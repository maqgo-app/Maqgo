"""
Sistema de recordatorios por abandono de reserva
Envía recordatorios por WhatsApp y Email cuando un usuario abandona el flujo
"""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import asyncio
import os
import smtplib
import ssl
from email.message import EmailMessage
from html import escape
from motor.motor_asyncio import AsyncIOMotorClient
import logging

from db_config import get_db_name, get_mongo_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/abandonment", tags=["abandonment"])

# Storage temporal para tracking (en producción usar MongoDB)
abandonment_tracking = {}
scheduled_reminders = {}

# Configuración de tiempos
FIRST_REMINDER_MINUTES = 30
SECOND_REMINDER_HOURS = 24
CRITICAL_FIRST_REMINDER_MINUTES = 10  # pasos de alta intención (ej: pago)
EMAIL_COOLDOWN_HOURS = 24
EMAIL_MAX_PER_WEEK = 3

class AbandonmentData(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    user_email: Optional[str] = None
    step: str
    step_number: int
    machinery: Optional[str] = None
    location: Optional[str] = None
    timestamp: int

class CompleteData(BaseModel):
    user_id: str

# Mapeo de maquinaria a nombres legibles
MACHINERY_NAMES = {
    'retroexcavadora': 'Retroexcavadora',
    'camion_tolva': 'Camión Tolva',
    'excavadora': 'Excavadora',
    'bulldozer': 'Bulldozer',
    'motoniveladora': 'Motoniveladora',
    'grua': 'Grúa Móvil',
    'camion_pluma': 'Camión Pluma',
    'compactadora': 'Compactadora',
    'camion_aljibe': 'Camión Aljibe',
    'minicargador': 'Minicargador'
}

def get_machinery_name(machinery_id: str) -> str:
    return MACHINERY_NAMES.get(machinery_id, machinery_id or 'maquinaria')


# URL de la app para enlaces en recordatorios (env o localhost)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5174").rstrip("/")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

try:
    import resend
except Exception:
    resend = None


async def send_whatsapp_reminder(phone: str, name: str, machinery: str, is_first: bool = True):
    """Envía recordatorio por WhatsApp usando Twilio (si está configurado). Si no, solo log."""
    machinery_name = get_machinery_name(machinery)
    link = f"{FRONTEND_URL}/client/home"
    if is_first:
        message = f"""¡Hola {name}! 👋

Tu reserva de *{machinery_name}* en MAQGO quedó pendiente.

🔧 Complétala ahora y asegura disponibilidad inmediata.

👉 {link}

_Equipo MAQGO_"""
    else:
        message = f"""Hola {name},

¿Aún necesitas una *{machinery_name}*? 🚜

Tu reserva sigue disponible. Complétala en menos de 2 minutos:

👉 {link}

_Si ya no la necesitas, ignora este mensaje._

_Equipo MAQGO_"""

    formatted_phone = phone if phone.startswith("+") else f"+56{phone}"

    try:
        account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
        from_number = os.environ.get("TWILIO_WHATSAPP_FROM")  # ej: whatsapp:+14155238886
        if account_sid and auth_token and from_number:
            from twilio.rest import Client
            client = Client(account_sid, auth_token)
            client.messages.create(
                from_=from_number,
                body=message,
                to=f"whatsapp:{formatted_phone}" if not formatted_phone.startswith("whatsapp:") else formatted_phone,
            )
            logger.info("WhatsApp reminder sent phone_tail=%s", formatted_phone[-4:] if len(formatted_phone) >= 4 else "?")
        else:
            logger.info("WhatsApp reminder skipped (no Twilio config) phone_tail=%s", formatted_phone[-4:] if len(formatted_phone) >= 4 else "?")
        return True
    except Exception as e:
        logger.exception("Error sending WhatsApp abandonment reminder")
        return False


def _is_critical_step(step: str) -> bool:
    return step in {"confirm", "payment", "providers", "location"}


def _resume_link(data: AbandonmentData) -> str:
    # Punto de retorno único; el frontend ya decide reanudar desde localStorage.
    return f"{FRONTEND_URL}/client/home"


async def _can_send_rescue_email(user_id: str, event_name: str) -> bool:
    """Aplica anti-saturación: cooldown 24h y tope semanal."""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    cooldown_since = now - timedelta(hours=EMAIL_COOLDOWN_HOURS)

    recent_same_event = await db.funnel_rescue_events.find_one({
        "userId": user_id,
        "event": event_name,
        "channel": "email",
        "sentAt": {"$gte": cooldown_since.isoformat()},
    })
    if recent_same_event:
        return False

    weekly_count = await db.funnel_rescue_events.count_documents({
        "userId": user_id,
        "channel": "email",
        "sentAt": {"$gte": week_ago.isoformat()},
    })
    return weekly_count < EMAIL_MAX_PER_WEEK


async def _log_rescue_event(user_id: str, email: str, event_name: str, step: str, sent: bool) -> None:
    await db.funnel_rescue_events.insert_one({
        "userId": user_id,
        "email": email,
        "channel": "email",
        "event": event_name,
        "step": step,
        "sent": sent,
        "sentAt": datetime.utcnow().isoformat(),
    })


async def send_email_reminder(data: AbandonmentData, is_first: bool = True):
    """Envía recordatorio por Email con límites anti-saturación."""
    try:
        if not data.user_email:
            return False
        event_name = f"abandonment_{data.step}_{'first' if is_first else 'second'}"
        can_send = await _can_send_rescue_email(data.user_id, event_name)
        if not can_send:
            logger.info("Rescue email throttled user=%s event=%s", data.user_id, event_name)
            return False

        machinery_name = get_machinery_name(data.machinery or "")
        resume_url = _resume_link(data)
        step_label = data.step.replace("_", " ").strip()
        urgent_hint = (
            "Tu solicitud era urgente y puede perder prioridad si no la retomas ahora.\n\n"
            if data.step == "payment" else
            ""
        )
        if is_first:
            subject = f"Retoma tu reserva de {machinery_name} en MAQGO"
            text = (
                f"Hola {data.user_name or 'Cliente'},\n\n"
                f"Vimos que tu reserva de {machinery_name} quedó pendiente en el paso '{step_label}'.\n\n"
                f"{urgent_hint}"
                f"Puedes continuar exactamente donde la dejaste:\n{resume_url}\n\n"
                "Si ya no necesitas el servicio, ignora este correo.\n\n"
                "Equipo MAQGO"
            )
        else:
            subject = f"Ultimo recordatorio: tu reserva de {machinery_name} sigue pendiente"
            text = (
                f"Hola {data.user_name or 'Cliente'},\n\n"
                f"Tu reserva de {machinery_name} sigue pendiente en MAQGO.\n"
                "Este es el ultimo recordatorio para no saturarte.\n\n"
                f"Continuar reserva: {resume_url}\n\n"
                "Equipo MAQGO"
            )
        html = _build_maqgo_email_html(
            preheader="Tu reserva sigue pendiente en MAQGO",
            title=subject,
            intro=(
                f"Detectamos que tu reserva de {machinery_name} quedo pendiente en el paso '{step_label}'."
                if is_first else
                f"Tu reserva de {machinery_name} sigue pendiente y este es el ultimo recordatorio."
            ),
            bullets=[
                "Retoma exactamente donde la dejaste desde el boton de abajo.",
                "Si ya resolviste por otro medio, puedes ignorar este correo.",
                "Este mensaje es transaccional y no corresponde a marketing masivo.",
            ],
            cta_label="Continuar reserva",
            cta_url=resume_url,
        )

        smtp_host = os.environ.get("EMAIL_SMTP_HOST", "").strip()
        smtp_user = os.environ.get("EMAIL_SMTP_USER", "").strip()
        smtp_pass = os.environ.get("EMAIL_SMTP_PASS", "").strip()
        smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
        use_ssl = os.environ.get("EMAIL_SMTP_SSL", "false").lower() == "true"

        if smtp_host and smtp_user and smtp_pass:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = SENDER_EMAIL
            msg["To"] = data.user_email
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            if use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=15) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                    server.starttls(context=ssl.create_default_context())
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
        else:
            resend_key = os.environ.get("RESEND_API_KEY", "").strip()
            if not resend or not resend_key:
                logger.warning("Rescue email skipped: no SMTP/Resend configured")
                return False
            resend.api_key = resend_key
            await asyncio.to_thread(
                resend.Emails.send,
                {
                    "from": SENDER_EMAIL,
                    "to": data.user_email,
                    "subject": subject,
                    "text": text,
                    "html": html,
                }
            )

        await _log_rescue_event(data.user_id, data.user_email, event_name, data.step, True)
        logger.info("Rescue email sent user=%s event=%s", data.user_id, event_name)
        return True
    except Exception as e:
        logger.exception("Error sending rescue email abandonment")
        if data.user_email:
            try:
                await _log_rescue_event(
                    data.user_id,
                    data.user_email,
                    f"abandonment_{data.step}_{'first' if is_first else 'second'}",
                    data.step,
                    False,
                )
            except Exception:
                pass
        return False


