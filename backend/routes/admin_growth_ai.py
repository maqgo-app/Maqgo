from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any, Optional
from uuid import uuid4

from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin_strict
from db_config import get_db_name, get_mongo_url
from services.growth_ai_scheduler import run_growth_ai_cycle


router = APIRouter(prefix="/admin/growth-ai", tags=["admin-growth-ai"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


async def _bootstrap_nodes_if_empty() -> None:
    if await db.growth_nodes.estimated_document_count() > 0:
        return

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
                "pipeline_stage": "captando",
                "traffic_light": "Preparar",
                "traffic_tone": "amber",
                "primary_gap": "Oferta por maquinaria",
                "zoc_summary": "Abrir por maquinaria (mínimo oferta activa).",
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
                "pipeline_stage": "captando",
                "traffic_light": "Preparar",
                "traffic_tone": "amber",
                "primary_gap": "Oferta por maquinaria",
                "zoc_summary": "Abrir por maquinaria (mínimo oferta activa).",
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
                "pipeline_stage": "captando",
                "traffic_light": "Preparar",
                "traffic_tone": "amber",
                "primary_gap": "Oferta por maquinaria",
                "zoc_summary": "Abrir por maquinaria (mínimo oferta activa).",
                "createdAt": now,
                "updatedAt": now,
            },
        ]
    )

    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {
            "$setOnInsert": {
                "createdAt": now,
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
                        "inventory_refresh_min_interval_min": 15,
                        "min_supply_per_machine": 3,
                        "require_go_live_approval_for_demand": True,
                        "allowed_node_ids": ["lampa", "quilicura", "pudahuel"],
                    },
                    "market": {
                        "country": "Chile",
                        "region": "RM",
                        "strategic_definition": "MAQGO es el marketplace de maquinaria pesada con operador para cualquier obra, faena o proyecto que necesite maquinaria de forma rápida, simple y confiable, con coordinación y seguimiento en línea.",
                    },
                },
            }
        },
        upsert=True,
    )

    await _audit(
        "Bootstrap Growth AI",
        "Se crearon nodos iniciales RM (Lampa, Quilicura, Pudahuel) y config base.",
        node_id="lampa",
        severity="INFO",
        event_type="bootstrap",
    )


def _google_news_rss(query: str) -> str:
    from urllib.parse import quote_plus

    q = quote_plus(query)
    return f"https://news.google.com/rss/search?q={q}&hl=es-419&gl=CL&ceid=CL:es-419"


async def _seed_discovery_sources_if_empty() -> int:
    conf = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (conf or {}).get("config") if isinstance(conf, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}
    sources = cfg.get("discovery_sources")
    if isinstance(sources, list) and len(sources) > 0:
        return len(sources)

    nodes = await db.growth_nodes.find({"region": "RM"}, {"_id": 0, "id": 1, "comuna": 1}).sort("sequence", 1).to_list(length=10)
    base: list[dict[str, Any]] = []

    for n in nodes:
        node_id = str(n.get("id") or "").strip()
        comuna = str(n.get("comuna") or "").strip()
        if not node_id or not comuna:
            continue

        base.extend(
            [
                {
                    "id": f"rm_{node_id}_prov_retro",
                    "url": _google_news_rss(f"arriendo retroexcavadora {comuna}"),
                    "type": "rss",
                    "kind": "supply",
                    "node_id": node_id,
                    "category": "retroexcavadora",
                    "enabled": True,
                    "max_items": 25,
                },
                {
                    "id": f"rm_{node_id}_prov_excavadora",
                    "url": _google_news_rss(f"arriendo excavadora {comuna}"),
                    "type": "rss",
                    "kind": "supply",
                    "node_id": node_id,
                    "category": "excavadora",
                    "enabled": True,
                    "max_items": 25,
                },
                {
                    "id": f"rm_{node_id}_prov_tolva",
                    "url": _google_news_rss(f"camion tolva arriendo {comuna}"),
                    "type": "rss",
                    "kind": "supply",
                    "node_id": node_id,
                    "category": "camion_tolva",
                    "enabled": True,
                    "max_items": 25,
                },
                {
                    "id": f"rm_{node_id}_demanda_mov_tierra",
                    "url": _google_news_rss(f"movimiento de tierra {comuna} retroexcavadora"),
                    "type": "rss",
                    "kind": "demand",
                    "node_id": node_id,
                    "category": "retroexcavadora",
                    "enabled": True,
                    "max_items": 25,
                },
            ]
        )

    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {"$set": {"config.discovery_sources": base, "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )
    await _audit("Discovery sources seeded", f"count={len(base)}", event_type="discovery")
    return len(base)


@router.get("/ping")
async def growth_ai_ping(_: dict = Depends(get_current_admin_strict)):
    await _bootstrap_nodes_if_empty()
    nodes_count = await db.growth_nodes.estimated_document_count()
    return {
        "ok": True,
        "nodes_count": int(nodes_count or 0),
        "has_config": bool(await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 1})),
    }


@router.post("/bootstrap")
async def growth_ai_bootstrap(_: dict = Depends(get_current_admin_strict)):
    await _bootstrap_nodes_if_empty()
    nodes = await db.growth_nodes.find({}, {"_id": 0, "id": 1, "comuna": 1, "region": 1}).sort("sequence", 1).to_list(length=50)
    return {"ok": True, "nodes": nodes}


