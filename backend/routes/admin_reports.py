"""
MAQGO Admin - Informe Operativo Semanal y Planilla de Pagos
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin_strict
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Optional
from collections import Counter
from email.message import EmailMessage
from html import escape as html_escape
import io
import csv
import base64
import os
import ssl
import smtplib
import asyncio
from zoneinfo import ZoneInfo

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

SUBSCRIPTIONS_CONFIG_KEY = "admin_report_subscriptions"

DEFAULT_ADMIN_REPORT_EMAIL = (
    os.environ.get("MAQGO_ADMIN_REPORT_EMAIL", "").strip()
    or "tomas@maqgo.cl, cvalle@maqgo.cl"
).strip().lower()

def _parse_bool(v: str, default: bool = False) -> bool:
    if v is None:
        return default
    t = str(v).strip().lower()
    if t in {"1", "true", "yes", "y", "on"}:
        return True
    if t in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _parse_int(v: str, default: int) -> int:
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _normalize_email_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        raw = ",".join(str(x) for x in value if x is not None)
    else:
        raw = str(value)
    emails = []
    for part in raw.replace(";", ",").split(","):
        t = part.strip().lower()
        if not t:
            continue
        emails.append(t)
    uniq = []
    seen = set()
    for e in emails:
        if e in seen:
            continue
        seen.add(e)
        uniq.append(e)
    return uniq


def _looks_like_email(value: str) -> bool:
    t = str(value or "").strip()
    if not t or "@" not in t:
        return False
    local, _, domain = t.partition("@")
    if not local or not domain or "." not in domain:
        return False
    return True


async def _get_subscription_config() -> dict:
    doc = await db.config.find_one({"_id": SUBSCRIPTIONS_CONFIG_KEY}, {"_id": 0})
    return doc or {}


async def _get_weekly_recipients_from_config_or_env() -> list[str]:
    try:
        cfg = await _get_subscription_config()
        weekly = cfg.get("weekly_emails")
        if isinstance(weekly, list) and weekly:
            return _normalize_email_list(weekly)
    except Exception:
        pass
    raw = (
        os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_EMAILS", "").strip()
        or os.environ.get("MAQGO_ADMIN_REPORT_EMAIL", "").strip()
        or DEFAULT_ADMIN_REPORT_EMAIL
    )
    return _normalize_email_list(raw)


async def _get_monthly_recipients_from_config_or_env() -> list[str]:
    try:
        cfg = await _get_subscription_config()
        monthly = cfg.get("monthly_emails")
        if isinstance(monthly, list) and monthly:
            return _normalize_email_list(monthly)
    except Exception:
        pass
    raw = (
        os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_EMAILS", "").strip()
        or os.environ.get("MAQGO_ADMIN_REPORT_EMAIL", "").strip()
        or DEFAULT_ADMIN_REPORT_EMAIL
    )
    return _normalize_email_list(raw)


class AdminReportSubscriptionsUpdate(BaseModel):
    weekly_emails: list[str] = Field(default_factory=list)
    monthly_emails: list[str] = Field(default_factory=list)



def _cron_verify(secret: Optional[str]) -> None:
    expected = os.environ.get("MAQGO_CRON_SECRET", "").strip()
    if not expected or (secret or "").strip() != expected:
        raise HTTPException(status_code=403, detail="Cron no autorizado")


async def _send_email(
    to_emails: list[str],
    subject: str,
    text: str,
    html: Optional[str] = None,
    attachments: Optional[list[dict]] = None,
) -> dict:
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev"

    smtp_host = os.environ.get("EMAIL_SMTP_HOST", "").strip()
    smtp_user = os.environ.get("EMAIL_SMTP_USER", "").strip()
    smtp_pass = os.environ.get("EMAIL_SMTP_PASS", "").strip()
    smtp_port = _parse_int(os.environ.get("EMAIL_SMTP_PORT", "587"), 587)
    use_ssl = _parse_bool(os.environ.get("EMAIL_SMTP_SSL", "false"), False)

    if smtp_host and smtp_user and smtp_pass:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = ", ".join(to_emails)
        msg.set_content(text or "")
        if html:
            msg.add_alternative(html, subtype="html")
        if attachments:
            for a in attachments:
                filename = str((a or {}).get("filename") or "attachment").strip() or "attachment"
                content = (a or {}).get("content") or b""
                if isinstance(content, str):
                    content = content.encode("utf-8")
                maintype = str((a or {}).get("maintype") or "application")
                subtype = str((a or {}).get("subtype") or "octet-stream")
                msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
        if use_ssl:
            context = ssl.create_default_context()
            await asyncio.to_thread(_smtp_send_ssl, smtp_host, smtp_port, smtp_user, smtp_pass, msg, context)
        else:
            context = ssl.create_default_context()
            await asyncio.to_thread(_smtp_send_starttls, smtp_host, smtp_port, smtp_user, smtp_pass, msg, context)
        return {"provider": "smtp"}

    try:
        import resend
    except Exception:
        resend = None
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not resend or not resend_key:
        raise HTTPException(status_code=500, detail="Proveedor de email no configurado (SMTP o RESEND_API_KEY)")
    resend.api_key = resend_key
    payload = {
        "from": sender,
        "to": to_emails,
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    if attachments:
        out = []
        for a in attachments:
            filename = str((a or {}).get("filename") or "attachment").strip() or "attachment"
            content = (a or {}).get("content") or b""
            if isinstance(content, str):
                content = content.encode("utf-8")
            out.append({"filename": filename, "content": base64.b64encode(content).decode("utf-8")})
        if out:
            payload["attachments"] = out
    result = await asyncio.to_thread(resend.Emails.send, payload)
    return {"provider": "resend", "id": result.get("id") if isinstance(result, dict) else None}


def _smtp_send_ssl(host: str, port: int, user: str, password: str, msg: EmailMessage, context) -> None:
    with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
        server.login(user, password)
        server.send_message(msg)


def _smtp_send_starttls(host: str, port: int, user: str, password: str, msg: EmailMessage, context) -> None:
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)


def _scheduled_window_allows_send(now_local: datetime, hour: int, minute: int, window_minutes: int) -> bool:
    target = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now_local < target:
        return False
    delta = now_local - target
    return delta.total_seconds() <= float(max(1, window_minutes)) * 60.0


def _previous_week_key(now_local: datetime) -> str:
    start_this_week = (now_local - timedelta(days=now_local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = start_this_week - timedelta(days=7)
    return prev_week_start.date().isoformat()


def _build_weekly_onepager_pdf_bytes(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.graphics import renderPDF
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    periodo = report.get("periodo", {}) or {}
    resumen = report.get("resumen", {}) or {}
    alertas = report.get("alertas", []) or []

    def fmt_int(val):
        try:
            return int(val)
        except Exception:
            return 0

    def fmt_clp(val):
        try:
            n = float(val or 0)
            return f"${int(round(n)):,}".replace(",", ".")
        except Exception:
            return "—"

    margin = 36
    gap = 12

    c.setTitle("MAQGO - Informe semanal (onepager)")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, height - 44, "MAQGO — Informe semanal (onepager)")
    c.setFont("Helvetica", 9)
    semana_label = str(periodo.get("semana") or "").strip()
    inicio = str(periodo.get("inicio") or "")[:10]
    fin = str(periodo.get("fin") or "")[:10]
    meta = []
    if semana_label:
        meta.append(semana_label)
    if inicio and fin:
        meta.append(f"{inicio} → {fin}")
    meta.append(f"Generado: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    c.drawString(margin, height - 60, " · ".join(meta))

    total_creados = fmt_int(resumen.get("total_servicios_creados_semana") or resumen.get("total_solicitudes"))
    pagados = fmt_int(resumen.get("servicios_pagados_cerrados_semana"))
    gmv = fmt_clp(resumen.get("gmv_pagado_semana_clp"))
    tasa_cancel = str(resumen.get("tasa_cancelacion") or "0%").strip()
    review_min = resumen.get("tiempo_promedio_revision_min")
    try:
        review_min = float(review_min or 0)
        review_min = round(review_min, 1)
    except Exception:
        review_min = 0.0

    box_y = height - 128
    box_h = 56
    box_w = (width - (2 * margin) - (2 * gap)) / 3.0

    def draw_kpi(x: float, title: str, value: str, sub: str) -> None:
        c.setFillColorRGB(0.96, 0.96, 0.97)
        c.roundRect(x, box_y, box_w, box_h, 10, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#0B1220"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 12, box_y + box_h - 18, title)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(x + 12, box_y + 18, value)
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 9)
        c.drawString(x + 12, box_y + 6, sub)

    draw_kpi(margin, "Servicios creados", str(total_creados), f"Cancelación: {tasa_cancel}")
    draw_kpi(margin + box_w + gap, "Pagados cerrados", str(pagados), f"Revisión prom: {review_min} min")
    draw_kpi(margin + (box_w + gap) * 2, "GMV pagado", gmv, "CLP (paid_at)")

    charts_top = height - 360
    chart_h = 180
    left_w = (width - (2 * margin) - gap) / 2.0
    right_x = margin + left_w + gap

    c.setFillColor(colors.HexColor("#0B1220"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, charts_top + chart_h + 18, "Distribución por estado")
    c.drawString(right_x, charts_top + chart_h + 18, "Top maquinaria")

    por_estado = resumen.get("por_estado") or {}
    etiquetas = resumen.get("etiquetas_estado") or {}
    keys = ["pending_review", "approved", "invoiced", "paid", "disputed", "cancelled", "otros"]
    pie_labels = []
    pie_data = []
    for k in keys:
        v = fmt_int(por_estado.get(k, 0))
        if v <= 0:
            continue
        pie_labels.append(str(etiquetas.get(k, k))[:18])
        pie_data.append(v)
    if sum(pie_data) > 0:
        d = Drawing(left_w, chart_h)
        p = Pie()
        p.x = 10
        p.y = 10
        p.width = min(220, left_w - 20)
        p.height = chart_h - 20
        p.data = pie_data
        p.labels = [f"{l} ({v})" for l, v in zip(pie_labels, pie_data)]
        palette = [
            colors.HexColor("#8FB3C9"),
            colors.HexColor("#66BB6A"),
            colors.HexColor("#D9A15A"),
            colors.HexColor("#EC6819"),
            colors.HexColor("#E57373"),
            colors.HexColor("#94A3B8"),
            colors.HexColor("#CBD5E1"),
        ]
        for i in range(len(p.data)):
            p.slices[i].fillColor = palette[i % len(palette)]
        d.add(p)
        renderPDF.draw(d, c, margin, charts_top)
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(margin, charts_top + chart_h / 2.0, "Sin datos")

    top_maq = resumen.get("top_maquinaria") or []
    bar_labels = []
    bar_values = []
    for row in top_maq[:5]:
        bar_labels.append(str(row.get("tipo") or "—")[:10])
        bar_values.append(fmt_int(row.get("n", 0)))
    if sum(bar_values) > 0:
        d2 = Drawing(left_w, chart_h)
        bc = VerticalBarChart()
        bc.x = 30
        bc.y = 20
        bc.height = chart_h - 40
        bc.width = left_w - 40
        bc.data = [bar_values]
        bc.valueAxis.valueMin = 0
        bc.valueAxis.valueMax = max(bar_values) if max(bar_values) > 0 else 1
        bc.valueAxis.valueStep = max(1, int(round(bc.valueAxis.valueMax / 4.0)))
        bc.categoryAxis.categoryNames = bar_labels
        bc.bars[0].fillColor = colors.HexColor("#8FB3C9")
        d2.add(bc)
        renderPDF.draw(d2, c, right_x, charts_top)
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(right_x, charts_top + chart_h / 2.0, "Sin datos")

    c.setFillColor(colors.HexColor("#0B1220"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, 178, "Alertas (solo lo crítico)")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#334155"))
    y = 164
    shown = 0
    for a in alertas:
        msg = str((a or {}).get("mensaje") or "").strip()
        if not msg:
            continue
        c.drawString(margin + 10, y, f"- {msg[:120]}")
        y -= 12
        shown += 1
        if shown >= 4:
            break
    if shown == 0:
        c.drawString(margin + 10, y, "- Sin alertas")

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawString(margin, 36, "Pipeline: pending_review → approved → invoiced → paid · Reporte resumido onepager.")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def _build_monthly_onepager_pdf_bytes(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.graphics import renderPDF
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    periodo = report.get("periodo", {}) or {}
    volume = report.get("volume", {}) or {}
    sales = report.get("sales", {}) or {}
    contribution = report.get("contribution", {}) or {}
    iva = report.get("iva", {}) or {}
    maqgo_revenue = report.get("maqgo_revenue", {}) or {}

    def fmt_clp(val):
        try:
            n = float(val or 0)
            return f"${int(round(n)):,}".replace(",", ".")
        except Exception:
            return "—"

    margin = 36
    gap = 12

    c.setTitle("MAQGO - Informe mensual (onepager)")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, height - 44, "MAQGO — Informe mensual (onepager)")
    c.setFont("Helvetica", 9)
    label = str(periodo.get("label") or "").strip()
    c.drawString(margin, height - 60, f"Periodo: {label} · Generado: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")

    box_y_top = height - 156
    box_h = 54
    box_w = (width - (2 * margin) - gap) / 2.0

    def draw_kpi(x: float, y: float, title: str, value: str, sub: str) -> None:
        c.setFillColorRGB(0.96, 0.96, 0.97)
        c.roundRect(x, y, box_w, box_h, 10, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#0B1220"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 12, y + box_h - 18, title)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(x + 12, y + 18, value)
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 9)
        c.drawString(x + 12, y + 6, sub)

    services_paid = int(volume.get("services_paid") or 0)
    draw_kpi(margin, box_y_top, "Ventas netas", fmt_clp(sales.get("net")), f"Servicios pagados: {services_paid}")
    draw_kpi(margin + box_w + gap, box_y_top, "Margen contribución", fmt_clp(contribution.get("margin")), f"{contribution.get('margin_pct')}% sobre ventas netas")
    draw_kpi(margin, box_y_top - (box_h + gap), "IVA neto estimado", fmt_clp(iva.get("neto_a_pagar_estimado")), "Estimado contable")
    draw_kpi(margin + box_w + gap, box_y_top - (box_h + gap), "Ingreso MAQGO neto", fmt_clp(maqgo_revenue.get("total_net")), "Comisiones (estimado)")

    charts_top = height - 392
    chart_h = 170
    left_w = (width - (2 * margin) - gap) / 2.0
    right_x = margin + left_w + gap

    c.setFillColor(colors.HexColor("#0B1220"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, charts_top + chart_h + 18, "Estructura mensual (CLP)")
    c.drawString(right_x, charts_top + chart_h + 18, "Documentos proveedor")

    bars = [
        float(contribution.get("sales_net") or 0),
        float(contribution.get("cost_of_sales") or 0),
        float(contribution.get("margin") or 0),
        float(maqgo_revenue.get("total_net") or 0),
    ]
    bar_labels = ["Ventas", "Costo", "Margen", "MAQGO"]
    if sum(bars) > 0:
        d = Drawing(left_w, chart_h)
        bc = VerticalBarChart()
        bc.x = 30
        bc.y = 20
        bc.height = chart_h - 40
        bc.width = left_w - 40
        bc.data = [bars]
        bc.valueAxis.valueMin = 0
        bc.valueAxis.valueMax = max(bars) if max(bars) > 0 else 1
        bc.valueAxis.valueStep = max(1, int(round(bc.valueAxis.valueMax / 4.0)))
        bc.categoryAxis.categoryNames = bar_labels
        bc.bars[0].fillColor = colors.HexColor("#66BB6A")
        d.add(bc)
        renderPDF.draw(d, c, margin, charts_top)
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(margin, charts_top + chart_h / 2.0, "Sin datos")

    with_inv = int(volume.get("with_provider_invoice") or 0)
    without_inv = int(volume.get("paid_without_invoice") or 0)
    other = max(0, services_paid - with_inv - without_inv)
    pie_data = [with_inv, without_inv, other]
    pie_labels = ["Con factura", "Sin factura", "Otros"]
    if sum(pie_data) > 0:
        d2 = Drawing(left_w, chart_h)
        p = Pie()
        p.x = 10
        p.y = 10
        p.width = min(220, left_w - 20)
        p.height = chart_h - 20
        p.data = pie_data
        p.labels = [f"{l} ({v})" for l, v in zip(pie_labels, pie_data)]
        palette = [colors.HexColor("#8FB3C9"), colors.HexColor("#D9A15A"), colors.HexColor("#94A3B8")]
        for i in range(len(p.data)):
            p.slices[i].fillColor = palette[i % len(palette)]
        d2.add(p)
        renderPDF.draw(d2, c, right_x, charts_top)
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(right_x, charts_top + chart_h / 2.0, "Sin datos")

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawString(margin, 36, "Onepager mensual para lectura rápida. Valores estimados: validar contabilidad.")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


async def _send_admin_weekly_report_email(*, force: bool, dry_run: bool, weeks_ago: int) -> dict:
    enabled = _parse_bool(os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_ENABLED", "true"), True)
    tz_name = os.environ.get("MAQGO_ADMIN_REPORT_TIMEZONE", "America/Santiago").strip() or "America/Santiago"
    hour = _parse_int(os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_HOUR", "8"), 8)
    minute = _parse_int(os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_MINUTE", "0"), 0)
    window = _parse_int(os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_WINDOW_MINUTES", "20"), 20)
    recipients = await _get_weekly_recipients_from_config_or_env()

    if not recipients:
        return {"ok": False, "reason": "missing_recipients"}
    if not enabled and not force:
        return {"ok": False, "reason": "disabled"}

    now_local = datetime.now(ZoneInfo(tz_name))
    is_monday = now_local.weekday() == 0
    in_window = _scheduled_window_allows_send(now_local, hour, minute, window)
    if not force and not (is_monday and in_window):
        return {
            "ok": False,
            "reason": "outside_schedule_window",
            "timezone": tz_name,
            "now_local": now_local.isoformat(),
        }

    week_key = _previous_week_key(now_local)
    recipients_key = ",".join(sorted(recipients))
    existing = await db.admin_weekly_report_mailings.find_one(
        {"kind": "weekly_report", "week_key": week_key, "recipients_key": recipients_key},
        {"_id": 0, "sent_at": 1},
    )
    if existing and not force:
        return {"ok": True, "skipped": True, "reason": "already_sent", "week_key": week_key}

    report = await _build_weekly_report(weeks_ago=weeks_ago)
    subject = f"MAQGO — Informe semanal {report['periodo']['semana']}"
    pdf_bytes = _build_weekly_onepager_pdf_bytes(report)
    inicio = str((report.get("periodo", {}) or {}).get("inicio") or "")[:10] or "semana"
    filename = f"maqgo_onepager_semanal_{inicio}.pdf"
    text = "Adjunto: Informe semanal MAQGO (onepager PDF)."
    html = f"<pre>{html_escape(text)}</pre>"

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "week_key": week_key,
            "to": recipients,
            "subject": subject,
            "text_preview": text[:2000],
            "attachment": {"filename": filename, "bytes": len(pdf_bytes)},
        }

    send_result = await _send_email(
        recipients,
        subject,
        text,
        html,
        attachments=[{"filename": filename, "content": pdf_bytes, "maintype": "application", "subtype": "pdf"}],
    )
    await db.admin_weekly_report_mailings.update_one(
        {"kind": "weekly_report", "week_key": week_key, "recipients_key": recipients_key},
        {
            "$set": {
                "kind": "weekly_report",
                "week_key": week_key,
                "recipients_key": recipients_key,
                "to": recipients,
                "timezone": tz_name,
                "scheduled_hour": hour,
                "scheduled_minute": minute,
                "weeks_ago": weeks_ago,
                "sent_at": datetime.utcnow().isoformat(),
                "provider": send_result.get("provider"),
                "provider_id": send_result.get("id"),
            }
        },
        upsert=True,
    )
    return {"ok": True, "sent": True, "week_key": week_key, "to": recipients, "provider": send_result.get("provider")}


cron_router = APIRouter(prefix="/admin", tags=["admin-cron-reports"])


@cron_router.api_route("/cron/admin-weekly-report", methods=["GET", "POST"])
async def cron_admin_weekly_report(
    secret: Optional[str] = Query(None),
    force: bool = Query(False),
    dry_run: bool = Query(False),
    weeks_ago: int = Query(1, ge=0, le=52),
):
    _cron_verify(secret)
    return await _send_admin_weekly_report_email(force=force, dry_run=dry_run, weeks_ago=weeks_ago)


@router.api_route("/cron/admin-weekly-report", methods=["GET", "POST"])
async def cron_admin_weekly_report_reports_namespace(
    secret: Optional[str] = Query(None),
    force: bool = Query(False),
    dry_run: bool = Query(False),
    weeks_ago: int = Query(1, ge=0, le=52),
):
    _cron_verify(secret)
    return await _send_admin_weekly_report_email(force=force, dry_run=dry_run, weeks_ago=weeks_ago)


def _shift_month(*, year: int, month: int, months_ago: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) - int(months_ago)
    y = total // 12
    m = (total % 12) + 1
    return int(y), int(m)


def _month_bounds_utc(*, year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, 0, 0, 0, 0)
    if month == 12:
        end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
    else:
        end = datetime(year, month + 1, 1, 0, 0, 0, 0)
    return start, end


async def _build_monthly_finance(*, year: int, month: int) -> dict:
    start, end = _month_bounds_utc(year=year, month=month)

    services = await db.services.find({
        "status": "paid",
        "paid_at": {"$gte": start, "$lt": end},
    }).to_list(5000)

    sales_net = 0.0
    sales_gross = 0.0
    provider_payment_total = 0.0
    iva_debito = 0.0
    iva_credito_estimado = 0.0
    client_commission_net = 0.0
    provider_commission_net = 0.0
    paid_without_invoice_count = 0
    with_provider_invoice_count = 0

    for s in services:
        net_total = float(s.get("net_total") or 0)
        gross_total = float(s.get("gross_total") or 0)
        if gross_total <= 0 and net_total > 0:
            gross_total = round(net_total * 1.19, 0)

        service_fee = float(s.get("service_fee") or 0)
        paid_without_invoice = bool(s.get("paid_without_invoice", False))

        provider_paid = (
            float(s.get("amount_paid_to_provider"))
            if s.get("amount_paid_to_provider") is not None
            else net_total
        )

        sales_net += net_total
        sales_gross += gross_total
        provider_payment_total += provider_paid

        iva_servicio = max(0.0, gross_total - net_total)
        iva_debito += iva_servicio

        if paid_without_invoice:
            paid_without_invoice_count += 1
        else:
            has_provider_invoice = bool(s.get("invoice_number")) or bool(s.get("invoice_uploaded_at"))
            if has_provider_invoice:
                iva_credito_estimado += iva_servicio
                with_provider_invoice_count += 1

        gross_sin_iva = (gross_total / 1.19) if gross_total else 0.0
        subtotal_base = gross_sin_iva / 1.10 if gross_sin_iva else 0.0
        client_commission_net += subtotal_base * 0.10
        provider_commission_net += (service_fee / 1.19) if service_fee else 0.0

    iva_neto_a_pagar_estimado = max(0.0, iva_debito - iva_credito_estimado)
    contribution_margin = sales_net - provider_payment_total
    contribution_margin_pct = (contribution_margin / sales_net * 100.0) if sales_net > 0 else 0.0
    maqgo_operating_revenue = client_commission_net + provider_commission_net

    return {
        "periodo": {
            "year": year,
            "month": month,
            "inicio": start.isoformat(),
            "fin": end.isoformat(),
            "label": f"{year}-{month:02d}",
        },
        "volume": {
            "services_paid": len(services),
            "with_provider_invoice": with_provider_invoice_count,
            "paid_without_invoice": paid_without_invoice_count,
        },
        "sales": {
            "net": round(sales_net, 0),
            "gross": round(sales_gross, 0),
        },
        "iva": {
            "debito": round(iva_debito, 0),
            "credito_estimado": round(iva_credito_estimado, 0),
            "neto_a_pagar_estimado": round(iva_neto_a_pagar_estimado, 0),
            "warning": "Estimado contable. Validar con SII/libro compra-venta y documentos tributarios.",
        },
        "contribution": {
            "sales_net": round(sales_net, 0),
            "cost_of_sales": round(provider_payment_total, 0),
            "margin": round(contribution_margin, 0),
            "margin_pct": round(contribution_margin_pct, 2),
        },
        "maqgo_revenue": {
            "client_commission_net": round(client_commission_net, 0),
            "provider_commission_net": round(provider_commission_net, 0),
            "total_net": round(maqgo_operating_revenue, 0),
        },
        "generated_at": datetime.utcnow().isoformat(),
    }


async def _send_admin_monthly_report_email(*, force: bool, dry_run: bool, months_ago: int) -> dict:
    enabled = _parse_bool(os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_ENABLED", "true"), True)
    tz_name = os.environ.get("MAQGO_ADMIN_REPORT_TIMEZONE", "America/Santiago").strip() or "America/Santiago"
    day = _parse_int(os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_DAY", "1"), 1)
    hour = _parse_int(os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_HOUR", "8"), 8)
    minute = _parse_int(os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_MINUTE", "0"), 0)
    window = _parse_int(os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_WINDOW_MINUTES", "90"), 90)
    recipients = await _get_monthly_recipients_from_config_or_env()

    if not recipients:
        return {"ok": False, "reason": "missing_recipients"}
    if not enabled and not force:
        return {"ok": False, "reason": "disabled"}

    now_local = datetime.now(ZoneInfo(tz_name))
    in_window = _scheduled_window_allows_send(now_local, hour, minute, window)
    if not force and not (int(now_local.day) == int(day) and in_window):
        return {
            "ok": False,
            "reason": "outside_schedule_window",
            "timezone": tz_name,
            "now_local": now_local.isoformat(),
        }

    y, m = _shift_month(year=now_local.year, month=now_local.month, months_ago=months_ago)
    month_key = f"{y}-{m:02d}"
    recipients_key = ",".join(sorted(recipients))
    existing = await db.admin_monthly_report_mailings.find_one(
        {"kind": "monthly_report", "month_key": month_key, "recipients_key": recipients_key},
        {"_id": 0, "sent_at": 1},
    )
    if existing and not force:
        return {"ok": True, "skipped": True, "reason": "already_sent", "month_key": month_key}

    report = await _build_monthly_finance(year=y, month=m)
    subject = f"MAQGO — Informe mensual {report['periodo']['label']}"
    pdf_bytes = _build_monthly_onepager_pdf_bytes(report)
    label = str((report.get("periodo", {}) or {}).get("label") or "").strip() or "mes"
    filename = f"maqgo_onepager_mensual_{label}.pdf"
    text = "Adjunto: Informe mensual MAQGO (onepager PDF)."
    html = f"<pre>{html_escape(text)}</pre>"

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "month_key": month_key,
            "to": recipients,
            "subject": subject,
            "text_preview": text[:2000],
            "attachment": {"filename": filename, "bytes": len(pdf_bytes)},
        }

    send_result = await _send_email(
        recipients,
        subject,
        text,
        html,
        attachments=[{"filename": filename, "content": pdf_bytes, "maintype": "application", "subtype": "pdf"}],
    )
    await db.admin_monthly_report_mailings.update_one(
        {"kind": "monthly_report", "month_key": month_key, "recipients_key": recipients_key},
        {
            "$set": {
                "kind": "monthly_report",
                "month_key": month_key,
                "recipients_key": recipients_key,
                "to": recipients,
                "timezone": tz_name,
                "scheduled_day": day,
                "scheduled_hour": hour,
                "scheduled_minute": minute,
                "months_ago": months_ago,
                "sent_at": datetime.utcnow().isoformat(),
                "provider": send_result.get("provider"),
                "provider_id": send_result.get("id"),
            }
        },
        upsert=True,
    )
    return {"ok": True, "sent": True, "month_key": month_key, "to": recipients, "provider": send_result.get("provider")}


@cron_router.api_route("/cron/admin-monthly-report", methods=["GET", "POST"])
async def cron_admin_monthly_report(
    secret: Optional[str] = Query(None),
    force: bool = Query(False),
    dry_run: bool = Query(False),
    months_ago: int = Query(1, ge=0, le=36),
):
    _cron_verify(secret)
    return await _send_admin_monthly_report_email(force=force, dry_run=dry_run, months_ago=months_ago)


@router.api_route("/cron/admin-monthly-report", methods=["GET", "POST"])
async def cron_admin_monthly_report_reports_namespace(
    secret: Optional[str] = Query(None),
    force: bool = Query(False),
    dry_run: bool = Query(False),
    months_ago: int = Query(1, ge=0, le=36),
):
    _cron_verify(secret)
    return await _send_admin_monthly_report_email(force=force, dry_run=dry_run, months_ago=months_ago)


@router.get("/sms-balance")
async def get_sms_balance(_: dict = Depends(get_current_admin_strict)):
    """
    Saldo de créditos SMS (LabsMobile) para monitoreo operativo en Admin.
    """
    try:
        from services.otp_service import get_sms_balance as otp_get_sms_balance
    except ImportError:
        raise HTTPException(status_code=500, detail="Servicio OTP no disponible")

    result = otp_get_sms_balance()
    threshold = float(str(os.environ.get("SMS_LOW_BALANCE_THRESHOLD", "300")).strip() or "300")
    credits = result.get("credits")

    if not result.get("success"):
        return {
            "success": False,
            "provider": "labsmobile",
            "credits": credits,
            "low_balance_threshold": threshold,
            "is_low_balance": (credits is not None and credits <= threshold),
            "error": result.get("error") or "No se pudo consultar saldo SMS",
            "code": result.get("code"),
        }

    return {
        "success": True,
        "provider": "labsmobile",
        "credits": credits,
        "low_balance_threshold": threshold,
        "is_low_balance": (credits is not None and credits <= threshold),
        "code": result.get("code"),
    }


@router.get("/subscriptions")
async def get_admin_report_subscriptions(_: dict = Depends(get_current_admin_strict)):
    cfg = await _get_subscription_config()
    weekly = _normalize_email_list(cfg.get("weekly_emails")) if cfg.get("weekly_emails") else await _get_weekly_recipients_from_config_or_env()
    monthly = _normalize_email_list(cfg.get("monthly_emails")) if cfg.get("monthly_emails") else await _get_monthly_recipients_from_config_or_env()
    return {
        "ok": True,
        "weekly_emails": weekly,
        "monthly_emails": monthly,
        "updated_at": cfg.get("updated_at"),
        "source": {
            "weekly": "db" if cfg.get("weekly_emails") else "env",
            "monthly": "db" if cfg.get("monthly_emails") else ("env" if (os.environ.get("MAQGO_ADMIN_MONTHLY_REPORT_EMAILS") or os.environ.get("MAQGO_ADMIN_REPORT_EMAIL")) else "default"),
        },
    }


@router.post("/subscriptions")
async def update_admin_report_subscriptions(body: AdminReportSubscriptionsUpdate, _: dict = Depends(get_current_admin_strict)):
    weekly = _normalize_email_list(body.weekly_emails)
    monthly = _normalize_email_list(body.monthly_emails)
    invalid = [e for e in weekly + monthly if not _looks_like_email(e)]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Emails inválidos: {', '.join(invalid[:5])}")
    now = datetime.utcnow().isoformat()
    await db.config.update_one(
        {"_id": SUBSCRIPTIONS_CONFIG_KEY},
        {"$set": {"weekly_emails": weekly, "monthly_emails": monthly, "updated_at": now}},
        upsert=True,
    )
    return {"ok": True, "weekly_emails": weekly, "monthly_emails": monthly, "updated_at": now}

async def _build_weekly_report(weeks_ago: int = 0):
    """
    Informe semanal alineado al pipeline de facturación MAQGO (colección `services`):
    pending_review → approved → invoiced → paid | disputed | cancelled
    """
    now = datetime.utcnow()
    start_of_week = now - timedelta(days=now.weekday() + (weeks_ago * 7))
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = start_of_week + timedelta(days=7)

    services = await db.services.find({
        "created_at": {"$gte": start_of_week, "$lt": end_of_week}
    }).to_list(None)

    pipeline_keys = ["pending_review", "approved", "invoiced", "paid", "disputed", "cancelled"]
    por_estado = {k: 0 for k in pipeline_keys}
    por_estado["otros"] = 0

    for s in services:
        st = s.get("status") or ""
        if st in pipeline_keys:
            por_estado[st] += 1
        else:
            por_estado["otros"] += 1

    review_hours = []
    for s in services:
        if s.get("approved_at") and s.get("created_at"):
            ca, aa = s["created_at"], s["approved_at"]
            if isinstance(ca, datetime) and isinstance(aa, datetime):
                review_hours.append((aa - ca).total_seconds() / 3600.0)

    tiempo_promedio_revision_h = round(sum(review_hours) / len(review_hours), 1) if review_hours else 0.0
    tiempo_promedio_revision_min = round(tiempo_promedio_revision_h * 60, 1) if tiempo_promedio_revision_h else 0.0

    paid_docs = await db.services.find({
        "status": "paid",
        "paid_at": {"$gte": start_of_week, "$lt": end_of_week}
    }).to_list(None)
    gmv_week = sum(float(d.get("gross_total") or 0) for d in paid_docs)
    n_pagados_cerrados = len(paid_docs)

    total_creados = len(services)
    canceladas = por_estado.get("cancelled", 0)
    tasa_cancel = round((canceladas / total_creados * 100), 1) if total_creados else 0.0

    mach = Counter((s.get("machinery_type") or "—") for s in services)
    top_maquinaria = [{"tipo": k, "n": v} for k, v in mach.most_common(5)]

    alertas = await generate_alerts(db, start_of_week, end_of_week)

    etiquetas = {
        "pending_review": "En revisión MAQGO",
        "approved": "Aprobado (factura proveedor)",
        "invoiced": "Facturado (pago pendiente)",
        "paid": "Pagado",
        "disputed": "En disputa",
        "cancelled": "Cancelado",
        "otros": "Otro estado",
    }

    return {
        "periodo": {
            "inicio": start_of_week.isoformat(),
            "fin": end_of_week.isoformat(),
            "semana": f"Semana del {start_of_week.strftime('%d/%m/%Y')} al {(end_of_week - timedelta(days=1)).strftime('%d/%m/%Y')}"
        },
        "resumen": {
            "total_servicios_creados_semana": total_creados,
            "por_estado": por_estado,
            "etiquetas_estado": etiquetas,
            "tiempo_promedio_revision_h": tiempo_promedio_revision_h,
            "tiempo_promedio_revision_min": tiempo_promedio_revision_min,
            "servicios_pagados_cerrados_semana": n_pagados_cerrados,
            "gmv_pagado_semana_clp": round(gmv_week),
            "tasa_cancelacion": f"{tasa_cancel}%",
            "top_maquinaria": top_maquinaria,
            "total_solicitudes": total_creados,
            "tiempo_promedio_confirmacion_min": tiempo_promedio_revision_min,
            "solicitudes_aceptadas": por_estado.get("approved", 0) + por_estado.get("invoiced", 0) + por_estado.get("paid", 0),
            "solicitudes_rechazadas": 0,
            "solicitudes_sin_respuesta": por_estado.get("pending_review", 0),
            "solicitudes_canceladas": canceladas,
            "reservas_inmediatas": 0,
            "tasa_aceptacion_inmediatas": "N/A",
        },
        "alertas": alertas,
        "generado_el": datetime.utcnow().isoformat(),
        "pipeline": "facturacion_post_servicio",
    }


@router.get("/weekly")
async def get_weekly_report(
    weeks_ago: int = 0,
    format: str = Query("json", pattern="^(json|pdf)$"),
    _: dict = Depends(get_current_admin_strict),
):
    """
    Genera el Informe Operativo Semanal.
    - weeks_ago: 0 = semana actual, 1 = semana pasada, etc.
    - format=json: respuesta JSON (modo actual).
    - format=pdf: PDF descargable, listo para imprimir.
    """
    report = await _build_weekly_report(weeks_ago)
    if format == "json":
        return report

    pdf_bytes = _build_weekly_onepager_pdf_bytes(report)
    inicio = str((report.get("periodo", {}) or {}).get("inicio") or "")[:10] or "semana"
    buffer = io.BytesIO(pdf_bytes)
    filename = f"maqgo_onepager_semanal_{inicio}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="application/pdf", headers=headers)


@router.get("/monthly-finance")
async def get_monthly_finance(
    year: Optional[int] = Query(None, ge=2020, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    format: str = Query("json", pattern="^(json|pdf)$"),
    _: dict = Depends(get_current_admin_strict),
):
    """
    Métricas mensuales de conciliación:
    - IVA débito / IVA crédito estimado / IVA neto a pagar (estimado)
    - Margen de contribución mensual (ingreso neto venta - costo de venta proveedor)
    """
    now = datetime.utcnow()
    y = int(year or now.year)
    m = int(month or now.month)
    report = await _build_monthly_finance(year=y, month=m)
    if format == "json":
        return report
    pdf_bytes = _build_monthly_onepager_pdf_bytes(report)
    buffer = io.BytesIO(pdf_bytes)
    label = str((report.get("periodo", {}) or {}).get("label") or "").strip() or f"{y}-{m:02d}"
    filename = f"maqgo_onepager_mensual_{label}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="application/pdf", headers=headers)


async def generate_alerts(db, start_date, end_date, umbral_revision_h=72):
    """
    Alertas alineadas al pipeline de facturación (colección `services`).
    Sin dependencias de colecciones legacy (operators / matching).
    """
    alertas = []
    now = datetime.utcnow()

    cola_lenta = await db.services.count_documents({
        "status": "pending_review",
        "created_at": {"$lt": now - timedelta(hours=umbral_revision_h)},
    })
    if cola_lenta > 0:
        alertas.append({
            "tipo": "COLA_REVISION",
            "mensaje": f"{cola_lenta} servicio(s) con más de {umbral_revision_h}h en revisión MAQGO (revisar/aprobar).",
            "detalle": [],
        })

    disp = await db.services.count_documents({
        "status": "disputed",
        "created_at": {"$gte": start_date, "$lt": end_date},
    })
    if disp > 0:
        alertas.append({
            "tipo": "DISPUTAS",
            "mensaje": f"{disp} servicio(s) en disputa creado(s) en esta ventana.",
            "detalle": [],
        })

    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_month.month == 12:
        end_month = start_month.replace(year=start_month.year + 1, month=1)
    else:
        end_month = start_month.replace(month=start_month.month + 1)
    mq_inv = await db.services.count_documents({
        "status": "paid",
        "maqgo_client_invoice_pending": {"$ne": False},
        "paid_at": {"$gte": start_month, "$lt": end_month},
    })
    if mq_inv > 0:
        alertas.append({
            "tipo": "FACTURACION_MAQGO_CLIENTE",
            "mensaje": f"{mq_inv} pago(s) donde MAQGO debe facturar al cliente (pendiente).",
            "detalle": [],
        })
    mq_inv_overdue = await db.services.count_documents({
        "status": "paid",
        "maqgo_client_invoice_pending": {"$ne": False},
        "paid_at": {"$lt": start_month},
    })
    if mq_inv_overdue > 0:
        alertas.append({
            "tipo": "FACTURACION_MAQGO_VENCIDA",
            "mensaje": f"{mq_inv_overdue} pago(s) de meses anteriores siguen sin factura cliente MAQGO.",
            "detalle": [],
        })

    inv_pend = await db.services.count_documents({"status": "invoiced"})
    if inv_pend > 0:
        alertas.append({
            "tipo": "COBROS_PROVEEDOR",
            "mensaje": f"{inv_pend} servicio(s) facturados esperando marcar pago a proveedor.",
            "detalle": [],
        })

    if not alertas:
        alertas.append({
            "tipo": "SIN_ALERTAS",
            "mensaje": "No hay alertas críticas en este snapshot.",
            "detalle": [],
        })

    return alertas


@router.get("/payments-planilla")
async def get_payments_planilla(
    format: str = Query("json", description="json o csv"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD. Sin fecha = todos los pendientes"),
    _: dict = Depends(get_current_admin_strict),
):
    """
    Planilla de pagos pendientes (status=invoiced) para conciliación financiera.
    Incluye desglose neto/IVA/bruto y visibilidad de facturación MAQGO al cliente.
    """
    query = {"status": "invoiced"}
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
            start = d.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            query["$or"] = [
                {"invoice_uploaded_at": {"$gte": start, "$lt": end}},
                {"created_at": {"$gte": start, "$lt": end}},
            ]
        except ValueError:
            date = None  # Ignorar fecha inválida

    services = await db.services.find(query).sort("created_at", -1).to_list(500)
    rows = []
    provider_ids = list(set(s.get("provider_id") for s in services if s.get("provider_id")))
    providers = {}
    if provider_ids:
        for u in await db.users.find({"id": {"$in": provider_ids}}, {"id": 1, "name": 1, "email": 1, "phone": 1}).to_list(100):
            providers[u["id"]] = u

    for s in services:
        prov = providers.get(s.get("provider_id", ""), {})
        net_amount = float(s.get("net_total") or 0)
        service_fee = float(s.get("service_fee") or 0)
        gross_total = float(s.get("gross_total") or 0)
        # Si el backend viejo no trae gross_total, lo reconstruimos desde neto.
        if gross_total <= 0 and net_amount > 0:
            gross_total = round(net_amount * 1.19, 0)
        iva_amount = max(0.0, round(gross_total - net_amount, 0))
        maqgo_invoice_pending = bool(s.get("maqgo_client_invoice_pending", False))
        paid_without_invoice = bool(s.get("paid_without_invoice", False))
        retention_amount = float(s.get("retention_amount") or 0)
        amount_paid_to_provider = (
            float(s.get("amount_paid_to_provider"))
            if s.get("amount_paid_to_provider") is not None
            else net_amount
        )
        rows.append({
            "id": str(s.get("_id", s.get("id", ""))),
            "fecha_creacion": s.get("created_at", ""),
            "fecha_factura": s.get("invoice_uploaded_at", ""),
            "fecha_servicio": s.get("service_date", ""),
            "proveedor": prov.get("name", "–"),
            "proveedor_email": prov.get("email", "–"),
            "proveedor_telefono": prov.get("phone", "–"),
            "cliente": s.get("client_name", "–"),
            "maquinaria": s.get("machinery_type", "–"),
            "horas": s.get("hours", 0),
            "monto_neto": round(net_amount, 0),
            "monto_iva": iva_amount,
            "monto_bruto": round(gross_total, 0),
            "comision_maqgo_proveedor": round(service_fee, 0),
            "monto_pago_proveedor": round(amount_paid_to_provider, 0),
            "pagado_sin_factura": "SI" if paid_without_invoice else "NO",
            "retencion_iva_sin_factura": round(retention_amount, 0) if paid_without_invoice else 0,
            "n_factura": s.get("invoice_number", "–"),
            "maqgo_facturo_cliente": "NO" if maqgo_invoice_pending else "SI",
            "fecha_factura_cliente_maqgo": s.get("maqgo_client_invoiced_at", ""),
            "estado_servicio": s.get("status", "–"),
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        header = [
            "ID",
            "Estado servicio",
            "Fecha creación",
            "Fecha servicio",
            "Fecha factura proveedor",
            "Proveedor",
            "Email",
            "Teléfono",
            "Cliente",
            "Maquinaria",
            "Horas",
            "Monto neto (CLP)",
            "IVA 19% (CLP)",
            "Monto bruto cliente (CLP)",
            "Comisión MAQGO proveedor (CLP)",
            "Monto a pagar proveedor (CLP)",
            "Pagado sin factura",
            "Retención IVA sin factura (CLP)",
            "Nº factura proveedor",
            "MAQGO facturó cliente",
            "Fecha factura cliente MAQGO",
        ]
        writer.writerow(header)
        for r in rows:
            writer.writerow([
                r["id"],
                r["estado_servicio"],
                str(r["fecha_creacion"])[:19] if r["fecha_creacion"] else "",
                str(r["fecha_servicio"])[:19] if r["fecha_servicio"] else "",
                str(r["fecha_factura"])[:19] if r["fecha_factura"] else "",
                r["proveedor"],
                r["proveedor_email"],
                r["proveedor_telefono"],
                r["cliente"],
                r["maquinaria"],
                r["horas"],
                r["monto_neto"],
                r["monto_iva"],
                r["monto_bruto"],
                r["comision_maqgo_proveedor"],
                r["monto_pago_proveedor"],
                r["pagado_sin_factura"],
                r["retencion_iva_sin_factura"],
                r["n_factura"],
                r["maqgo_facturo_cliente"],
                str(r["fecha_factura_cliente_maqgo"])[:19] if r["fecha_factura_cliente_maqgo"] else "",
            ])
        output.seek(0)
        filename = f"maqgo_planilla_pagos_{date or datetime.now().strftime('%Y-%m-%d')}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    return {
        "rows": rows,
        "total": len(rows),
        "total_neto": sum(r["monto_neto"] for r in rows),
        "total_iva": sum(r["monto_iva"] for r in rows),
        "total_bruto": sum(r["monto_bruto"] for r in rows),
        "total_pago_proveedor": sum(r["monto_pago_proveedor"] for r in rows),
    }


@router.post("/weekly/send-email")
async def send_weekly_report_email(
    email: Optional[str] = Query(None),
    weeks_ago: int = Query(1, ge=0, le=52),
    dry_run: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    recipients = _normalize_email_list(
        email
        or os.environ.get("MAQGO_ADMIN_WEEKLY_REPORT_EMAILS", "")
        or os.environ.get("MAQGO_ADMIN_REPORT_EMAIL", "")
        or DEFAULT_ADMIN_REPORT_EMAIL
    )
    if not recipients:
        raise HTTPException(status_code=400, detail="Falta destinatario email (param email o env MAQGO_ADMIN_WEEKLY_REPORT_EMAILS)")

    report = await _build_weekly_report(weeks_ago=weeks_ago)
    text = format_report_as_text(report)
    subject = f"MAQGO — Informe semanal {report['periodo']['semana']}"
    html = f"<pre>{html_escape(text)}</pre>"

    if dry_run:
        return {"ok": True, "dry_run": True, "to": recipients, "subject": subject, "text_preview": text[:2000]}

    result = await _send_email(recipients, subject, text, html)
    return {"ok": True, "sent": True, "to": recipients, "provider": result.get("provider"), "provider_id": result.get("id")}


@router.post("/monthly/send-email")
async def send_monthly_report_email(
    email: Optional[str] = Query(None),
    months_ago: int = Query(1, ge=0, le=36),
    dry_run: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    recipients = _normalize_email_list(email or ",".join(await _get_monthly_recipients_from_config_or_env()) or DEFAULT_ADMIN_REPORT_EMAIL)
    if not recipients:
        raise HTTPException(status_code=400, detail="Falta destinatario email (param email o env MAQGO_ADMIN_MONTHLY_REPORT_EMAILS)")

    now = datetime.utcnow()
    y, m = _shift_month(year=now.year, month=now.month, months_ago=months_ago)
    report = await _build_monthly_finance(year=y, month=m)
    text = format_monthly_finance_as_text(report)
    subject = f"MAQGO — Informe mensual {report['periodo']['label']}"
    html = f"<pre>{html_escape(text)}</pre>"

    if dry_run:
        return {"ok": True, "dry_run": True, "to": recipients, "subject": subject, "text_preview": text[:2000]}

    result = await _send_email(recipients, subject, text, html)
    return {"ok": True, "sent": True, "to": recipients, "provider": result.get("provider"), "provider_id": result.get("id")}


def format_report_as_text(report: dict) -> str:
    """Formatea el informe como texto plano (pipeline facturación MAQGO)."""
    r = report["resumen"]
    pe = r.get("por_estado") or {}
    lab = r.get("etiquetas_estado") or {}

    lineas_estado = ""
    for k, v in pe.items():
        if v or k == "pending_review":
            etiqueta = lab.get(k, k)
            lineas_estado += f"  • {etiqueta}: {v}\n"

    top_m = r.get("top_maquinaria") or []
    lineas_maq = ""
    for row in top_m[:5]:
        lineas_maq += f"  • {row.get('tipo', '—')}: {row.get('n', 0)}\n"
    if not lineas_maq:
        lineas_maq = "  (sin datos)\n"

    texto = f"""
