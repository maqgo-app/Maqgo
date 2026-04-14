"""
Servicio central de email transaccional (MVP) usando Resend API.

Contrato principal:
    sendEmail({
      "to": "user@example.com" | ["a@x.com", "b@y.com"],
      "cc": "copy@example.com" | ["c1@x.com"],
      "subject": "Asunto",
      "html": "<p>Contenido</p>",
    })
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "onboarding@resend.dev"


def _normalize_recipients(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [x.strip() for x in value.split(",") if x.strip()]
    if isinstance(value, (list, tuple, set)):
        out: list[str] = []
        for item in value:
            if item is None:
                continue
            token = str(item).strip()
            if token:
                out.append(token)
        return out
    token = str(value).strip()
    return [token] if token else []


def _resolve_from_email() -> str:
    # EMAIL_FROM es la nueva variable oficial.
    # SENDER_EMAIL se conserva para compatibilidad con módulos existentes.
    configured = (
        os.environ.get("EMAIL_FROM", "").strip()
        or os.environ.get("SENDER_EMAIL", "").strip()
    )
    return configured or DEFAULT_FROM


def sendEmail(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Envío de email vía Resend sin levantar excepciones al caller.
    """
    to = _normalize_recipients((payload or {}).get("to"))
    cc = _normalize_recipients((payload or {}).get("cc"))
    subject = str((payload or {}).get("subject") or "").strip()
    html = str((payload or {}).get("html") or "").strip()
    resend_api_key = os.environ.get("RESEND_API_KEY", "").strip()

    if not to:
        return {"success": False, "error": "Destino email requerido"}
    if not subject:
        return {"success": False, "error": "Asunto requerido"}
    if not html:
        return {"success": False, "error": "HTML requerido"}
    if not resend_api_key:
        logger.warning("Email skipped: RESEND_API_KEY no configurada")
        return {"success": False, "error": "RESEND_API_KEY no configurada"}

    request_payload: dict[str, Any] = {
        "from": _resolve_from_email(),
        "to": to,
        "subject": subject,
        "html": html,
    }
    if cc:
        request_payload["cc"] = cc

    try:
        response = requests.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json=request_payload,
            timeout=15,
        )
        response_json = response.json() if response.content else {}
        if 200 <= response.status_code < 300:
            return {
                "success": True,
                "id": response_json.get("id"),
                "provider": "resend",
            }
        error_msg = (
            response_json.get("message")
            or response_json.get("error")
            or f"HTTP {response.status_code}"
        )
        logger.warning("Resend email error: %s", error_msg)
        return {
            "success": False,
            "error": str(error_msg),
            "status_code": response.status_code,
            "provider": "resend",
        }
    except Exception as exc:
        logger.warning("Resend email exception: %s", exc)
        return {
            "success": False,
            "error": "No se pudo enviar email",
            "provider": "resend",
        }


async def send_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Alias async para compatibilidad con rutas async."""
    return await asyncio.to_thread(sendEmail, payload)