@router.post("/start")
async def growth_ai_start(payload: GrowthStartPayload, _: dict = Depends(get_current_admin_strict)):
    await _bootstrap_nodes_if_empty()
    sources_count = await _seed_discovery_sources_if_empty()

    conf = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (conf or {}).get("config") if isinstance(conf, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}

    autopilot = cfg.get("autopilot") if isinstance(cfg.get("autopilot"), dict) else {}
    autopilot["enabled"] = True
    autopilot["discovery_enabled"] = True
    autopilot["outreach_enabled"] = bool(payload.include_outreach)
    autopilot["outreach_supply_enabled"] = True
    autopilot["outreach_demand_enabled"] = False
    autopilot["auto_execute"] = False
    autopilot["auto_execute_providers"] = bool(payload.auto_execute_providers)
    autopilot["auto_execute_clients"] = False

    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {"$set": {"config.autopilot": autopilot, "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )

    from services.growth_ai_discovery import run_discovery_once
    from services.growth_ai_scheduler import _autopilot_tick

    res = await run_discovery_once(db=db, config=cfg | {"autopilot": autopilot})
    autopilot_res = await _autopilot_tick(db)
    await _audit(
        "Growth start",
        f"sources={sources_count} created={res.get('items_created')} supply_outreach={True} demand_outreach={False} auto_execute_providers={bool(payload.auto_execute_providers)}",
        event_type="start",
    )
    return {"ok": True, "sources": sources_count, "discovery": res, "autopilot": autopilot_res}


@router.post("/stop")
async def growth_ai_stop(_: dict = Depends(get_current_admin_strict)):
    conf = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (conf or {}).get("config") if isinstance(conf, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}
    autopilot = cfg.get("autopilot") if isinstance(cfg.get("autopilot"), dict) else {}
    autopilot["enabled"] = False
    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {"$set": {"config.autopilot": autopilot, "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )
    await _audit("Growth stop", "autopilot.enabled=false", event_type="stop")
    return {"ok": True}


def _append_sms_stop_if_possible(msg: str) -> str:
    t = (msg or "").strip()
    if not t:
        return t
    if "stop" in t.lower():
        return t
    suffix = " Responde STOP para no recibir más mensajes."
    if len(t) + len(suffix) <= 480:
        return t + suffix
    return t


@router.post("/test/sms")
async def send_test_sms(payload: SmsTestPayload, _: dict = Depends(get_current_admin_strict)):
    from services.growth_ai_scheduler import _sms_guardrails_for_scheduler
    from services.growth_ai_contact_executor import execute_contact_action

    phone = payload.phone.strip()
    ok, err = await _sms_guardrails_for_scheduler(db, phone)
    if not ok:
        raise HTTPException(status_code=400, detail=f"sms_blocked:{err}")

    persona = payload.persona.strip().lower()
    comuna = payload.comuna.strip() or "RM"
    machine = payload.machine.strip() or "maquinaria"
    role = payload.role.strip()

    if persona in {"proveedor", "provider"}:
        base = f"MAQGO: {('Para ' + role + ': ') if role else ''}Estamos sumando proveedores de {machine} en {comuna}. Activa tu perfil y recibe solicitudes. Onboarding: https://maqgo.cl/provider/register"
    else:
        base = f"MAQGO: {('Para ' + role + ': ') if role else ''}Cotiza y reserva {machine} con operador en {comuna}, incluso para hoy (según disponibilidad). Responde: comuna + fecha/hora + trabajo."

    msg = _append_sms_stop_if_possible(base)
    res = await execute_contact_action(channel="sms", to=phone, subject="", message=msg)

    masked = phone[-4:] if len(phone) >= 4 else ""
    await _audit("SMS test", f"persona={persona} phone=***{masked}", event_type="sms_test")
    return {"ok": True, "message": msg, "result": res}


@router.post("/test/sms/batch")
async def send_test_sms_batch(payload: SmsTestBatchPayload, _: dict = Depends(get_current_admin_strict)):
    phones = [str(p).strip() for p in (payload.phones or []) if str(p).strip()]
    phones = phones[:5]
    variants = [str(v).strip().lower() for v in (payload.variants or []) if str(v).strip()]
    variants = [v for v in variants if v in {"proveedor", "cliente"}]
    if not phones:
        raise HTTPException(status_code=400, detail="phones requerido")
    if not variants:
        variants = ["proveedor", "cliente"]

    out = []
    for phone in phones:
        for persona in variants:
            r = await send_test_sms(
                SmsTestPayload(
                    phone=phone,
                    persona=persona,
                    comuna=payload.comuna,
                    machine=payload.machine,
                ),
                _,
            )
            out.append({"phone": phone, "persona": persona, "ok": True, "message": r.get("message")})

    redacted = [f"***{p[-4:]}" if len(p) >= 4 else "***" for p in phones]
    await _audit("SMS test batch", f"phones={','.join(redacted)} variants={','.join(variants)}", event_type="sms_test")
    return {"ok": True, "sent": out}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pick(obj: dict, keys: list[str]) -> dict:
    out: dict[str, Any] = {}
    for k in keys:
        if k in obj:
            out[k] = obj.get(k)
    return out


async def _audit(title: str, detail: str, *, node_id: Optional[str] = None, severity: str = "INFO", event_type: str = "event") -> str:
    _id = str(uuid4())
    await db.growth_audit.insert_one(
        {
            "id": _id,
            "title": title,
            "detail": detail,
            "node_id": node_id,
            "severity": severity,
            "event_type": event_type,
            "at": _now_iso(),
            "processedAt": None,
        }
    )
    return _id


class NodeUpsert(BaseModel):
    id: str = Field(min_length=2)
    name: str = Field(default="")
    comuna: str = Field(default="")
    region: str = Field(default="")
    sequence: int = Field(default=0)
    status: str = Field(default="planned")
    traffic_light: str = Field(default="—")
    traffic_tone: str = Field(default="neutral")
    primary_gap: str = Field(default="")
    zoc_summary: str = Field(default="")


class NodeDecision(BaseModel):
    kind: str = Field(min_length=2)
    reason: str = Field(min_length=2)


class NodeGoLiveMachine(BaseModel):
    machine_key: str = Field(min_length=2)
    enable: bool = Field(default=True)
    reason: str = Field(default="")


class GrowthStartPayload(BaseModel):
    include_outreach: bool = Field(default=True)
    auto_execute_providers: bool = Field(default=True)


class SmsTestPayload(BaseModel):
    phone: str = Field(min_length=8)
    persona: str = Field(min_length=2)
    comuna: str = Field(default="")
    machine: str = Field(default="retroexcavadora")
    role: str = Field(default="")


class SmsTestBatchPayload(BaseModel):
    phones: list[str] = Field(default_factory=list)
    variants: list[str] = Field(default_factory=lambda: ["proveedor", "cliente"])
    comuna: str = Field(default="")
    machine: str = Field(default="retroexcavadora")


class NodePipelineStageUpdate(BaseModel):
    stage: str = Field(min_length=2)
    reason: str = Field(min_length=2)


class NodeGoLiveMachinesBulk(BaseModel):
    machine_keys: list[str] = Field(default_factory=list)
    enable: bool = Field(default=True)
    reason: str = Field(default="")


class ProgramCreate(BaseModel):
    title: str = Field(min_length=3)
    objective: str = Field(default="")
    node_id: str = Field(default="")


class ProgramTransition(BaseModel):
    reason: str = Field(default="")


class OpportunityTriage(BaseModel):
    status: str = Field(min_length=2)
    reason: str = Field(min_length=2)


class AutomationEnable(BaseModel):
    enabled: bool


class ActionText(BaseModel):
    text: str = Field(min_length=2)


class ConfigUpdate(BaseModel):
    config: dict = Field(default_factory=dict)


class DraftOutreachRequest(BaseModel):
    persona: str = Field(min_length=2)
    context: dict = Field(default_factory=dict)


class ContactActionCreate(BaseModel):
    node_id: str = Field(default="")
    persona: str = Field(min_length=2)
    channel: str = Field(min_length=2)
    to: str = Field(min_length=2)
    subject: str = Field(default="")
    message: str = Field(min_length=2)
    reason: str = Field(default="")
    execution_mode: str = Field(default="manual")
    meta: dict = Field(default_factory=dict)


class ContactActionApprove(BaseModel):
    reason: str = Field(default="")
    allow_auto_execute: bool = Field(default=False)


class SmsSuppressionCreate(BaseModel):
    phone: str = Field(min_length=2)
    reason: str = Field(default="")


class OpportunityItemCreate(BaseModel):
    node_id: str = Field(default="")
    category: str = Field(default="")
    title: str = Field(min_length=2)
    detail: str = Field(default="")
    source: str = Field(default="manual")
    kind: str = Field(default="supply")
    contact: dict = Field(default_factory=dict)
    meta: dict = Field(default_factory=dict)


class DiscoverySourceUpsert(BaseModel):
    id: str = Field(min_length=2)
    url: str = Field(min_length=4)
    type: str = Field(default="rss")
    kind: str = Field(default="supply")
    node_id: str = Field(default="")
    category: str = Field(default="")
    enabled: bool = Field(default=True)
    max_items: int = Field(default=25)


@router.get("/overview")
async def overview(_: dict = Depends(get_current_admin_strict)):
    await _bootstrap_nodes_if_empty()
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=200)
    top_nodes = []
    for n in nodes[:6]:
        top_nodes.append(
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
                "region": n.get("region") or "",
                "comuna": n.get("comuna") or "",
                "primary_gap": n.get("primary_gap") or "",
                "traffic_light": n.get("traffic_light") or "—",
                "traffic_tone": n.get("traffic_tone") or "neutral",
            }
        )

    tones = [str(n.get("traffic_tone") or "neutral") for n in nodes]
    if "red" in tones:
        m_status, m_tone = "En riesgo", "red"
    elif "amber" in tones:
        m_status, m_tone = "En vigilancia", "amber"
    elif nodes:
        m_status, m_tone = "Sano", "green"
    else:
        m_status, m_tone = "Sin datos", "neutral"

    p0 = (
        await db.growth_audit.find({"severity": "P0"}, {"_id": 0})
        .sort("at", -1)
        .to_list(length=6)
    )
    p0_risks = [{"id": r.get("id"), "title": r.get("title"), "detail": r.get("detail")} for r in p0]

    recent_work = (
        await db.growth_audit.find({"event_type": {"$in": ["brain_tick", "automation_run", "program"]}}, {"_id": 0})
        .sort("at", -1)
        .to_list(length=6)
    )
    working_now = [{"id": w.get("id"), "title": w.get("title"), "meta": w.get("at")} for w in recent_work]

    top_action_doc = await db.growth_actions.find_one({"status": {"$ne": "done"}}, {"_id": 0}, sort=[("createdAt", -1)])
    top_action = None
    if top_action_doc:
        top_action = {
            "id": top_action_doc.get("id"),
            "title": top_action_doc.get("title"),
            "reason": top_action_doc.get("reason") or "",
            "node_id": top_action_doc.get("node_id") or "",
        }

    def _pipeline_stage(n: dict) -> str:
        st = str(n.get("pipeline_stage") or "").strip().lower()
        if st in {"captando", "por_abrir", "abierta", "pausada"}:
            return st
        status = str(n.get("status") or "").strip().lower()
        if status == "launched":
            return "abierta"
        if status == "pilot":
            return "por_abrir"
        if status == "paused":
            return "pausada"
        return "captando"

    def _comuna_signal(stage: str, live_total: int, ready_total: int, ready_not_live: int) -> dict:
        st = str(stage or "").strip().lower()
        if st == "pausada":
            return {"label": "Pausada", "tone": "red", "key": "pausada"}
        if live_total > 0:
            return {"label": "LIVE", "tone": "green", "key": "live"}
        if ready_not_live > 0 or ready_total > 0:
            return {"label": "LISTA", "tone": "amber", "key": "lista"}
        return {"label": "Captando", "tone": "neutral", "key": "captando"}

    pipeline_items = []
    total_ready_machines = 0
    total_live_machines = 0
    total_ready_not_live = 0
    for n in nodes:
        open_machines = n.get("open_machines") if isinstance(n.get("open_machines"), dict) else {}
        live_machines = n.get("live_machines") if isinstance(n.get("live_machines"), dict) else {}
        ready_keys = [str(k) for k in open_machines.keys()]
        live_keys = [str(k) for k in live_machines.keys() if bool(live_machines.get(k))]
        ready_not_live_all = [k for k in ready_keys if not bool(live_machines.get(k))]
        ready_not_live_preview = ready_not_live_all[:6]
        total_ready_machines += len(ready_keys)
        total_live_machines += len(live_keys)
        total_ready_not_live += len(ready_not_live_all)
        stage = _pipeline_stage(n)
        signal = _comuna_signal(stage, len(live_keys), len(ready_keys), len(ready_not_live_all))
        pipeline_items.append(
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
                "region": n.get("region") or "",
                "comuna": n.get("comuna") or "",
                "sequence": int(n.get("sequence") or 0),
                "stage": stage,
                "status": n.get("status") or "",
                "traffic_light": n.get("traffic_light") or "—",
                "traffic_tone": n.get("traffic_tone") or "neutral",
                "comuna_signal": signal,
                "ready_machines": {"total": len(ready_keys), "not_live": len(ready_not_live_all)},
                "live_machines": {"total": len(live_keys)},
                "ready_not_live": ready_not_live_preview,
                "ready_not_live_all": ready_not_live_all[:40],
                "ready_not_live_total": len(ready_not_live_all),
            }
        )

    captando = [p for p in pipeline_items if p.get("stage") == "captando"]
    por_abrir = [p for p in pipeline_items if p.get("stage") == "por_abrir"]
    abiertas = [p for p in pipeline_items if p.get("stage") == "abierta"]
    pausadas = [p for p in pipeline_items if p.get("stage") == "pausada"]
    captando.sort(key=lambda x: (int(x.get("sequence") or 0), str(x.get("comuna") or "")))
    por_abrir.sort(key=lambda x: (int(x.get("sequence") or 0), str(x.get("comuna") or "")))
    abiertas.sort(key=lambda x: (int(x.get("sequence") or 0), str(x.get("comuna") or "")))
    pausadas.sort(key=lambda x: (int(x.get("sequence") or 0), str(x.get("comuna") or "")))

    if total_live_machines > 0:
        gl_status, gl_tone = "On", "green"
        gl_reason = f"{total_live_machines} maquinaria(s) en LIVE"
    elif total_ready_machines > 0:
        gl_status, gl_tone = "Atención", "amber"
        gl_reason = f"{total_ready_not_live} maquinaria(s) LISTA(s) sin aprobar"
    else:
        gl_status, gl_tone = "Off", "red"
        gl_reason = "Sin oferta lista para GO LIVE"

    last_gl = await db.growth_audit.find_one(
        {"event_type": {"$in": ["go_live_machine", "go_live_machine_off"]}},
        {"_id": 0, "at": 1, "title": 1, "node_id": 1},
        sort=[("at", -1)],
    )

    return {
        "marketplace": {
            "status": m_status,
            "tone": m_tone,
            "summary": f"{len(nodes)} nodos · {tones.count('red')} en rojo · {tones.count('amber')} en ámbar",
        },
        "weekly": {
            "go_live": {
                "status": gl_status,
                "tone": gl_tone,
                "reason": gl_reason,
                "live_machines": total_live_machines,
                "ready_machines": total_ready_machines,
                "ready_not_live": total_ready_not_live,
                "last_change": last_gl.get("at") if isinstance(last_gl, dict) else None,
                "last_change_title": last_gl.get("title") if isinstance(last_gl, dict) else None,
                "last_change_node_id": last_gl.get("node_id") if isinstance(last_gl, dict) else None,
            }
        },
        "pipeline": {
            "captando": captando[:12],
            "por_abrir": por_abrir[:12],
            "abiertas": abiertas[:12],
            "pausadas": pausadas[:12],
            "next_captando": captando[:5],
            "next_por_abrir": por_abrir[:5],
        },
        "top_nodes": top_nodes,
        "p0_risks": p0_risks,
        "working_now": working_now,
        "top_action": top_action,
    }


@router.get("/comunas")
async def list_comunas(_: dict = Depends(get_current_admin_strict)):
    await _bootstrap_nodes_if_empty()
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=500)
    items = []

    def _comuna_signal(stage: str, live_total: int, ready_total: int, ready_not_live: int) -> dict:
        st = str(stage or "").strip().lower()
        if st == "pausada":
            return {"label": "Pausada", "tone": "red", "key": "pausada"}
        if live_total > 0:
            return {"label": "LIVE", "tone": "green", "key": "live"}
        if ready_not_live > 0 or ready_total > 0:
            return {"label": "LISTA", "tone": "amber", "key": "lista"}
        return {"label": "Captando", "tone": "neutral", "key": "captando"}

    for n in nodes:
        status = str(n.get("status") or "").strip().lower()
        stage = str(n.get("pipeline_stage") or "").strip().lower()
        if stage not in {"captando", "por_abrir", "abierta", "pausada"}:
            if status == "launched":
                stage = "abierta"
            elif status == "pilot":
                stage = "por_abrir"
            elif status == "paused":
                stage = "pausada"
            else:
                stage = "captando"
        open_machines = n.get("open_machines") if isinstance(n.get("open_machines"), dict) else {}
        live_machines = n.get("live_machines") if isinstance(n.get("live_machines"), dict) else {}
        ready_keys = [str(k) for k in open_machines.keys()]
        ready_not_live_all = [k for k in ready_keys if not bool(live_machines.get(k))]
        ready_not_live_preview = ready_not_live_all[:6]
        live_keys = [str(k) for k in live_machines.keys() if bool(live_machines.get(k))]
        signal = _comuna_signal(stage, len(live_keys), len(ready_keys), len(ready_not_live_all))
        items.append(
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
                "region": n.get("region") or "",
                "comuna": n.get("comuna") or "",
                "sequence": int(n.get("sequence") or 0),
                "stage": stage,
                "status": n.get("status") or "",
                "traffic_light": n.get("traffic_light") or "—",
                "traffic_tone": n.get("traffic_tone") or "neutral",
                "comuna_signal": signal,
                "min_supply_per_machine": int(n.get("min_supply_per_machine") or 0) or 0,
                "ready_machines": {"total": len(ready_keys), "not_live": len(ready_not_live_all)},
                "live_machines": {"total": len(live_keys)},
                "ready_not_live": ready_not_live_preview,
                "ready_not_live_all": ready_not_live_all[:40],
                "ready_not_live_total": len(ready_not_live_all),
            }
        )
    return {"items": items}


