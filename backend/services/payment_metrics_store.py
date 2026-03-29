"""
Contadores persistentes de payment_rollout (MongoDB, compartido entre instancias).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

COLLECTION = "payment_rollout_counters"
DOC_ID = "global"


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[COLLECTION].create_index("_id", name="idx_counters_id")
    except Exception as e:
        logger.warning("payment_rollout_counters index: %s", e)


async def inc_fields(db: AsyncIOMotorDatabase, **deltas: int) -> None:
    if not deltas:
        return
    await db[COLLECTION].update_one(
        {"_id": DOC_ID},
        {"$inc": deltas},
        upsert=True,
    )


async def get_counter_doc(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    doc = await db[COLLECTION].find_one({"_id": DOC_ID}, {"_id": 0})
    return dict(doc) if doc else {}


def _rate(num: float, den: float) -> float:
    return round((num / den) if den > 0 else 0.0, 6)


async def build_hardening_snapshot_from_db(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    c = await get_counter_doc(db)
    replays = int(c.get("idempotency_replays") or 0)
    fresh = int(c.get("idempotency_fresh_executions") or 0)
    conflicts = int(c.get("idempotency_conflicts") or 0)
    leg_key = int(c.get("legacy_missing_idempotency_key") or 0)
    hdr_key = int(c.get("idempotency_key_from_header") or 0)
    leg_bid = int(c.get("legacy_missing_booking_id_generated") or 0)
    sup_bid = int(c.get("booking_ids_supplied") or 0)
    attempts = int(c.get("charge_attempts") or 0)
    succ = int(c.get("charge_successes") or 0)
    fail = int(c.get("charge_failures") or 0)

    total_idem = replays + fresh
    key_total = leg_key + hdr_key
    bid_total = leg_bid + sup_bid

    return {
        "idempotency_hit_rate": _rate(replays, float(total_idem)),
        "duplicate_request_rate": _rate(replays, float(total_idem)),
        "charge_success_rate": _rate(succ, float(attempts)),
        "charge_failure_rate": _rate(fail, float(attempts)),
        "legacy_missing_key_rate": _rate(leg_key, float(key_total)),
        "booking_id_generated_rate": _rate(leg_bid, float(bid_total)),
        "replay_count": replays,
        "conflict_409_count": conflicts,
    }
