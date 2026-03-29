"""
Evidencia estructurada OneClick (certificación Transbank).
No altera la lógica de negocio: inserciones best-effort; fallos solo se loguean.
PAN: solo últimos 4 dígitos (last4). Token de inscripción: forma enmascarada.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

COLLECTION = "oneclick_evidence"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mask_inscription_token(token: Optional[str]) -> Optional[str]:
    """No almacena el token TBK completo en evidencia (solo prefijo/sufijo cortos)."""
    if not token:
        return None
    t = str(token).strip()
    if len(t) <= 8:
        return "****"
    return f"{t[:4]}...{t[-4:]}"


def card_last4_only(card_number: Optional[str]) -> Optional[str]:
    """Solo últimos 4 dígitos; ignora separadores y máscaras tipo ****."""
    if not card_number:
        return None
    digits = re.sub(r"\D", "", str(card_number))
    if not digits:
        return None
    return digits[-4:] if len(digits) >= 4 else digits


def _response_code(result: dict) -> Any:
    if not isinstance(result, dict):
        return None
    rc = result.get("response_code")
    if rc is None:
        rc = result.get("responseCode")
    return rc


async def record_start(
    db: AsyncIOMotorDatabase,
    *,
    token: Optional[str],
    email: str,
    username: str,
) -> None:
    doc = {
        "type": "start",
        "token": mask_inscription_token(token),
        "email": (email or "").strip(),
        "username": (username or "").strip(),
        "timestamp": _now_iso(),
    }
    try:
        await db[COLLECTION].insert_one(doc)
    except Exception as e:
        logger.warning("oneclick_evidence record_start: %s", e)


async def record_confirm(
    db: AsyncIOMotorDatabase,
    *,
    token: str,
    result: dict,
) -> None:
    last4 = card_last4_only(result.get("card_number"))
    doc = {
        "type": "confirm",
        "token": mask_inscription_token(token),
        "response_code": _response_code(result),
        "tbk_user": result.get("tbk_user") or None,
        "card_type": result.get("card_type"),
        "last4": last4,
        "timestamp": _now_iso(),
    }
    try:
        await db[COLLECTION].insert_one(doc)
    except Exception as e:
        logger.warning("oneclick_evidence record_confirm: %s", e)


async def record_authorize(
    db: AsyncIOMotorDatabase,
    *,
    buy_order: str,
    tbk_user: str,
    amount: int,
    result: dict,
) -> None:
    details = result.get("details") or []
    d0: dict[str, Any] = details[0] if details and isinstance(details[0], dict) else {}
    rc = d0.get("response_code")
    if rc is None:
        rc = d0.get("responseCode")
    status = d0.get("status")
    auth_code = d0.get("authorization_code") or d0.get("authorizationCode")

    doc = {
        "type": "authorize",
        "buy_order": buy_order,
        "tbk_user": tbk_user,
        "amount": int(amount),
        "status": status,
        "response_code": rc,
        "authorization_code": auth_code,
        "timestamp": _now_iso(),
    }
    try:
        await db[COLLECTION].insert_one(doc)
    except Exception as e:
        logger.warning("oneclick_evidence record_authorize: %s", e)


def serialize_evidence_doc(doc: dict) -> dict:
    out = dict(doc)
    if "_id" in out:
        out["_id"] = str(out["_id"])
    return out
