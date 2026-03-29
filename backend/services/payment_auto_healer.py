"""
Auto-healing (capa aditiva).

Ejecuta repair sobre casos seguros; casos no seguros → dead_letter_payment + auto_heal_triggered.
No modifica reglas de negocio del cobro.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.payment_consistency_engine import detect_inconsistencies, repair_inconsistency
from services.payment_ledger import EVT_AUTO_HEAL_TRIGGERED, append_dead_letter_payment, append_event

logger = logging.getLogger(__name__)


async def run_auto_heal(
    db: AsyncIOMotorDatabase,
    *,
    limit: int = 500,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 500), int(os.environ.get("MAQGO_AUTO_HEAL_MAX", "3000"))))
    await append_event(
        db,
        EVT_AUTO_HEAL_TRIGGERED,
        {"phase": "start", "limit": limit},
    )
    cases = await detect_inconsistencies(db, limit=limit)
    fixed = 0
    skipped_unsafe = 0
    for c in cases:
        if c.get("is_safe_to_fix"):
            ok = await repair_inconsistency(db, c)
            if ok:
                fixed += 1
                await append_event(
                    db,
                    EVT_AUTO_HEAL_TRIGGERED,
                    {
                        "success": True,
                        "kind": c.get("kind"),
                        "intent_id": c.get("intent_id"),
                        "booking_id": c.get("booking_id"),
                    },
                )
            else:
                await append_event(
                    db,
                    EVT_AUTO_HEAL_TRIGGERED,
                    {
                        "success": False,
                        "kind": c.get("kind"),
                        "reason": "repair_returned_false",
                    },
                )
        else:
            skipped_unsafe += 1
            await append_dead_letter_payment(
                db,
                reason=f"auto_heal_unsafe_{c.get('kind')}",
                payload={
                    "case": c,
                },
            )
            await append_event(
                db,
                EVT_AUTO_HEAL_TRIGGERED,
                {
                    "success": False,
                    "kind": c.get("kind"),
                    "phase": "dead_letter",
                },
            )

    await append_event(
        db,
        EVT_AUTO_HEAL_TRIGGERED,
        {
            "phase": "end",
            "cases": len(cases),
            "fixed": fixed,
            "skipped_unsafe": skipped_unsafe,
        },
    )
    return {
        "cases": len(cases),
        "fixed": fixed,
        "skipped_unsafe": skipped_unsafe,
        "limit": limit,
    }
