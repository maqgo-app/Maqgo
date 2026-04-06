"""
Motor de consistencia financiera (capa aditiva).

Detecta drift entre payment_intents, payments (local) y payment_ledger (p. ej. charge_success).
Solo repara casos seguros derivados de evidencia existente; no borra ni sobrescribe el ledger.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.payment_intent_service import CAPTURE_SUCCEEDED, PaymentIntentService
from services.payment_ledger import (
    EVT_CONSISTENCY_CHECK_RUN,
    append_event,
    ledger_has_charge_success_for_service_request,
)

logger = logging.getLogger(__name__)

# Tipos de caso (drift). Alias de documentación ↔ kind:
# - processing_with_payment_evidence → KIND_PAYMENT_CHARGED_INTENT_NOT_SUCCEEDED
# - ledger_success_no_intent_sync → KIND_LEDGER_SUCCESS_INTENT_NOT_SUCCEEDED
KIND_PAYMENT_CHARGED_INTENT_NOT_SUCCEEDED = "payment_charged_intent_not_succeeded"
KIND_LEDGER_SUCCESS_INTENT_NOT_SUCCEEDED = "ledger_success_intent_not_succeeded"
KIND_INTENT_SUCCEEDED_NO_PAYMENT = "intent_succeeded_no_payment_row"
KIND_INTENT_SUCCEEDED_NO_LEDGER_SUCCESS = "intent_succeeded_no_ledger_charge_success"


async def detect_inconsistencies(
    db: AsyncIOMotorDatabase,
    *,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Lista casos de drift detectables (no modifica datos).
    """
    limit = max(1, min(int(limit or 500), int(os.environ.get("MAQGO_CONSISTENCY_MAX_SCAN", "3000"))))
    cases: list[dict[str, Any]] = []
    cursor = db.payment_intents.find({}).limit(limit)
    async for raw in cursor:
        intent = {k: v for k, v in raw.items() if k != "_id"}
        bid = intent.get("booking_id")
        sr_id = intent.get("service_request_id")
        iid = intent.get("id")
        cap = intent.get("payment_capture_status") or "idle"

        pay = None
        if sr_id:
            pay = await db.payments.find_one(
                {"serviceRequestId": sr_id, "status": "charged"},
                {"_id": 0},
            )

        has_ledger_success = False
        if sr_id:
            has_ledger_success = await ledger_has_charge_success_for_service_request(db, sr_id)

        if pay and cap != CAPTURE_SUCCEEDED:
            cases.append(
                {
                    "kind": KIND_PAYMENT_CHARGED_INTENT_NOT_SUCCEEDED,
                    "intent_id": iid,
                    "booking_id": bid,
                    "service_request_id": sr_id,
                    "payment_id": pay.get("id"),
                    "is_safe_to_fix": True,
                    "details": {"capture": cap, "reason": "payments.charged exists"},
                }
            )

        if has_ledger_success and cap != CAPTURE_SUCCEEDED and sr_id:
            cases.append(
                {
                    "kind": KIND_LEDGER_SUCCESS_INTENT_NOT_SUCCEEDED,
                    "intent_id": iid,
                    "booking_id": bid,
                    "service_request_id": sr_id,
                    "is_safe_to_fix": True,
                    "details": {"capture": cap},
                }
            )

        if cap == CAPTURE_SUCCEEDED and sr_id and not pay:
            cases.append(
                {
                    "kind": KIND_INTENT_SUCCEEDED_NO_PAYMENT,
                    "intent_id": iid,
                    "booking_id": bid,
                    "service_request_id": sr_id,
                    "is_safe_to_fix": False,
                    "details": {
                        "reason": "capture succeeded sin fila payments charged ni evidencia ledger",
                        "has_ledger_charge_success": has_ledger_success,
                    },
                }
            )

        # Pago local charged pero ledger sin charge_success (drift anómalo; no auto-fix)
        if (
            cap == CAPTURE_SUCCEEDED
            and sr_id
            and pay
            and not has_ledger_success
        ):
            cases.append(
                {
                    "kind": KIND_INTENT_SUCCEEDED_NO_LEDGER_SUCCESS,
                    "intent_id": iid,
                    "booking_id": bid,
                    "service_request_id": sr_id,
                    "payment_id": pay.get("id"),
                    "is_safe_to_fix": False,
                    "details": {
                        "reason": "payments.charged existe pero ledger sin charge_success",
                    },
                }
            )

    return cases


async def count_open_inconsistencies(db: AsyncIOMotorDatabase, *, limit: int = 500) -> int:
    """Conteo en vivo para admin (p. ej. hasta 500 intents por defecto)."""
    return len(await detect_inconsistencies(db, limit=limit))


async def repair_inconsistency(
    db: AsyncIOMotorDatabase,
    case: dict[str, Any],
) -> bool:
    """
    Reparación segura: alinear payment_capture_status con evidencia de pago/ledger.
    """
    if not case.get("is_safe_to_fix"):
        return False
    kind = case.get("kind")
    bid = case.get("booking_id")
    if not bid:
        return False

    pis = PaymentIntentService(db)
    if kind in (
        KIND_PAYMENT_CHARGED_INTENT_NOT_SUCCEEDED,
        KIND_LEDGER_SUCCESS_INTENT_NOT_SUCCEEDED,
    ):
        try:
            await pis.set_payment_capture_outcome(bid, CAPTURE_SUCCEEDED)
            return True
        except Exception as e:
            logger.warning("repair_inconsistency failed: %s", e)
            return False
    return False


async def run_consistency_check(
    db: AsyncIOMotorDatabase,
    *,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Detecta y repara casos seguros; registra consistency_check_run en el ledger.
    """
    cases = await detect_inconsistencies(db, limit=limit)
    repaired = 0
    for c in cases:
        if c.get("is_safe_to_fix"):
            if await repair_inconsistency(db, c):
                repaired += 1

    await append_event(
        db,
        EVT_CONSISTENCY_CHECK_RUN,
        {
            "scanned_cap": limit,
            "cases_found": len(cases),
            "repaired": repaired,
        },
    )
    return {
        "cases_found": len(cases),
        "repaired": repaired,
        "limit": limit,
    }
