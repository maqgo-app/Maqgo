"""
Documento MongoDB: colección `trusted_devices` (login por riesgo).
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

# Límites de almacenamiento (evita documentos enormes por UA/IP)
MAX_IP_LEN = 128
MAX_USER_AGENT_LEN = 512
# MVP suave: confianza de dispositivo muy larga para minimizar fricción OTP.
DEFAULT_TRUSTED_DEVICE_TTL_SECONDS = 60 * 60 * 24 * 365  # 365 días


def _trusted_device_ttl_seconds() -> int:
    """
    TTL explícito de confianza por dispositivo.
    Evita confianza indefinida: tras este plazo sin renovación, se vuelve a pedir OTP.
    """
    raw = str(os.environ.get("MAQGO_TRUSTED_DEVICE_TTL_SECONDS", DEFAULT_TRUSTED_DEVICE_TTL_SECONDS)).strip()
    try:
        parsed = int(raw)
    except Exception:
        parsed = DEFAULT_TRUSTED_DEVICE_TTL_SECONDS
    # Piso de seguridad/UX: al menos 5 minutos.
    return max(300, parsed)


def build_trusted_device(user_id, phone_number, device_id, ip, country, user_agent):
    """
    Payload $set para un dispositivo de confianza.
    Usa datetime UTC consciente (recomendado frente a datetime.utcnow() deprecado en 3.12+).
    """
    now = datetime.now(timezone.utc)
    trusted_until = now + timedelta(seconds=_trusted_device_ttl_seconds())
    cc = (country or "").strip().upper()[:2]
    return {
        "user_id": user_id,
        "phone_number": phone_number,
        "device_id": device_id,
        "last_login_at": now,
        "last_verified_at": now,
        "trusted_until": trusted_until,
        "last_ip": (ip or "")[:MAX_IP_LEN],
        "last_country": cc,
        "user_agent": (user_agent or "")[:MAX_USER_AGENT_LEN],
        "is_active": True,
    }


def build_trusted_session_touch(ip: str, country: str, user_agent: str) -> dict:
    """Campos a actualizar en login directo sin OTP (mismo dispositivo de confianza)."""
    now = datetime.now(timezone.utc)
    trusted_until = now + timedelta(seconds=_trusted_device_ttl_seconds())
    cc = (country or "").strip().upper()[:2]
    return {
        "last_login_at": now,
        "trusted_until": trusted_until,
        "last_ip": (ip or "")[:MAX_IP_LEN],
        "last_country": cc,
        "user_agent": (user_agent or "")[:MAX_USER_AGENT_LEN],
    }
