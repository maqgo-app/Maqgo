from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from loguru import logger


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _interval_sec() -> float:
    raw = os.environ.get("MAQGO_GROWTH_AI_INTERVAL_SECONDS", "12").strip()
    try:
        v = float(raw)
    except Exception:
        v = 12.0
    return max(8.0, min(30.0, v))


async def _ensure_indexes(db) -> None:
    await db.growth_nodes.create_index([("id", 1)], unique=True, name="uniq_growth_node_id")
    await db.growth_programs.create_index([("id", 1)], unique=True, name="uniq_growth_program_id")
    await db.growth_opportunities.create_index([("id", 1)], unique=True, name="uniq_growth_opp_id")
    await db.growth_automations.create_index([("id", 1)], unique=True, name="uniq_growth_auto_id")
    await db.growth_actions.create_index([("id", 1)], unique=True, name="uniq_growth_action_id")
    await db.growth_audit.create_index([("id", 1)], unique=True, name="uniq_growth_audit_id")
    await db.growth_audit.create_index([("processedAt", 1), ("at", 1)], name="idx_growth_audit_processed")


async def _seed_if_empty(db) -> None:
    if await db.growth_nodes.estimated_document_count() == 0:
        now = _now_iso()
        await db.growth_nodes.insert_many(
            [
                {
                    "id": "lampa",
                    "name": "Lampa",
                    "comuna": "Lampa",
                    "sequence": 1,
                    "status": "planned",
                    "traffic_light": "Preparar",
                    "traffic_tone": "amber",
                    "primary_gap": "Retroexcavadoras insuficientes",
                    "zoc_summary": "ZOC inicial: comuna + radios cercanos (MVP)",
                    "createdAt": now,
                    "updatedAt": now,
                },
                {
                    "id": "quilicura",
                    "name": "Quilicura",
                    "comuna": "Quilicura",
                    "sequence": 2,
                    "status": "planned",
                    "traffic_light": "Esperar",
                    "traffic_tone": "neutral",
                    "primary_gap": "—",
                    "zoc_summary": "—",
                    "createdAt": now,
                    "updatedAt": now,
                },
            ]
        )

    if await db.growth_automations.estimated_document_count() == 0:
        now = _now_iso()
        await db.growth_automations.insert_many(
            [
                {
                    "id": "gap_scan",
                    "title": "Detección de brechas (Nodo+Categoría)",
                    "description": "Identifica brechas de serviceability y propone acciones.",
                    "enabled": True,
                    "createdAt": now,
                    "updatedAt": now,
                },
                {
                    "id": "risk_watch",
                    "title": "Monitoreo de deterioro",
                    "description": "Detecta señales tempranas de deterioro y recomienda protección.",
                    "enabled": True,
                    "createdAt": now,
                    "updatedAt": now,
                },
            ]
        )

    if await db.growth_opportunities.estimated_document_count() == 0:
        now = _now_iso()
        await db.growth_opportunities.insert_many(
            [
                {
                    "id": str(uuid.uuid4()),
                    "title": "Proveedor potencial: retroexcavadoras (RM Norte)",
                    "detail": "Señal detectada en fuente autorizada. Requiere validación.",
                    "source": "discovery",
                    "node_id": "lampa",
                    "category": "retroexcavadora",
                    "status": "new",
                    "createdAt": now,
                    "updatedAt": now,
                }
            ]
        )


async def _process_unprocessed_audit_events(db) -> int:
    cursor = db.growth_audit.find({"processedAt": None}, {"_id": 0}).sort("at", 1)
    count = 0
    async for ev in cursor:
        ev_id = str(ev.get("id") or "")
        if not ev_id:
            continue

        et = str(ev.get("event_type") or "")
        node_id = str(ev.get("node_id") or "")
        title = str(ev.get("title") or "")
        detail = str(ev.get("detail") or "")

        if et == "program_approved":
            action_id = str(uuid.uuid4())
            await db.growth_actions.insert_one(
                {
                    "id": action_id,
                    "title": "Preparar ejecución autorizada",
                    "reason": f"Programa aprobado: {detail or title}",
                    "node_id": node_id,
                    "status": "open",
                    "createdAt": _now_iso(),
                    "updatedAt": _now_iso(),
                }
            )

        await db.growth_audit.update_one({"id": ev_id}, {"$set": {"processedAt": _now_iso(), "processedBy": "brain"}})
        count += 1
        if count >= 50:
            break
    return count


async def run_growth_ai_cycle(db) -> None:
    await db.config.update_one(
        {"_id": "growth_ai_state"},
        {"$set": {"last_tick_at": _now_iso(), "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )
    processed = await _process_unprocessed_audit_events(db)
    if processed:
        logger.info("Growth AI processed %s audit events", processed)


async def growth_ai_scheduler() -> None:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from db_config import get_db_name, get_mongo_url
        from services.scheduler_lock import try_acquire_mongo_lock
    except Exception as e:
        logger.warning("Growth AI scheduler no iniciado (dependencias): %s", e)
        return

    try:
        ic = AsyncIOMotorClient(get_mongo_url(), serverSelectionTimeoutMS=3000)
        db = ic[get_db_name()]
        await ic.admin.command("ping")
    except Exception as e:
        logger.warning("MongoDB no disponible. Growth AI scheduler desactivado. Error: %s", e)
        return

    try:
        await _ensure_indexes(db)
        await _seed_if_empty(db)
    except Exception as e:
        logger.warning("Growth AI ensure/seed falló (continuando): %s", e)

    interval = _interval_sec()
    owner = str(os.environ.get("MAQGO_INSTANCE_ID") or "").strip() or str(uuid.uuid4())
    ttl_sec = max(30, int(interval * 4))
    has_lock = False
    logger.info("🧠 Growth AI scheduler iniciado (intervalo=%ss)", interval)

    while True:
        try:
            acquired = await try_acquire_mongo_lock(db, "growth_ai_scheduler", owner=owner, ttl_sec=ttl_sec)
            if acquired:
                if not has_lock:
                    logger.info("🧠 Growth AI lock adquirido (single-runner)")
                has_lock = True
                await run_growth_ai_cycle(db)
            else:
                if has_lock:
                    logger.warning("🧠 Growth AI lock perdido; otra instancia ejecutará")
                has_lock = False
        except Exception as e:
            logger.error("Error en Growth AI scheduler: %s", e)
        await asyncio.sleep(interval)

