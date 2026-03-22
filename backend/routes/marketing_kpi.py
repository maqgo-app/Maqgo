"""
KPI marketing MAQGO: inversión por canal (manual), CAC derivado y reporte semanal.
Cron: GET /api/admin/cron/marketing-weekly-report?secret=MAQGO_CRON_SECRET (lunes, p. ej. 10:00 Chile vía Railway/cron-job.org)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict, Tuple
from datetime import datetime, timedelta, timezone
import os
import logging

from auth_dependency import get_current_admin
from motor.motor_asyncio import AsyncIOMotorClient
from db_config import get_db_name, get_mongo_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/marketing", tags=["admin-marketing"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

ALLOWED_CHANNELS = {"meta", "google_pmax", "google_search", "demand_gen", "otro"}
AUDIENCIAS = ("clientes", "proveedores")


class SpendLine(BaseModel):
    channel: str = Field(..., description="meta | google_pmax | google_search | demand_gen | otro")
    audience: str = Field(
        ...,
        description="clientes = captación demanda; proveedores = captación oferta (campañas lead a maquinistas, etc.)",
    )
    amount_clp: float = Field(ge=0)


class SpendPayload(BaseModel):
    """Fecha calendario YYYY-MM-DD: se normaliza al lunes ISO de esa semana (ver `week_effective`)."""
    week_start: str
    lines: List[SpendLine]


def _parse_week_start(s: str) -> datetime:
    """
    Acepta cualquier día YYYY-MM-DD y devuelve el lunes 00:00 UTC de esa semana ISO (lunes = primer día).
    Evita errores al pegar fechas desde Meta/Google y alinea front y API.
    """
    try:
        d = datetime.strptime(s.strip()[:10], "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail="week_start debe ser YYYY-MM-DD")
    d = d.replace(tzinfo=timezone.utc)
    wd = d.weekday()  # Monday=0 .. Sunday=6
    monday = d - timedelta(days=wd)
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _week_range(week_start: datetime) -> Tuple[datetime, datetime]:
    """[start, end) en UTC."""
    start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=7)
    return start, end


def _week_period_meta(ws: datetime) -> Dict[str, str]:
    """Rango humano de la semana [lunes, domingo] en fechas calendario UTC."""
    start, end_excl = _week_range(ws)
    last_day = end_excl - timedelta(seconds=1)
    return {
        "week_start_date": start.strftime("%Y-%m-%d"),
        "week_end_date_inclusive": last_day.strftime("%Y-%m-%d"),
    }


def _previous_week_bounds() -> Tuple[datetime, datetime]:
    """Semana calendario anterior (lun–dom) en UTC: útil si el cron corre un lunes."""
    now = datetime.now(timezone.utc)
    weekday = now.weekday()
    this_monday = (now - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_start = this_monday - timedelta(days=7)
    prev_end = this_monday
    return prev_start, prev_end


async def _load_spend_for_week(week_start: datetime) -> Dict[str, Any]:
    start, _ = _week_range(week_start)
    cur = db.marketing_spend.find({"week_start": start})
    lines = await cur.to_list(100)
    by_audience = {"clientes": 0.0, "proveedores": 0.0}
    by_channel = {}
    for doc in lines:
        aud = doc.get("audience", "clientes")
        amt = float(doc.get("amount_clp") or 0)
        ch = doc.get("channel", "otro")
        by_audience[aud] = by_audience.get(aud, 0) + amt
        key = f"{ch}:{aud}"
        by_channel[key] = by_channel.get(key, 0) + amt
    total = sum(by_audience.values())
    return {
        "lines": lines,
        "total_clp": total,
        "gasto_clientes_clp": by_audience.get("clientes", 0),
        "gasto_proveedores_clp": by_audience.get("proveedores", 0),
        "by_channel": by_channel,
    }


async def _count_users_role(role: str, start: datetime, end: datetime) -> int:
    """Cuenta usuarios nuevos en la ventana (createdAt ISO string y/o created_at datetime)."""
    start_s = start.isoformat()
    end_s = end.isoformat()
    return await db.users.count_documents({
        "role": role,
        "$or": [
            {"createdAt": {"$gte": start_s, "$lt": end_s}},
            {"created_at": {"$gte": start, "$lt": end}},
        ],
    })


async def _count_services_created(start: datetime, end: datetime) -> int:
    return await db.services.count_documents({
        "created_at": {"$gte": start, "$lt": end},
    })


async def _count_services_paid(start: datetime, end: datetime) -> int:
    return await db.services.count_documents({
        "status": "paid",
        "paid_at": {"$gte": start, "$lt": end},
    })


def _safe_div(num: float, den: float) -> Optional[float]:
    if den <= 0:
        return None
    return round(num / den, 2)


def _serialize_spend_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out["_id"] = str(out.get("_id", ""))
    if isinstance(out.get("week_start"), datetime):
        out["week_start"] = out["week_start"].isoformat()
    return out


async def build_marketing_report_for_week(week_start: datetime) -> Dict[str, Any]:
    start, end = _week_range(week_start)
    spend_block = await _load_spend_for_week(week_start)

    nuevos_clientes = await _count_users_role("client", start, end)
    nuevos_proveedores = await _count_users_role("provider", start, end)
    servicios_creados = await _count_services_created(start, end)
    servicios_pagados = await _count_services_paid(start, end)

    gc = spend_block["gasto_clientes_clp"]
    gp = spend_block["gasto_proveedores_clp"]
    total = spend_block["total_clp"]

    report = {
        "week_start": start.isoformat(),
        "week_end_exclusive": end.isoformat(),
        "periodo": {
            "inicio": start.isoformat(),
            "fin": (end - timedelta(seconds=1)).isoformat(),
        },
        "inversion_clp": {
            "total": total,
            "clientes": gc,
            "proveedores": gp,
            "detalle_cargado": [_serialize_spend_doc(x) for x in spend_block["lines"]],
        },
        "volumen": {
            "nuevos_clientes": nuevos_clientes,
            "nuevos_proveedores": nuevos_proveedores,
            "servicios_creados": servicios_creados,
            "servicios_pagados_cerrados": servicios_pagados,
        },
        "kpi": {
            # Registro: gasto de la semana atribuido a esa audiencia ÷ nuevos usuarios con ese role en la misma ventana.
            "CAC_cliente_registro_clp": _safe_div(gc, nuevos_clientes),
            "CAC_proveedor_registro_clp": _safe_div(gp, nuevos_proveedores),
            # Alias explícito (mismo valor): costo de adquisición de proveedores cuando cargas campañas con audience=proveedores
            "costo_adquisicion_proveedor_clp": _safe_div(gp, nuevos_proveedores),
            "costo_adquisicion_cliente_clp": _safe_div(gc, nuevos_clientes),
            "CAC_por_servicio_creado_clp": _safe_div(total, servicios_creados),
            "CAC_por_servicio_pagado_clp": _safe_div(total, servicios_pagados),
            "nota": (
                "CAC por registro: divide solo el gasto que cargaste con audience 'clientes' o 'proveedores' "
                "(p. ej. Meta lead gen a proveedores) entre los nuevos registros de esa audiencia en la semana. "
                "Si una campaña es solo para proveedores, regístrala con audience=proveedores para que no mezcle con clientes."
            ),
            "como_cargar_campañas": {
                "proveedores": "Líneas con audience=proveedores (canal meta, google_*, etc.); suma = gasto_proveedores_clp.",
                "clientes": "Líneas con audience=clientes; suma = gasto_clientes_clp.",
            },
        },
        "generado_el": datetime.now(timezone.utc).isoformat(),
    }
    return report


@router.post("/spend")
async def save_marketing_spend(body: SpendPayload, _: dict = Depends(get_current_admin)):
    """Reemplaza todas las líneas de inversión de esa semana."""
    ws = _parse_week_start(body.week_start)
    start, _ = _week_range(ws)

    for line in body.lines:
        if line.channel not in ALLOWED_CHANNELS:
            raise HTTPException(400, detail=f"Canal inválido. Usar: {sorted(ALLOWED_CHANNELS)}")
        if line.audience not in AUDIENCIAS:
            raise HTTPException(400, detail="audience debe ser clientes o proveedores")

    await db.marketing_spend.delete_many({"week_start": start})
    for line in body.lines:
        await db.marketing_spend.insert_one({
            "week_start": start,
            "channel": line.channel,
            "audience": line.audience,
            "amount_clp": line.amount_clp,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    try:
        await db.marketing_spend.create_index([("week_start", 1), ("channel", 1), ("audience", 1)])
    except Exception:
        pass

    meta = _week_period_meta(start)
    return {
        "success": True,
        "week_start": start.isoformat(),
        "week_effective": meta,
        "lineas": len(body.lines),
    }


@router.get("/spend")
async def get_marketing_spend(
    week_start: str = Query(..., description="YYYY-MM-DD (cualquier día de la semana; se usa el lunes ISO)"),
    _: dict = Depends(get_current_admin),
):
    ws = _parse_week_start(week_start)
    block = await _load_spend_for_week(ws)
    meta = _week_period_meta(ws)
    return {
        "week_start": _week_range(ws)[0].isoformat(),
        "week_effective": meta,
        "nota": "Todos los montos son CLP de la semana indicada; la fecha se normaliza al lunes de esa semana.",
        **block,
    }


@router.get("/report")
async def get_marketing_report(
    week_start: Optional[str] = Query(None, description="YYYY-MM-DD (cualquier día; se normaliza al lunes ISO). Omitir = semana según weeks_ago"),
    weeks_ago: int = Query(0, ge=0, le=52),
    _: dict = Depends(get_current_admin),
):
    if week_start:
        ws = _parse_week_start(week_start)
        if weeks_ago:
            ws = ws - timedelta(days=7 * weeks_ago)
    else:
        now = datetime.now(timezone.utc)
        weekday = now.weekday()
        this_monday = (now - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
        ws = this_monday - timedelta(days=7 * weeks_ago)

    return await build_marketing_report_for_week(ws)


# --- Cron sin sesión (secret en env) ---

def _verify_cron_secret(secret: Optional[str]) -> None:
    expected = os.environ.get("MAQGO_CRON_SECRET", "").strip()
    if not expected or secret != expected:
        raise HTTPException(status_code=403, detail="Cron no autorizado")


async def _run_weekly_cron_job() -> Dict[str, Any]:
    """Semana calendario anterior (lun–dom UTC) respecto al lunes en que corre el cron."""
    prev_start, prev_end = _previous_week_bounds()
    report = await build_marketing_report_for_week(prev_start)

    await db.marketing_weekly_snapshots.insert_one({
        "week_start": prev_start,
        "week_end": prev_end,
        "report": report,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": "cron",
    })
    logger.info("marketing weekly snapshot guardado semana %s", prev_start.isoformat())

    admin_email = os.environ.get("MAQGO_ADMIN_REPORT_EMAIL", "").strip()
    if admin_email:
        try:
            import resend
            import asyncio
            key = os.environ.get("RESEND_API_KEY", "")
            if key:
                resend.api_key = key
                subject = f"MAQGO — Reporte marketing semanal {report['periodo']['inicio'][:10]}"
                inv = report["inversion_clp"]
                text = (
                    f"Semana: {report['periodo']['inicio'][:10]}\n"
                    f"Inversión total CLP: {inv['total']}\n"
                    f"  — campañas clientes: {inv['clientes']}\n"
                    f"  — campañas proveedores: {inv['proveedores']}\n"
                    f"Nuevos clientes: {report['volumen']['nuevos_clientes']}\n"
                    f"Nuevos proveedores: {report['volumen']['nuevos_proveedores']}\n"
                    f"CAC cliente (est.): {report['kpi']['CAC_cliente_registro_clp']}\n"
                    f"CAC / costo adq. proveedor (est.): {report['kpi']['CAC_proveedor_registro_clp']}\n"
                )
                await asyncio.to_thread(
                    resend.Emails.send,
                    {"from": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev"), "to": admin_email, "subject": subject, "text": text},
                )
        except Exception as e:
            logger.warning("Email reporte marketing no enviado: %s", e)

    return report


@router.api_route("/cron/weekly-report", methods=["GET", "POST"])
async def cron_weekly_marketing_report(
    secret: Optional[str] = Query(None),
    x_cron_secret: Optional[str] = Query(None, alias="X-Cron-Secret"),
):
    """
    Misma URL base `/api/admin/marketing/...` — ver también `cron_router` alias corto.
    Genera reporte de la **semana anterior** y guarda snapshot.
    """
    _verify_cron_secret(secret or x_cron_secret)
    report = await _run_weekly_cron_job()
    return {"success": True, "report": report}


# Alias corto para cron externo: GET /api/admin/cron/marketing-weekly-report?secret=...
cron_router = APIRouter(prefix="/admin", tags=["admin-cron-marketing"])


@cron_router.api_route("/cron/marketing-weekly-report", methods=["GET", "POST"])
async def cron_marketing_weekly_report_alias(
    secret: Optional[str] = Query(None),
):
    _verify_cron_secret(secret)
    report = await _run_weekly_cron_job()
    return {"success": True, "report": report}


@router.get("/snapshots/latest")
async def latest_snapshots(limit: int = Query(4, ge=1, le=52), _: dict = Depends(get_current_admin)):
    cur = db.marketing_weekly_snapshots.find().sort("week_start", -1).limit(limit)
    rows = await cur.to_list(limit)
    for r in rows:
        r["_id"] = str(r.get("_id", ""))
        if isinstance(r.get("week_start"), datetime):
            r["week_start"] = r["week_start"].isoformat()
    return {"snapshots": rows}