@router.post("/nodes/{node_id}/go-live-machines")
async def node_go_live_machines(node_id: str, payload: NodeGoLiveMachinesBulk, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    keys = [str(k).strip().lower() for k in (payload.machine_keys or []) if str(k).strip()]
    uniq = []
    seen = set()
    for k in keys:
        if k in seen:
            continue
        seen.add(k)
        uniq.append(k)
    if not uniq:
        raise HTTPException(status_code=400, detail="machine_keys requerido")

    now = _now_iso()
    if payload.enable:
        set_doc = {f"live_machines.{k}": True for k in uniq}
        set_doc["updatedAt"] = now
        await db.growth_nodes.update_one({"id": node_id}, {"$set": set_doc})
        await _audit(
            "GO LIVE aprobado (bulk)",
            (payload.reason or "").strip() or f"machine_keys={','.join(uniq)}",
            node_id=node_id,
            severity="INFO",
            event_type="go_live_machine_bulk",
        )
    else:
        unset_doc = {f"live_machines.{k}": "" for k in uniq}
        await db.growth_nodes.update_one({"id": node_id}, {"$unset": unset_doc, "$set": {"updatedAt": now}})
        await _audit(
            "GO LIVE removido (bulk)",
            (payload.reason or "").strip() or f"machine_keys={','.join(uniq)}",
            node_id=node_id,
            severity="INFO",
            event_type="go_live_machine_bulk_off",
        )

    return {"ok": True, "count": len(uniq)}


@router.post("/nodes/{node_id}/pipeline-stage")
async def set_node_pipeline_stage(node_id: str, payload: NodePipelineStageUpdate, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    stage = payload.stage.strip().lower()
    if stage not in {"captando", "por_abrir", "abierta", "pausada"}:
        raise HTTPException(status_code=400, detail="stage inválido")

    await db.growth_nodes.update_one(
        {"id": node_id},
        {"$set": {"pipeline_stage": stage, "updatedAt": _now_iso()}},
    )
    await _audit(
        "Pipeline comuna actualizado",
        payload.reason,
        node_id=node_id,
        severity="INFO",
        event_type="pipeline_stage",
    )
    return {"ok": True}


@router.get("/map")
async def map_view(_: dict = Depends(get_current_admin_strict)):
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=500)
    next_suggested = nodes[0] if nodes else None
    return {
        "nodes": [
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
                "region": n.get("region") or "",
                "comuna": n.get("comuna") or "",
                "subtitle": n.get("primary_gap") or n.get("status") or "—",
                "traffic_light": n.get("traffic_light") or "—",
                "traffic_tone": n.get("traffic_tone") or "neutral",
            }
            for n in nodes
        ],
        "next_suggested": {"node_id": next_suggested.get("id")} if next_suggested else None,
    }


