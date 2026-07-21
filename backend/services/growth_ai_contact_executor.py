from __future__ import annotations

import os
import urllib.parse
from typing import Any

from datetime import datetime
import html

from fastapi import HTTPException


def _public_base_url() -> str:
    return (os.environ.get("MAQGO_PUBLIC_URL", "https://www.maqgo.cl").strip() or "https://www.maqgo.cl").rstrip("/")


def _email_logo_url() -> str:
    custom = (os.environ.get("MAQGO_EMAIL_LOGO_URL", "") or "").strip()
    if custom:
        return custom
    return f"{_public_base_url()}/maqgo_logo_clean.svg"


def _email_html(subject: str, message: str) -> str:
    title = (subject or "MAQGO").strip()
    body_text = (message or "").strip()
    body = html.escape(body_text).replace("\n", "<br/>")
    title_html = html.escape(title)
    logo = _email_logo_url()
    low = f"{title} {body_text}".lower()
    if "onboarding" in low or "proveedor" in low:
        cta_url = _public_base_url() + "/provider/register"
        cta_label = "Iniciar onboarding"
    elif "cotiza" in low or "cotizar" in low:
        cta_url = _public_base_url() + "/client/machinery"
        cta_label = "Cotizar ahora"
    else:
        cta_url = _public_base_url()
        cta_label = "Abrir MAQGO"

    def _norm_preheader(v: str) -> str:
        t = " ".join((v or "").replace("\n", " ").split())
        return t[:140]

    preheader = html.escape(_norm_preheader(body_text))
    is_provider = "onboarding" in low or "proveedor" in low
    is_client = ("cotiza" in low or "cotizar" in low) and not is_provider

    def _detect_role_label() -> str:
        if is_client:
            if "municip" in low or "municipalidad" in low or "dirección de obras" in low or "adquisiciones" in low:
                return "Municipalidad / Compras"
            if "gerente" in low or "gerencia" in low or "operaciones" in low:
                return "Gerencia / Operaciones"
            if "jefe de obra" in low:
                return "Jefatura de Obra"
            if "compras" in low:
                return "Compras"
            if "dueño" in low or "propietario" in low:
                return "Dueño / Administración"
            return ""
        if is_provider:
            if "gerente" in low or "gerencia" in low:
                return "Gerencia"
            if "operador" in low:
                return "Operación"
            if "dueño" in low or "propietario" in low:
                return "Dueño / Administración"
            return ""
        return ""

    role_label = _detect_role_label()
    role_pill = (
        f"<span style=\"display:inline-block;margin-top:10px;background:#EEF2F7;color:#0B1220;padding:8px 12px;border-radius:999px;font-weight:900;font-size:12px;\">Para: {html.escape(role_label)}</span>"
        if role_label
        else ""
    )
    if is_provider:
        highlights = [
            {"k": "Urgente o programado", "v": "Tu cliente elige la urgencia que necesita"},
            {"k": "Trazabilidad completa", "v": "Seguimiento del servicio de punta a punta"},
            {"k": "Bonificación mismo día", "v": "Inicio hoy → bonificación adicional hasta +20%"},
        ]
    elif is_client:
        highlights = [
            {"k": "Cotiza en tiempo real", "v": "Para pymes, personas y municipalidades"},
            {"k": "Hoy o por fecha", "v": "Urgente o programado"},
            {"k": "Seguimiento en línea", "v": "Estado de tu servicio en todo momento"},
        ]
    else:
        highlights = [
            {"k": "Hoy o por fecha", "v": "Tú eliges lo que necesites"},
            {"k": "Seguimiento en tiempo real", "v": "Sin perder visibilidad de nada"},
            {"k": "Soporte MAQGO", "v": "Equipo especializado detrás"},
        ]

    def _get_marker(k: str) -> tuple[str, str]:
        key = (k or "").lower()
        if "bonificación" in key or "inicio hoy" in key:
            return ("BONUS", "#EC6819")
        if "trazabilidad" in key or "seguimiento" in key:
            return ("EN LÍNEA", "#0B1220")
        if "solicitud" in key or "inmediata" in key or "urgente" in key or "hoy" in key or "fecha" in key:
            return ("FECHA", "#16A34A")
        if "cotiza" in key or "tiempo real" in key:
            return ("COTIZA", "#2563EB")
        if "soporte" in key:
            return ("SOPORTE", "#64748B")
        return ("MAQGO", "#0B1220")

    def _tile(k: str, v: str) -> str:
        tag, color = _get_marker(k)
        return (
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;\">"
            "<tr><td style=\"padding:14px 14px 12px 14px;\">"
            f"<div style=\"display:inline-block;background:{html.escape(color)};color:#FFFFFF;padding:6px 10px;border-radius:999px;font-weight:900;font-size:11px;letter-spacing:.2px;\">{html.escape(tag)}</div>"
            f"<div style=\"margin-top:10px;font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">{html.escape(k)}</div>"
            f"<div style=\"margin-top:6px;font-size:13px;line-height:18px;color:#0B1220;font-weight:900;\">{html.escape(v)}</div>"
            "</td></tr>"
            "</table>"
        )

    t1 = _tile(highlights[0]["k"], highlights[0]["v"]) if len(highlights) > 0 else ""
    t2 = _tile(highlights[1]["k"], highlights[1]["v"]) if len(highlights) > 1 else ""
    t3 = _tile(highlights[2]["k"], highlights[2]["v"]) if len(highlights) > 2 else ""

    if is_provider:
        steps_title = "Cómo funciona (proveedores)"
        steps = [
            "Haz clic en “Iniciar onboarding” para crear tu perfil.",
            "Registra empresa, unidades disponibles y territorio que cubres.",
            "Empieza a recibir solicitudes verificadas cuando haya match en tu zona.",
        ]
        differentiator = "MAQGO te ayuda a recibir solicitudes en tu zona (mismo día o programadas), con seguimiento en línea y activación rápida del perfil."
    elif is_client:
        steps_title = "Cómo funciona (clientes)"
        steps = [
            "Selecciona la maquinaria que requieras y define si la necesitas hoy o para otra fecha.",
            "Indica ubicación exacta y detalles del proyecto (una sola línea clara).",
            "Coordina directamente con el proveedor y monitorea el estado 24/7.",
        ]
        differentiator = "Cotiza y reserva maquinaria con operador en minutos (mismo día o programado), con seguimiento en línea y coordinación simple."
    else:
        steps_title = "Cómo funciona"
        steps = [
            "Define tu necesidad.",
            "Coordinación del servicio.",
            "Seguimiento en tiempo real.",
        ]
        differentiator = "Solicitud inmediata o programada con seguimiento en tiempo real."

    steps_rows = "".join(
        [
            "<tr>"
            "<td style=\"padding:0 0 10px 0;vertical-align:top;width:36px;\">"
            "<div style=\"width:28px;height:28px;border-radius:999px;background:#0B1220;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;\">"
            f"{i + 1}"
            "</div>"
            "</td>"
            "<td style=\"padding:0 0 10px 0;vertical-align:top;\">"
            f"<div style=\"font-size:13px;line-height:18px;color:#0B1220;font-weight:800;\">{html.escape(s)}</div>"
            "</td>"
            "</tr>"
            for i, s in enumerate(steps)
        ]
    )

    if is_provider:
        tagline = "Más solicitudes · Cobertura por zona · Seguimiento en línea"
    elif is_client:
        tagline = "Cotiza y reserva · Mismo día o programado · Seguimiento en línea"
    else:
        tagline = "Solicitud inmediata o programada · Seguimiento en línea"

    if is_client:
        if role_label == "Municipalidad / Compras":
            use_cases_title = "Ideal para"
            use_cases = [
                "Compras y coordinación con trazabilidad.",
                "Servicios programados o urgentes en terreno.",
                "Seguimiento de estado para equipos internos.",
            ]
        elif role_label == "Gerencia / Operaciones":
            use_cases_title = "Ideal para"
            use_cases = [
                "Reducir llamadas y tiempos de coordinación.",
                "Seguimiento del servicio en línea.",
                "Planificación por fecha o urgencia (hoy).",
            ]
        elif role_label == "Jefatura de Obra":
            use_cases_title = "Ideal para"
            use_cases = [
                "Movilizar maquinaria a obra sin fricción.",
                "Compartir ubicación y trabajo en una sola línea.",
                "Ver estado del servicio sin perder tiempo.",
            ]
        else:
            use_cases_title = "Ideal para"
            use_cases = [
                "Cotizar rápido sin llamadas.",
                "Pedir hoy o programar por fecha.",
                "Seguir el servicio en línea.",
            ]
    elif is_provider:
        if role_label == "Gerencia":
            use_cases_title = "Hecho para"
            use_cases = [
                "Más solicitudes con cobertura por zona y unidades.",
                "Seguimiento del servicio para tu equipo.",
                "Activación rápida del perfil y flota.",
            ]
        else:
            use_cases_title = "Hecho para"
            use_cases = [
                "Dueños y operación en terreno.",
                "Cobertura por zona y disponibilidad.",
                "Seguimiento del servicio para mejor experiencia.",
            ]
    else:
        use_cases_title = ""
        use_cases = []

    use_cases_rows = "".join(
        [
            "<tr>"
            "<td style=\"padding:0 0 10px 0;vertical-align:top;width:18px;color:#EC6819;font-weight:900;\">•</td>"
            f"<td style=\"padding:0 0 10px 0;vertical-align:top;\"><div style=\"font-size:13px;line-height:18px;color:#0B1220;font-weight:800;\">{html.escape(s)}</div></td>"
            "</tr>"
            for s in use_cases
        ]
    )

    use_cases_block = (
        "<div style=\"margin-top:14px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;\">"
        f"<div style=\"font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;\">{html.escape(use_cases_title)}</div>"
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:12px;\">"
        f"{use_cases_rows}"
        "</table>"
        "</div>"
        if use_cases_title and use_cases_rows
        else ""
    )

    sender_email = (os.environ.get("SENDER_EMAIL", "").strip() or "equipo@maqgo.cl").strip()
    sender_name = (os.environ.get("SENDER_NAME", "").strip() or "Equipo MAQGO").strip()
    sender_from = f"{sender_name} <{sender_email}>" if sender_name else sender_email

    trust_block = (
        "<div style=\"margin-top:12px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;\">"
        "<div style=\"font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;\">Importante</div>"
        f"<div style=\"margin-top:10px;font-size:12px;line-height:16px;color:#475569;\">Sitio oficial: <a href=\"{_public_base_url()}\" style=\"color:#0B1220;font-weight:900;text-decoration:none;\">{html.escape(_public_base_url())}</a> · No solicitamos claves ni pagos por correo.</div>"
        f"<div style=\"margin-top:8px;font-size:12px;line-height:16px;color:#475569;\">Remitente: <span style=\"font-weight:900;color:#0B1220;\">{html.escape(sender_from)}</span></div>"
        "<div style=\"margin-top:8px;font-size:12px;line-height:16px;color:#475569;\">Si este correo no corresponde, responde con <span style=\"font-weight:900;color:#0B1220;\">BAJA</span> y lo detenemos.</div>"
        "</div>"
    )
    return f"""<!doctype html>
<html lang=\"es\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  </head>
  <body style=\"margin:0;background:#F6F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;\">
    <div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">{preheader}</div>
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#F6F8FB;padding:26px 0;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"720\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:720px;max-width:720px;\">
            <tr>
              <td style=\"background:#ffffff;border:1px solid #E6EDF5;border-radius:22px;overflow:hidden;\">
                <div style=\"height:10px;background:#EC6819;line-height:10px;font-size:0;\">&nbsp;</div>
                <div style=\"padding:24px 26px 22px 26px;\">
                  <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
                    <tr>
                      <td style=\"vertical-align:middle;\">
                        <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#0B1220;border-radius:999px;\">
                          <tr>
                            <td style=\"padding:12px 16px;\">
                              <img src=\"{logo}\" alt=\"MAQGO\" width=\"92\" style=\"display:block;border:0;outline:none;text-decoration:none;width:92px;height:auto;\" />
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style=\"vertical-align:middle;text-align:right;\">
                        <span style=\"display:inline-block;background:#0B1220;color:#ffffff;padding:9px 12px;border-radius:999px;font-weight:900;font-size:12px;letter-spacing:.2px;\">MAQGO</span>
                      </td>
                    </tr>
                  </table>

                  <div style=\"margin-top:18px;font-weight:900;font-size:26px;line-height:32px;letter-spacing:-0.3px;color:#0B1220;\">{title_html}</div>
                  <div style=\"margin-top:6px;font-size:13px;line-height:18px;color:#64748B;\">{html.escape(tagline)}</div>
                  {role_pill}

                  <div style=\"margin-top:14px;\">
                    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
                      <tr>
                        <td style=\"padding:0 10px 0 0;vertical-align:top;width:33.33%;\">{t1}</td>
                        <td style=\"padding:0 10px 0 0;vertical-align:top;width:33.33%;\">{t2}</td>
                        <td style=\"padding:0;vertical-align:top;width:33.33%;\">{t3}</td>
                      </tr>
                    </table>
                  </div>

                  <div style=\"margin-top:10px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;\">
                    <div style=\"font-size:14px;line-height:1.55;color:#0B1220;\">{body}</div>
                  </div>

                  <div style=\"margin-top:12px;padding:12px 14px;border:1px solid rgba(236,104,25,0.25);border-radius:16px;background:rgba(236,104,25,0.06);\">
                    <div style=\"font-size:12px;line-height:16px;color:#0B1220;font-weight:900;\">La ventaja MAQGO</div>
                    <div style=\"margin-top:6px;font-size:12px;line-height:16px;color:#475569;\">{html.escape(differentiator)}</div>
                  </div>

                  {use_cases_block}

                  {trust_block}

                  <div style=\"margin-top:14px;padding:14px 16px;border:1px solid #E6EDF5;border-radius:16px;background:#FFFFFF;\">
                    <div style=\"font-size:11px;letter-spacing:.28px;color:#64748B;font-weight:800;text-transform:uppercase;\">{html.escape(steps_title)}</div>
                    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:12px;\">
                      {steps_rows}
                    </table>
                  </div>

                  <div style=\"margin-top:14px;\">
                    <a href=\"{cta_url}\" style=\"display:inline-block;background:#EC6819;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:14px;font-weight:900;font-size:14px;\">{cta_label}</a>
                    <span style=\"display:inline-block;margin-left:10px;font-size:12px;line-height:16px;color:#64748B;\">Si prefieres, responde este correo.</span>
                  </div>

                  <div style="margin-top:14px;border-top:1px solid #EEF2F7;padding-top:12px;font-size:12px;color:#64748B;line-height:16px;">
                    MAQGO · Cotiza y coordina maquinaria con seguimiento en línea.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;font-size:11px;color:#94A3B8;padding:12px 12px;">© {datetime.utcnow().strftime('%Y')} MAQGO. Todos los derechos reservados.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _is_email(value: str) -> bool:
    t = (value or "").strip()
    return "@" in t and "." in t and " " not in t


def _is_phone(value: str) -> bool:
    t = (value or "").strip()
    return t.startswith("+569") and len(t) == 12


def _wa_url(phone_e164: str, text: str) -> str:
    phone_digits = "".join(c for c in phone_e164 if c.isdigit())
    q = urllib.parse.quote((text or "").strip())
    return f"https://wa.me/{phone_digits}?text={q}"


async def execute_contact_action(*, channel: str, to: str, subject: str, message: str) -> dict[str, Any]:
    ch = (channel or "").strip().lower()
    dst = (to or "").strip()
    subj = (subject or "").strip()
    msg = (message or "").strip()

    if ch == "email":
        if not _is_email(dst):
            raise HTTPException(status_code=400, detail="Email inválido")
        from services.admin_emailer import _send_email

        res = await _send_email([dst.lower()], subj or "MAQGO", msg, _email_html(subj or "MAQGO", msg))
        return {"status": "sent", "channel": "email", **(res or {})}

    if ch == "sms":
        if not _is_phone(dst):
            raise HTTPException(status_code=400, detail="Teléfono inválido (debe ser +569XXXXXXXX)")
        from services.otp_service import send_sms

        ok, err = send_sms(dst, msg)
        if not ok:
            return {"status": "failed", "channel": "sms", "error": err or "SMS failed"}
        return {"status": "sent", "channel": "sms"}

    if ch == "whatsapp":
        if not _is_phone(dst):
            return {"status": "manual_required", "channel": "whatsapp", "url": "", "reason": "missing_phone"}
        return {"status": "manual_required", "channel": "whatsapp", "url": _wa_url(dst, msg)}

    if ch == "form":
        return {"status": "manual_required", "channel": "form", "url": dst}

    raise HTTPException(status_code=400, detail="Canal no soportado")
