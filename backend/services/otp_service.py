"""
MAQGO - OTP Service (Redis + LabsMobile)

- OTP propio de 6 dígitos (control interno)
- Redis: código + expiración + intentos + rate-limit
- LabsMobile: envío SMS transaccional
"""

import os
import random
import logging
from typing import Optional, Tuple
from urllib.parse import urlparse
import requests

logger = logging.getLogger(__name__)

# Config
OTP_EXPIRY_SECONDS = 300  # 5 minutos
OTP_MAX_ATTEMPTS = 3
RATE_LIMIT_WINDOW = 600  # 10 minutos
RATE_LIMIT_MAX = 3  # máx 3 OTP por número cada 10 min

def _extract_host(url_or_host: str) -> str:
    raw = (url_or_host or '').strip()
    if not raw:
        return ''
    if '://' not in raw:
        return raw.split('/')[0].split(':')[0]
    parsed = urlparse(raw)
    host = parsed.netloc or parsed.path
    return (host or '').split('/')[0].split(':')[0]


def _get_webotp_domains() -> list[str]:
    """
    Web OTP requiere que el SMS contenga un token con formato `@dominio`.
    Usamos el dominio del frontend para aumentar compatibilidad.
    """
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.maqgo.cl')
    host = _extract_host(frontend_url)
    if not host:
        host = 'www.maqgo.cl'
    root = host[4:] if host.startswith('www.') else host
    domains = [host]
    if root and root != host:
        domains.append(root)
    return domains


WEBOTP_DOMAINS = _get_webotp_domains()
SMS_MESSAGE = "Tu código MAQGO es: {otp}. Válido por 5 minutos."

REDIS_URL = os.environ.get("REDIS_URL", "")
LABSMOBILE_USERNAME = os.environ.get("LABSMOBILE_USERNAME", "")
LABSMOBILE_API_TOKEN = os.environ.get("LABSMOBILE_API_TOKEN", "")
LABSMOBILE_SENDER = os.environ.get("LABSMOBILE_SENDER", "MAQGO")


