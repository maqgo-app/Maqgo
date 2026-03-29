"""
Ledger append-only de pagos (event sourcing ligero).

- Solo insert; nunca update/delete de eventos.
- Permite reconstruir historial y auditar cobros / idempotencia.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

COLLECTION = "payment_ledger"

# Tipos de evento (contrato estable)
EVT_CHARGE_ATTEMPT = "charge_attempt"
EVT_CHARGE_SUCCESS = "charge_success"
EVT_CHARGE_FAILURE = "charge_failure"
EVT_IDEMPOTENCY_REPLAY = "idempotency_replay"
EVT_IDEMPOTENCY_CONFLICT = "idempotency_conflict"
EVT_PAYMENT_INTENT_CREATED = "payment_intent_created"
EVT_PAYMENT_INTENT_UPDATED = "payment_intent_updated"
EVT_PROVIDER_CALL_EXECUTED = "provider_call_executed"
EVT_RECONCILIATION_MISMATCH = "reconciliation_mismatch"
EVT_DEAD_LETTER_PAYMENT = "dead_letter_payment"
EVT_SAGA_REPAIR_ATTEMPT = "saga_repair_attempt"
EVT_SAGA_REPAIR_SUCCESS = "saga_repair_success"
EVT_SAGA_REPAIR_FAILURE = "saga_repair_failure"
EVT_CONSISTENCY_CHECK_RUN = "consistency_check_run"
EVT_AUTO_HEAL_TRIGGERED = "auto_heal_triggered"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[COLLECTION].create_index("timestamp", name="idx_ledger_ts")
        await db[COLLECTION].create_index("type", name="idx_ledger_type")
        await db[COLLECTION].create_index([("type", 1), ("timestamp", -1)], name="idx_ledger_type_ts")
        await db[COLLECTION].create_index(
            [("type", 1), ("payload.service_request_id", 1)],
            name="idx_ledger_type_sr",
            sparse=True,
        )
    except Exception as e:
        logger.warning("payment_ledger index: %s", e)


async def ledger_has_charge_success_for_service_request(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
) -> bool:
    """Exactly-once lógico: si ya hay charge_success en ledger para este SR, no repetir efecto financiero."""
    doc = await db[COLLECTION].find_one(
        {
            "type": EVT_CHARGE_SUCCESS,
            "payload.service_request_id": service_request_id,
        },
        {"_id": 1},
    )
    return doc is not None


async def load_ledger_events_for_intent(
    db: AsyncIOMotorDatabase,
    *,
    intent_id: Optional[str] = None,
    booking_id: Optional[str] = None,
    service_request_id: Optional[str] = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Eventos de ledger relacionados a un intent / booking / SR (orden cronológico)."""
    ors = []
    if intent_id:
        ors.append({"payload.intent_id": intent_id})
    if booking_id:
        ors.append({"payload.booking_id": booking_id})
    if service_request_id:
        ors.append({"payload.service_request_id": service_request_id})
    if not ors:
        return []
    q = {"$or": ors}
    cur = db[COLLECTION].find(q).sort("timestamp", 1).limit(limit)
    return await cur.to_list(length=limit)


async def append_event(
    db: AsyncIOMotorDatabase,
    event_type: str,
    payload: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """
    Inserta un evento inmutable. Fallos se registran y no deben tumbar el flujo principal
    (el caller puede ignorar el return).
    """
    try:
        eid = f"ple_{uuid.uuid4().hex[:20]}"
        doc = {
            "_id": eid,
            "id": eid,
            "type": event_type,
            "payload": payload or {},
            "timestamp": _now_iso(),
        }
        await db[COLLECTION].insert_one(doc)
        return eid
    except Exception as e:
        logger.exception("payment_ledger append_event failed type=%s: %s", event_type, e)
        return None


async def append_dead_letter_payment(
    db: AsyncIOMotorDatabase,
    *,
    reason: str,
    payload: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Marcador para fallos irreversibles / estado inconsistente (controlado)."""
    pl = dict(payload or {})
    pl["reason"] = reason
    return await append_event(db, EVT_DEAD_LETTER_PAYMENT, pl)


async def aggregate_ledger_admin_metrics(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    """Agregados para panel admin (solo lectura)."""
    try:
        total = await db[COLLECTION].count_documents({})
    except Exception:
        total = 0
    by_type: dict[str, int] = {}
    try:
        cursor = db[COLLECTION].aggregate(
            [
                {"$group": {"_id": "$type", "n": {"$sum": 1}}},
            ]
        )
        async for row in cursor:
            tid = row.get("_id") or "unknown"
            by_type[str(tid)] = int(row.get("n") or 0)
    except Exception as e:
        logger.warning("ledger aggregate: %s", e)
    mismatches = int(by_type.get(EVT_RECONCILIATION_MISMATCH, 0))
    saga_repairs = int(by_type.get(EVT_SAGA_REPAIR_SUCCESS, 0))
    dead_letter = int(by_type.get(EVT_DEAD_LETTER_PAYMENT, 0))
    auto_heal_ok = 0
    auto_heal_fail = 0
    try:
        auto_heal_ok = await db[COLLECTION].count_documents(
            {"type": EVT_AUTO_HEAL_TRIGGERED, "payload.success": True}
        )
        auto_heal_fail = await db[COLLECTION].count_documents(
            {"type": EVT_AUTO_HEAL_TRIGGERED, "payload.success": False}
        )
    except Exception:
        pass
    ah_total = auto_heal_ok + auto_heal_fail
    auto_heal_success_rate = round((auto_heal_ok / ah_total) if ah_total > 0 else 0.0, 6)

    return {
        "total_events_logged": total,
        "event_counts_by_type": by_type,
        "reconciliation_mismatches": mismatches,
        "saga_repair_count": saga_repairs,
        "dead_letter_payment_count": dead_letter,
        "auto_heal_success_rate": auto_heal_success_rate,
        "auto_heal_resolved_count": auto_heal_ok,
        "auto_heal_failed_count": auto_heal_fail,
    }