═══════════════════════════════════════════════════════════════
     MAQGO - INFORME SEMANAL (pipeline facturación post-servicio)
═══════════════════════════════════════════════════════════════
{report["periodo"]["semana"]}
Generado: {report["generado_el"][:19]}

Servicios creados en la semana: {r.get("total_servicios_creados_semana", r.get("total_solicitudes", 0))}
Tiempo promedio revisión MAQGO→aprobado: {r.get("tiempo_promedio_revision_h", 0)} h
Pagados cerrados en la semana (paid_at): {r.get("servicios_pagados_cerrados_semana", 0)}
GMV pagado en la semana (CLP): {r.get("gmv_pagado_semana_clp", 0)}
Tasa cancelación (sobre creados): {r.get("tasa_cancelacion", "0%")}

Por estado (creados esta semana):
{lineas_estado}
Top maquinaria (creados esta semana):
{lineas_maq}
───────────────────────────────────────────────────────────────
                        ALERTAS
───────────────────────────────────────────────────────────────
"""

    for alerta in report["alertas"]:
        texto += f"\n⚠️  {alerta['mensaje']}\n"
        if alerta.get("detalle"):
            for d in alerta["detalle"][:5]:
                texto += f"    • {d}\n"

    texto += """
═══════════════════════════════════════════════════════════════
Alineado a estados: pending_review → approved → invoiced → paid
═══════════════════════════════════════════════════════════════
"""

    return texto


def _fmt_money(v) -> str:
    try:
        n = float(v or 0)
    except Exception:
        n = 0.0
    return f"{round(n):,}".replace(",", ".")


def format_monthly_finance_as_text(report: dict) -> str:
    p = report.get("periodo") or {}
    vol = report.get("volume") or {}
    sales = report.get("sales") or {}
    iva = report.get("iva") or {}
    contr = report.get("contribution") or {}
    rev = report.get("maqgo_revenue") or {}

    label = p.get("label") or f"{p.get('year', '—')}-{int(p.get('month') or 0):02d}"
    gen = str(report.get("generated_at") or datetime.utcnow().isoformat())[:19]

    texto = f"""
