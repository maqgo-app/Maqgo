"""
MAQGO Admin - Informe Operativo Semanal y Planilla de Pagos
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin_strict
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta, timezone
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
from pathlib import Path

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


def _fmt_clp(val) -> str:
    try:
        n = float(val or 0)
    except Exception:
        n = 0.0
    n = round(n, 0)
    s = f"{int(n):,}".replace(",", ".")
    return f"${s}"


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


def _get_frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL", "").strip() or "https://www.maqgo.cl").rstrip("/")


def _extract_zone_from_address(address: str) -> str:
    t = str(address or "").strip()
    if not t:
        return "—"
    parts = [p.strip() for p in t.split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[-2][:40]
    if len(parts) == 1:
        return parts[0][:40]
    return "—"


def _parse_dt_maybe(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    t = str(value).strip()
    if not t:
        return None
    try:
        if t.endswith("Z"):
            t = t[:-1] + "+00:00"
        return datetime.fromisoformat(t)
    except Exception:
        return None


def _business_day_for_month(*, year: int, month: int, day: int, tz_name: str) -> datetime:
    safe_day = int(day or 1)
    safe_day = max(1, min(31, safe_day))
    for d in range(safe_day, 0, -1):
        try:
            dt = datetime(year, month, d, 0, 0, 0, tzinfo=ZoneInfo(tz_name))
            break
        except Exception:
            continue
    else:
        dt = datetime(year, month, 1, 0, 0, 0, tzinfo=ZoneInfo(tz_name))
    while dt.weekday() >= 5:
        dt = dt + timedelta(days=1)
    return dt


async def _compute_komatsu_integration_snapshot() -> dict:
    docs = await db.machines.find(
        {
            "status": {"$ne": "deleted"},
            "external.komatsu.assetId": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "external.komatsu.lastSyncAt": 1},
    ).to_list(20000)
    now = datetime.now(timezone.utc)
    connected = 0
    ok_24h = 0
    stale_72h = 0
    never_sync = 0
    newest = None
    for d in docs:
        connected += 1
        last = (((d or {}).get("external") or {}).get("komatsu") or {}).get("lastSyncAt")
        dt = _parse_dt_maybe(last)
        if not dt:
            never_sync += 1
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if newest is None or dt > newest:
            newest = dt
        age_h = (now - dt).total_seconds() / 3600.0
        if age_h <= 24.0:
            ok_24h += 1
        elif age_h > 72.0:
            stale_72h += 1
    return {
        "connected": connected,
        "ok_24h": ok_24h,
        "stale_72h": stale_72h,
        "never_sync": never_sync,
        "newest_sync_at": newest.isoformat() if isinstance(newest, datetime) else None,
    }


def _get_email_logo_url() -> str:
    raw = os.environ.get("MAQGO_EMAIL_LOGO_URL", "").strip()
    if raw:
        return raw
    return f"{_get_frontend_url()}/maqgo_logo_clean.png"


def _find_maqgo_logo_png_path() -> Optional[str]:
    repo_root = Path(__file__).resolve().parents[2]
    candidates = [
        repo_root / "frontend" / "public" / "maqgo_logo_clean.png",
        repo_root / "frontend" / "src" / "assets" / "maqgo-logo.png",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


def _render_admin_email_shell(*, title: str, subtitle: str, kpis: list[dict], sections: list[dict], cta_text: str, cta_url: str, report_id: str) -> str:
    logo_url = html_escape(_get_email_logo_url())
    safe_title = html_escape(title)
    safe_subtitle = html_escape(subtitle)
    safe_cta_text = html_escape(cta_text)
    safe_cta_url = html_escape(cta_url)
    safe_report_id = html_escape(report_id)

    kpi_cells = []
    for k in kpis[:4]:
        kpi_cells.append(
            f"""
            <td style="padding:0 8px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EDF5;border-radius:14px;background:#FFFFFF;">
                <tr><td style="padding:14px 14px 12px 14px;">
                  <div style="font-size:11px;letter-spacing:.3px;color:#64748B;font-weight:800;">{html_escape(str(k.get('label','')).upper())}</div>
                  <div style="margin-top:6px;font-size:20px;line-height:24px;color:#0B1220;font-weight:900;">{html_escape(str(k.get('value','')))}</div>
                  <div style="margin-top:4px;font-size:12px;color:#64748B;">{html_escape(str(k.get('sub','')))}</div>
                </td></tr>
              </table>
            </td>
            """
        )
    if len(kpi_cells) == 3:
        kpi_cells.append('<td style="padding:0 0 0 0;"></td>')
    kpi_row = "<tr>" + "".join(kpi_cells) + "</tr>"

    section_html = []
    for s in sections[:3]:
        st = html_escape(str(s.get("title") or ""))
        rows = s.get("rows") or []
        row_html = []
        for r in rows[:6]:
            label = html_escape(str(r.get("label") or ""))
            value = html_escape(str(r.get("value") or ""))
            pct = float(r.get("pct") or 0.0)
            pct = max(0.0, min(100.0, pct))
            color = html_escape(str(r.get("color") or "#8FB3C9"))
            row_html.append(
                f"""
                <tr>
                  <td style="padding:8px 0;font-size:12px;color:#0B1220;">{label}</td>
                  <td style="padding:8px 0 8px 12px;width:64%;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;border-radius:10px;">
                      <tr>
                        <td style="width:{pct:.0f}%;background:{color};height:10px;border-radius:10px;">&nbsp;</td>
                        <td style="width:{100.0-pct:.0f}%;height:10px;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding:8px 0 8px 12px;font-size:12px;color:#64748B;text-align:right;white-space:nowrap;">{value}</td>
                </tr>
                """
            )
        section_html.append(
            f"""
            <tr>
              <td style="padding:0 0 14px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                  <tr>
                    <td style="padding:16px 16px 6px 16px;">
                      <div style="font-size:14px;font-weight:900;color:#0B1220;">{st}</div>
                      <div style="margin-top:10px;height:2px;width:120px;background:#EC6819;border-radius:2px;"></div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:4px 16px 12px 16px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        {''.join(row_html)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            """
        )

    return f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#F6F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FB;padding:26px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:720px;">
            <tr>
              <td style="background:#ffffff;border:1px solid #E6EDF5;border-radius:20px;overflow:hidden;">
                <div style="height:10px;background:#EC6819;line-height:10px;font-size:0;">&nbsp;</div>
                <div style="padding:22px 26px 18px 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="background:#0B1220;border-radius:999px;">
                          <tr>
                            <td style="padding:10px 14px;">
                              <img src="{logo_url}" alt="MAQGO" width="86" style="display:block;border:0;outline:none;text-decoration:none;" />
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="vertical-align:middle;text-align:right;">
                        <span style="display:inline-block;background:#0B1220;color:#ffffff;padding:8px 12px;border-radius:999px;font-weight:900;font-size:12px;">Admin</span>
                      </td>
                    </tr>
                  </table>

                  <div style="margin-top:14px;font-weight:900;font-size:26px;line-height:32px;letter-spacing:-0.2px;color:#0B1220;">{safe_title}</div>
                  <div style="margin-top:6px;font-size:12px;color:#64748B;">{safe_subtitle}</div>

                  <div style="margin-top:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      {kpi_row}
                    </table>
                  </div>

                  <div style="margin-top:14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      {''.join(section_html)}
                    </table>
                  </div>

                  <div style="margin-top:4px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:14px;background:#FAFBFE;">
                    <div style="font-size:12px;color:#0B1220;line-height:18px;">
                      Adjuntamos el reporte en PDF (onepager) para lectura rápida. ID: <span style="font-weight:900;">{safe_report_id}</span>
                    </div>
                    <div style="margin-top:12px;">
                      <a href="{safe_cta_url}" style="display:inline-block;background:#0B1220;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:900;font-size:13px;">
                        {safe_cta_text}
                      </a>
                    </div>
                  </div>

                  <div style="margin-top:14px;border-top:1px solid #EEF2F7;padding-top:12px;font-size:11px;color:#94A3B8;line-height:16px;">
                    Este correo es automático para operación MAQGO. No responder.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;font-size:11px;color:#94A3B8;padding:12px 12px;">© {datetime.utcnow().strftime('%Y')} MAQGO</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _fmt_delta_pct(val) -> str:
    try:
        v = float(val)
    except Exception:
        return "—"
    if v == 0:
        return "0%"
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.1f}%"


def _fmt_days(val) -> str:
    try:
        v = float(val)
    except Exception:
        return "—"
    if v <= 0:
        return "—"
    if v < 1:
        return f"{v:.2f}"
    return f"{v:.1f}"


def _fmt_ratio(n, d) -> str:
    try:
        nn = int(n or 0)
        dd = int(d or 0)
    except Exception:
        return "—"
    if dd <= 0:
        return "—"
    nn = max(0, nn)
    return f"{nn}/{dd}"


def _render_metric_tile(*, label: str, value: str, sub: str) -> str:
    return f"""
    <td style="padding:0 10px 10px 0;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
        <tr><td style="padding:16px 16px 12px 16px;">
          <div style="font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;">{html_escape(label)}</div>
          <div style="margin-top:6px;font-size:22px;line-height:26px;color:#0B1220;font-weight:900;">{html_escape(value)}</div>
          <div style="margin-top:4px;font-size:12px;line-height:16px;color:#64748B;">{html_escape(sub)}</div>
        </td></tr>
      </table>
    </td>
    """


def _render_section_header(title: str) -> str:
    return f"""
    <div style="margin-top:18px;font-size:14px;font-weight:900;color:#0B1220;letter-spacing:.2px;">{html_escape(title)}</div>
    <div style="margin-top:8px;height:2px;width:140px;background:#EC6819;border-radius:2px;"></div>
    """


def _render_bullets(items: list[str]) -> str:
    lis = []
    for x in (items or [])[:6]:
        t = str(x or "").strip()
        if not t:
            continue
        lis.append(f'<tr><td style="padding:6px 0;font-size:13px;line-height:18px;color:#0B1220;">• {html_escape(t)}</td></tr>')
    if not lis:
        lis.append('<tr><td style="padding:6px 0;font-size:13px;line-height:18px;color:#64748B;">—</td></tr>')
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {''.join(lis)}
    </table>
    """


def _render_mini_rows(rows: list[dict]) -> str:
    out = []
    for r in (rows or [])[:5]:
        label = html_escape(str((r or {}).get("label") or ""))
        value = html_escape(str((r or {}).get("value") or ""))
        pct = float((r or {}).get("pct") or 0.0)
        pct = max(0.0, min(100.0, pct))
        color = html_escape(str((r or {}).get("color") or "#8FB3C9"))
        out.append(
            f"""
            <tr>
              <td style="padding:7px 0;font-size:12px;color:#0B1220;">{label}</td>
              <td style="padding:7px 0 7px 10px;width:60%;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;border-radius:999px;">
                  <tr>
                    <td style="width:{pct:.0f}%;background:{color};height:10px;border-radius:999px;">&nbsp;</td>
                    <td style="width:{100.0-pct:.0f}%;height:10px;">&nbsp;</td>
                  </tr>
                </table>
              </td>
              <td style="padding:7px 0 7px 10px;font-size:12px;color:#64748B;text-align:right;white-space:nowrap;">{value}</td>
            </tr>
            """
        )
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {''.join(out) if out else '<tr><td style="padding:6px 0;color:#64748B;">—</td></tr>'}
    </table>
    """


def _render_admin_weekly_brief_email(*, report: dict, report_id: str, cta_url: str) -> str:
    logo_url = html_escape(_get_email_logo_url())
    periodo = report.get("periodo", {}) or {}
    resumen = report.get("resumen", {}) or {}
    business = report.get("business", {}) or {}
    ops = report.get("ops", {}) or {}
    growth = report.get("growth", {}) or {}
    demand = report.get("demand", {}) or {}
    integrations = report.get("integrations", {}) or {}

    title = "Resumen Semanal"
    semana = str(periodo.get("semana") or "").strip() or "Semana"
    subtitle = f"{semana} · Generado {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"

    gmv = _fmt_clp(business.get("gmv_paid_clp") or resumen.get("gmv_pagado_semana_clp") or 0)
    maqgo_rev = _fmt_clp(business.get("maqgo_revenue_net_clp") or 0)
    completed = str(business.get("services_completed") or resumen.get("servicios_pagados_cerrados_semana") or 0)
    ticket = _fmt_clp(business.get("ticket_promedio_clp") or 0)
    wow_gmv = _fmt_delta_pct(business.get("wow_gmv_pct"))
    wow_rev = _fmt_delta_pct(business.get("wow_maqgo_revenue_pct"))
    wow_completed = _fmt_delta_pct(business.get("wow_completed_pct"))

    health = ops.get("health_score")
    try:
        health = int(health)
    except Exception:
        health = None
    health_label = "—"
    if health is not None:
        if health >= 85:
            health_label = "Sano"
        elif health >= 70:
            health_label = "Atención"
        else:
            health_label = "Crítico"
    health_value = f"{health}/100" if health is not None else "—"

    insights = (report.get("insights") or []) if isinstance(report.get("insights"), list) else []

    avg_days = business.get("avg_rental_days")
    avg_days_label = f"{_fmt_days(avg_days)} días" if avg_days is not None else "—"

    a_items = [
        f"GMV pagado: {gmv} (vs semana anterior: {wow_gmv})",
        f"Ingreso MAQGO neto (estimado): {maqgo_rev} (vs semana anterior: {wow_rev})",
        f"Servicios completados: {completed} (vs semana anterior: {wow_completed})",
        f"Ticket promedio: {ticket}",
        f"Arriendo promedio: {avg_days_label}",
    ]

    b_items = [
        f"Salud operacional: {health_value} · {health_label} (backlog/disputas/pagos)",
        f"Tiempo de revisión (prom.): {ops.get('review_avg_min') or resumen.get('tiempo_promedio_revision_min') or 0} min (creación→aprobación)",
        f"Backlog revisión: {ops.get('pending_review_total') or 0} (en revisión más de 72h: {ops.get('stuck_over_72h') or 0})",
        f"Disputas abiertas: {ops.get('disputed_total') or 0}",
        f"Documentos proveedor recibidos: {ops.get('invoiced_total') or resumen.get('por_pagar_proveedor_count') or 0} (pendiente revisión/pago)",
    ]

    c_items = [
        f"Nuevos clientes: {growth.get('new_clients') or resumen.get('nuevos_clientes_semana') or 0}",
        f"Nuevos proveedores: {growth.get('new_providers') or resumen.get('nuevos_proveedores_semana') or 0}",
        f"Nuevas maquinarias: {growth.get('new_machines') or resumen.get('nuevas_maquinarias_semana') or 0}",
    ]

    mk = report.get("marketing") or {}
    mk_funnel = (mk.get("funnel") or {}) if isinstance(mk, dict) else {}
    fc = (mk_funnel.get("clientes") or {}) if isinstance(mk_funnel.get("clientes"), dict) else {}
    fp = (mk_funnel.get("proveedores") or {}) if isinstance(mk_funnel.get("proveedores"), dict) else {}
    c_reg = int(fc.get("registrados") or 0)
    p_reg = int(fp.get("registrados") or 0)
    if c_reg > 0:
        c_items.append(
            f"Clientes nuevos ({c_reg}): "
            f"con tarjeta {int(fc.get('con_tarjeta_oneclick') or 0)} · "
            f"con solicitud {int(fc.get('con_solicitud_servicio') or 0)}"
        )
    else:
        c_items.append("Clientes nuevos: —")
    if p_reg > 0:
        c_items.append(
            f"Proveedores nuevos ({p_reg}): "
            f"disponibles {int(fp.get('disponibles') or 0)} · "
            f"con 1er servicio {int(fp.get('con_primer_servicio_semana') or 0)}"
        )
    else:
        c_items.append("Proveedores nuevos: —")

    top_zones = demand.get("top_zones") or []
    zone_rows = []
    if isinstance(top_zones, list) and top_zones:
        max_zone = max([int((z or {}).get("n") or 0) for z in top_zones] + [1])
        for z in top_zones[:3]:
            name = str((z or {}).get("zone") or "—").strip()
            n = int((z or {}).get("n") or 0)
            ch = (z or {}).get("wow_pct")
            wow = _fmt_delta_pct(ch) if ch is not None else "—"
            zone_rows.append({"label": name, "value": f"{n} (vs semana anterior: {wow})", "pct": float(n) / float(max_zone) * 100.0, "color": "#8FB3C9"})

    komatsu = integrations.get("komatsu") or {}
    k_total = int(komatsu.get("connected") or 0)
    k_ok = int(komatsu.get("ok_24h") or 0)
    k_stale = int(komatsu.get("stale_72h") or 0)
    k_never = int(komatsu.get("never_sync") or 0)
    d_items = [
        f"Zonas calientes (demanda): {int(demand.get('requests_created') or 0)} solicitudes",
        f"Komatsu: conectadas {k_total} · actualizadas (últimas 24h) {k_ok} · sin actualizar (más de 72h) {k_stale} · nunca sincronizadas {k_never}",
        f"Documentos proveedor recibidos: {ops.get('invoiced_total') or 0} (pendiente revisión/pago)",
    ]

    html = f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#F6F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FB;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:720px;">
            <tr>
              <td style="background:#ffffff;border:1px solid #E6EDF5;border-radius:22px;overflow:hidden;">
                <div style="height:10px;background:#EC6819;line-height:10px;font-size:0;">&nbsp;</div>
                <div style="padding:26px 26px 22px 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="background:#0B1220;border-radius:999px;">
                          <tr>
                            <td style="padding:12px 16px;">
                              <img src="{logo_url}" alt="MAQGO" width="92" style="display:block;border:0;outline:none;text-decoration:none;width:92px;height:auto;" />
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="vertical-align:middle;text-align:right;">
                        <span style="display:inline-block;background:#0B1220;color:#ffffff;padding:9px 12px;border-radius:999px;font-weight:900;font-size:12px;letter-spacing:.2px;">Admin</span>
                      </td>
                    </tr>
                  </table>

                  <div style="margin-top:18px;font-weight:900;font-size:28px;line-height:34px;letter-spacing:-0.3px;color:#0B1220;">{html_escape(title)}</div>
                  <div style="margin-top:6px;font-size:12px;line-height:16px;color:#64748B;">{html_escape(subtitle)}</div>

                  <div style="margin-top:18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        {_render_metric_tile(label="GMV pagado", value=gmv, sub=f"vs semana anterior: {wow_gmv}")}
                        {_render_metric_tile(label="Ingreso MAQGO", value=maqgo_rev, sub=f"vs semana anterior: {wow_rev}")}
                        <td style="padding:0 0 10px 0;vertical-align:top;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                            <tr><td style="padding:16px 16px 12px 16px;">
                              <div style="font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;">Salud operacional</div>
                              <div style="margin-top:6px;font-size:22px;line-height:26px;color:#0B1220;font-weight:900;">{html_escape(health_value)}</div>
                              <div style="margin-top:4px;font-size:12px;line-height:16px;color:#64748B;">{html_escape(health_label)}</div>
                            </td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  {_render_section_header("Claves")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FAFBFE;">
                    {_render_bullets(insights)}
                  </div>

                  {_render_section_header("Negocio")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    {_render_bullets(a_items)}
                  </div>

                  {_render_section_header("Operación")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    {_render_bullets(b_items)}
                  </div>

                  {_render_section_header("Crecimiento")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    {_render_bullets(c_items)}
                  </div>

                  {_render_section_header("Riesgos")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    {_render_bullets(d_items)}
                    {'<div style="margin-top:10px;"></div>' if zone_rows else ''}
                    {_render_mini_rows(zone_rows) if zone_rows else ''}
                  </div>

                  <div style="margin-top:16px;padding:16px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#0B1220;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;line-height:16px;color:rgba(255,255,255,0.78);">
                          Reporte ID: <span style="font-weight:900;color:#ffffff;">{html_escape(report_id)}</span>
                        </td>
                        <td style="text-align:right;">
                          <a href="{html_escape(cta_url)}" style="display:inline-block;background:#ffffff;color:#0B1220;text-decoration:none;padding:11px 14px;border-radius:12px;font-weight:900;font-size:13px;">
                            Abrir Admin
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="margin-top:14px;border-top:1px solid #EEF2F7;padding-top:12px;font-size:11px;color:#94A3B8;line-height:16px;">
                    Reporte automático MAQGO (agregado/anónimo). No responder.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;font-size:11px;color:#94A3B8;padding:12px 12px;">© {datetime.utcnow().strftime('%Y')} MAQGO</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
    return html


def _render_admin_monthly_intelligence_email(*, report: dict, report_id: str, cta_url: str) -> str:
    logo_url = html_escape(_get_email_logo_url())
    periodo = report.get("periodo", {}) or {}
    sales = report.get("sales", {}) or {}
    contribution = report.get("contribution", {}) or {}
    iva = report.get("iva", {}) or {}
    maqgo_revenue = report.get("maqgo_revenue", {}) or {}
    volume = report.get("volume", {}) or {}
    demand = report.get("demand", {}) or {}
    marketing = report.get("marketing") or {}
    integrations = report.get("integrations", {}) or {}

    label = str(periodo.get("label") or "").strip() or "Mes"
    title = "Resumen Mensual"
    subtitle = f"Periodo: {label} · Generado {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"

    sales_net = _fmt_clp(sales.get("net") or 0)
    margin = _fmt_clp(contribution.get("margin") or 0)
    margin_pct = contribution.get("margin_pct")
    try:
        margin_pct = float(margin_pct)
        margin_pct = f"{margin_pct:.2f}%"
    except Exception:
        margin_pct = "—"
    maqgo_net = _fmt_clp(maqgo_revenue.get("total_net") or 0)
    iva_neto = _fmt_clp(iva.get("neto_a_pagar_estimado") or 0)

    services_paid = int(volume.get("services_paid") or 0)
    avg_days = volume.get("avg_rental_days")
    avg_days_label = f"{_fmt_days(avg_days)} días" if avg_days is not None else "—"
    new_clients = int(volume.get("new_clients") or 0)
    new_providers = int(volume.get("new_providers") or 0)
    new_machines = int(volume.get("new_machines") or 0)
    maqgo_pending = int(volume.get("maqgo_client_invoice_pending") or 0)
    maqgo_done = int(volume.get("maqgo_client_invoiced_marked") or 0)
    provider_doc_missing = int(volume.get("provider_doc_missing") or 0)
    with_provider_invoice = int(volume.get("with_provider_invoice") or 0)
    paid_without_invoice = int(volume.get("paid_without_invoice") or 0)

    mk_kpi = (marketing.get("kpi") or {}) if isinstance(marketing, dict) else {}
    cac_value = "—"
    try:
        c = mk_kpi.get("CAC_cliente_registro_clp")
        p = mk_kpi.get("CAC_proveedor_registro_clp")
        left = _fmt_clp(float(c)) if c is not None else "—"
        right = _fmt_clp(float(p)) if p is not None else "—"
        if left != "—" or right != "—":
            cac_value = f"{left} / {right}"
    except Exception:
        pass

    ltv_value = "—"
    try:
        candidates = [
            mk_kpi.get("LTV_cliente_clp"),
            mk_kpi.get("LTV_cliente_12m_clp"),
            mk_kpi.get("LTV_cliente_estimado_clp"),
        ]
        raw = next((x for x in candidates if x is not None and float(x) > 0), None)
        if raw is not None:
            ltv_value = _fmt_clp(float(raw))
    except Exception:
        ltv_value = "—"

    mid_tile = (
        _render_metric_tile(label="LTV cliente", value=ltv_value, sub="Auto (si hay datos)")
        if ltv_value != "—"
        else _render_metric_tile(label="Crecimiento", value=f"{new_clients} / {new_providers}", sub="Clientes / Proveedores")
    )
    growth_hint = (
        f'<div style="margin-top:6px;font-size:12px;line-height:16px;color:#64748B;">Crecimiento del mes: +{new_clients} clientes · +{new_providers} proveedores</div>'
        if ltv_value != "—"
        else ""
    )

    insights = (report.get("insights") or []) if isinstance(report.get("insights"), list) else []

    net_by_doc = (sales.get("net_by_document") or {}) if isinstance(sales.get("net_by_document"), dict) else {}
    docs_rows = []
    max_docs = max(
        1.0,
        float(net_by_doc.get("with_provider_invoice") or 0),
        float(net_by_doc.get("paid_without_invoice") or 0),
        float(net_by_doc.get("other") or 0),
    )
    docs_rows.append(
        {
            "label": "Proveedor con factura",
            "value": _fmt_clp(net_by_doc.get("with_provider_invoice") or 0),
            "pct": float(net_by_doc.get("with_provider_invoice") or 0) / max_docs * 100.0,
            "color": "#8FB3C9",
        }
    )
    docs_rows.append(
        {
            "label": "Factura de compra (no emisor)",
            "value": _fmt_clp(net_by_doc.get("paid_without_invoice") or 0),
            "pct": float(net_by_doc.get("paid_without_invoice") or 0) / max_docs * 100.0,
            "color": "#D9A15A",
        }
    )
    docs_rows.append(
        {
            "label": "Pendiente documento proveedor",
            "value": _fmt_clp(net_by_doc.get("other") or 0),
            "pct": float(net_by_doc.get("other") or 0) / max_docs * 100.0,
            "color": "#94A3B8",
        }
    )

    top_zones = demand.get("top_zones") or []
    zone_rows = []
    if isinstance(top_zones, list) and top_zones:
        max_zone = max([int((z or {}).get("n") or 0) for z in top_zones] + [1])
        for z in top_zones[:5]:
            zone_rows.append({"label": str((z or {}).get("zone") or "—"), "value": str(int((z or {}).get("n") or 0)), "pct": float(int((z or {}).get("n") or 0)) / float(max_zone) * 100.0, "color": "#8FB3C9"})

    komatsu = integrations.get("komatsu") or {}
    k_total = int(komatsu.get("connected") or 0)
    k_ok = int(komatsu.get("ok_24h") or 0)
    k_stale = int(komatsu.get("stale_72h") or 0)
    k_never = int(komatsu.get("never_sync") or 0)
    machines_published_total = int(volume.get("machines_published_total") or 0)

    html = f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#F6F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FB;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:720px;">
            <tr>
              <td style="background:#ffffff;border:1px solid #E6EDF5;border-radius:22px;overflow:hidden;">
                <div style="height:10px;background:#EC6819;line-height:10px;font-size:0;">&nbsp;</div>
                <div style="padding:26px 26px 22px 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="background:#0B1220;border-radius:999px;">
                          <tr>
                            <td style="padding:12px 16px;">
                              <img src="{logo_url}" alt="MAQGO" width="92" style="display:block;border:0;outline:none;text-decoration:none;width:92px;height:auto;" />
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="vertical-align:middle;text-align:right;">
                        <span style="display:inline-block;background:#0B1220;color:#ffffff;padding:9px 12px;border-radius:999px;font-weight:900;font-size:12px;letter-spacing:.2px;">Admin</span>
                      </td>
                    </tr>
                  </table>

                  <div style="margin-top:18px;font-weight:900;font-size:28px;line-height:34px;letter-spacing:-0.3px;color:#0B1220;">{html_escape(title)}</div>
                  <div style="margin-top:6px;font-size:12px;line-height:16px;color:#64748B;">{html_escape(subtitle)}</div>

                  <div style="margin-top:18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        {_render_metric_tile(label="Ventas netas", value=sales_net, sub=f"Servicios pagados: {services_paid}")}
                        {_render_metric_tile(label="Margen contribución", value=margin, sub=f"{margin_pct} sobre ventas netas")}
                        {_render_metric_tile(label="Ingreso MAQGO neto", value=maqgo_net, sub="Estimado")}
                      </tr>
                      <tr>
                        {_render_metric_tile(label="IVA neto estimado", value=iva_neto, sub="Validar contabilidad")}
                        {mid_tile}
                        <td style="padding:0 0 10px 0;vertical-align:top;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                            <tr><td style="padding:16px 16px 12px 16px;">
                              <div style="font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;">Nuevas maquinarias</div>
                              <div style="margin-top:6px;font-size:22px;line-height:26px;color:#0B1220;font-weight:900;">{new_machines}</div>
                              <div style="margin-top:4px;font-size:12px;line-height:16px;color:#64748B;">CAC C/P: {html_escape(cac_value)}</div>
                            </td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  {growth_hint}

                  {_render_section_header("Claves")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FAFBFE;">
                    {_render_bullets(insights)}
                  </div>

                  {_render_section_header("Finanzas")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    <div style="font-size:12px;color:#64748B;margin-bottom:10px;">
                      Arriendo promedio: {html_escape(avg_days_label)} ·
                      Documentos MAQGO a cliente: por emitir {maqgo_pending} · emitidos (marcados) {maqgo_done}
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-bottom:10px;">
                      Documentación proveedor: factura {with_provider_invoice} · factura compra {paid_without_invoice} · pendiente documento {provider_doc_missing}
                    </div>
                    {_render_mini_rows(docs_rows)}
                  </div>

                  {_render_section_header("Mercado")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    <div style="font-size:12px;color:#64748B;margin-bottom:8px;">Solicitudes creadas: {int(demand.get('requests_created') or 0)}</div>
                    {_render_mini_rows(zone_rows)}
                  </div>

                  {_render_section_header("Plataforma")}
                  <div style="margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;">
                    {_render_bullets([
                      f"Maquinarias publicadas (MAQGO): {machines_published_total}",
                      f"Komatsu (única telemática hoy): conectadas {k_total} · actualizadas (últimas 24h) {k_ok} · sin actualizar (más de 72h) {k_stale} · nunca sincronizadas {k_never}",
                    ])}
                  </div>

                  <div style="margin-top:16px;padding:16px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#0B1220;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;line-height:16px;color:rgba(255,255,255,0.78);">
                          Reporte ID: <span style="font-weight:900;color:#ffffff;">{html_escape(report_id)}</span>
                        </td>
                        <td style="text-align:right;">
                          <a href="{html_escape(cta_url)}" style="display:inline-block;background:#ffffff;color:#0B1220;text-decoration:none;padding:11px 14px;border-radius:12px;font-weight:900;font-size:13px;">
                            Abrir Admin
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="margin-top:14px;border-top:1px solid #EEF2F7;padding-top:12px;font-size:11px;color:#94A3B8;line-height:16px;">
                    Reporte automático MAQGO (agregado/anónimo). No responder.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;font-size:11px;color:#94A3B8;padding:12px 12px;">© {datetime.utcnow().strftime('%Y')} MAQGO</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
    return html

def _build_weekly_onepager_pdf_bytes(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph, Flowable
    from reportlab.lib.styles import ParagraphStyle

    BRAND = colors.HexColor("#EC6819")
    INK = colors.HexColor("#0B1220")
    MUTED = colors.HexColor("#475569")
    BG = colors.HexColor("#F8FAFC")
    CARD = colors.white
    BORDER = colors.HexColor("#E2E8F0")
    SOFT = colors.HexColor("#EEF2F7")

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

    created_count = fmt_int(resumen.get("total_servicios_creados_semana") or resumen.get("total_solicitudes"))
    created_amount = float(resumen.get("monto_creado_semana_clp") or 0)
    paid_count = fmt_int(resumen.get("servicios_pagados_cerrados_semana") or 0)
    gmv_paid = float(resumen.get("gmv_pagado_semana_clp") or 0)
    por_pagar_count = fmt_int(resumen.get("por_pagar_proveedor_count") or 0)
    por_pagar_amount = float(resumen.get("por_pagar_proveedor_monto_clp") or 0)
    cancel_rate = str(resumen.get("tasa_cancelacion") or "0%").strip()
    canceladas = fmt_int(
        resumen.get("solicitudes_canceladas")
        or ((resumen.get("por_estado") or {}).get("cancelled") if isinstance(resumen.get("por_estado"), dict) else 0)
        or 0
    )
    review_min = resumen.get("tiempo_promedio_revision_min")
    try:
        review_min = float(review_min or 0)
        review_min = round(review_min, 1)
    except Exception:
        review_min = 0.0

    semana_label = str(periodo.get("semana") or "").strip()
    inicio = str(periodo.get("inicio") or "")[:10]
    fin = str(periodo.get("fin") or "")[:10]
    meta = []
    if semana_label:
        meta.append(semana_label)
    has_range_in_label = ("→" in semana_label) or (inicio and inicio in semana_label) or (fin and fin in semana_label)
    if inicio and fin and not has_range_in_label:
        meta.append(f"{inicio} → {fin}")
    meta.append(datetime.utcnow().strftime("Generado %Y-%m-%d %H:%M UTC"))
    if review_min and review_min > 0:
        meta.append(f"Revisión prom.: {review_min} min")
    subtitle = " · ".join(meta)

    por_estado = (resumen.get("por_estado") or {}) if isinstance(resumen.get("por_estado"), dict) else {}
    etiquetas = (resumen.get("etiquetas_estado") or {}) if isinstance(resumen.get("etiquetas_estado"), dict) else {}
    palette = {
        "pending_review": "#8FB3C9",
        "approved": "#66BB6A",
        "invoiced": "#D9A15A",
        "paid": "#EC6819",
        "disputed": "#E57373",
        "cancelled": "#94A3B8",
        "otros": "#CBD5E1",
    }
    total_estado = max(1, int(sum(fmt_int(v) for v in por_estado.values())))
    estado_rows = []
    for k, v in sorted(por_estado.items(), key=lambda kv: fmt_int(kv[1]), reverse=True):
        n = fmt_int(v)
        if n <= 0:
            continue
        estado_rows.append(
            {
                "label": str(etiquetas.get(k) or k).strip(),
                "value": str(n),
                "pct": float(n) / float(total_estado) * 100.0,
                "color": palette.get(k, "#8FB3C9"),
            }
        )
        if len(estado_rows) >= 6:
            break

    top_maq = resumen.get("top_maquinaria") or []
    if not isinstance(top_maq, list):
        top_maq = []
    max_top = max([fmt_int((x or {}).get("n")) for x in top_maq] + [1])
    top_rows = []
    for row in top_maq[:6]:
        t = str((row or {}).get("tipo") or "—").strip()
        n = fmt_int((row or {}).get("n"))
        if n <= 0:
            continue
        top_rows.append({"label": t, "value": str(n), "pct": float(n) / float(max_top) * 100.0, "color": "#8FB3C9"})

    buffer = io.BytesIO()
    width, height = A4

    styles = {
        "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=2),
        "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=9.2, leading=12, textColor=MUTED, spaceAfter=10),
        "kpi_label": ParagraphStyle("kl", fontName="Helvetica-Bold", fontSize=8.2, leading=10, textColor=MUTED),
        "kpi_value": ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=INK),
        "kpi_sub": ParagraphStyle("ks", fontName="Helvetica", fontSize=8.6, leading=11, textColor=MUTED),
        "card_title": ParagraphStyle("ct", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK),
        "row_label": ParagraphStyle("rl", fontName="Helvetica", fontSize=9, leading=11, textColor=INK),
        "row_value": ParagraphStyle("rv", fontName="Helvetica", fontSize=9, leading=11, textColor=MUTED, alignment=2),
        "alert": ParagraphStyle("al", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#334155")),
    }

    class ProgressBar(Flowable):
        def __init__(self, pct: float, color_hex: str):
            super().__init__()
            try:
                self.pct = float(pct or 0.0)
            except Exception:
                self.pct = 0.0
            self.pct = max(0.0, min(100.0, self.pct))
            self.color_hex = str(color_hex or "#8FB3C9")
            self.h = 9

        def wrap(self, availWidth, availHeight):
            self.w = max(1, float(availWidth))
            return self.w, self.h

        def draw(self):
            r = 4
            self.canv.setFillColor(SOFT)
            self.canv.roundRect(0, 0, self.w, self.h, r, stroke=0, fill=1)
            if self.pct <= 0:
                return
            fill_w = self.w * (self.pct / 100.0)
            fill_w = max(1.5, min(self.w, fill_w))
            self.canv.setFillColor(colors.HexColor(self.color_hex))
            self.canv.roundRect(0, 0, fill_w, self.h, r, stroke=0, fill=1)

    def card(*, inner, pad: int = 12):
        t = Table([[inner]], colWidths=["*"])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), CARD),
                    ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
                    ("LINEABOVE", (0, 0), (-1, 0), 2.2, BRAND),
                    ("LEFTPADDING", (0, 0), (-1, -1), pad),
                    ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                    ("TOPPADDING", (0, 0), (-1, -1), pad),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
                ]
            )
        )
        return t

    def kpi_cell(label: str, value: str, sub: str):
        inner = [
            Paragraph(html_escape(str(label or "")).upper(), styles["kpi_label"]),
            Spacer(1, 4),
            Paragraph(html_escape(str(value or "—")), styles["kpi_value"]),
            Spacer(1, 2),
            Paragraph(html_escape(str(sub or "")), styles["kpi_sub"]),
        ]
        return card(inner=inner, pad=12)

    def section_card(title: str, rows: list[dict]):
        title_p = Paragraph(html_escape(str(title or "")), styles["card_title"])
        body_rows = []
        for r in (rows or [])[:6]:
            label = html_escape(str((r or {}).get("label") or "—"))
            value = html_escape(str((r or {}).get("value") or ""))
            pct = (r or {}).get("pct") or 0.0
            color_hex = (r or {}).get("color") or "#8FB3C9"
            body_rows.append([Paragraph(label, styles["row_label"]), ProgressBar(pct, color_hex), Paragraph(value, styles["row_value"])])
        if not body_rows:
            body_rows = [[Paragraph("Sin datos", styles["row_label"]), ProgressBar(0, "#CBD5E1"), Paragraph("—", styles["row_value"])]]
        body = Table(body_rows, colWidths=["42%", "38%", "20%"])
        body.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        inner = Table([[title_p], [Spacer(1, 6)], [body]], colWidths=["*"])
        inner.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        return card(inner=inner, pad=12)

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=24,
        rightMargin=24,
        topMargin=94,
        bottomMargin=42,
        title="MAQGO - Informe semanal",
    )

    logo_path = _find_maqgo_logo_png_path()
    logo_reader = None
    if logo_path:
        try:
            logo_reader = ImageReader(logo_path)
        except Exception:
            logo_reader = None

    def paint_frame(canv, _doc):
        canv.saveState()
        canv.setFillColor(BG)
        canv.rect(0, 0, width, height, stroke=0, fill=1)
        canv.setFillColor(BRAND)
        canv.rect(0, height - 18, width, 18, stroke=0, fill=1)

        pill_x, pill_y, pill_w, pill_h = 24, height - 68, 136, 36
        canv.setFillColor(INK)
        canv.roundRect(pill_x, pill_y, pill_w, pill_h, 14, stroke=0, fill=1)
        if logo_reader:
            try:
                canv.drawImage(logo_reader, pill_x + 10, pill_y + 6, width=116, height=24, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass
        else:
            canv.setFillColor(colors.white)
            canv.setFont("Helvetica-Bold", 12)
            canv.drawString(pill_x + 12, height - 13, "MAQGO")

        badge_w, badge_h = 64, 22
        canv.setFillColor(INK)
        canv.roundRect(width - 24 - badge_w, height - 22, badge_w, badge_h, 10, stroke=0, fill=1)
        canv.setFillColor(colors.white)
        canv.setFont("Helvetica-Bold", 10.5)
        canv.drawCentredString(width - 24 - badge_w / 2, height - 7.5, "Admin")

        canv.setFillColor(colors.HexColor("#64748B"))
        canv.setFont("Helvetica", 8)
        canv.drawString(24, 24, "MAQGO · Reporte operativo semanal")
        canv.restoreState()

    story = []
    story.append(Paragraph("Informe semanal", styles["title"]))
    story.append(Paragraph(html_escape(subtitle), styles["sub"]))

    mk = report.get("marketing") or {}
    mk_kpi = (mk.get("kpi") or {}) if isinstance(mk, dict) else {}
    cac_c = mk_kpi.get("CAC_cliente_registro_clp")
    cac_p = mk_kpi.get("CAC_proveedor_registro_clp")
    try:
        cac_c_v = float(cac_c) if cac_c is not None else None
    except Exception:
        cac_c_v = None
    try:
        cac_p_v = float(cac_p) if cac_p is not None else None
    except Exception:
        cac_p_v = None
    cac_value = "—"
    if cac_c_v is not None or cac_p_v is not None:
        left = fmt_clp(cac_c_v) if cac_c_v is not None else "—"
        right = fmt_clp(cac_p_v) if cac_p_v is not None else "—"
        cac_value = f"{left} / {right}"

    nuevos_clientes = fmt_int(resumen.get("nuevos_clientes_semana") or 0)
    nuevos_proveedores = fmt_int(resumen.get("nuevos_proveedores_semana") or 0)
    nuevas_maquinarias = fmt_int(resumen.get("nuevas_maquinarias_semana") or 0)
    sub_clientes = f"CAC: {fmt_clp(cac_c_v)}" if cac_c_v is not None else "Cohorte semanal"
    sub_proveedores = f"CAC: {fmt_clp(cac_p_v)}" if cac_p_v is not None else "Cohorte semanal"

    kpis = [
        ("Servicios creados", str(created_count), f"Monto creado: {fmt_clp(created_amount)}"),
        ("Pagados cerrados", str(paid_count), f"GMV pagado: {fmt_clp(gmv_paid)}"),
        ("Documentos proveedor recibidos", str(por_pagar_count), f"Pago pendiente: {fmt_clp(por_pagar_amount)}"),
        ("Nuevos clientes", str(nuevos_clientes), sub_clientes),
        ("Nuevos proveedores", str(nuevos_proveedores), sub_proveedores),
        ("Nuevas maquinarias", str(nuevas_maquinarias), f"Cancelación: {cancel_rate}"),
    ]
    kpi_cards = [kpi_cell(*k) for k in kpis[:6]]
    grid = Table([kpi_cards[:3], kpi_cards[3:6]], colWidths=["33.33%", "33.33%", "33.33%"])
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(grid)
    story.append(Spacer(1, 12))

    two = Table([[section_card("Distribución por estado", estado_rows), section_card("Top maquinaria", top_rows)]], colWidths=["50%", "50%"])
    two.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(two)
    story.append(Spacer(1, 12))

    mk_funnel = (mk.get("funnel") or {}) if isinstance(mk, dict) else {}
    if isinstance(mk_funnel, dict) and mk_funnel:
        fc = (mk_funnel.get("clientes") or {}) if isinstance(mk_funnel.get("clientes"), dict) else {}
        fp = (mk_funnel.get("proveedores") or {}) if isinstance(mk_funnel.get("proveedores"), dict) else {}
        funnel_rows = [
            ["Funnel (cohorte nuevos)", "Clientes", "Proveedores"],
            ["Registrados", str(int(fc.get("registrados") or 0)), str(int(fp.get("registrados") or 0))],
            ["Activados", str(int(fc.get("con_tarjeta_oneclick") or 0)), str(int(fp.get("onboarding_completado") or 0))],
            ["Con acción", str(int(fc.get("con_solicitud_servicio") or 0)), str(int(fp.get("disponibles") or 0))],
            ["Monetizados", str(int(fc.get("con_servicio_pagado_semana") or 0)), str(int(fp.get("con_primer_servicio_semana") or 0))],
        ]
        ft = Table(funnel_rows, colWidths=["46%", "27%", "27%"])
        ft.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                    ("TEXTCOLOR", (0, 1), (0, -1), INK),
                    ("TEXTCOLOR", (1, 1), (-1, -1), MUTED),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                    ("LINEBELOW", (0, 0), (-1, 0), 1, BORDER),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(card(inner=[ft], pad=12))
        story.append(Spacer(1, 12))

    shown_alerts = []
    for a in alertas:
        msg = str((a or {}).get("mensaje") or "").strip()
        if not msg:
            continue
        shown_alerts.append(msg)
        if len(shown_alerts) >= 4:
            break
    if not shown_alerts:
        shown_alerts = ["Sin alertas críticas"]
    alert_flow = [Paragraph(f"• {html_escape(m)[:220]}", styles["alert"]) for m in shown_alerts]
    story.append(card(inner=[Paragraph("Alertas (solo lo crítico)", styles["card_title"]), Spacer(1, 8), *alert_flow], pad=12))

    doc.build(story, onFirstPage=paint_frame, onLaterPages=paint_frame)
    buffer.seek(0)
    return buffer.getvalue()


def _build_monthly_onepager_pdf_bytes(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph, Flowable
    from reportlab.lib.styles import ParagraphStyle

    BRAND = colors.HexColor("#EC6819")
    INK = colors.HexColor("#0B1220")
    MUTED = colors.HexColor("#475569")
    BG = colors.HexColor("#F8FAFC")
    CARD = colors.white
    BORDER = colors.HexColor("#E2E8F0")
    SOFT = colors.HexColor("#EEF2F7")

    periodo = report.get("periodo", {}) or {}
    volume = report.get("volume", {}) or {}
    sales = report.get("sales", {}) or {}
    contribution = report.get("contribution", {}) or {}
    iva = report.get("iva", {}) or {}
    maqgo_revenue = report.get("maqgo_revenue", {}) or {}
    demand = report.get("demand", {}) or {}

    def fmt_clp(val):
        try:
            n = float(val or 0)
            return f"${int(round(n)):,}".replace(",", ".")
        except Exception:
            return "—"

    width, height = A4
    buffer = io.BytesIO()

    styles = {
        "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=2),
        "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=9.2, leading=12, textColor=MUTED, spaceAfter=10),
        "kpi_label": ParagraphStyle("kl", fontName="Helvetica-Bold", fontSize=8.2, leading=10, textColor=MUTED),
        "kpi_value": ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=INK),
        "kpi_sub": ParagraphStyle("ks", fontName="Helvetica", fontSize=8.6, leading=11, textColor=MUTED),
        "card_title": ParagraphStyle("ct", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK),
        "row_label": ParagraphStyle("rl", fontName="Helvetica", fontSize=9, leading=11, textColor=INK),
        "row_value": ParagraphStyle("rv", fontName="Helvetica", fontSize=9, leading=11, textColor=MUTED, alignment=2),
    }

    class ProgressBar(Flowable):
        def __init__(self, pct: float, color_hex: str):
            super().__init__()
            try:
                self.pct = float(pct or 0.0)
            except Exception:
                self.pct = 0.0
            self.pct = max(0.0, min(100.0, self.pct))
            self.color_hex = str(color_hex or "#8FB3C9")
            self.h = 9

        def wrap(self, availWidth, availHeight):
            self.w = max(1, float(availWidth))
            return self.w, self.h

        def draw(self):
            r = 4
            self.canv.setFillColor(SOFT)
            self.canv.roundRect(0, 0, self.w, self.h, r, stroke=0, fill=1)
            if self.pct <= 0:
                return
            fill_w = self.w * (self.pct / 100.0)
            fill_w = max(1.5, min(self.w, fill_w))
            self.canv.setFillColor(colors.HexColor(self.color_hex))
            self.canv.roundRect(0, 0, fill_w, self.h, r, stroke=0, fill=1)

    def card(*, inner, pad: int = 12):
        t = Table([[inner]], colWidths=["*"])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), CARD),
                    ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
                    ("LINEABOVE", (0, 0), (-1, 0), 2.2, BRAND),
                    ("LEFTPADDING", (0, 0), (-1, -1), pad),
                    ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                    ("TOPPADDING", (0, 0), (-1, -1), pad),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
                ]
            )
        )
        return t

    def kpi_cell(label: str, value: str, sub: str):
        inner = [
            Paragraph(html_escape(str(label or "")).upper(), styles["kpi_label"]),
            Spacer(1, 4),
            Paragraph(html_escape(str(value or "—")), styles["kpi_value"]),
            Spacer(1, 2),
            Paragraph(html_escape(str(sub or "")), styles["kpi_sub"]),
        ]
        return card(inner=inner, pad=12)

    def section_card(title: str, rows: list[dict]):
        title_p = Paragraph(html_escape(str(title or "")), styles["card_title"])
        body_rows = []
        for r in (rows or [])[:6]:
            label = html_escape(str((r or {}).get("label") or "—"))
            value = html_escape(str((r or {}).get("value") or ""))
            pct = (r or {}).get("pct") or 0.0
            color_hex = (r or {}).get("color") or "#8FB3C9"
            body_rows.append([Paragraph(label, styles["row_label"]), ProgressBar(pct, color_hex), Paragraph(value, styles["row_value"])])
        if not body_rows:
            body_rows = [[Paragraph("Sin datos", styles["row_label"]), ProgressBar(0, "#CBD5E1"), Paragraph("—", styles["row_value"])]]
        body = Table(body_rows, colWidths=["42%", "38%", "20%"])
        body.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        inner = Table([[title_p], [Spacer(1, 6)], [body]], colWidths=["*"])
        inner.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        return card(inner=inner, pad=12)

    label = str(periodo.get("label") or "").strip()
    subtitle = f"Periodo: {label} · {datetime.utcnow().strftime('Generado %Y-%m-%d %H:%M UTC')}"

    services_paid = int(volume.get("services_paid") or 0)
    new_clients = int(volume.get("new_clients") or 0)
    new_providers = int(volume.get("new_providers") or 0)
    new_machines = int(volume.get("new_machines") or 0)
    sales_net = float(contribution.get("sales_net") or sales.get("net") or 0)
    sales_gross = float(sales.get("gross") or 0)
    cost = float(contribution.get("cost_of_sales") or 0)
    margin_val = float(contribution.get("margin") or 0)
    margin_pct = contribution.get("margin_pct")
    try:
        margin_pct = float(margin_pct)
        margin_pct_label = f"{margin_pct:.2f}% sobre ventas netas"
    except Exception:
        margin_pct_label = f"{contribution.get('margin_pct')}% sobre ventas netas" if contribution.get("margin_pct") is not None else "Sobre ventas netas"
    iva_neto = float(iva.get("neto_a_pagar_estimado") or 0)
    maqgo_val = float(maqgo_revenue.get("total_net") or 0)

    max_flow = max(1.0, sales_net, cost, margin_val, maqgo_val)
    flow_rows = [
        {"label": "Ventas", "value": fmt_clp(sales_net), "pct": float(sales_net) / float(max_flow) * 100.0, "color": "#66BB6A"},
        {"label": "Costo", "value": fmt_clp(cost), "pct": float(cost) / float(max_flow) * 100.0, "color": "#8FB3C9"},
        {"label": "Margen", "value": fmt_clp(margin_val), "pct": float(margin_val) / float(max_flow) * 100.0, "color": "#EC6819"},
        {"label": "MAQGO", "value": fmt_clp(maqgo_val), "pct": float(maqgo_val) / float(max_flow) * 100.0, "color": "#0B1220"},
    ]

    with_inv = int(volume.get("with_provider_invoice") or 0)
    without_inv = int(volume.get("paid_without_invoice") or 0)
    other = max(0, services_paid - with_inv - without_inv)
    net_by_doc = (sales.get("net_by_document") or {}) if isinstance(sales.get("net_by_document"), dict) else {}
    net_with_inv = float(net_by_doc.get("with_provider_invoice") or 0)
    net_without_inv = float(net_by_doc.get("paid_without_invoice") or 0)
    net_other = float(net_by_doc.get("other") or 0)
    max_docs_val = max(1.0, net_with_inv, net_without_inv, net_other)
    docs_rows = [
        {
            "label": "Proveedor con factura",
            "value": f"{fmt_clp(net_with_inv)} ({with_inv})",
            "pct": float(net_with_inv) / float(max_docs_val) * 100.0,
            "color": "#8FB3C9",
        },
        {
            "label": "Factura de compra (no emisor)",
            "value": f"{fmt_clp(net_without_inv)} ({without_inv})",
            "pct": float(net_without_inv) / float(max_docs_val) * 100.0,
            "color": "#D9A15A",
        },
        {
            "label": "Pendiente documento proveedor",
            "value": f"{fmt_clp(net_other)} ({other})",
            "pct": float(net_other) / float(max_docs_val) * 100.0,
            "color": "#94A3B8",
        },
    ]

    zones = demand.get("top_zones") or []
    zone_rows = []
    if isinstance(zones, list) and zones:
        max_zone = max([int((z or {}).get("n") or 0) for z in zones] + [1])
        for z in zones[:5]:
            name = str((z or {}).get("zone") or "—").strip()
            n = int((z or {}).get("n") or 0)
            if not name or n <= 0:
                continue
            zone_rows.append({"label": name, "value": str(n), "pct": float(n) / float(max_zone) * 100.0, "color": "#8FB3C9"})

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=24,
        rightMargin=24,
        topMargin=94,
        bottomMargin=42,
        title="MAQGO - Informe mensual",
    )

    logo_path = _find_maqgo_logo_png_path()
    logo_reader = None
    if logo_path:
        try:
            logo_reader = ImageReader(logo_path)
        except Exception:
            logo_reader = None

    def paint_frame(canv, _doc):
        canv.saveState()
        canv.setFillColor(BG)
        canv.rect(0, 0, width, height, stroke=0, fill=1)
        canv.setFillColor(BRAND)
        canv.rect(0, height - 18, width, 18, stroke=0, fill=1)

        pill_x, pill_y, pill_w, pill_h = 24, height - 68, 136, 36
        canv.setFillColor(INK)
        canv.roundRect(pill_x, pill_y, pill_w, pill_h, 14, stroke=0, fill=1)
        if logo_reader:
            try:
                canv.drawImage(logo_reader, pill_x + 10, pill_y + 6, width=116, height=24, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass
        else:
            canv.setFillColor(colors.white)
            canv.setFont("Helvetica-Bold", 12)
            canv.drawString(pill_x + 12, height - 13, "MAQGO")

        badge_w, badge_h = 64, 22
        canv.setFillColor(INK)
        canv.roundRect(width - 24 - badge_w, height - 22, badge_w, badge_h, 10, stroke=0, fill=1)
        canv.setFillColor(colors.white)
        canv.setFont("Helvetica-Bold", 10.5)
        canv.drawCentredString(width - 24 - badge_w / 2, height - 7.5, "Admin")

        canv.setFillColor(colors.HexColor("#64748B"))
        canv.setFont("Helvetica", 8)
        canv.drawString(24, 24, footer_text)
        canv.restoreState()

    story = []
    story.append(Paragraph("Informe mensual", styles["title"]))
    story.append(Paragraph(html_escape(subtitle), styles["sub"]))

    mk = report.get("marketing") or {}
    mk_kpi = (mk.get("kpi") or {}) if isinstance(mk, dict) else {}
    cac_c = mk_kpi.get("CAC_cliente_registro_clp")
    cac_p = mk_kpi.get("CAC_proveedor_registro_clp")
    try:
        cac_c_v = float(cac_c) if cac_c is not None else None
    except Exception:
        cac_c_v = None
    try:
        cac_p_v = float(cac_p) if cac_p is not None else None
    except Exception:
        cac_p_v = None
    cac_value = "—"
    if cac_c_v is not None or cac_p_v is not None:
        left = fmt_clp(cac_c_v) if cac_c_v is not None else "—"
        right = fmt_clp(cac_p_v) if cac_p_v is not None else "—"
        cac_value = f"{left} / {right}"

    footer_text = "Valores estimados: validar contabilidad"
    if cac_value != "—":
        footer_text = f"{footer_text} · CAC C/P: {cac_value}"

    kpis = [
        ("Ventas netas", fmt_clp(sales_net), f"Servicios pagados: {services_paid}"),
        ("Margen contribución", fmt_clp(margin_val), margin_pct_label),
        ("Ingreso MAQGO neto", fmt_clp(maqgo_val), "Estimado"),
        ("IVA neto estimado", fmt_clp(iva_neto), "Estimado contable"),
        ("Nuevos usuarios", f"{new_clients} / {new_providers}", "Clientes / Proveedores"),
        ("Nuevas maquinarias", str(new_machines), "Registradas en el mes"),
    ]
    kpi_cards = [kpi_cell(*k) for k in kpis[:6]]
    grid = Table([kpi_cards[:3], kpi_cards[3:6]], colWidths=["33.33%", "33.33%", "33.33%"])
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(grid)
    story.append(Spacer(1, 12))

    two = Table([[section_card("Flujo mensual (neto)", flow_rows), section_card("Documentación proveedor", docs_rows)]], colWidths=["50%", "50%"])
    two.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(two)

    if zone_rows:
        story.append(Spacer(1, 12))
        story.append(section_card("Zonas con mayor demanda (solicitudes)", zone_rows))

    doc.build(story, onFirstPage=paint_frame, onLaterPages=paint_frame)
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
    cta_url = f"{_get_frontend_url()}/admin"
    report_id = week_key
    subject = f"MAQGO — Resumen semanal {report['periodo']['semana']}"
    html = _render_admin_weekly_brief_email(report=report, report_id=report_id, cta_url=cta_url)
    text = f"MAQGO — Resumen semanal · {report['periodo']['semana']} · ID: {report_id}"

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "week_key": week_key,
            "to": recipients,
            "subject": subject,
            "text_preview": text[:2000],
            "html_preview": html[:2000],
        }

    send_result = await _send_email(
        recipients,
        subject,
        text,
        html,
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

    machines_published_total = await db.machines.count_documents({
        "status": {"$ne": "deleted"},
        "published": True,
    })

    sales_net = 0.0
    sales_gross = 0.0
    sales_net_with_provider_invoice = 0.0
    sales_net_paid_without_invoice = 0.0
    sales_net_other_docs = 0.0
    provider_payment_total = 0.0
    iva_debito = 0.0
    iva_credito_estimado = 0.0
    client_commission_net = 0.0
    provider_commission_net = 0.0
    paid_without_invoice_count = 0
    with_provider_invoice_count = 0
    other_doc_count = 0
    maqgo_client_pending_count = 0
    maqgo_client_done_count = 0
    rental_hours = []
    gmv_by_type = {}

    for s in services:
        net_total = float(s.get("net_total") or 0)
        gross_total = float(s.get("gross_total") or 0)
        if gross_total <= 0 and net_total > 0:
            gross_total = round(net_total * 1.19, 0)
        mtype = str(s.get("machinery_type") or s.get("machineryType") or "—").strip() or "—"
        gmv_by_type[mtype] = float(gmv_by_type.get(mtype) or 0) + float(gross_total or 0)

        service_fee = float(s.get("service_fee") or 0)
        paid_without_invoice = bool(s.get("paid_without_invoice", False))
        hours = float(s.get("hours") or 0)
        if hours > 0:
            rental_hours.append(hours)
        if s.get("maqgo_client_invoice_pending") is False:
            maqgo_client_done_count += 1
        else:
            maqgo_client_pending_count += 1

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
            sales_net_paid_without_invoice += net_total
        else:
            has_provider_invoice = (
                (s.get("invoiceStatus") == "validated")
                or bool(s.get("invoice_uploaded_at"))
                or bool(s.get("invoice_number"))
                or bool(s.get("invoiceFilename"))
                or bool(s.get("invoice_image"))
            )
            if has_provider_invoice:
                iva_credito_estimado += iva_servicio
                with_provider_invoice_count += 1
                sales_net_with_provider_invoice += net_total
            else:
                other_doc_count += 1
                sales_net_other_docs += net_total

        gross_sin_iva = (gross_total / 1.19) if gross_total else 0.0
        subtotal_base = gross_sin_iva / 1.10 if gross_sin_iva else 0.0
        client_commission_net += subtotal_base * 0.10
        provider_commission_net += (service_fee / 1.19) if service_fee else 0.0

    iva_neto_a_pagar_estimado = max(0.0, iva_debito - iva_credito_estimado)
    contribution_margin = sales_net - provider_payment_total
    contribution_margin_pct = (contribution_margin / sales_net * 100.0) if sales_net > 0 else 0.0
    maqgo_operating_revenue = client_commission_net + provider_commission_net
    avg_rental_hours = (sum(rental_hours) / len(rental_hours)) if rental_hours else 0.0
    avg_rental_days = (avg_rental_hours / 8.0) if avg_rental_hours > 0 else 0.0

    start_iso = start.replace(tzinfo=timezone.utc).isoformat()
    end_iso = end.replace(tzinfo=timezone.utc).isoformat()
    reqs = await db.service_requests.find(
        {"createdAt": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0, "location.address": 1},
    ).to_list(5000)
    zones = Counter(_extract_zone_from_address((r.get("location") or {}).get("address") if isinstance(r.get("location"), dict) else "") for r in reqs)
    top_zones = [{"zone": k, "n": v} for k, v in zones.most_common(5) if k and k != "—"]

    spend_rows = await db.marketing_spend.find(
        {"week_start": {"$gte": start.replace(tzinfo=timezone.utc), "$lt": end.replace(tzinfo=timezone.utc)}},
        {"_id": 0, "audience": 1, "amount_clp": 1, "channel": 1},
    ).to_list(2000)
    spend_clientes = 0.0
    spend_proveedores = 0.0
    for row in spend_rows:
        aud = str(row.get("audience") or "clientes").strip().lower()
        amt = float(row.get("amount_clp") or 0)
        if aud == "proveedores":
            spend_proveedores += amt
        else:
            spend_clientes += amt
    spend_total = spend_clientes + spend_proveedores

    async def count_role(role: str) -> int:
        return await db.users.count_documents({
            "$and": [
                {"$or": [{"role": role}, {"roles": role}]},
                {
                    "$or": [
                        {"createdAt": {"$gte": start_iso, "$lt": end_iso}},
                        {"created_at": {"$gte": start, "$lt": end}},
                    ]
                },
            ],
        })

    nuevos_clientes = await count_role("client")
    nuevos_proveedores = await count_role("provider")
    cac_cliente = (round(spend_clientes / nuevos_clientes, 2) if nuevos_clientes > 0 else None)
    cac_proveedor = (round(spend_proveedores / nuevos_proveedores, 2) if nuevos_proveedores > 0 else None)
    nuevas_maquinarias = await db.machines.count_documents(
        {
            "status": {"$ne": "deleted"},
            "createdAt": {"$gte": start.replace(tzinfo=timezone.utc), "$lt": end.replace(tzinfo=timezone.utc)},
        }
    )

    komatsu = await _compute_komatsu_integration_snapshot()
    integrations = {"komatsu": komatsu}

    top_machinery_gmv = []
    for k, v in sorted(gmv_by_type.items(), key=lambda kv: float(kv[1] or 0), reverse=True)[:5]:
        if not k or k == "—":
            continue
        top_machinery_gmv.append({"machinery": k, "gmv_clp": round(float(v or 0), 0)})

    report = {
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
            "provider_doc_missing": other_doc_count,
            "maqgo_client_invoice_pending": maqgo_client_pending_count,
            "maqgo_client_invoiced_marked": maqgo_client_done_count,
            "new_clients": nuevos_clientes,
            "new_providers": nuevos_proveedores,
            "new_machines": nuevas_maquinarias,
            "avg_rental_days": round(avg_rental_days, 2) if avg_rental_days > 0 else None,
            "machines_published_total": int(machines_published_total or 0),
        },
        "sales": {
            "net": round(sales_net, 0),
            "gross": round(sales_gross, 0),
            "net_by_document": {
                "with_provider_invoice": round(sales_net_with_provider_invoice, 0),
                "paid_without_invoice": round(sales_net_paid_without_invoice, 0),
                "other": round(sales_net_other_docs, 0),
            },
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
        "demand": {
            "requests_created": len(reqs),
            "top_zones": top_zones,
        },
        "marketing": {
            "spend_clp": {
                "total": round(spend_total, 0),
                "clientes": round(spend_clientes, 0),
                "proveedores": round(spend_proveedores, 0),
            },
            "kpi": {
                "CAC_cliente_registro_clp": cac_cliente,
                "CAC_proveedor_registro_clp": cac_proveedor,
            },
        },
        "integrations": integrations,
        "market": {
            "top_machinery_by_gmv": top_machinery_gmv,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }

    insights = []
    if top_machinery_gmv:
        top = top_machinery_gmv[0]
        label = str(top.get("machinery") or "").strip()
        if label:
            insights.append(f"{label} lidera GMV del mes.")
    if top_zones:
        z0 = top_zones[0]
        label = str(z0.get("zone") or "").strip()
        if label:
            insights.append(f"{label} concentra la mayor demanda (solicitudes).")
    if int((komatsu or {}).get("stale_72h") or 0) > 0:
        insights.append(f"Integración Komatsu: {int((komatsu or {}).get('stale_72h') or 0)} máquina(s) sin actualizar (más de 72h).")
    if other_doc_count > 0:
        insights.append(f"Pendiente documento proveedor: {other_doc_count} servicio(s) sin evidencia de documento en sistema.")
    report["insights"] = insights[:5]
    return report


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
    scheduled_local = _business_day_for_month(year=now_local.year, month=now_local.month, day=day, tz_name=tz_name)
    is_scheduled_day = now_local.date() == scheduled_local.date()
    if not force and not (is_scheduled_day and in_window):
        return {
            "ok": False,
            "reason": "outside_schedule_window",
            "timezone": tz_name,
            "now_local": now_local.isoformat(),
            "scheduled_local": scheduled_local.isoformat(),
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
    report_id = month_key
    cta_url = f"{_get_frontend_url()}/admin"
    subject = f"MAQGO — Resumen mensual {report['periodo']['label']}"
    html = _render_admin_monthly_intelligence_email(report=report, report_id=report_id, cta_url=cta_url)
    text = f"MAQGO — Resumen mensual · {report['periodo']['label']} · ID: {report_id}"

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "month_key": month_key,
            "to": recipients,
            "subject": subject,
            "text_preview": text[:2000],
            "html_preview": html[:2000],
        }

    send_result = await _send_email(
        recipients,
        subject,
        text,
        html,
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
    rental_hours = [float(s.get("hours") or 0) for s in paid_docs if float(s.get("hours") or 0) > 0]
    avg_rental_hours = (sum(rental_hours) / len(rental_hours)) if rental_hours else 0.0
    avg_rental_days = (avg_rental_hours / 8.0) if avg_rental_hours > 0 else 0.0

    def calc_maqgo_net(docs: list[dict]) -> float:
        total = 0.0
        for s in docs or []:
            net_total = float(s.get("net_total") or 0)
            gross_total = float(s.get("gross_total") or 0)
            if gross_total <= 0 and net_total > 0:
                gross_total = round(net_total * 1.19, 0)
            service_fee = float(s.get("service_fee") or 0)
            gross_sin_iva = (gross_total / 1.19) if gross_total else 0.0
            subtotal_base = gross_sin_iva / 1.10 if gross_sin_iva else 0.0
            client_commission_net = subtotal_base * 0.10
            provider_commission_net = (service_fee / 1.19) if service_fee else 0.0
            total += float(client_commission_net + provider_commission_net)
        return round(total, 0)

    prev_start = start_of_week - timedelta(days=7)
    prev_end = start_of_week
    paid_docs_prev = await db.services.find(
        {"status": "paid", "paid_at": {"$gte": prev_start, "$lt": prev_end}},
        {"_id": 0, "gross_total": 1, "net_total": 1, "service_fee": 1},
    ).to_list(5000)
    gmv_prev = sum(float(d.get("gross_total") or 0) for d in paid_docs_prev)
    completed_prev = len(paid_docs_prev)
    maqgo_rev_week = calc_maqgo_net(paid_docs)
    maqgo_rev_prev = calc_maqgo_net(paid_docs_prev)

    def wow_pct(now_val: float, prev_val: float):
        try:
            now_f = float(now_val or 0)
            prev_f = float(prev_val or 0)
        except Exception:
            return None
        if prev_f <= 0:
            return None
        return round((now_f - prev_f) / prev_f * 100.0, 1)

    ticket_prom = round((gmv_week / n_pagados_cerrados), 0) if n_pagados_cerrados > 0 else 0.0

    monto_creado_week = sum(float(s.get("gross_total") or 0) for s in services)
    invoiced_filter = {
        "status": "invoiced",
        "$or": [
            {"invoiceStatus": "validated"},
            {"invoice_uploaded_at": {"$exists": True, "$ne": None}},
            {"invoice_number": {"$exists": True, "$ne": None}},
            {"invoiceFilename": {"$exists": True, "$ne": ""}},
            {"invoice_image": {"$exists": True, "$ne": None}},
        ],
    }
    invoiced_pending = await db.services.find(
        invoiced_filter,
        {"_id": 0, "net_total": 1, "amount_paid_to_provider": 1},
    ).to_list(5000)
    por_pagar_count = len(invoiced_pending)
    por_pagar_amount = 0.0
    for s in invoiced_pending:
        if s.get("amount_paid_to_provider") is not None:
            por_pagar_amount += float(s.get("amount_paid_to_provider") or 0)
        else:
            por_pagar_amount += float(s.get("net_total") or 0)

    total_creados = len(services)
    canceladas = por_estado.get("cancelled", 0)
    tasa_cancel = round((canceladas / total_creados * 100), 1) if total_creados else 0.0

    mach = Counter((s.get("machinery_type") or "—") for s in services)
    top_maquinaria = [{"tipo": k, "n": v} for k, v in mach.most_common(5)]

    alertas = await generate_alerts(db, start_of_week, end_of_week)
    marketing = None
    try:
        from routes.marketing_kpi import build_marketing_report_for_week

        marketing = await build_marketing_report_for_week(start_of_week.replace(tzinfo=timezone.utc))
    except Exception:
        marketing = None

    start_iso = start_of_week.replace(tzinfo=timezone.utc).isoformat()
    end_iso = end_of_week.replace(tzinfo=timezone.utc).isoformat()

    async def count_role(role: str) -> int:
        return await db.users.count_documents({
            "$and": [
                {"$or": [{"role": role}, {"roles": role}]},
                {
                    "$or": [
                        {"createdAt": {"$gte": start_iso, "$lt": end_iso}},
                        {"created_at": {"$gte": start_of_week, "$lt": end_of_week}},
                    ]
                },
            ],
        })

    nuevos_clientes = await count_role("client")
    nuevos_proveedores = await count_role("provider")
    nuevas_maquinarias = await db.machines.count_documents(
        {
            "status": {"$ne": "deleted"},
            "createdAt": {"$gte": start_of_week.replace(tzinfo=timezone.utc), "$lt": end_of_week.replace(tzinfo=timezone.utc)},
        }
    )

    komatsu = await _compute_komatsu_integration_snapshot()
    integrations = {"komatsu": komatsu}

    pending_review_total = await db.services.count_documents({"status": "pending_review"})
    stuck_over_72h = await db.services.count_documents({"status": "pending_review", "created_at": {"$lt": now - timedelta(hours=72)}})
    disputed_total = await db.services.count_documents({"status": "disputed"})
    invoiced_total = await db.services.count_documents(invoiced_filter)

    health_score = 100.0
    health_score -= min(35.0, float(stuck_over_72h) * 6.0)
    health_score -= min(20.0, float(disputed_total) * 3.0)
    health_score -= min(20.0, float(invoiced_total) * 0.6)
    health_score = max(0.0, min(100.0, health_score))

    reqs_week = await db.service_requests.find(
        {"createdAt": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0, "location.address": 1},
    ).to_list(8000)
    prev_start_iso = prev_start.replace(tzinfo=timezone.utc).isoformat()
    prev_end_iso = prev_end.replace(tzinfo=timezone.utc).isoformat()
    reqs_prev = await db.service_requests.find(
        {"createdAt": {"$gte": prev_start_iso, "$lt": prev_end_iso}},
        {"_id": 0, "location.address": 1},
    ).to_list(8000)

    zones_week = Counter(_extract_zone_from_address((r.get("location") or {}).get("address") if isinstance(r.get("location"), dict) else "") for r in reqs_week)
    zones_prev = Counter(_extract_zone_from_address((r.get("location") or {}).get("address") if isinstance(r.get("location"), dict) else "") for r in reqs_prev)
    top_zones = []
    for z, n in zones_week.most_common(5):
        if not z or z == "—":
            continue
        prev_n = int(zones_prev.get(z) or 0)
        zp = None
        if prev_n > 0:
            zp = round((float(n) - float(prev_n)) / float(prev_n) * 100.0, 1)
        top_zones.append({"zone": z, "n": int(n), "wow_pct": zp})
        if len(top_zones) >= 5:
            break

    demand = {"requests_created": len(reqs_week), "top_zones": top_zones}
    growth = {"new_clients": nuevos_clientes, "new_providers": nuevos_proveedores, "new_machines": nuevas_maquinarias}
    ops = {
        "health_score": int(round(health_score, 0)),
        "review_avg_min": tiempo_promedio_revision_min,
        "pending_review_total": pending_review_total,
        "stuck_over_72h": stuck_over_72h,
        "disputed_total": disputed_total,
        "invoiced_total": invoiced_total,
    }
    business = {
        "gmv_paid_clp": round(gmv_week, 0),
        "maqgo_revenue_net_clp": maqgo_rev_week,
        "services_completed": n_pagados_cerrados,
        "ticket_promedio_clp": ticket_prom,
        "avg_rental_days": round(avg_rental_days, 2) if avg_rental_days > 0 else None,
        "wow_gmv_pct": wow_pct(gmv_week, gmv_prev),
        "wow_maqgo_revenue_pct": wow_pct(maqgo_rev_week, maqgo_rev_prev),
        "wow_completed_pct": wow_pct(n_pagados_cerrados, completed_prev),
    }

    insights = []
    if business.get("wow_gmv_pct") is not None:
        d = float(business["wow_gmv_pct"])
        if abs(d) >= 8:
            verb = "subió" if d > 0 else "bajó"
            insights.append(f"GMV {verb} {abs(d):.1f}% vs semana anterior.")
    if business.get("wow_maqgo_revenue_pct") is not None:
        d = float(business["wow_maqgo_revenue_pct"])
        if abs(d) >= 8:
            verb = "subió" if d > 0 else "bajó"
            insights.append(f"Ingreso MAQGO {verb} {abs(d):.1f}% vs semana anterior (estimado).")
    if int(stuck_over_72h) > 0:
        insights.append(f"Backlog crítico: {int(stuck_over_72h)} servicio(s) en revisión (más de 72h).")
    if int(komatsu.get("stale_72h") or 0) > 0:
        insights.append(f"Integración Komatsu: {int(komatsu.get('stale_72h') or 0)} máquina(s) sin actualizar (más de 72h).")
    if top_zones:
        z0 = top_zones[0]
        if z0.get("wow_pct") is not None and abs(float(z0["wow_pct"])) >= 20:
            verb = "creció" if float(z0["wow_pct"]) > 0 else "cayó"
            insights.append(f"Demanda: {z0.get('zone')} {verb} {abs(float(z0['wow_pct'])):.1f}% vs semana anterior.")
    insights = insights[:5]

    etiquetas = {
        "pending_review": "En revisión MAQGO",
        "approved": "Aprobado (factura proveedor)",
        "invoiced": "Factura recibida (pago pendiente)",
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
            "monto_creado_semana_clp": round(monto_creado_week, 0),
            "por_estado": por_estado,
            "etiquetas_estado": etiquetas,
            "tiempo_promedio_revision_h": tiempo_promedio_revision_h,
            "tiempo_promedio_revision_min": tiempo_promedio_revision_min,
            "servicios_pagados_cerrados_semana": n_pagados_cerrados,
            "gmv_pagado_semana_clp": round(gmv_week),
            "por_pagar_proveedor_count": por_pagar_count,
            "por_pagar_proveedor_monto_clp": round(por_pagar_amount, 0),
            "tasa_cancelacion": f"{tasa_cancel}%",
            "top_maquinaria": top_maquinaria,
            "nuevos_clientes_semana": nuevos_clientes,
            "nuevos_proveedores_semana": nuevos_proveedores,
            "nuevas_maquinarias_semana": nuevas_maquinarias,
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
        "marketing": marketing,
        "business": business,
        "ops": ops,
        "growth": growth,
        "demand": demand,
        "integrations": integrations,
        "insights": insights,
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

    invoiced_filter = {
        "status": "invoiced",
        "$or": [
            {"invoiceStatus": "validated"},
            {"invoice_uploaded_at": {"$exists": True, "$ne": None}},
            {"invoice_number": {"$exists": True, "$ne": None}},
            {"invoiceFilename": {"$exists": True, "$ne": ""}},
            {"invoice_image": {"$exists": True, "$ne": None}},
        ],
    }
    inv_pend = await db.services.count_documents(invoiced_filter)
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
    only_approved: bool = Query(True, description="Si true: solo facturas proveedor aprobadas por MAQGO (listas para pago)."),
    _: dict = Depends(get_current_admin_strict),
):
    """
    Planilla de pagos pendientes (status=invoiced) para conciliación financiera.
    Incluye desglose neto/IVA/bruto y visibilidad de facturación MAQGO al cliente.
    """
    evidence_or = [
        {"invoiceStatus": "validated"},
        {"invoice_uploaded_at": {"$exists": True, "$ne": None}},
        {"invoice_number": {"$exists": True, "$ne": None}},
        {"invoiceFilename": {"$exists": True, "$ne": ""}},
        {"invoice_image": {"$exists": True, "$nin": [None, ""]}},
    ]
    base = {"status": "invoiced", "$or": evidence_or}
    if only_approved:
        base["provider_invoice_approved"] = True
    query = base
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
            start = d.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            query = {
                "$and": [
                    base,
                    {
                        "$or": [
                            {"invoice_uploaded_at": {"$gte": start, "$lt": end}},
                            {"created_at": {"$gte": start, "$lt": end}},
                        ]
                    },
                ]
            }
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
        provider_invoice_approved = bool(s.get("provider_invoice_approved") is True)
        provider_invoice_expected = float(s.get("provider_invoice_expected_total_clp") or 0)
        provider_invoice_confirmed = float(s.get("provider_invoice_total_confirmed_clp") or 0)
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
            "factura_proveedor_aprobada": "SI" if provider_invoice_approved else "NO",
            "monto_factura_proveedor_esperado": round(provider_invoice_expected, 0),
            "monto_factura_proveedor_confirmado": round(provider_invoice_confirmed, 0),
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
            "Factura proveedor aprobada",
            "Monto factura proveedor esperado (CLP)",
            "Monto factura proveedor confirmado (CLP)",
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
                r["factura_proveedor_aprobada"],
                r["monto_factura_proveedor_esperado"],
                r["monto_factura_proveedor_confirmado"],
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