def _get_redis():
    """Obtiene cliente Redis. Retorna None si no está configurado."""
    if not REDIS_URL:
        return None
    try:
        import redis
        return redis.from_url(REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Redis not available: {e}")
        return None


def send_sms(phone: str, message: str) -> Tuple[bool, Optional[str]]:
    """
    Envía SMS vía LabsMobile.
    Retorna (success, error_message).
    """
    if not LABSMOBILE_USERNAME or not LABSMOBILE_API_TOKEN:
        return False, "LabsMobile no configurado"

    msisdn = "".join(c for c in phone if c.isdigit())
    if not msisdn:
        return False, "Número destino inválido"

    payload = {
        "message": message,
        "tpoa": LABSMOBILE_SENDER,
        "recipient": [{"msisdn": msisdn}],
    }

    try:
        res = requests.post(
            "https://api.labsmobile.com/json/send",
            json=payload,
            auth=(LABSMOBILE_USERNAME, LABSMOBILE_API_TOKEN),
            headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
            timeout=12,
        )
        if res.status_code != 200:
            logger.error("LabsMobile SMS HTTP error %s: %s", res.status_code, res.text[:400])
            return False, f"LabsMobile error HTTP {res.status_code}"
        try:
            data = res.json()
        except ValueError:
            logger.error("LabsMobile response not JSON: %s", res.text[:400])
            return False, "LabsMobile respuesta inválida"

        api_code = str(data.get("code", "")).strip()
        if api_code and api_code != "0":
            logger.error("LabsMobile API error code=%s body=%s", api_code, str(data)[:500])
            return False, f"LabsMobile error {api_code}"

        logger.info("SMS LabsMobile enviado a %s", phone)
        return True, None
    except Exception as e:
        logger.error("LabsMobile request error: %s", e)
        return False, str(e)


def get_sms_balance() -> dict:
    """
    Consulta saldo de créditos en LabsMobile.
    Retorna: {success, credits, code, error}
    """
    if not LABSMOBILE_USERNAME or not LABSMOBILE_API_TOKEN:
        return {"success": False, "credits": None, "code": None, "error": "LabsMobile no configurado"}

    try:
        res = requests.get(
            "https://api.labsmobile.com/json/balance",
            auth=(LABSMOBILE_USERNAME, LABSMOBILE_API_TOKEN),
            headers={"Cache-Control": "no-cache"},
            timeout=10,
        )
        if res.status_code != 200:
            logger.error("LabsMobile balance HTTP error %s: %s", res.status_code, res.text[:300])
            return {"success": False, "credits": None, "code": str(res.status_code), "error": f"HTTP {res.status_code}"}
        data = res.json()
        api_code = str(data.get("code", "")).strip()
        credits_raw = data.get("credits")
        credits = float(credits_raw) if credits_raw is not None else None
        if api_code and api_code != "0":
            msg = str(data.get("message") or f"API code {api_code}")
            logger.error("LabsMobile balance API error code=%s msg=%s", api_code, msg)
            return {"success": False, "credits": credits, "code": api_code, "error": msg}
        return {"success": True, "credits": credits, "code": api_code or "0", "error": None}
    except Exception as e:
        logger.error("LabsMobile balance request error: %s", e)
        return {"success": False, "credits": None, "code": None, "error": str(e)}


def _normalize_phone(phone: str) -> str:
    """Asegura formato E.164 para Chile."""
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        return f"+{digits}"
    if len(digits) == 9 and digits[0] == "9":
        return f"+56{digits}"
    return phone if phone.startswith("+") else f"+{phone}"


def _is_valid_cl_phone_e164(phone: str) -> bool:
    digits = "".join(c for c in str(phone or "") if c.isdigit())
    if digits.startswith("56"):
        digits = digits[2:]
    return len(digits) == 9 and digits.startswith("9")


def send_otp(phone_number: str, channel: str = "sms") -> dict:
    """
    Envía OTP de 6 dígitos.
    - Rate limit: máx 3 OTP por número cada 10 min
    - OTP válido 5 minutos
    - channel: 'sms' (por ahora solo SMS)
    - Secure: Falla claramente si hay problemas, sin ocultar errores
    """
    print("SEND_OTP_START", phone_number, channel)
    
    phone = _normalize_phone(phone_number)
    if not _is_valid_cl_phone_e164(phone):
        print("INVALID_PHONE_FORMAT", phone)
        return {
            "success": False,
            "error": "Formato de teléfono inválido. Usa +569XXXXXXXX.",
        }
        
    if channel not in ("sms", "whatsapp"):
        channel = "sms"

    # Solo SMS por ahora
    if channel == "whatsapp":
        print("WHATSAPP_NOT_SUPPORTED")
        return {
            "success": False,
            "error": "WhatsApp no disponible. Usa SMS.",
        }

    print("REDIS_CONNECTION_START")
    r = _get_redis()
    
    # Sin Redis: no podemos hacer rate limit ni guardar OTP
    if not r:
        print("REDIS_NOT_AVAILABLE")
        return {
            "success": False,
            "error": "OTP service not configured (REDIS_URL required)",
        }
    
    print("REDIS_OK")
    rate_key = f"otp_rate:{phone}"
    try:
        current = r.get(rate_key) or "0"
        count = int(current)
        if count >= RATE_LIMIT_MAX:
            ttl = r.ttl(rate_key)
            print("RATE_LIMIT_EXCEEDED", count, ttl)
            return {
                "success": False,
                "error": f"Demasiados intentos. Intenta en {max(1, ttl // 60)} minutos.",
            }
    except Exception as e:
        print("REDIS_RATE_CHECK_ERROR", str(e))
        count = 0

    otp = "".join(str(random.randint(0, 9)) for _ in range(6))
    otp_key = f"otp:{phone}"
    attempts_key = f"otp_attempts:{phone}"
    print("OTP_GENERATED", otp)

    # Guardar OTP y resetear intentos
    try:
        pipe = r.pipeline()
        pipe.setex(otp_key, OTP_EXPIRY_SECONDS, otp)
        pipe.setex(attempts_key, OTP_EXPIRY_SECONDS, "0")
        if count == 0:
            pipe.setex(rate_key, RATE_LIMIT_WINDOW, "1")
        else:
            pipe.incr(rate_key)
            pipe.expire(rate_key, RATE_LIMIT_WINDOW)
        pipe.execute()
        print("REDIS_SAVE_OK")
    except Exception as e:
        print("REDIS_SAVE_ERROR", str(e))
        return {
            "success": False,
            "error": "Redis storage failed",
        }

    # Enviar SMS
    print("SMS_SEND_START", phone)
    ok, err = send_sms(phone, SMS_MESSAGE.format(otp=otp))
    print("SMS_SEND_RESULT", ok, err)
    
    if not ok:
        print("SMS_SEND_FAILED", err)
        # Delete OTP since SMS failed
        try:
            r.delete(otp_key, attempts_key)
            print("OTP_CLEANED_UP")
        except:
            pass
        logger.error("Fallo envío OTP phone=%s error=%s", phone, err)
        return {
            "success": False,
            "error": err or "Error al enviar SMS",
        }

    print("SEND_OTP_SUCCESS")
    return {
        "success": True,
        "channel": "sms",
        "demo_mode": False,
    }


def verify_otp(phone_number: str, code: str) -> dict:
    """
    Verifica código OTP.
    - Máx 3 intentos
    - Errores claros: inválido, expirado, demasiados intentos
    """
    phone = _normalize_phone(phone_number)
    if not _is_valid_cl_phone_e164(phone):
        return {
            "success": True,
            "valid": False,
            "error": "Formato de teléfono inválido. Usa +569XXXXXXXX.",
        }
    code = code.strip()

    if len(code) != 6 or not code.isdigit():
        return {
            "success": True,
            "valid": False,
            "error": "Código inválido",
        }

    r = _get_redis()
    if not r:
        return {
            "success": False,
            "valid": False,
            "error": "OTP service not configured",
        }

    otp_key = f"otp:{phone}"
    attempts_key = f"otp_attempts:{phone}"

    try:
        stored = r.get(otp_key)
        attempts = int(r.get(attempts_key) or "0")

        if attempts >= OTP_MAX_ATTEMPTS:
            r.delete(otp_key, attempts_key)
            return {
                "success": True,
                "valid": False,
                "error": "Demasiados intentos. Solicita un nuevo código.",
            }

        if not stored:
            return {
                "success": True,
                "valid": False,
                "error": "Código expirado. Solicita uno nuevo.",
            }

        if code != stored:
            r.incr(attempts_key)
            r.expire(attempts_key, r.ttl(otp_key))
            remaining = OTP_MAX_ATTEMPTS - attempts - 1
            err = "Código incorrecto."
            logger.warning("OTP inválido phone=%s remaining=%s", phone, max(remaining, 0))
            if remaining > 0:
                err += f" Te quedan {remaining} intentos."
            return {
                "success": True,
                "valid": False,
                "error": err,
            }

        # OK: eliminar OTP
        r.delete(otp_key, attempts_key)
        return {
            "success": True,
            "valid": True,
        }

    except Exception as e:
        logger.error(f"Redis verify error: {e}")
        return {
            "success": False,
            "valid": False,
            "error": "Error al verificar. Intenta nuevamente.",
        }


def is_otp_configured() -> bool:
    """Indica si el servicio OTP (Redis + LabsMobile) está listo."""
    return bool(
        str(os.environ.get("REDIS_URL", "")).strip()
        and str(os.environ.get("LABSMOBILE_USERNAME", "")).strip()
        and str(os.environ.get("LABSMOBILE_API_TOKEN", "")).strip()
        and str(os.environ.get("LABSMOBILE_SENDER", "")).strip()
    )
