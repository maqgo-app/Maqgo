import hashlib
from datetime import datetime
from html import escape
from typing import Any, Optional


from services.admin_emailer import _send_email


def _dedupe_key(event_type: str, to_email: str, subject: str, text: str) -> str:
    h = hashlib.sha256()
    h.update((event_type or "").strip().lower().encode("utf-8"))
    h.update(b"|")
    h.update((to_email or "").strip().lower().encode("utf-8"))
    h.update(b"|")
    h.update((subject or "").encode("utf-8"))
    h.update(b"|")
    h.update((text or "").encode("utf-8"))
    return h.hexdigest()


def _build_maqgo_email_html(
    *,
    preheader: str,
    title: str,
    intro: str,
    bullets: list[str],
    cta_label: str,
    cta_url: str,
) -> str:
    items = "".join(f"<li style=\"margin:0 0 8px 0;\">{escape(i)}</li>" for i in bullets)
    return f"""\
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:22px 24px;background:#0b1220;color:#fff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" style="font-size:22px;font-weight:700;letter-spacing:0.3px;">MAQGO</td>
                    <td align="right">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-size:12px;">Aviso automático</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 12px 24px;">
                <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.25;color:#111827;">{escape(title)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155;">{escape(intro)}</p>
                <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.6;color:#334155;">{items}</ul>
                <a href="{escape(cta_url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;">
                  {escape(cta_label)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                  Este correo es transaccional y se envía para continuidad operativa.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _template_service_auto_started(
    *,
    service_request_id: str,
    app_url: str,
) -> tuple[str, str, str]:
    srid = str(service_request_id or "").strip() or "—"
    subject = f"Servicio activado automáticamente ({srid})"
    intro = "Tu servicio se activó automáticamente, según el flujo de operación, tras la confirmación de llegada del operador."
    bullets = [
        f"Servicio: {srid}",
        "Revisa el estado del servicio y los avisos en la app.",
        "Si detectas algo incorrecto, repórtalo desde la app.",
    ]
    cta_url = f"{(app_url or '').rstrip('/')}/client/service-active" if app_url else "/client/service-active"
    html = _build_maqgo_email_html(
        preheader=f"Servicio {srid} activado automáticamente",
        title="Servicio activado automáticamente",
        intro=intro,
        bullets=bullets,
        cta_label="Ver estado del servicio",
        cta_url=cta_url,
    )
    text = "\n".join(
        [
            "Servicio activado automáticamente",
            "",
            f"Servicio: {srid}",
            "",
            "Tu servicio se activó automáticamente, según el flujo de operación, tras la confirmación de llegada del operador.",
            "",
            "Acciones:",
            "- Revisa el estado del servicio y los avisos en la app.",
            "- Si detectas algo incorrecto, repórtalo desde la app.",
            "",
            f"Estado del servicio: {cta_url}",
        ]
    )
    return subject, text, html


def _format_clp_amount(value: Any) -> str:
    try:
        n = int(round(float(value)))
    except Exception:
        return "—"
    return f"${n:,}".replace(",", ".")


def _template_service_finished_summary(
    *,
    service_request_id: str,
    app_url: str,
    payload: dict[str, Any],
) -> tuple[str, str, str]:
    srid = str(service_request_id or "").strip() or "—"
    total = _format_clp_amount(payload.get("total_amount"))
    when = str(payload.get("finished_at") or "").strip() or "—"
    machinery = str(payload.get("machinery") or "").strip() or "—"
    location = str(payload.get("location") or "").strip() or "—"
    hours = str(payload.get("hours") or "").strip() or "—"

    subject = f"Resumen de tu servicio ({srid})"
    intro = "Este es el resumen de tu servicio en MAQGO."
    bullets = [
        f"Servicio: {srid}",
        f"Maquinaria: {machinery}",
        f"Ubicación: {location}",
        f"Duración: {hours}",
        f"Finalizado: {when}",
        f"Total: {total}",
    ]
    cta_url = f"{(app_url or '').rstrip('/')}/client/history" if app_url else "/client/history"
    html = _build_maqgo_email_html(
        preheader=f"Resumen del servicio {srid}",
        title="Resumen de tu servicio",
        intro=intro,
        bullets=bullets,
        cta_label="Ver detalle en la app",
        cta_url=cta_url,
    )
    text = "\n".join(
        [
            "Resumen de tu servicio",
            "",
            f"Servicio: {srid}",
            f"Maquinaria: {machinery}",
            f"Ubicación: {location}",
            f"Duración: {hours}",
            f"Finalizado: {when}",
            f"Total: {total}",
            "",
            f"Ver detalle en la app: {cta_url}",
        ]
    )
    return subject, text, html


async def send_client_event_email(
    *,
    db,
    event_type: str,
    to_email: str,
    payload: dict[str, Any],
    dry_run: bool = False,
    force: bool = False,
) -> dict:
    t = (event_type or "").strip().lower()
    email = (to_email or "").strip().lower()
    if not email:
        return {"ok": False, "reason": "missing_email"}

    app_url = str(payload.get("app_url") or "").strip()
    service_request_id = str(payload.get("service_request_id") or "").strip()

    if t == "service_auto_started":
        subject, text, html = _template_service_auto_started(service_request_id=service_request_id, app_url=app_url)
    elif t == "service_finished_summary":
        subject, text, html = _template_service_finished_summary(
            service_request_id=service_request_id,
            app_url=app_url,
            payload=payload,
        )
    else:
        subject = f"MAQGO — Aviso ({t})"
        text = str(payload.get("text") or "").strip() or "Tienes una actualización en tu servicio."
        html = f"<pre>{escape(text)}</pre>"

    key = _dedupe_key(t, email, subject, text)
    existing = await db.client_email_events.find_one({"dedupe_key": key}, {"_id": 0, "status": 1})
    if existing and not force:
        return {"ok": True, "skipped": True, "reason": "already_sent", "dedupe_key": key, "to": email}

    if dry_run:
        return {"ok": True, "dry_run": True, "dedupe_key": key, "to": email, "subject": subject, "text_preview": text[:2000]}

    last_error: Optional[str] = None
    send_result: Optional[dict] = None
    try:
        send_result = await _send_email([email], subject, text, html)
        last_error = None
    except Exception as e:
        last_error = str(e)

    status = "sent" if send_result and not last_error else "failed"
    await db.client_email_events.update_one(
        {"dedupe_key": key},
        {
            "$set": {
                "event_type": t,
                "dedupe_key": key,
                "to": email,
                "subject": subject,
                "text_preview": text[:2000],
                "status": status,
                "sent_at": datetime.utcnow().isoformat(),
                "provider": (send_result or {}).get("provider"),
                "provider_id": (send_result or {}).get("id"),
                "error": last_error,
                "meta": {"service_request_id": service_request_id} if service_request_id else {},
            }
        },
        upsert=True,
    )
    if status != "sent":
        return {"ok": False, "sent": False, "error": last_error, "dedupe_key": key, "to": email}
    return {"ok": True, "sent": True, "dedupe_key": key, "to": email, "provider": send_result.get("provider")}
