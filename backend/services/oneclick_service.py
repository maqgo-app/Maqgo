import os
import requests
import subprocess
import tempfile
from pathlib import Path
from dotenv import load_dotenv
import logging
import json as jsonlib
import time

load_dotenv()
logger = logging.getLogger(__name__)

# Timeout para evitar bloqueos indefinidos (Transbank suele responder en 2-5 s)
# Si no hay timeout, una API lenta puede causar "timeout" percibido por el usuario
TBK_REQUEST_TIMEOUT = 25
TBK_DEBUG_HTTP = os.getenv("TBK_DEBUG_HTTP", "false").lower() == "true"
TBK_REQUEST_RETRIES = max(0, int(os.getenv("TBK_REQUEST_RETRIES", "2")))


def _cfg():
    tbk_env = os.getenv("TBK_ENV", "integration")
    base_url = (
        "https://webpay3g.transbank.cl"
        if tbk_env == "production"
        else "https://webpay3gint.transbank.cl"
    )
    parent_cc = os.getenv("TBK_PARENT_COMMERCE_CODE", "").strip()
    child_cc = os.getenv("TBK_CHILD_COMMERCE_CODE", "").strip()
    # Soporta ambos nombres para evitar caída por mismatch de env var.
    api_key_secret = (
        os.getenv("TBK_API_KEY_SECRET", "").strip()
        or os.getenv("TBK_API_KEY", "").strip()
    )
    # Id explícito opcional (si no existe, usar parent commerce code).
    api_key_id = os.getenv("TBK_API_KEY_ID", "").strip() or parent_cc
    return_url = os.getenv("TBK_RETURN_URL", "").strip()
    return {
        "base_url": base_url,
        "parent_cc": parent_cc,
        "child_cc": child_cc,
        "api_key_secret": api_key_secret,
        "api_key_id": api_key_id,
        "return_url": return_url,
    }


def _check_config():
    """Valida que las credenciales Transbank estén configuradas."""
    c = _cfg()
    missing = []
    if not c["parent_cc"]:
        missing.append("TBK_PARENT_COMMERCE_CODE")
    if not c["child_cc"]:
        missing.append("TBK_CHILD_COMMERCE_CODE")
    if not c["api_key_secret"]:
        missing.append("TBK_API_KEY_SECRET/TBK_API_KEY")
    if missing:
        raise ValueError(f"Faltan variables de entorno Transbank: {', '.join(missing)}. Agrega en .env")


def _headers():
    c = _cfg()
    return {
        "Tbk-Api-Key-Id": c["api_key_id"],
        "Tbk-Api-Key-Secret": c["api_key_secret"],
        "Content-Type": "application/json",
        "Accept": "*/*",
        # Keep UA explicit and stable to match verified curl behavior.
        "User-Agent": "curl/8.7.1",
    }


def _request_json(method: str, url: str, headers: dict, payload: dict | None, *, allow_retries: bool = True):
    """
    Make a strict JSON request to Transbank with deterministic headers/body.
    Logs full request/response when TBK_DEBUG_HTTP=true for diagnosis.
    """
    # Root cause observed: WAF allows the request when sent via `curl`,
    # but blocks when sent via `requests` (fingerprint/origin policy).
    # Definitive fix for validation: use `curl` from the backend runtime.
    payload_obj = payload or {}
    body_str = jsonlib.dumps(payload_obj, ensure_ascii=False)

    if TBK_DEBUG_HTTP:
        logger.info(
            "TBK_REQ(method=curl) method=%s url=%s headers=%s body=%s",
            method,
            url,
            headers,
            body_str,
        )

    last_error = None
    attempts = (TBK_REQUEST_RETRIES + 1) if allow_retries else 1
    for attempt in range(1, attempts + 1):
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as tmp:
                tmp_path = tmp.name

            cmd = [
                "curl",
                "-sS",
                "--noproxy",
                "*",
                "-X",
                method,
                "-o",
                tmp_path,
                "-w",
                "%{http_code}",
            ]

            for k, v in (headers or {}).items():
                cmd.extend(["-H", f"{k}: {v}"])

            if payload is not None:
                cmd.extend(["--data", body_str])

            cmd.append(url)

            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=TBK_REQUEST_TIMEOUT,
                check=False,
            )

            http_code_raw = (proc.stdout or "").strip()
            try:
                http_code = int(http_code_raw)
            except Exception:
                http_code = 0

            body_text = ""
            if tmp_path and Path(tmp_path).exists():
                body_text = Path(tmp_path).read_text(encoding="utf-8", errors="replace")

            if TBK_DEBUG_HTTP:
                logger.info(
                    "TBK_RES(method=curl) status=%s body=%s",
                    http_code_raw,
                    body_text[:2000],
                )

            # Retry only transients (5xx/408/429) or transport failures.
            transient_http = http_code in {408, 429} or 500 <= http_code <= 599
            transient_transport = proc.returncode != 0 or http_code == 0
            should_retry = attempt < attempts and (transient_http or transient_transport)
            if should_retry:
                backoff = min(2.0, 0.4 * (2 ** (attempt - 1)))
                logger.warning(
                    "TBK retry attempt=%s/%s reason=http=%s curl_rc=%s backoff=%.2fs",
                    attempt,
                    attempts,
                    http_code,
                    proc.returncode,
                    backoff,
                )
                time.sleep(backoff)
                continue

            if http_code < 200 or http_code >= 300:
                raise requests.exceptions.HTTPError(
                    f"HTTP {http_code} from Transbank. Body={body_text[:2000]}",
                    response=None,
                )

            if not body_text.strip():
                return {}

            return jsonlib.loads(body_text)
        except subprocess.TimeoutExpired as exc:
            last_error = exc
            if attempt < attempts:
                backoff = min(2.0, 0.4 * (2 ** (attempt - 1)))
                logger.warning(
                    "TBK retry attempt=%s/%s reason=timeout backoff=%.2fs",
                    attempt,
                    attempts,
                    backoff,
                )
                time.sleep(backoff)
                continue
            raise requests.exceptions.Timeout(f"Timeout contacting Transbank after {attempts} attempts") from exc
        finally:
            try:
                if tmp_path and Path(tmp_path).exists():
                    Path(tmp_path).unlink()
            except Exception:
                pass
    if last_error:
        raise last_error
    raise requests.exceptions.RequestException("Unexpected Transbank request failure")