def _build_maqgo_email_html(
    *,
    preheader: str,
    title: str,
    intro: str,
    bullets: list[str],
    cta_label: str,
    cta_url: str,
) -> str:
    items = "".join(
        f"<li style=\"margin:0 0 8px 0;\">{escape(i)}</li>"
        for i in bullets
    )
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
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-size:12px;">Soporte MAQGO</span>
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
                  Este correo es transaccional y se envia para continuidad operativa.
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


async def schedule_reminders(user_id: str, data: AbandonmentData):
    """Programa los recordatorios a 30 min y 24 horas"""
    
    # Cancelar recordatorios anteriores si existen
    if user_id in scheduled_reminders:
        for task in scheduled_reminders[user_id]:
            task.cancel()
    
    scheduled_reminders[user_id] = []
    
    # Primer recordatorio a los 30 minutos
    async def first_reminder():
        first_wait = CRITICAL_FIRST_REMINDER_MINUTES if _is_critical_step(data.step) else FIRST_REMINDER_MINUTES
        await asyncio.sleep(first_wait * 60)
        
        # Verificar si el usuario aún está en abandono
        if user_id in abandonment_tracking:
            tracking = abandonment_tracking[user_id]
            if tracking.get('completed'):
                return
            
            logger.info("Sending first abandonment reminder user_id=%s", user_id)
            
            if data.user_phone:
                await send_whatsapp_reminder(data.user_phone, data.user_name or 'Cliente', data.machinery, is_first=True)
            
            if data.user_email:
                await send_email_reminder(data, is_first=True)
            
            tracking['first_reminder_sent'] = True
    
    # Segundo recordatorio a las 24 horas
    async def second_reminder():
        await asyncio.sleep(SECOND_REMINDER_HOURS * 60 * 60)
        
        # Verificar si el usuario aún está en abandono
        if user_id in abandonment_tracking:
            tracking = abandonment_tracking[user_id]
            if tracking.get('completed'):
                return
            
            logger.info("Sending second abandonment reminder user_id=%s", user_id)
            
            if data.user_phone:
                await send_whatsapp_reminder(data.user_phone, data.user_name or 'Cliente', data.machinery, is_first=False)
            
            if data.user_email:
                await send_email_reminder(data, is_first=False)
            
            tracking['second_reminder_sent'] = True
            
            # Limpiar tracking después del segundo recordatorio
            del abandonment_tracking[user_id]
    
    # Crear tareas
    task1 = asyncio.create_task(first_reminder())
    task2 = asyncio.create_task(second_reminder())
    
    scheduled_reminders[user_id] = [task1, task2]


