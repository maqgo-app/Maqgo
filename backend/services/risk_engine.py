"""
Motor de riesgo para login SMS: cuándo exigir OTP (capa dispositivo / país).

Contadores Redis y validez de device_id se resuelven en risk_auth_service.
La confianza del dispositivo va por `device_id` persistente + fila en `trusted_devices`;
no forzar OTP solo por cambiar User-Agent (actualizaciones de navegador, iPad/desktop, etc.).
`current_ip` queda reservado para reglas futuras (ASN, listas, etc.).
"""

from __future__ import annotations

from typing import Any, Optional


def get_device_class(user_agent: str) -> str:
    """
    Clasificación gruesa (tests / telemetría); el login por riesgo ya no OTP-ea por clase UA.
    """
    if not user_agent:
        return "unknown"

    ua = user_agent.lower()

    if "mobi" in ua or "android" in ua or "iphone" in ua:
        return "mobile"

    return "desktop"


def is_risky_login(
    stored_device: Optional[dict[str, Any]],
    current_ip: str,
    current_country: str,
    user_agent: str,
) -> bool:
    """
    Devuelve True si se debe pedir OTP.
    País: solo si ambos lados tienen código ISO y difieren (no penalizar CF ausente).
    User-Agent: ignorado para step-up (evita falsos positivos tras logout / mismo dispositivo).
    """
    _ = current_ip
    _ = user_agent

    if not stored_device:
        return True  # dispositivo nuevo

    if not stored_device.get("is_active", True):
        return True

    stored_cc = (stored_device.get("last_country") or "").strip().upper()[:2]
    cur_cc = (current_country or "").strip().upper()[:2]
    if stored_cc and cur_cc and stored_cc != cur_cc:
        return True

    return False
