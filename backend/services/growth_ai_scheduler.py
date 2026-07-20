from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from uuid import uuid4

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


def _bool_env(name: str, default: bool = False) -> bool:
    v = str(os.environ.get(name, "")).strip().lower()
    if not v:
        return default
    return v in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    raw = str(os.environ.get(name, "")).strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _scl_now() -> datetime:
    return datetime.now(ZoneInfo("America/Santiago"))


async def _ensure_indexes(db) -> None:
    await db.growth_nodes.create_index([("id", 1)], unique=True, name="uniq_growth_node_id")
    await db.growth_programs.create_index([("id", 1)], unique=True, name="uniq_growth_program_id")
    await db.growth_opportunities.create_index([("id", 1)], unique=True, name="uniq_growth_opp_id")
    await db.growth_automations.create_index([("id", 1)], unique=True, name="uniq_growth_auto_id")
    await db.growth_actions.create_index([("id", 1)], unique=True, name="uniq_growth_action_id")
    await db.growth_audit.create_index([("id", 1)], unique=True, name="uniq_growth_audit_id")
    await db.growth_audit.create_index([("processedAt", 1), ("at", 1)], name="idx_growth_audit_processed")
    await db.growth_contact_actions.create_index([("id", 1)], unique=True, name="uniq_growth_contact_action_id")
    await db.growth_contact_actions.create_index([("status", 1), ("createdAt", -1)], name="idx_growth_contact_action_status")
    await db.growth_contact_attempts.create_index([("id", 1)], unique=True, name="uniq_growth_contact_attempt_id")
    await db.growth_contact_attempts.create_index([("action_id", 1), ("at", -1)], name="idx_growth_contact_attempt_action")
    await db.growth_discovery_runs.create_index([("id", 1)], unique=True, name="uniq_growth_discovery_run_id")
    await db.growth_opportunity_items.create_index([("id", 1)], unique=True, name="uniq_growth_opportunity_item_id")
    await db.growth_opportunity_items.create_index([("status", 1), ("createdAt", -1)], name="idx_growth_opportunity_item_status")
    await db.growth_sms_suppressions.create_index([("id", 1)], unique=True, name="uniq_growth_sms_suppression_id")
    await db.growth_sms_suppressions.create_index([("phone", 1)], unique=True, name="uniq_growth_sms_suppression_phone")
    await db.growth_opportunity_items.create_index([("dedupe_key", 1)], unique=True, name="uniq_growth_opportunity_item_dedupe")
    await db.growth_discovery_runs.create_index([("at", -1)], name="idx_growth_discovery_runs_at")
    await db.growth_learning_stats.create_index([("id", 1)], unique=True, name="uniq_growth_learning_stats_id")
    await db.growth_learning_stats.create_index([("updatedAt", -1)], name="idx_growth_learning_stats_updated")