def start_inscription(username: str, email: str, response_url: str = None):
    _check_config()
    c = _cfg()
    url = f"{c['base_url']}/rswebpaytransaction/api/oneclick/v1.2/inscriptions"

    # Transbank debe poder alcanzar la URL de retorno. Con localhost no funciona.
    # Para pruebas locales: usa ngrok y define TBK_RETURN_URL en .env
    final_url = response_url or c["return_url"] or ""
    if final_url and "localhost" in final_url and c["return_url"]:
        final_url = c["return_url"]

    payload = {
        "username": username,
        "email": email,
        "response_url": final_url
    }

    # Sin reintentos automáticos en el POST de inscripción: reduce riesgo de duplicidad
    # borde si Transbank aceptó pero la lectura de respuesta falló (el idempotency del
    # endpoint /start mitiga reintentos de cliente; aquí evitamos doble POST silencioso).
    response = _request_json("POST", url, _headers(), payload, allow_retries=False)
    if isinstance(response, dict):
        _tok = response.get("token")
        _wp = response.get("url_webpay") or response.get("urlWebpay")
        logger.info("[ONECLICK_START] token=%s url=%s", _tok, _wp)
    return response


def confirm_inscription(token: str):
    _check_config()
    c = _cfg()
    url = f"{c['base_url']}/rswebpaytransaction/api/oneclick/v1.2/inscriptions/{token}"

    return _request_json("PUT", url, _headers(), {})


def authorize_payment(username: str, tbk_user: str, buy_order: str, amount: int):
    _check_config()
    c = _cfg()
    url = f"{c['base_url']}/rswebpaytransaction/api/oneclick/v1.2/transactions"

    payload = {
        "username": username,
        "tbk_user": tbk_user,
        "buy_order": buy_order,
        "details": [
            {
                "commerce_code": c["child_cc"],
                "buy_order": buy_order,
                "amount": amount
            }
        ]
    }

    # No retries on authorize to avoid duplicate financial operations.
    return _request_json("POST", url, _headers(), payload, allow_retries=False)


def refund_payment(buy_order: str, detail_buy_order: str, amount: int):
    """
    Reembolso / anulación parcial o total (OneClick Mall).
    buy_order: orden padre de la transacción (misma usada en authorize).
    detail_buy_order: orden del detalle tienda hija (puede coincidir con la padre en MAQGO).
    """
    _check_config()
    c = _cfg()
    url = f"{c['base_url']}/rswebpaytransaction/api/oneclick/v1.2/transactions/{buy_order}/refunds"

    payload = {
        "commerce_code": c["child_cc"],
        "detail_buy_order": detail_buy_order,
        "amount": amount
    }

    data = _request_json("POST", url, _headers(), payload)
    rc = data.get("response_code", data.get("responseCode", -1))
    if rc != 0:
        raise ValueError(
            f"Transbank rechazó el reembolso: response_code={rc} body={data}"
        )
    return data
