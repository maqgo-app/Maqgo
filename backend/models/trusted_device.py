"""
Documento MongoDB: colección `trusted_devices` (login por riesgo).
"""

from __future__ import annotations

from datetime import datetime, timezone

# Límites de almacenamiento (evita documentos enormes por UA/IP)
MAX_IP_LEN = 128
MAX_USER_AGENT_LEN = 512


def build_trusted_device(user_id, phone_number, device_id, ip, country, user_agent):
    """
    Payload $set para un dispositivo de confianza.
    Usa datetime UTC consciente (recomendado frente a datetime.utcnow() deprecado en 3.12+).
    """
    cc = (country or "").strip().upper()[:2]
    return {
        "user_id": user_id,
        "phone_number": phone_number,
        "device_id": device_id,
        "last_login_at": datetime.now(timezone.utc),
        "last_ip": (ip or "")[:MAX_IP_LEN],
        "last_country": cc,
        "user_agent": (user_agent or "")[:MAX_USER_AGENT_LEN],
        "is_active": True,
    }


def build_trusted_session_touch(ip: str, country: str, user_agent: str) -> dict:
    """Campos a actualizar en login directo sin OTP (mismo dispositivo de confianza)."""
    cc = (country or "").strip().upper()[:2]
    return {
        "last_login_at": datetime.now(timezone.utc),
        "last_ip": (ip or "")[:MAX_IP_LEN],
        "last_country": cc,
        "user_agent": (user_agent or "")[:MAX_USER_AGENT_LEN],
    }
