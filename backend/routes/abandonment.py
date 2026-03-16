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

router = APIRouter(prefix="/abandonment", tags=["abandonment"])

# Storage temporal para tracking (en producción usar MongoDB)
abandonment_tracking = {}
scheduled_reminders = {}

# Configuración de tiempos
FIRST_REMINDER_MINUTES = 30
SECOND_REMINDER_HOURS = 24

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
            print(f"✅ WhatsApp reminder sent to {formatted_phone}")
        else:
            print(f"📱 WhatsApp reminder (no Twilio config): would send to {formatted_phone}")
        return True
    except Exception as e:
        print(f"❌ Error sending WhatsApp: {e}")
        return False


async def send_email_reminder(email: str, name: str, machinery: str, is_first: bool = True):
    """Envía recordatorio por Email"""
    try:
        # Por ahora solo log - en producción usar SendGrid/Resend
        machinery_name = get_machinery_name(machinery)
        
        subject = f"Tu reserva de {machinery_name} está pendiente - MAQGO" if is_first else f"¿Aún necesitas una {machinery_name}? - MAQGO"
        
        print(f"📧 Email reminder would be sent to {email}")
        print(f"   Subject: {subject}")
        print(f"   Name: {name}, Machinery: {machinery_name}")
        
        # TODO: Integrar con servicio de email real
        # await send_email(to=email, subject=subject, body=body)
        
        return True
        
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return False


async def schedule_reminders(user_id: str, data: AbandonmentData):
    """Programa los recordatorios a 30 min y 24 horas"""
    
    # Cancelar recordatorios anteriores si existen
    if user_id in scheduled_reminders:
        for task in scheduled_reminders[user_id]:
            task.cancel()
    
    scheduled_reminders[user_id] = []
    
    # Primer recordatorio a los 30 minutos
    async def first_reminder():
        await asyncio.sleep(FIRST_REMINDER_MINUTES * 60)
        
        # Verificar si el usuario aún está en abandono
        if user_id in abandonment_tracking:
            tracking = abandonment_tracking[user_id]
            if tracking.get('completed'):
                return
            
            print(f"⏰ Sending first reminder to {data.user_name}")
            
            if data.user_phone:
                await send_whatsapp_reminder(data.user_phone, data.user_name or 'Cliente', data.machinery, is_first=True)
            
            if data.user_email:
                await send_email_reminder(data.user_email, data.user_name or 'Cliente', data.machinery, is_first=True)
            
            tracking['first_reminder_sent'] = True
    
    # Segundo recordatorio a las 24 horas
    async def second_reminder():
        await asyncio.sleep(SECOND_REMINDER_HOURS * 60 * 60)
        
        # Verificar si el usuario aún está en abandono
        if user_id in abandonment_tracking:
            tracking = abandonment_tracking[user_id]
            if tracking.get('completed'):
                return
            
            print(f"⏰ Sending second reminder to {data.user_name}")
            
            if data.user_phone:
                await send_whatsapp_reminder(data.user_phone, data.user_name or 'Cliente', data.machinery, is_first=False)
            
            if data.user_email:
                await send_email_reminder(data.user_email, data.user_name or 'Cliente', data.machinery, is_first=False)
            
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