async def _seed_if_empty(db) -> None:
    if await db.growth_nodes.estimated_document_count() == 0:
        now = _now_iso()
        await db.growth_nodes.insert_many(
            [
                {
                    "id": "lampa",
                    "name": "Lampa",
                    "region": "RM",
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
                    "region": "RM",
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
                {
                    "id": "pudahuel",
                    "name": "Pudahuel",
                    "region": "RM",
                    "comuna": "Pudahuel",
                    "sequence": 3,
                    "status": "planned",
                    "traffic_light": "Preparar",
                    "traffic_tone": "amber",
                    "primary_gap": "—",
                    "zoc_summary": "—",
                    "createdAt": now,
                    "updatedAt": now,
                },
            ]
        )
    else:
        now = _now_iso()
        await db.growth_nodes.update_one(
            {"id": "pudahuel"},
            {
                "$set": {
                    "id": "pudahuel",
                    "name": "Pudahuel",
                    "region": "RM",
                    "comuna": "Pudahuel",
                    "sequence": 3,
                    "status": "planned",
                    "traffic_light": "Preparar",
                    "traffic_tone": "amber",
                    "primary_gap": "—",
                    "zoc_summary": "—",
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
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

    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {
            "$setOnInsert": {
                "createdAt": _now_iso(),
                "config": {
                    "autopilot": {
                        "enabled": False,
                        "discovery_enabled": True,
                        "outreach_enabled": True,
                        "auto_approve": True,
                        "auto_execute": False,
                        "max_actions_per_tick": 10,
                        "max_exec_per_tick": 5,
                        "discovery_min_interval_min": 30,
                        "allowed_node_ids": ["lampa", "quilicura", "pudahuel"],
                    },
                    "market": {
                        "country": "Chile",
                        "region": "RM",
                        "strategic_definition": "MAQGO es el marketplace de maquinaria pesada con operador para particulares, contratistas y pequeñas y medianas empresas que ejecutan trabajos en terreno y necesitan acceder a maquinaria de forma rápida, simple y confiable, sin depender de contratos de largo plazo ni procesos tradicionales de cotización.",
                    },
                    "sender": {"recommended_from": "equipo@maqgo.cl", "recommended_name": "Equipo MAQGO", "env_var": "SENDER_EMAIL", "env_var_name": "SENDER_NAME"},
                },
            }
        },
        upsert=True,
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


def _learning_key(*, node_id: str, persona: str, role: str, channel: str, machine: str) -> str:
    base = "|".join(
        [
            (node_id or "").strip().lower(),
            (persona or "").strip().lower(),
            (role or "").strip().lower(),
            (channel or "").strip().lower(),
            (machine or "").strip().lower(),
        ]
    )
    return str(uuid.uuid5(uuid.NAMESPACE_URL, base))


async def _update_learning_stats(
    db,
    *,
    node_id: str,
    persona: str,
    role: str,
    channel: str,
    machine: str,
    outcome: str,
) -> None:
    kid = _learning_key(node_id=node_id, persona=persona, role=role, channel=channel, machine=machine)
    now = _now_iso()
    inc: dict[str, int] = {"counters.total": 1}
    out = (outcome or "").strip().lower()
    if out:
        inc[f"counters.{out}"] = 1
    await db.growth_learning_stats.update_one(
        {"id": kid},
        {
            "$set": {"id": kid, "node_id": node_id, "persona": persona, "role": role, "channel": channel, "machine": machine, "updatedAt": now},
            "$setOnInsert": {"createdAt": now, "counters": {}},
            "$inc": inc,
        },
        upsert=True,
    )


async def _sms_guardrails_for_scheduler(db, phone: str) -> tuple[bool, str]:
    enabled = _bool_env("MAQGO_GROWTH_SMS_ENABLED", False)
    if not enabled:
        return (False, "sms_disabled")

    s = await db.growth_sms_suppressions.find_one({"phone": phone}, {"_id": 0})
    if s:
        return (False, "sms_suppressed")

    now = _scl_now()
    start_h = _int_env("MAQGO_GROWTH_SMS_ALLOWED_HOUR_START", 9)
    end_h = _int_env("MAQGO_GROWTH_SMS_ALLOWED_HOUR_END", 19)
    if now.hour < start_h or now.hour >= end_h:
        return (False, "sms_outside_window")

    per_phone = _int_env("MAQGO_GROWTH_SMS_PER_PHONE_PER_DAY", 1)
    per_day = _int_env("MAQGO_GROWTH_SMS_DAILY_LIMIT", 150)

    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_start_utc = day_start.astimezone(timezone.utc)

    phone_count = await db.growth_contact_attempts.count_documents(
        {"channel": "sms", "to": phone, "at": {"$gte": day_start_utc.isoformat()}},
        limit=10000,
    )
    if phone_count >= per_phone:
        return (False, "sms_phone_daily_limit")

    global_count = await db.growth_contact_attempts.count_documents(
        {"channel": "sms", "at": {"$gte": day_start_utc.isoformat()}},
        limit=100000,
    )
    if global_count >= per_day:
        return (False, "sms_global_daily_limit")

    return (True, "")


def _append_sms_stop_if_possible(message: str) -> str:
    msg = (message or "").strip()
    if "stop" in msg.lower():
        return msg
    suffix = " Responde STOP para no recibir más mensajes."
    if len(msg) + len(suffix) <= 480:
        return msg + suffix
    return msg


async def _autopilot_tick(db) -> dict[str, int]:
    state = await db.config.find_one({"_id": "growth_ai_state"}, {"_id": 0})
    state_cfg = (state or {})
    last_discovery_at = str(state_cfg.get("last_discovery_at") or "").strip()

    cfg_doc = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (cfg_doc or {}).get("config") if isinstance(cfg_doc, dict) else None
    if not isinstance(cfg, dict):
        cfg = {}
    autopilot = cfg.get("autopilot") if isinstance(cfg.get("autopilot"), dict) else {}

    enabled = bool(autopilot.get("enabled", False))
    enabled = _bool_env("MAQGO_GROWTH_AUTOPILOT_ENABLED", enabled)
    if not enabled:
        return {"discovery_runs": 0, "leads_triaged": 0, "actions_created": 0, "actions_executed": 0}

    discovery_enabled = bool(autopilot.get("discovery_enabled", True))
    outreach_enabled = bool(autopilot.get("outreach_enabled", True))
    auto_approve = bool(autopilot.get("auto_approve", True))
    auto_execute = bool(autopilot.get("auto_execute", False))

    max_actions_per_tick = int(autopilot.get("max_actions_per_tick", 10) or 10)
    max_exec_per_tick = int(autopilot.get("max_exec_per_tick", 5) or 5)
    discovery_min_interval_min = int(autopilot.get("discovery_min_interval_min", 30) or 30)

    allowed_nodes = autopilot.get("allowed_node_ids")
    if not isinstance(allowed_nodes, list):
        allowed_nodes = []
    allowed_nodes = [str(x).strip() for x in allowed_nodes if str(x).strip()]
    if not allowed_nodes:
        nodes = await db.growth_nodes.find({"region": "RM"}, {"_id": 0, "id": 1}).sort("sequence", 1).to_list(length=10)
        allowed_nodes = [str(n.get("id") or "").strip() for n in nodes if str(n.get("id") or "").strip()][:3]

    now_iso = _now_iso()
    out = {"discovery_runs": 0, "leads_triaged": 0, "actions_created": 0, "actions_executed": 0}

    if discovery_enabled:
        should_run = True
        if last_discovery_at:
            try:
                last_dt = datetime.fromisoformat(last_discovery_at.replace("Z", "+00:00"))
                mins = (datetime.now(timezone.utc) - last_dt).total_seconds() / 60.0
                should_run = mins >= float(discovery_min_interval_min)
            except Exception:
                should_run = True

        if should_run:
            try:
                from services.growth_ai_discovery import run_discovery_once

                res = await run_discovery_once(db=db, config=cfg)
                out["discovery_runs"] = 1
                await db.config.update_one(
                    {"_id": "growth_ai_state"},
                    {"$set": {"last_discovery_at": now_iso, "last_discovery_run": res, "updatedAt": now_iso}, "$setOnInsert": {"createdAt": now_iso}},
                    upsert=True,
                )
            except Exception as e:
                await db.config.update_one(
                    {"_id": "growth_ai_state"},
                    {"$set": {"last_discovery_at": now_iso, "last_discovery_error": str(e)[:300], "updatedAt": now_iso}, "$setOnInsert": {"createdAt": now_iso}},
                    upsert=True,
                )

    if not outreach_enabled:
        return out

    from services.growth_ai_copy_engine import draft_outreach_message
    from services.growth_ai_contact_executor import execute_contact_action as _exec

    async def _sent_rate(channel: str, *, node_id: str, persona: str, role: str, machine: str) -> tuple[int, float]:
        kid = _learning_key(node_id=node_id, persona=persona, role=role, channel=channel, machine=machine)
        doc = await db.growth_learning_stats.find_one({"id": kid}, {"_id": 0})
        counters = doc.get("counters") if isinstance(doc, dict) else None
        if not isinstance(counters, dict):
            return (0, 0.0)
        total = int(counters.get("total") or 0)
        sent = int(counters.get("sent") or 0)
        if total <= 0:
            return (0, 0.0)
        return (total, sent / float(total))

    lead_filter: dict = {"status": "new"}
    if allowed_nodes:
        lead_filter["node_id"] = {"$in": allowed_nodes}

    cursor = db.growth_opportunity_items.find(lead_filter, {"_id": 0}).sort("createdAt", 1)
    created = 0
    triaged = 0
    async for lead in cursor:
        if created >= max_actions_per_tick:
            break

        lead_id = str(lead.get("id") or "").strip()
        if not lead_id:
            continue

        contact = lead.get("contact") if isinstance(lead.get("contact"), dict) else {}
        emails = contact.get("emails") if isinstance(contact.get("emails"), list) else []
        phones = contact.get("phones") if isinstance(contact.get("phones"), list) else []
        email = str(emails[0]).strip().lower() if emails else ""
        phone = str(phones[0]).strip() if phones else ""

        if not email and not phone:
            await db.growth_opportunity_items.update_one({"id": lead_id}, {"$set": {"status": "triaged_no_contact", "updatedAt": now_iso}})
            triaged += 1
            continue

        kind = str(lead.get("kind") or "").strip().lower()
        persona = "proveedor" if kind == "supply" else "cliente"

        title = str(lead.get("title") or "").strip().lower()
        link = str(lead.get("link") or "").strip().lower()
        low = f"{title} {link}"
        if "municip" in low or "dirección de obras" in low or "adquisiciones" in low or "secplan" in low:
            role = "Municipalidad / Compras"
        elif "gerente" in low or "operaciones" in low or "jefe de operaciones" in low:
            role = "Gerencia / Operaciones" if persona == "cliente" else "Gerencia"
        elif "jefe de obra" in low:
            role = "Jefatura de Obra"
        else:
            role = "Dueño / Administración"

        node_id = str(lead.get("node_id") or "").strip()
        node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0}) if node_id else None
        city = str((node or {}).get("comuna") or "").strip()
        machine = str(lead.get("category") or "").strip() or "maquinaria"

        if email and phone:
            e_n, e_rate = await _sent_rate("email", node_id=node_id, persona=persona, role=role, machine=machine)
            s_n, s_rate = await _sent_rate("sms", node_id=node_id, persona=persona, role=role, machine=machine)
            if e_n >= 5 and s_n >= 5 and s_rate > e_rate + 0.05:
                channel = "sms"
            else:
                channel = "email"
        else:
            channel = "email" if email else "sms"
        to = email if channel == "email" else phone

        existing = await db.growth_contact_actions.find_one(
            {"channel": channel, "to": to, "meta.lead_id": lead_id},
            {"_id": 0, "id": 1},
        )
        if existing:
            await db.growth_opportunity_items.update_one({"id": lead_id}, {"$set": {"status": "triaged_duplicate_contact", "updatedAt": now_iso}})
            triaged += 1
            continue

        draft = await draft_outreach_message(persona=persona, context={"city": city, "machine": machine, "role": role})
        result = draft.get("result") if isinstance(draft, dict) else None
        if not isinstance(result, dict):
            continue

        action_id = str(uuid4())
        subject = str(result.get("subject") or "").strip()
        message = str(result.get("message") or "").strip()
        reason = str(result.get("short_reason") or "").strip() or "autopilot"

        exec_mode = "auto" if auto_execute else "manual"
        status = "approved" if auto_approve else "draft"
        now2 = _now_iso()
        await db.growth_contact_actions.insert_one(
            {
                "id": action_id,
                "status": status,
                "node_id": node_id,
                "persona": persona,
                "channel": channel,
                "to": to,
                "subject": subject,
                "message": message,
                "reason": reason,
                "execution_mode": exec_mode,
                "meta": {
                    "lead_id": lead_id,
                    "lead_kind": kind,
                    "lead_source": lead.get("source"),
                    "lead_source_type": lead.get("source_type"),
                    "lead_url": lead.get("link"),
                    "role": role,
                    "machine": machine,
                },
                "approvedAt": now2 if status == "approved" else None,
                "createdAt": now2,
                "updatedAt": now2,
            }
        )
        await db.growth_opportunity_items.update_one(
            {"id": lead_id},
            {"$set": {"status": "contact_planned" if status != "approved" else "contact_approved", "updatedAt": now2, "lastContactActionId": action_id}},
        )
        created += 1
        triaged += 1

    out["actions_created"] = created
    out["leads_triaged"] = triaged

    if not auto_execute:
        return out

    exec_cursor = db.growth_contact_actions.find(
        {"status": "approved", "execution_mode": "auto"},
        {"_id": 0},
    ).sort("approvedAt", 1)

    executed = 0
    async for a in exec_cursor:
        if executed >= max_exec_per_tick:
            break

        action_id = str(a.get("id") or "").strip()
        if not action_id:
            continue

        channel = str(a.get("channel") or "").strip().lower()
        to = str(a.get("to") or "").strip()
        subject = str(a.get("subject") or "").strip()
        message = str(a.get("message") or "").strip()

        if channel == "sms":
            ok, err = await _sms_guardrails_for_scheduler(db, to)
            if not ok:
                await db.growth_contact_actions.update_one({"id": action_id}, {"$set": {"status": "failed", "updatedAt": _now_iso(), "lastError": err}})
                continue
            message = _append_sms_stop_if_possible(message)

        res = await _exec(channel=channel, to=to, subject=subject, message=message)
        attempt_id = str(uuid4())
        await db.growth_contact_attempts.insert_one(
            {
                "id": attempt_id,
                "action_id": action_id,
                "channel": channel,
                "to": to,
                "status": str(res.get("status") or "").strip().lower(),
                "provider": res.get("provider"),
                "provider_id": res.get("id") or res.get("provider_id"),
                "url": res.get("url"),
                "error": res.get("error"),
                "at": _now_iso(),
            }
        )

        new_status = str(res.get("status") or "").strip().lower() or "failed"
        if new_status == "sent":
            await db.growth_contact_actions.update_one(
                {"id": action_id},
                {"$set": {"status": "executed", "executedAt": _now_iso(), "updatedAt": _now_iso(), "lastError": None}},
            )
        elif new_status == "manual_required":
            await db.growth_contact_actions.update_one(
                {"id": action_id},
                {"$set": {"status": "manual_required", "updatedAt": _now_iso(), "manualUrl": res.get("url") or ""}},
            )
        else:
            await db.growth_contact_actions.update_one(
                {"id": action_id},
                {"$set": {"status": "failed", "updatedAt": _now_iso(), "lastError": res.get("error")}},
            )

        meta = a.get("meta") if isinstance(a.get("meta"), dict) else {}
        lead_id = str(meta.get("lead_id") or "").strip()
        if lead_id:
            await db.growth_opportunity_items.update_one(
                {"id": lead_id},
                {"$set": {"status": "contacted" if new_status == "sent" else "contact_failed", "updatedAt": _now_iso(), "lastAttemptId": attempt_id}},
            )

        await _update_learning_stats(
            db,
            node_id=str(a.get("node_id") or ""),
            persona=str(a.get("persona") or ""),
            role=str(meta.get("role") or ""),
            channel=channel,
            machine=str(meta.get("machine") or ""),
            outcome=new_status,
        )

        executed += 1

    out["actions_executed"] = executed
    return out


async def run_growth_ai_cycle(db) -> None:
    await db.config.update_one(
        {"_id": "growth_ai_state"},
        {"$set": {"last_tick_at": _now_iso(), "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )

    autopilot_stats = await _autopilot_tick(db)
    await db.config.update_one(
        {"_id": "growth_ai_state"},
        {"$set": {"last_autopilot_stats": autopilot_stats, "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )
    processed = await _process_unprocessed_audit_events(db)
    if processed:
        logger.info("Growth AI processed %s audit events", processed)

    try:
        await db.growth_audit.insert_one(
            {
                "id": str(uuid.uuid4()),
                "title": "Brain tick",
                "detail": "cycle_completed",
                "node_id": None,
                "severity": "INFO",
                "event_type": "brain_tick",
                "at": _now_iso(),
                "processedAt": _now_iso(),
                "processedBy": "brain",
            }
        )
    except Exception:
        pass


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
