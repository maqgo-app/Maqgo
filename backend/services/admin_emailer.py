import asyncio
import os
import ssl
import smtplib
from datetime import datetime
from email.message import EmailMessage
from html import escape as html_escape
from typing import Any, Optional
import hashlib
from zoneinfo import ZoneInfo

from fastapi import HTTPException


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


def _get_sender_email() -> str:
    return (os.environ.get("SENDER_EMAIL", "").strip() or "equipo@maqgo.cl").strip()


def _get_sender_name() -> str:
    return (os.environ.get("SENDER_NAME", "").strip() or "Equipo MAQGO").strip()


def _get_sender_from() -> str:
    name = _get_sender_name()
    email = _get_sender_email()
    if not name:
        return email
    safe_name = name.replace('"', "'").strip()
    return f"{safe_name} <{email}>"


def _smtp_send_ssl(host: str, port: int, user: str, password: str, msg: EmailMessage, context) -> None:
    with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
        server.login(user, password)
        server.send_message(msg)


def _smtp_send_starttls(host: str, port: int, user: str, password: str, msg: EmailMessage, context) -> None:
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)


async def _send_email(to_emails: list[str], subject: str, text: str, html: Optional[str] = None) -> dict:
    sender = _get_sender_from()

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
        context = ssl.create_default_context()
        if use_ssl:
            await asyncio.to_thread(_smtp_send_ssl, smtp_host, smtp_port, smtp_user, smtp_pass, msg, context)
        else:
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
    payload: dict[str, Any] = {
        "from": sender,
        "to": to_emails,
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    result = await asyncio.to_thread(resend.Emails.send, payload)
    return {"provider": "resend", "id": result.get("id") if isinstance(result, dict) else None}


def _env_recipients_for_event(event_type: str) -> list[str]:
    event = (event_type or "").strip().lower()
    mapping = {
        "admin_incident": "MAQGO_ADMIN_INCIDENT_EMAILS",
        "admin_notice": "MAQGO_ADMIN_NOTICE_EMAILS",
        "provider_onboarding_notice": "MAQGO_ADMIN_ONBOARDING_EMAILS",
    }
    key = mapping.get(event)
    raw = ""
    if key:
        raw = os.environ.get(key, "").strip()
    if not raw:
        raw = os.environ.get("MAQGO_ADMIN_EVENT_EMAILS", "").strip()
    return _normalize_email_list(raw)


def _template_admin_incident(*, title: str, details: str, severity: str) -> tuple[str, str, str]:
    sev = (severity or "medium").strip().lower()
    subject = f"MAQGO — Incidente ({sev}): {title}".strip()
    text = f"Incidente MAQGO\n\nSeveridad: {sev}\nTítulo: {title}\n\nDetalle:\n{details}\n"
    html = f"<pre>{html_escape(text)}</pre>"
    return subject, text, html


def _template_admin_notice(*, title: str, message: str) -> tuple[str, str, str]:
    subject = f"MAQGO — Aviso: {title}".strip()
    text = f"Aviso MAQGO\n\nTítulo: {title}\n\n{message}\n"
    html = f"<pre>{html_escape(text)}</pre>"
    return subject, text, html


def _template_provider_onboarding_notice(*, provider_name: str, provider_id: str, message: str) -> tuple[str, str, str]:
    subject = f"MAQGO — Alta proveedor: {provider_name}".strip()
    text = f"Nuevo proveedor / onboarding\n\nProveedor: {provider_name}\nProvider ID: {provider_id}\n\n{message}\n"
    html = f"<pre>{html_escape(text)}</pre>"
    return subject, text, html


def _template_for_event(event_type: str, payload: dict) -> tuple[str, str, str]:
    t = (event_type or "").strip().lower()
    if t == "admin_incident":
        return _template_admin_incident(
            title=str(payload.get("title") or "").strip() or "Sin título",
            details=str(payload.get("details") or "").strip() or "—",
            severity=str(payload.get("severity") or "medium"),
        )
    if t == "provider_onboarding_notice":
        return _template_provider_onboarding_notice(
            provider_name=str(payload.get("provider_name") or "").strip() or "Proveedor",
            provider_id=str(payload.get("provider_id") or "").strip() or "—",
            message=str(payload.get("message") or "").strip() or "—",
        )
    return _template_admin_notice(
        title=str(payload.get("title") or "").strip() or "Sin título",
        message=str(payload.get("message") or "").strip() or "—",
    )


def _dedupe_key(event_type: str, recipients: list[str], subject: str, text: str) -> str:
    h = hashlib.sha256()
    h.update((event_type or "").strip().lower().encode("utf-8"))
    h.update(b"|")
    h.update(",".join(sorted(recipients)).encode("utf-8"))
    h.update(b"|")
    h.update((subject or "").encode("utf-8"))
    h.update(b"|")
    h.update((text or "").encode("utf-8"))
    return h.hexdigest()


async def send_admin_event_email(
    *,
    db,
    event_type: str,
    payload: dict,
    dry_run: bool = False,
    force: bool = False,
    retry_attempts: int = 3,
) -> dict:
    recipients = _env_recipients_for_event(event_type)
    if not recipients:
        return {"ok": False, "reason": "missing_recipients"}

    tz_name = os.environ.get("MAQGO_ADMIN_REPORT_TIMEZONE", "America/Santiago").strip() or "America/Santiago"
    now_local = datetime.now(ZoneInfo(tz_name))
    subject, text, html = _template_for_event(event_type, payload or {})
    key = _dedupe_key(event_type, recipients, subject, text)

    existing = await db.admin_email_events.find_one({"dedupe_key": key}, {"_id": 0, "sent_at": 1, "status": 1})
    if existing and not force:
        return {"ok": True, "skipped": True, "reason": "already_sent", "dedupe_key": key, "to": recipients}

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "dedupe_key": key,
            "to": recipients,
            "subject": subject,
            "text_preview": text[:2000],
            "timezone": tz_name,
            "now_local": now_local.isoformat(),
        }

    last_error = None
    send_result = None
    attempts = max(1, int(retry_attempts))
    for i in range(attempts):
        try:
            send_result = await _send_email(recipients, subject, text, html)
            last_error = None
            break
        except Exception as e:
            last_error = str(e)
            if i + 1 < attempts:
                await asyncio.sleep(0.6 * (2 ** i))

    status = "sent" if send_result and not last_error else "failed"
    await db.admin_email_events.update_one(
        {"dedupe_key": key},
        {
            "$set": {
                "event_type": (event_type or "").strip().lower(),
                "dedupe_key": key,
                "to": recipients,
                "subject": subject,
                "text_preview": text[:2000],
                "status": status,
                "timezone": tz_name,
                "now_local": now_local.isoformat(),
                "sent_at": datetime.utcnow().isoformat(),
                "provider": (send_result or {}).get("provider"),
                "provider_id": (send_result or {}).get("id"),
                "error": last_error,
                "retry_attempts": attempts,
            }
        },
        upsert=True,
    )
    if status != "sent":
        return {"ok": False, "sent": False, "error": last_error, "dedupe_key": key, "to": recipients}
    return {"ok": True, "sent": True, "dedupe_key": key, "to": recipients, "provider": send_result.get("provider")}