@router.get("/nodes")
async def list_nodes(_: dict = Depends(get_current_admin_strict)):
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=500)
    return {"items": nodes}


@router.post("/nodes")
async def upsert_node(payload: NodeUpsert, _: dict = Depends(get_current_admin_strict)):
    doc = payload.model_dump()
    doc["updatedAt"] = _now_iso()
    doc.setdefault("createdAt", _now_iso())
    await db.growth_nodes.update_one({"id": doc["id"]}, {"$set": doc, "$setOnInsert": {"createdAt": _now_iso()}}, upsert=True)
    await _audit("Nodo actualizado", f"Nodo {doc['id']} actualizado", node_id=doc["id"], event_type="node")
    return {"ok": True}


@router.get("/nodes/{node_id}")
async def node_detail(node_id: str, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    risks = (
        await db.growth_audit.find({"node_id": node_id, "severity": "P0"}, {"_id": 0})
        .sort("at", -1)
        .to_list(length=10)
    )
    gaps = node.get("gaps") if isinstance(node.get("gaps"), list) else []
    if not gaps and node.get("primary_gap"):
        gaps = [{"id": "gap-1", "title": node.get("primary_gap"), "detail": "Brecha detectada (MVP)"}]

    recs = node.get("recommendations") if isinstance(node.get("recommendations"), list) else []
    if not recs and node.get("primary_gap"):
        recs = [
            {
                "id": "rec-1",
                "title": "Cerrar brecha principal",
                "summary": "Priorizar la brecha más cercana a destrabar readiness.",
                "impact": "alto",
                "effort": "medio",
                "confidence": "media",
            }
        ]

    recent_audit = (
        await db.growth_audit.find({"node_id": node_id}, {"_id": 0})
        .sort("at", -1)
        .to_list(length=12)
    )

    open_machines = node.get("open_machines") if isinstance(node.get("open_machines"), dict) else {}
    live_machines = node.get("live_machines") if isinstance(node.get("live_machines"), dict) else {}
    ready_by_machine = []
    for k, n in open_machines.items():
        try:
            nn = int(n)
        except Exception:
            nn = 0
        kk = str(k)
        ready_by_machine.append({"machine_key": kk, "units": nn, "is_live": bool(live_machines.get(kk))})
    ready_by_machine.sort(key=lambda x: (-int(x.get("units") or 0), str(x.get("machine_key") or "")))

    return {
        "node": {
            "id": node.get("id"),
            "name": node.get("name") or node.get("comuna") or "Nodo",
            "region": node.get("region") or "",
            "comuna": node.get("comuna") or "",
            "status": node.get("status") or "—",
            "traffic_light": node.get("traffic_light") or "—",
            "traffic_tone": node.get("traffic_tone") or "neutral",
            "zoc_summary": node.get("zoc_summary") or "",
            "min_supply_per_machine": int(node.get("min_supply_per_machine") or 0) or 0,
            "open_machines": open_machines,
            "live_machines": live_machines,
            "ready_by_machine": ready_by_machine,
        },
        "gaps": gaps,
        "risks": [{"id": r.get("id"), "title": r.get("title"), "detail": r.get("detail")} for r in risks],
        "recommendations": recs,
        "recent_audit": [
            {
                "id": a.get("id"),
                "title": a.get("title"),
                "detail": a.get("detail"),
            }
            for a in recent_audit
        ],
    }


@router.get("/nodes/{node_id}/drawer")
async def node_drawer(node_id: str, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0, "id": 1, "region": 1, "comuna": 1, "name": 1})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    audit = (
        await db.growth_audit.find({"node_id": node_id}, {"_id": 0, "id": 1, "at": 1, "title": 1, "detail": 1, "event_type": 1, "severity": 1})
        .sort("at", -1)
        .to_list(length=12)
    )

    leads = (
        await db.growth_opportunity_items.find(
            {"node_id": node_id},
            {
                "_id": 0,
                "id": 1,
                "createdAt": 1,
                "kind": 1,
                "status": 1,
                "category": 1,
                "title": 1,
                "link": 1,
                "source": 1,
                "source_type": 1,
                "score": 1,
                "contact": 1,
            },
        )
        .sort("createdAt", -1)
        .to_list(length=5)
    )

    return {
        "node": {
            "id": node.get("id"),
            "name": node.get("name") or node.get("comuna") or "Nodo",
            "region": node.get("region") or "",
            "comuna": node.get("comuna") or "",
        },
        "recent_audit": audit,
        "top_leads": leads,
    }


