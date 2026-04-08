"""
MAQGO — Autenticación por riesgo (con caducidad temporal de confianza).

- trusted_devices en MongoDB
- Fallos de verificación OTP (Redis): umbral en ventana deslizante
- País: CF-IPCountry (Cloudflare) o cabecera opcional X-Client-Country
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request

from services.risk_engine import is_risky_login as risk_engine_is_risky

logger = logging.getLogger(__name__)

# Tras N fallos de verificación OTP en la ventana, el siguiente login exige OTP aunque el dispositivo sea conocido.
LOGIN_VERIFY_FAIL_THRESHOLD = 5
LOGIN_VERIFY_FAIL_WINDOW_SEC = 900  # 15 min

_TRUST_INDEX_ENSURED = False

DEVICE_ID_MIN_LEN = 8
DEVICE_ID_MAX_LEN = 128


def _get_redis():
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis

        return redis.from_url(url, decode_responses=True)
    except Exception as e:
        logger.warning("risk_auth Redis: %s", e)
        return None


def normalize_device_id(raw: Optional[str]) -> str:
    s = str(raw or "").strip()
    if len(s) < DEVICE_ID_MIN_LEN or len(s) > DEVICE_ID_MAX_LEN:
        return ""
    if not re.match(r"^[A-Za-z0-9._:-]+$", s):
        return ""
    return s


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()[:128]
    if request.client:
        return (request.client.host or "")[:128]
    return ""


def get_client_user_agent(request: Request) -> str:
    """User-Agent del cliente; truncado en el modelo."""
    raw = request.headers.get("user-agent") or request.headers.get("User-Agent") or ""
    return (raw or "").strip()[:512]


def get_client_country(request: Request) -> str:
    """
    ISO 3166-1 alpha-2 en mayúsculas, o cadena vacía si se desconoce.
    En producción detrás de Cloudflare, usar CF-IPCountry.
    """
    cf = request.headers.get("cf-ipcountry") or request.headers.get("CF-IPCountry")
    if cf:
        c = cf.strip().upper()[:2]
        if c and c not in ("XX", "T1", "--"):
            return c
    hint = request.headers.get("x-client-country") or request.headers.get("X-Client-Country")
    if hint and len(hint.strip()) >= 2:
        return hint.strip().upper()[:2]
    return ""


def is_risky_login(
    *,
    trusted_row: Optional[dict[str, Any]],
    device_id_valid: bool,
    current_country: str,
    too_many_failed: bool,
    current_ip: str = "",
    current_user_agent: str = "",
) -> bool:
    """
    Política compuesta:
    - Sin device_id válido → riesgo.
    - Demasiados fallos recientes de verificación OTP → riesgo.
    - Resto delegado en services.risk_engine (país, clase de UA, dispositivo inactivo).
    """
    if not device_id_valid:
        return True
    if too_many_failed:
        return True
    if is_trusted_device_expired(trusted_row):
        return True
    return risk_engine_is_risky(
        trusted_row,
        current_ip,
        current_country,
        current_user_agent,
    )


def _fail_key(user_id: str, device_id: str) -> str:
    return f"login_verify_fail:{user_id}:{device_id}"


def _parse_dt_utc(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        text = str(raw).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def is_trusted_device_expired(trusted_row: Optional[dict[str, Any]]) -> bool:
    """
    True cuando la confianza del dispositivo ya expiró o no es verificable.
    Si la fila no existe, la evaluación de riesgo ya la trata como "nuevo dispositivo".
    """
    if not trusted_row:
        return False
    trusted_until = _parse_dt_utc(trusted_row.get("trusted_until"))
    if not trusted_until:
        # Backward compatibility: filas legacy sin trusted_until requieren revalidación por OTP.
        return True
    return trusted_until <= datetime.now(timezone.utc)


def get_login_verify_fail_count(user_id: str, device_id: str) -> int:
    r = _get_redis()
    if not r or not user_id or not device_id:
        return 0
    try:
        v = r.get(_fail_key(user_id, device_id))
        return int(v or "0")
    except Exception as e:
        logger.warning("get_login_verify_fail_count: %s", e)
        return 0


def record_login_verify_failure(user_id: str, device_id: str) -> None:
    """Incrementa contador de fallos al rechazar un OTP (código incorrecto, etc.)."""
    r = _get_redis()
    if not r or not user_id or not device_id:
        return
    key = _fail_key(user_id, device_id)
    try:
        n = r.incr(key)
        if n == 1:
            r.expire(key, LOGIN_VERIFY_FAIL_WINDOW_SEC)
    except Exception as e:
        logger.warning("record_login_verify_failure: %s", e)


def clear_login_verify_failures(user_id: str, device_id: str) -> None:
    r = _get_redis()
    if not r or not user_id or not device_id:
        return
    try:
        r.delete(_fail_key(user_id, device_id))
    except Exception as e:
        logger.warning("clear_login_verify_failures: %s", e)


def too_many_recent_login_failures(user_id: str, device_id: str) -> bool:
    return get_login_verify_fail_count(user_id, device_id) >= LOGIN_VERIFY_FAIL_THRESHOLD


def _phone_last9_digits(phone: str) -> str:
    d = "".join(c for c in str(phone or "") if c.isdigit())
    if d.startswith("56") and len(d) >= 11:
        d = d[2:]
    return d[-9:] if len(d) >= 9 else d


async def find_trusted_device(db, *, user_id: str, phone_e164: str, device_id: str) -> Optional[dict[str, Any]]:
    """
    Busca por user_id + device_id (único en índice). El teléfono en el documento puede
    diferir en formato menor; validamos con últimos 9 dígitos.
    """
    doc = await db.trusted_devices.find_one(
        {"user_id": user_id, "device_id": device_id, "is_active": True},
        {"_id": 0},
    )
    if not doc:
        return None
    want = _phone_last9_digits(phone_e164)
    got = _phone_last9_digits(str(doc.get("phone_number") or ""))
    if want and got and want != got:
        return None
    return doc


async def upsert_trusted_device(
    db,
    *,
    user_id: str,
    phone_e164: str,
    device_id: str,
    last_ip: str,
    last_country: str,
    user_agent: str = "",
) -> None:
    """Tras OTP válido: refuerza dispositivo de confianza."""
    from models.trusted_device import build_trusted_device

    prev = await db.trusted_devices.find_one(
        {"user_id": user_id, "device_id": device_id},
        {"_id": 0, "last_country": 1},
    )
    country_to_set = (last_country or "").strip().upper()[:2] if last_country else ""
    if not country_to_set and prev:
        country_to_set = (prev.get("last_country") or "").strip().upper()[:2]

    payload = build_trusted_device(
        user_id,
        phone_e164,
        device_id,
        last_ip,
        country_to_set,
        user_agent,
    )
    await db.trusted_devices.update_one(
        {"user_id": user_id, "device_id": device_id},
        {"$set": payload},
        upsert=True,
    )


async def ensure_trusted_device_indexes(db) -> None:
    global _TRUST_INDEX_ENSURED
    if _TRUST_INDEX_ENSURED:
        return
    try:
        await db.trusted_devices.create_index(
            [("user_id", 1), ("device_id", 1)],
            unique=True,
            name="uniq_user_device",
        )
        _TRUST_INDEX_ENSURED = True
    except Exception as e:
        logger.warning("ensure_trusted_device_indexes: %s", e)
