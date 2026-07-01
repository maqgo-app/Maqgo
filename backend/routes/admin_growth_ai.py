from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin_strict
from db_config import get_db_name, get_mongo_url


router = APIRouter(prefix="/admin/growth-ai", tags=["admin-growth-ai"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


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
    sequence: int = Field(default=0)
    status: str = Field(default="planned")
    traffic_light: str = Field(default="—")
    traffic_tone: str = Field(default="neutral")
    primary_gap: str = Field(default="")
    zoc_summary: str = Field(default="")


class NodeDecision(BaseModel):
    kind: str = Field(min_length=2)
    reason: str = Field(min_length=2)


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


@router.get("/overview")
async def overview(_: dict = Depends(get_current_admin_strict)):
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=200)
    top_nodes = []
    for n in nodes[:6]:
        top_nodes.append(
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
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

    return {
        "marketplace": {
            "status": m_status,
            "tone": m_tone,
            "summary": f"{len(nodes)} nodos · {tones.count('red')} en rojo · {tones.count('amber')} en ámbar",
        },
        "top_nodes": top_nodes,
        "p0_risks": p0_risks,
        "working_now": working_now,
        "top_action": top_action,
    }


@router.get("/map")
async def map_view(_: dict = Depends(get_current_admin_strict)):
    nodes = await db.growth_nodes.find({}, {"_id": 0}).sort("sequence", 1).to_list(length=500)
    next_suggested = nodes[0] if nodes else None
    return {
        "nodes": [
            {
                "id": n.get("id"),
                "name": n.get("name") or n.get("comuna") or "Nodo",
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

    return {
        "node": {
            "id": node.get("id"),
            "name": node.get("name") or node.get("comuna") or "Nodo",
            "status": node.get("status") or "—",
            "traffic_light": node.get("traffic_light") or "—",
            "traffic_tone": node.get("traffic_tone") or "neutral",
            "zoc_summary": node.get("zoc_summary") or "",
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