@router.post("/nodes/{node_id}/decisions")
async def node_decision(node_id: str, payload: NodeDecision, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    kind = payload.kind.strip().lower()
    if kind not in {"pilot", "launch", "pause"}:
        raise HTTPException(status_code=400, detail="kind inválido")

    if kind == "pilot":
        status = "pilot"
        tl, tone = "Piloto", "amber"
        title = "Nodo en piloto"
        et = "node_pilot"
    elif kind == "launch":
        status = "launched"
        tl, tone = "Lanzado", "green"
        title = "Nodo lanzado"
        et = "node_launch"
    else:
        status = "paused"
        tl, tone = "Pausado", "red"
        title = "Demanda pausada"
        et = "node_pause"

    await db.growth_nodes.update_one(
        {"id": node_id},
        {"$set": {"status": status, "traffic_light": tl, "traffic_tone": tone, "updatedAt": _now_iso()}},
    )
    await _audit(title, payload.reason, node_id=node_id, severity="INFO", event_type=et)
    return {"ok": True}


@router.post("/nodes/{node_id}/go-live-machine")
async def node_go_live_machine(node_id: str, payload: NodeGoLiveMachine, _: dict = Depends(get_current_admin_strict)):
    node = await db.growth_nodes.find_one({"id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    machine_key = payload.machine_key.strip().lower()
    if not machine_key:
        raise HTTPException(status_code=400, detail="machine_key requerido")

    now = _now_iso()
    if payload.enable:
        await db.growth_nodes.update_one(
            {"id": node_id},
            {"$set": {f"live_machines.{machine_key}": True, "updatedAt": now}},
        )
        await _audit(
            "GO LIVE aprobado (maquinaria)",
            (payload.reason or "").strip() or f"machine_key={machine_key}",
            node_id=node_id,
            severity="INFO",
            event_type="go_live_machine",
        )
    else:
        await db.growth_nodes.update_one(
            {"id": node_id},
            {"$unset": {f"live_machines.{machine_key}": ""}, "$set": {"updatedAt": now}},
        )
        await _audit(
            "GO LIVE removido (maquinaria)",
            (payload.reason or "").strip() or f"machine_key={machine_key}",
            node_id=node_id,
            severity="INFO",
            event_type="go_live_machine_off",
        )

    return {"ok": True}


@router.get("/programs")
async def list_programs(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_programs.find({}, {"_id": 0}).sort("updatedAt", -1).to_list(length=200)
    return {"items": items}


@router.post("/programs")
async def create_program(payload: ProgramCreate, _: dict = Depends(get_current_admin_strict)):
    program_id = str(uuid4())
    now = _now_iso()
    doc = {
        "id": program_id,
        "title": payload.title.strip(),
        "objective": payload.objective.strip(),
        "node_id": payload.node_id.strip(),
        "status": "proposed",
        "createdAt": now,
        "updatedAt": now,
    }
    await db.growth_programs.insert_one(doc)
    await _audit("Programa propuesto", doc["title"], node_id=doc["node_id"] or None, event_type="program")
    return {"id": program_id}


async def _transition_program(program_id: str, action: str, reason: str) -> None:
    prog = await db.growth_programs.find_one({"id": program_id}, {"_id": 0})
    if not prog:
        raise HTTPException(status_code=404, detail="Programa no encontrado")

    a = action.strip().lower()
    if a not in {"approve", "pause", "resume", "close"}:
        raise HTTPException(status_code=400, detail="acción inválida")

    if a == "approve":
        status = "active"
        title = "Programa aprobado"
        et = "program_approved"
    elif a == "pause":
        status = "paused"
        title = "Programa pausado"
        et = "program_paused"
    elif a == "resume":
        status = "active"
        title = "Programa reanudado"
        et = "program_resumed"
    else:
        status = "closed"
        title = "Programa cerrado"
        et = "program_closed"

    await db.growth_programs.update_one({"id": program_id}, {"$set": {"status": status, "updatedAt": _now_iso()}})
    await _audit(title, reason or prog.get("title") or "", node_id=prog.get("node_id") or None, event_type=et)


@router.post("/programs/{program_id}/{action}")
async def program_transition(program_id: str, action: str, payload: ProgramTransition, _: dict = Depends(get_current_admin_strict)):
    await _transition_program(program_id, action, payload.reason)
    return {"ok": True}


@router.get("/opportunities")
async def list_opportunities(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_opportunities.find({}, {"_id": 0}).sort("createdAt", -1).to_list(length=500)
    return {"items": items}


@router.get("/opportunity-items")
async def list_opportunity_items(status: Optional[str] = Query(default=None), _: dict = Depends(get_current_admin_strict)):
    q: dict[str, Any] = {}
    if status:
        q["status"] = status.strip().lower()
    items = await db.growth_opportunity_items.find(q, {"_id": 0}).sort("createdAt", -1).to_list(length=500)
    return {"items": items}


@router.post("/opportunity-items/{item_id}/triage")
async def triage_opportunity_item(item_id: str, payload: OpportunityTriage, _: dict = Depends(get_current_admin_strict)):
    it = await db.growth_opportunity_items.find_one({"id": item_id}, {"_id": 0})
    if not it:
        raise HTTPException(status_code=404, detail="Opportunity item no encontrado")

    status = payload.status.strip().lower()
    reason = payload.reason.strip()
    await db.growth_opportunity_items.update_one(
        {"id": item_id},
        {"$set": {"status": status, "triageReason": reason, "updatedAt": _now_iso()}},
    )
    await _audit("Opportunity item triage", f"status={status} reason={reason}", node_id=it.get("node_id"), event_type="triage")
    return {"ok": True}


@router.post("/opportunity-items")
async def create_opportunity_item(payload: OpportunityItemCreate, _: dict = Depends(get_current_admin_strict)):
    item_id = str(uuid4())
    now = _now_iso()
    doc = {
        "id": item_id,
        "status": "new",
        "node_id": payload.node_id.strip() or None,
        "category": payload.category.strip(),
        "title": payload.title.strip(),
        "detail": payload.detail.strip(),
        "source": payload.source.strip() or "manual",
        "kind": payload.kind.strip() or "supply",
        "contact": payload.contact if isinstance(payload.contact, dict) else {},
        "meta": payload.meta if isinstance(payload.meta, dict) else {},
        "createdAt": now,
        "updatedAt": now,
    }
    await db.growth_opportunity_items.insert_one(doc)
    await db.growth_discovery_runs.insert_one(
        {
            "id": str(uuid4()),
            "source": doc["source"],
            "status": "recorded",
            "items_created": 1,
            "at": now,
        }
    )
    await _audit("Opportunity item creado", doc["title"], node_id=doc.get("node_id"), event_type="discovery")
    return {"id": item_id}


@router.get("/discovery/sources")
async def get_discovery_sources(_: dict = Depends(get_current_admin_strict)):
    conf = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (conf or {}).get("config") if isinstance(conf, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}
    sources = cfg.get("discovery_sources")
    if not isinstance(sources, list):
        sources = []
    return {"items": sources}


@router.put("/discovery/sources")
async def put_discovery_sources(payload: list[DiscoverySourceUpsert], _: dict = Depends(get_current_admin_strict)):
    items: list[dict[str, Any]] = []
    for s in payload:
        items.append(
            {
                "id": s.id.strip(),
                "url": s.url.strip(),
                "type": s.type.strip().lower() or "rss",
                "kind": s.kind.strip().lower() or "supply",
                "node_id": s.node_id.strip(),
                "category": s.category.strip(),
                "enabled": bool(s.enabled),
                "max_items": int(s.max_items or 25),
            }
        )
    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {
            "$set": {"config.discovery_sources": items, "updatedAt": _now_iso()},
            "$setOnInsert": {"createdAt": _now_iso()},
        },
        upsert=True,
    )
    await _audit("Discovery sources updated", f"count={len(items)}", event_type="discovery")
    return {"ok": True, "count": len(items)}


@router.post("/discovery/run")
async def discovery_run(_: dict = Depends(get_current_admin_strict)):
    conf = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (conf or {}).get("config") if isinstance(conf, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}
    from services.growth_ai_discovery import run_discovery_once

    res = await run_discovery_once(db=db, config=cfg)
    await _audit("Discovery run", f"created={res.get('items_created')}", event_type="discovery")
    return res


@router.get("/discovery/runs")
async def discovery_runs(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_discovery_runs.find({}, {"_id": 0}).sort("at", -1).to_list(length=200)
    return {"items": items}


@router.post("/opportunities/{opportunity_id}/triage")
async def triage_opportunity(opportunity_id: str, payload: OpportunityTriage, _: dict = Depends(get_current_admin_strict)):
    opp = await db.growth_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Oportunidad no encontrada")
    status = payload.status.strip().lower()
    if status not in {"triaged", "discarded"}:
        raise HTTPException(status_code=400, detail="status inválido")
    await db.growth_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"status": status, "triage_reason": payload.reason.strip(), "updatedAt": _now_iso()}},
    )
    await _audit("Oportunidad triage", f"{status}: {payload.reason}", node_id=opp.get("node_id") or None, event_type="opportunity")
    return {"ok": True}


@router.get("/automations")
async def list_automations(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_automations.find({}, {"_id": 0}).sort("title", 1).to_list(length=200)
    return {"items": items}


@router.post("/automations/{automation_id}/enable")
async def enable_automation(automation_id: str, payload: AutomationEnable, _: dict = Depends(get_current_admin_strict)):
    auto = await db.growth_automations.find_one({"id": automation_id}, {"_id": 0})
    if not auto:
        raise HTTPException(status_code=404, detail="Automatización no encontrada")
    await db.growth_automations.update_one({"id": automation_id}, {"$set": {"enabled": bool(payload.enabled), "updatedAt": _now_iso()}})
    await _audit("Automatización actualizada", f"{automation_id} enabled={bool(payload.enabled)}", event_type="automation")
    return {"ok": True}


@router.get("/automations/status")
async def automations_status(_: dict = Depends(get_current_admin_strict)):
    state = await db.config.find_one({"_id": "growth_ai_state"}, {"_id": 0})
    last_tick = (state or {}).get("last_tick_at") or "—"
    return {"summary": f"Cerebro last tick: {last_tick}"}


@router.post("/brain/tick")
async def brain_tick(_: dict = Depends(get_current_admin_strict)):
    await run_growth_ai_cycle(db)
    state = await db.config.find_one({"_id": "growth_ai_state"}, {"_id": 0})
    last_tick = (state or {}).get("last_tick_at") or "—"
    await _audit("Brain tick", f"Tick ejecutado; last_tick_at={last_tick}", event_type="brain_tick")
    return {"ok": True, "last_tick_at": last_tick}


@router.get("/engine/status")
async def engine_status(_: dict = Depends(get_current_admin_strict)):
    return {
        "engine": "maqgo_internal",
        "configured": True,
        "notes": "Copy generator interno (sin proveedores externos).",
    }


@router.get("/runtime/status")
async def runtime_status(_: dict = Depends(get_current_admin_strict)):
    cfg_doc = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    cfg = (cfg_doc or {}).get("config") if isinstance(cfg_doc, dict) else None
    if not isinstance(cfg, dict):
        cfg = {}
    autopilot = cfg.get("autopilot") if isinstance(cfg.get("autopilot"), dict) else {}

    state = await db.config.find_one({"_id": "growth_ai_state"}, {"_id": 0})
    s = state if isinstance(state, dict) else {}

    interval = os.environ.get("MAQGO_GROWTH_AI_INTERVAL_SECONDS", "12")
    try:
        interval_sec = int(str(interval).strip() or "12")
    except Exception:
        interval_sec = 12

    return {
        "scheduler": {
            "interval_sec": interval_sec,
            "last_tick_at": s.get("last_tick_at") or "—",
            "last_autopilot_stats": s.get("last_autopilot_stats") or {},
        },
        "discovery": {
            "last_discovery_at": s.get("last_discovery_at") or "—",
            "last_discovery_error": s.get("last_discovery_error") or "",
        },
        "inventory": {
            "last_inventory_at": s.get("last_inventory_at") or "—",
            "inventory_error": s.get("inventory_error") or "",
        },
        "daily": s.get("daily_counts") or {},
        "autoscale": {
            "last_day_start_utc": s.get("autoscale_last_day_start_utc") or "",
            "status": s.get("autoscale_status") or "",
            "window_days": int(s.get("autoscale_window_days") or 0) or 0,
        },
        "autopilot": {
            "enabled": bool(autopilot.get("enabled", False)),
            "discovery_enabled": bool(autopilot.get("discovery_enabled", True)),
            "outreach_enabled": bool(autopilot.get("outreach_enabled", True)),
            "outreach_supply_enabled": bool(autopilot.get("outreach_supply_enabled", True)),
            "outreach_demand_enabled": bool(autopilot.get("outreach_demand_enabled", True)),
            "auto_approve": bool(autopilot.get("auto_approve", True)),
            "auto_execute": bool(autopilot.get("auto_execute", False)),
            "auto_execute_providers": bool(autopilot.get("auto_execute_providers", False)),
            "auto_execute_clients": bool(autopilot.get("auto_execute_clients", False)),
            "require_go_live_approval_for_demand": bool(autopilot.get("require_go_live_approval_for_demand", True)),
            "allowed_node_ids": autopilot.get("allowed_node_ids") if isinstance(autopilot.get("allowed_node_ids"), list) else [],
            "autoscale_supply_enabled": bool(autopilot.get("autoscale_supply_enabled", False)),
            "autoscale_window_days": int(autopilot.get("autoscale_window_days", 0) or 0),
            "autoscale_supply_util_threshold": float(autopilot.get("autoscale_supply_util_threshold", 0.0) or 0.0),
            "autoscale_supply_min_sent_rate": float(autopilot.get("autoscale_supply_min_sent_rate", 0.0) or 0.0),
            "autoscale_step_supply": int(autopilot.get("autoscale_step_supply", 0) or 0),
            "autoscale_cap_supply": int(autopilot.get("autoscale_cap_supply", 0) or 0),
        },
    }


@router.post("/engine/draft-outreach")
async def engine_draft_outreach(payload: DraftOutreachRequest, _: dict = Depends(get_current_admin_strict)):
    from services.growth_ai_copy_engine import draft_outreach_message

    res = await draft_outreach_message(persona=payload.persona, context=payload.context)
    await _audit("Outreach draft", payload.persona, event_type="draft")
    return res


@router.post("/llm/draft-outreach")
async def llm_draft_outreach(payload: DraftOutreachRequest, _: dict = Depends(get_current_admin_strict)):
    return await engine_draft_outreach(payload, _)


@router.post("/contact-actions")
async def create_contact_action(payload: ContactActionCreate, _: dict = Depends(get_current_admin_strict)):
    action_id = str(uuid4())
    now = _now_iso()
    exec_mode = payload.execution_mode.strip().lower() or "manual"
    if exec_mode not in {"manual", "auto"}:
        raise HTTPException(status_code=400, detail="execution_mode inválido")
    doc = {
        "id": action_id,
        "status": "draft",
        "node_id": payload.node_id.strip() or None,
        "persona": payload.persona.strip(),
        "channel": payload.channel.strip().lower(),
        "to": payload.to.strip(),
        "subject": payload.subject.strip(),
        "message": payload.message.strip(),
        "reason": payload.reason.strip(),
        "execution_mode": exec_mode,
        "meta": payload.meta if isinstance(payload.meta, dict) else {},
        "createdAt": now,
        "updatedAt": now,
        "approvedAt": None,
        "executedAt": None,
        "lastError": None,
    }
    await db.growth_contact_actions.insert_one(doc)
    await _audit("Contacto creado", f"channel={doc['channel']} to={doc['to']}", node_id=doc.get("node_id"), event_type="contact")
    return {"id": action_id}


@router.get("/contact-actions")
async def list_contact_actions(status: Optional[str] = Query(default=None), _: dict = Depends(get_current_admin_strict)):
    q: dict[str, Any] = {}
    if status:
        q["status"] = status.strip().lower()
    items = await db.growth_contact_actions.find(q, {"_id": 0}).sort("createdAt", -1).to_list(length=500)
    return {"items": items}


@router.post("/contact-actions/{action_id}/approve")
async def approve_contact_action(action_id: str, payload: ContactActionApprove, _: dict = Depends(get_current_admin_strict)):
    a = await db.growth_contact_actions.find_one({"id": action_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Acción de contacto no encontrada")
    if str(a.get("status") or "").lower() not in {"draft", "failed", "manual_required"}:
        raise HTTPException(status_code=400, detail="Acción no aprobable en el estado actual")

    exec_mode = "auto" if bool(payload.allow_auto_execute) else str(a.get("execution_mode") or "manual")
    await db.growth_contact_actions.update_one(
        {"id": action_id},
        {
            "$set": {
                "status": "approved",
                "approvedAt": _now_iso(),
                "updatedAt": _now_iso(),
                "approvalReason": payload.reason.strip(),
                "execution_mode": exec_mode,
            }
        },
    )
    await _audit("Contacto aprobado", payload.reason.strip() or "approved", node_id=a.get("node_id"), event_type="contact")
    return {"ok": True}


@router.post("/contact-actions/{action_id}/execute")
async def execute_contact_action(action_id: str, _: dict = Depends(get_current_admin_strict)):
    a = await db.growth_contact_actions.find_one({"id": action_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Acción de contacto no encontrada")
    if str(a.get("status") or "").lower() != "approved":
        raise HTTPException(status_code=400, detail="Acción debe estar aprobada")

    from services.growth_ai_contact_executor import execute_contact_action as _exec

    def _scl_now() -> datetime:
        return datetime.now(ZoneInfo("America/Santiago"))

    async def _sms_guardrails(phone: str) -> None:
        enabled = str(os.environ.get("MAQGO_GROWTH_SMS_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
        if not enabled:
            raise HTTPException(status_code=400, detail="SMS Growth deshabilitado")

        s = await db.growth_sms_suppressions.find_one({"phone": phone}, {"_id": 0})
        if s:
            raise HTTPException(status_code=400, detail="Teléfono suprimido")

        now = _scl_now()
        start_h = int(str(os.environ.get("MAQGO_GROWTH_SMS_ALLOWED_HOUR_START", "9")).strip() or "9")
        end_h = int(str(os.environ.get("MAQGO_GROWTH_SMS_ALLOWED_HOUR_END", "19")).strip() or "19")
        if now.hour < start_h or now.hour >= end_h:
            raise HTTPException(status_code=400, detail="Fuera de ventana horaria")

        per_phone = int(str(os.environ.get("MAQGO_GROWTH_SMS_PER_PHONE_PER_DAY", "1")).strip() or "1")
        per_day = int(str(os.environ.get("MAQGO_GROWTH_SMS_DAILY_LIMIT", "150")).strip() or "150")

        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day_start_utc = day_start.astimezone(timezone.utc)

        phone_count = await db.growth_contact_attempts.count_documents(
            {"channel": "sms", "to": phone, "at": {"$gte": day_start_utc.isoformat()}},
            limit=10000,
        )
        if phone_count >= per_phone:
            raise HTTPException(status_code=400, detail="Límite diario por teléfono")

        global_count = await db.growth_contact_attempts.count_documents(
            {"channel": "sms", "at": {"$gte": day_start_utc.isoformat()}},
            limit=100000,
        )
        if global_count >= per_day:
            raise HTTPException(status_code=400, detail="Límite diario global SMS")

    channel = str(a.get("channel") or "").strip().lower()
    to = str(a.get("to") or "").strip()
    subject = str(a.get("subject") or "").strip()
    message = str(a.get("message") or "").strip()

    if channel == "sms":
        await _sms_guardrails(to)
        if "stop" not in message.lower():
            suffix = " Responde STOP para no recibir más mensajes."
            if len(message) + len(suffix) <= 480:
                message = message + suffix

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
        await _audit("Contacto ejecutado", f"channel={channel}", node_id=a.get("node_id"), event_type="contact")
    elif new_status == "manual_required":
        await db.growth_contact_actions.update_one(
            {"id": action_id},
            {"$set": {"status": "manual_required", "updatedAt": _now_iso(), "manualUrl": res.get("url") or ""}},
        )
        await _audit("Contacto requiere ejecución manual", f"channel={channel}", node_id=a.get("node_id"), event_type="contact")
    else:
        await db.growth_contact_actions.update_one(
            {"id": action_id},
            {"$set": {"status": "failed", "updatedAt": _now_iso(), "lastError": res.get("error")}},
        )
        await _audit("Contacto falló", f"channel={channel} err={res.get('error')}", node_id=a.get("node_id"), severity="P0", event_type="contact")
    return {"ok": True, "attempt_id": attempt_id, "result": res}


@router.get("/sms/suppressions")
async def list_sms_suppressions(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_sms_suppressions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(length=500)
    return {"items": items}


@router.get("/learning/stats")
async def list_learning_stats(
    node_id: Optional[str] = Query(default=None),
    persona: Optional[str] = Query(default=None),
    channel: Optional[str] = Query(default=None),
    _: dict = Depends(get_current_admin_strict),
):
    q: dict[str, Any] = {}
    if node_id:
        q["node_id"] = node_id.strip()
    if persona:
        q["persona"] = persona.strip().lower()
    if channel:
        q["channel"] = channel.strip().lower()
    items = await db.growth_learning_stats.find(q, {"_id": 0}).sort("updatedAt", -1).to_list(length=200)
    return {"items": items}


@router.post("/sms/suppressions")
async def add_sms_suppression(payload: SmsSuppressionCreate, _: dict = Depends(get_current_admin_strict)):
    phone = payload.phone.strip()
    _id = str(uuid4())
    now = _now_iso()
    await db.growth_sms_suppressions.update_one(
        {"phone": phone},
        {
            "$set": {
                "id": _id,
                "phone": phone,
                "reason": payload.reason.strip(),
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    await _audit("SMS suppression", phone, event_type="sms")
    return {"ok": True}


@router.delete("/sms/suppressions/{phone}")
async def remove_sms_suppression(phone: str, _: dict = Depends(get_current_admin_strict)):
    p = phone.strip()
    await db.growth_sms_suppressions.delete_one({"phone": p})
    await _audit("SMS suppression removed", p, event_type="sms")
    return {"ok": True}


@router.get("/contact-actions/{action_id}/attempts")
async def list_contact_attempts(action_id: str, _: dict = Depends(get_current_admin_strict)):
    items = await db.growth_contact_attempts.find({"action_id": action_id}, {"_id": 0}).sort("at", -1).to_list(length=200)
    return {"items": items}


@router.get("/actions")
async def list_actions(_: dict = Depends(get_current_admin_strict)):
    items = await db.growth_actions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(length=500)
    return {"items": items}


async def _update_action_text(action_id: str, field: str, text: str) -> None:
    a = await db.growth_actions.find_one({"id": action_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Acción no encontrada")
    if field not in {"expected", "observed", "learning"}:
        raise HTTPException(status_code=400, detail="field inválido")
    await db.growth_actions.update_one({"id": action_id}, {"$set": {field: text.strip(), "updatedAt": _now_iso()}})
    await _audit("Acción actualizada", f"{field} actualizado", node_id=a.get("node_id") or None, event_type="action")


@router.post("/actions/{action_id}/expected")
async def action_expected(action_id: str, payload: ActionText, _: dict = Depends(get_current_admin_strict)):
    await _update_action_text(action_id, "expected", payload.text)
    return {"ok": True}


@router.post("/actions/{action_id}/observed")
async def action_observed(action_id: str, payload: ActionText, _: dict = Depends(get_current_admin_strict)):
    await _update_action_text(action_id, "observed", payload.text)
    return {"ok": True}


@router.post("/actions/{action_id}/learning")
async def action_learning(action_id: str, payload: ActionText, _: dict = Depends(get_current_admin_strict)):
    await _update_action_text(action_id, "learning", payload.text)
    return {"ok": True}


@router.get("/audit")
async def list_audit(nodeId: Optional[str] = Query(default=None), _: dict = Depends(get_current_admin_strict)):
    q: dict[str, Any] = {}
    if nodeId:
        q["node_id"] = nodeId
    items = await db.growth_audit.find(q, {"_id": 0}).sort("at", -1).to_list(length=500)
    return {
        "items": [
            {
                "id": a.get("id"),
                "title": a.get("title"),
                "detail": a.get("detail"),
                "node_id": a.get("node_id"),
                "severity": a.get("severity"),
                "at": a.get("at"),
            }
            for a in items
        ]
    }


@router.get("/config")
async def get_config(_: dict = Depends(get_current_admin_strict)):
    doc = await db.config.find_one({"_id": "growth_ai_config"}, {"_id": 0})
    return {"config": (doc or {}).get("config") or {}}


@router.put("/config")
async def update_config(payload: ConfigUpdate, _: dict = Depends(get_current_admin_strict)):
    await db.config.update_one(
        {"_id": "growth_ai_config"},
        {"$set": {"config": payload.config, "updatedAt": _now_iso()}, "$setOnInsert": {"createdAt": _now_iso()}},
        upsert=True,
    )
    await _audit("Config actualizada", "growth_ai_config actualizada", event_type="config")
    return {"ok": True}