═══════════════════════════════════════════════════════════════
                 MAQGO - INFORME MENSUAL (finanzas)
═══════════════════════════════════════════════════════════════
Periodo: {label}
Generado: {gen}

Servicios pagados en el mes: {vol.get('services_paid', 0)}
Con factura proveedor: {vol.get('with_provider_invoice', 0)}
Pagado sin factura: {vol.get('paid_without_invoice', 0)}

Ventas (CLP):
  • Neto:  {_fmt_money(sales.get('net'))}
  • Bruto: {_fmt_money(sales.get('gross'))}

IVA (estimado, CLP):
  • Débito: {_fmt_money(iva.get('debito'))}
  • Crédito estimado: {_fmt_money(iva.get('credito_estimado'))}
  • Neto a pagar estimado: {_fmt_money(iva.get('neto_a_pagar_estimado'))}

Margen contribución (CLP):
  • Ventas netas: {_fmt_money(contr.get('sales_net'))}
  • Costo venta (pago proveedor): {_fmt_money(contr.get('cost_of_sales'))}
  • Margen: {_fmt_money(contr.get('margin'))} ({contr.get('margin_pct', 0)}%)

Ingresos MAQGO (neto, CLP):
  • Comisión cliente: {_fmt_money(rev.get('client_commission_net'))}
  • Comisión proveedor: {_fmt_money(rev.get('provider_commission_net'))}
  • Total: {_fmt_money(rev.get('total_net'))}

Nota: {iva.get('warning', '')}
═══════════════════════════════════════════════════════════════
"""
    return texto.strip() + "\n"
