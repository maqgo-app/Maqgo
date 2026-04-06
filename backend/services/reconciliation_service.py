"""
Reconciliación best-effort: payment_intent vs fila de pago local (TBK sin API de consulta por intent en MVP).

Idempotente: re-ejecutar solo añade eventos `reconciliation_mismatch` si sigue habiendo drift
(el caller puede deduplicar por intent_id en payload si lo necesita).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.payment_ledger import EVT_RECONCILIATION_MISMATCH, append_event

logger = logging.getLogger(__name__)


async def provider_check_local(
    db: AsyncIOMotorDatabase,
    intent: dict[str, Any],
) -> str:
    """
    Estado derivado desde datos persistidos (proxy de "proveedor" = cobro registrado).
    """
    sr_id = intent.get("service_request_id")
    if not sr_id:
        return "no_service_request"
    pay = await db.payments.find_one(
        {"serviceRequestId": sr_id, "status": "charged"},
        {"_id": 0, "id": 1, "tbkBuyOrder": 1},
    )
    return "provider_charged" if pay else "provider_not_charged"


async def reconcile_payment_intents(
    db: AsyncIOMotorDatabase,
    *,
    limit: int = 500,
    booking_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Batch idempotente: escanea intents y emite eventos si hay drift intent ↔ payments.
    """
    limit = max(1, min(int(limit or 500), int(os.environ.get("MAQGO_RECONCILE_MAX_BATCH", "2000"))))
    q: dict[str, Any] = {}
    if booking_id:
        q["booking_id"] = booking_id

    scanned = 0
    mismatches = 0
    try:
        cursor = db.payment_intents.find(q).limit(limit)
        async for intent in cursor:
            scanned += 1
            intent = {k: v for k, v in intent.items() if k != "_id"}
            sr_id = intent.get("service_request_id")
            if not sr_id:
                continue
            prov = await provider_check_local(db, intent)
            cap = intent.get("payment_capture_status") or "idle"

            drift = (cap == "succeeded" and prov != "provider_charged") or (
                prov == "provider_charged" and cap not in ("succeeded", "processing")
            )

            if drift:
                mismatches += 1
                await append_event(
                    db,
                    EVT_RECONCILIATION_MISMATCH,
                    {
                        "intent_id": intent.get("id"),
                        "booking_id": intent.get("booking_id"),
                        "service_request_id": sr_id,
                        "payment_capture_status": cap,
                        "state": intent.get("state"),
                        "provider_derived": prov,
                    },
                )
    except Exception as e:
        logger.exception("reconcile_payment_intents: %s", e)
        raise

    return {"scanned": scanned, "mismatches_logged": mismatches, "limit": limit}
