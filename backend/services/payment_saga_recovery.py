"""
Recuperación de sagas de pago (capa aditiva).

Reconstruye estado desde payment_intent + payment_ledger + payments local.
No invalida el ledger; no ejecuta cobros TBK nuevos.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.payment_intent_service import CAPTURE_FAILED, CAPTURE_SUCCEEDED, PaymentIntentService
from services.payment_ledger import (
    EVT_CHARGE_SUCCESS,
    EVT_SAGA_REPAIR_ATTEMPT,
    EVT_SAGA_REPAIR_FAILURE,
    EVT_SAGA_REPAIR_SUCCESS,
    append_event,
    load_ledger_events_for_intent,
)

logger = logging.getLogger(__name__)


def compute_final_state(
    intent: Optional[dict[str, Any]],
    events: list[dict[str, Any]],
    *,
    has_charged_payment: bool,
) -> dict[str, Any]:
    """Estado financiero lógico final derivado de ledger + payments."""
    ledger_ok = any((e.get("type") == EVT_CHARGE_SUCCESS) for e in events)
    should_succeed_capture = bool(has_charged_payment or ledger_ok)
    return {
        "capture_outcome": CAPTURE_SUCCEEDED if should_succeed_capture else None,
        "ledger_has_charge_success": ledger_ok,
        "has_charged_payment": has_charged_payment,
    }


async def apply_resolved_state(
    db: AsyncIOMotorDatabase,
    intent: dict[str, Any],
    resolved: dict[str, Any],
) -> bool:
    bid = intent.get("booking_id")
    if not bid or not resolved.get("capture_outcome"):
        return False
    pis = PaymentIntentService(db)
    cap = intent.get("payment_capture_status") or "idle"
    if cap == CAPTURE_SUCCEEDED:
        return True
    await pis.set_payment_capture_outcome(bid, resolved["capture_outcome"])
    return True


async def recover_saga(db: AsyncIOMotorDatabase, intent_id: str) -> dict[str, Any]:
    """
    Carga intent, eventos de ledger y fila payments; aplica alineación segura.
    """
    await append_event(
        db,
        EVT_SAGA_REPAIR_ATTEMPT,
        {"intent_id": intent_id},
    )
    raw = await db.payment_intents.find_one({"id": intent_id}, {"_id": 0})
    if not raw:
        await append_event(
            db,
            EVT_SAGA_REPAIR_FAILURE,
            {"intent_id": intent_id, "reason": "intent_not_found"},
        )
        return {"ok": False, "reason": "intent_not_found"}

    intent = dict(raw)
    sr_id = intent.get("service_request_id")
    bid = intent.get("booking_id")
    events = await load_ledger_events_for_intent(
        db,
        intent_id=intent_id,
        booking_id=bid,
        service_request_id=sr_id,
    )
    pay = None
    if sr_id:
        pay = await db.payments.find_one(
            {"serviceRequestId": sr_id, "status": "charged"},
            {"_id": 0},
        )
    resolved = compute_final_state(
        intent,
        events,
        has_charged_payment=bool(pay),
    )
    try:
        if resolved.get("capture_outcome") and (intent.get("payment_capture_status") != CAPTURE_SUCCEEDED):
            await apply_resolved_state(db, intent, resolved)
            await append_event(
                db,
                EVT_SAGA_REPAIR_SUCCESS,
                {
                    "intent_id": intent_id,
                    "booking_id": bid,
                    "service_request_id": sr_id,
                    "resolved": resolved,
                },
            )
            return {"ok": True, "resolved": resolved}

        # processing → failed: solo si NO hay ledger success, NO hay payment charged y NO hay booking_id
        # (transición estricta; con booking_id pero sin evidencia no se fuerza failed aquí).
        if not resolved["ledger_has_charge_success"] and not resolved["has_charged_payment"]:
            if (intent.get("payment_capture_status") or "") == "processing":
                if not bid:
                    await db.payment_intents.update_one(
                        {"id": intent_id},
                        {
                            "$set": {
                                "payment_capture_status": CAPTURE_FAILED,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            },
                            "$inc": {"version": 1},
                        },
                    )
                    await append_event(
                        db,
                        EVT_SAGA_REPAIR_SUCCESS,
                        {
                            "intent_id": intent_id,
                            "action": "release_processing_to_failed",
                            "rule": "no_ledger_no_payment_no_booking_id",
                        },
                    )
                    return {"ok": True, "resolved": {"action": "released_processing"}}
                await append_event(
                    db,
                    EVT_SAGA_REPAIR_FAILURE,
                    {
                        "intent_id": intent_id,
                        "reason": "processing_without_evidence_but_booking_id_present",
                        "booking_id": bid,
                        "resolved": resolved,
                    },
                )
                return {"ok": False, "resolved": resolved}

        await append_event(
            db,
            EVT_SAGA_REPAIR_FAILURE,
            {"intent_id": intent_id, "reason": "no_action_needed_or_unsafe", "resolved": resolved},
        )
        return {"ok": False, "resolved": resolved}
    except Exception as e:
        logger.exception("recover_saga: %s", e)
        await append_event(
            db,
            EVT_SAGA_REPAIR_FAILURE,
            {"intent_id": intent_id, "error": str(e)[:400]},
        )
        return {"ok": False, "error": str(e)}