@router.post("/track")
async def track_abandonment(data: AbandonmentData, background_tasks: BackgroundTasks):
    """Registra el progreso del usuario y programa recordatorios si abandona"""
    
    user_id = data.user_id
    
    # Actualizar tracking
    abandonment_tracking[user_id] = {
        'data': data.dict(),
        'tracked_at': datetime.now().isoformat(),
        'completed': False,
        'first_reminder_sent': False,
        'second_reminder_sent': False
    }
    
    # Solo programar recordatorios si el usuario tiene teléfono o email
    if data.user_phone or data.user_email:
        # Programar recordatorios en background
        background_tasks.add_task(schedule_reminders, user_id, data)
    
    return {
        "status": "tracking",
        "user_id": user_id,
        "step": data.step,
        "reminders_scheduled": bool(data.user_phone or data.user_email)
    }


@router.post("/complete")
async def complete_booking(data: CompleteData):
    """Marca la reserva como completada y cancela recordatorios pendientes"""
    
    user_id = data.user_id
    
    # Marcar como completado
    if user_id in abandonment_tracking:
        abandonment_tracking[user_id]['completed'] = True
    
    # Cancelar recordatorios pendientes
    if user_id in scheduled_reminders:
        for task in scheduled_reminders[user_id]:
            task.cancel()
        del scheduled_reminders[user_id]
    
    return {
        "status": "completed",
        "user_id": user_id,
        "reminders_cancelled": True
    }


@router.get("/status/{user_id}")
async def get_abandonment_status(user_id: str):
    """Obtiene el estado de tracking de un usuario"""
    
    if user_id in abandonment_tracking:
        return {
            "status": "tracking",
            "data": abandonment_tracking[user_id]
        }
    
    return {
        "status": "not_found",
        "user_id": user_id
    }
