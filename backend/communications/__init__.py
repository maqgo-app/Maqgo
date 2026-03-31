"""
MAQGO – Communications Module

Twilio SMS & WhatsApp Integration
Following MAQGO Communications Spec (LOCKED)

Channels Priority:
1) WhatsApp → Primary (providers + clients)
2) SMS → Verification + fallback only
3) Email → Confirmations only (not implemented in MVP)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Literal
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

logger = logging.getLogger(__name__)

# Environment variables (NEVER hardcode)
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_SMS_FROM = os.environ.get('TWILIO_SMS_FROM')
TWILIO_WHATSAPP_FROM = os.environ.get('TWILIO_WHATSAPP_FROM')

# Demo mode flag (disabled by default to avoid OTP demo leaks)
DEMO_MODE = os.environ.get('MAQGO_DEMO_MODE', 'false').lower() == 'true'
IS_PRODUCTION = os.environ.get('MAQGO_ENV', 'development').lower() == 'production'
DEMO_OTP_CODE = '123456'

def _is_demo_allowed() -> bool:
    """
    Demo OTP solo permitido fuera de produccion.
    En produccion, cualquier desconfiguracion debe fallar de forma explicita.
    """
    return DEMO_MODE and not IS_PRODUCTION

# Message templates (professional, calm, never aggressive)
# REGLA: ≤3 líneas para SMS, lenguaje neutral chileno, sin tecnicismos
# Repetir "No se realizó ningún cobro" cuando aplique

SMS_TEMPLATES = {
    'otp': 'MAQGO: Tu código de verificación es {otp}. Válido por 5 minutos.',
    
    # === CLIENTE - SMS ===
    'client_request_sent': """MAQGO: Recibimos tu solicitud de maquinaria.
Está pendiente de aceptación del proveedor.
No se ha realizado ningún cobro.
Te avisaremos apenas se confirme.""",

    'client_provider_accepted': """MAQGO: ¡Servicio confirmado!
El proveedor aceptó tu solicitud y se ejecutó el cobro automáticamente.
Revisa los detalles en la app.""",

    'client_provider_rejected': """MAQGO: El proveedor rechazó la solicitud.
No se realizó ningún cobro.
Puedes seleccionar otro proveedor disponible.""",

    'client_request_expired': """MAQGO: La solicitud expiró por falta de confirmación del proveedor.
No se realizó ningún cobro.
Intenta nuevamente desde la app.""",

    'client_cancellation_no_charge': """MAQGO: Servicio cancelado correctamente.
No se realizó ningún cobro.""",

    'client_cancellation_with_charge': """MAQGO: Servicio cancelado fuera de plazo.
Se aplicó el cobro correspondiente según las condiciones.""",

    'client_provider_arrived': """MAQGO: El operador llegó a la ubicación.
Ya puedes autorizar el inicio del servicio en la app.""",

    # === PROVEEDOR - SMS ===
    'provider_new_request': """MAQGO: Nueva solicitud disponible.
Tienes {minutes} minutos para aceptar.
Al aceptar, se ejecuta el cobro automático al cliente.""",

    'provider_request_accepted': """MAQGO: Aceptaste el servicio.
El cliente fue notificado y el cobro se ejecutó correctamente.""",

    'provider_request_expired': """MAQGO: La solicitud expiró por falta de respuesta.""",
}

WHATSAPP_TEMPLATES = {
    # === CLIENTE - WhatsApp ===
    'client_request_sent': """MAQGO: Recibimos tu solicitud de maquinaria.
Está pendiente de aceptación del proveedor.
No se ha realizado ningún cobro.
Te avisaremos apenas se confirme.""",

    'client_provider_accepted': """MAQGO: ¡Servicio confirmado!
El proveedor aceptó tu solicitud y se ejecutó el cobro automáticamente.
Revisa los detalles en la app.""",

    'client_provider_arrived': """MAQGO: El operador llegó a la ubicación.
Ya puedes autorizar el inicio del servicio en la app.""",

    'client_provider_arriving': """MAQGO: El proveedor está llegando al lugar de acceso.
Prepárate para recibir al operador.""",

    'client_service_reminder': """MAQGO: Recordatorio de tu servicio hoy.
Maquinaria: {machine}
Inicio estimado: {start_time}
Proveedor: {provider_name}""",

    # === PROVEEDOR - WhatsApp ===
    'new_request_provider': """MAQGO: Nueva solicitud disponible.

Maquinaria: {machine}
Ubicación: {area}
Duración: {hours} h
Ingreso estimado: {amount}

Tienes {minutes} minutos para aceptar.
Al aceptar, se ejecuta el cobro automático al cliente.""",

    'provider_request_accepted': """MAQGO: Aceptaste el servicio.
El cliente fue notificado y el cobro se ejecutó correctamente.""",

    # === OPERADOR - WhatsApp ===
    'operator_assigned': """MAQGO: Fuiste asignado a un servicio.
Maquinaria: {machine}
Dirección: {address}
Inicio estimado: {start_time}""",

    # === TEMPLATES EXISTENTES (actualizados) ===
    'service_completed_invoice': """MAQGO: ¡Servicio completado!

Tu servicio fue entregado exitosamente.

📄 Factura a MAQGO (no al cliente):
• Razón Social: MAQGO SpA
• RUT: 76.248.124-3
• Monto a facturar: {invoice_amount} (neto, menos tarifa plataforma)

Emite la factura dirigida a MAQGO y súbela en "Mis Cobros" para recibir tu pago.

Puedes subir tu factura 24 h después del servicio. Pago en 2 días hábiles tras subirla.""",
    
    'confirmation_client': """MAQGO: ¡Servicio confirmado!
El proveedor aceptó tu solicitud y se ejecutó el cobro automáticamente.
Tu maquinaria ya fue asignada.
Te avisaremos cuando el operador vaya en camino.""",
    
    'provider_en_route': """MAQGO: Operador en camino.

Tu maquinaria está en camino a tu ubicación.
Llegada estimada: {eta} minutos.
Patente: {license_plate}""",
    
    'service_started': """MAQGO: Servicio iniciado.

El servicio ha comenzado.
Duración contratada: {hours} horas.""",
    
    'service_finished': """MAQGO: Servicio finalizado.

Gracias por usar MAQGO.
Total: {amount}

Por favor, califica tu experiencia.""",

    # Templates para Dueño/Secretaria (notificaciones reducidas)
    'owner_new_assignment': """MAQGO: Nueva asignación.

Tu {machine} ({license_plate}) fue asignada.
Operador: {operator_name}
Destino: {location}
Pago estimado: {amount}

El operador ya está en camino.""",
    
    'owner_service_finished': """MAQGO: Servicio completado.

Tu {machine} ({license_plate}) finalizó el servicio.
Operador: {operator_name}
Ganancia neta: {net_amount}

Pago en 2 días hábiles tras subir la factura.""",
    
    'owner_critical_alert': """MAQGO: Alerta importante.

Problema reportado con tu {machine} ({license_plate}).
Motivo: {reason}
Operador: {operator_name}

Contacta al soporte si necesitas ayuda.""",

    'owner_weekly_summary': """MAQGO: Resumen semanal.

Hola {owner_name}, aquí va tu resumen:

Ganado esta semana: {weekly_earned}
Total del mes: {monthly_earned}
Servicios completados: {services_count}

Pendientes:
• Para facturar: {to_invoice}
• Por cobrar: {to_collect}""",

    'service_approved_invoice': """MAQGO: Servicio Aprobado.

¡Tu servicio fue aprobado! Ya puedes facturar a MAQGO.

Datos para facturar (a MAQGO, no al cliente):
• Razón Social: MAQGO SpA
• RUT: 76.248.124-3
• Monto: {invoice_amount} (neto, menos tarifa plataforma)

Sube tu factura en la app para recibir el pago.""",

    'invoice_uploaded': """MAQGO: Factura Recibida.

Hemos recibido tu factura N° {invoice_number}.

Tu pago de {net_amount} estará en tu cuenta en 2 días hábiles.
Te notificaremos cuando el depósito esté listo.""",

    'payment_sent': """MAQGO: Pago Realizado.

¡Listo! Hemos transferido {net_amount} a tu cuenta.

Factura: {invoice_number}
Revisa tu cuenta bancaria.

¡Gracias por confiar en MAQGO!""",
}


def get_twilio_client() -> Optional[Client]:
    """Get Twilio client if credentials are available."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured")
        return None
    return Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


def log_message(
    channel: str,
    to: str,
    template: str,
    status: str,
    error: Optional[str] = None
) -> dict:
    """Log every message (status, timestamp) as required."""
    log_entry = {
        'channel': channel,
        'to': to,
        'template': template,
        'status': status,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'error': error
    }
    logger.info(f"Message log: {log_entry}")
    return log_entry


# ==================== SMS FUNCTIONS (OTP) ====================
# OTP interno (Redis + LabsMobile). Sin Verify externo.

def send_sms_otp(phone_number: str, channel: str = 'sms') -> dict:
    """
    Send 6-digit OTP via SMS.
    - Proveedor: LabsMobile
    - OTP valid for 5 minutes, max 3 attempts, rate limit 3/10min
    - Secure: Falla claramente si hay problemas, sin ocultar errores
    """
    print("OTP_SERVICE_START", phone_number, channel)
    
    if channel not in ['sms', 'whatsapp']:
        channel = 'sms'

    # OTP interno vía services.otp_service (Redis + LabsMobile)
    try:
        print("OTP_SERVICE_IMPORT_START")
        from services.otp_service import send_otp, is_otp_configured
        print("OTP_SERVICE_IMPORT_OK")
        
        print("OTP_CONFIG_CHECK_START")
        configured = is_otp_configured()
        print("OTP_CONFIG_CHECK_RESULT", configured)
        
        if not configured:
            print("OTP_NOT_CONFIGURED")
            return {
                'success': False,
                'error': 'OTP service not configured. Check REDIS_URL, LABSMOBILE credentials.',
                'log': log_message('sms', phone_number, 'otp', 'error', 'OTP not configured')
            }
        
        print("OTP_SEND_START", phone_number)
        result = send_otp(phone_number, channel)
        print("OTP_SEND_RESULT", result)
        
        if result.get('success'):
            print("OTP_SEND_OK")
            return {
                'success': True,
                'channel': result.get('channel', 'sms'),
                'demo_mode': False,
                'log': log_message('sms', phone_number, 'otp', 'sent')
            }
        
        print("OTP_SEND_FAILED", result.get('error'))
        return {
            'success': False,
            'error': result.get('error', 'OTP send failed'),
            'log': log_message('sms', phone_number, 'otp', 'error', result.get('error'))
        }
        
    except ImportError as e:
        print("OTP_IMPORT_ERROR", str(e))
        return {
            'success': False,
            'error': 'OTP service not available',
            'log': log_message('sms', phone_number, 'otp', 'error', f"Import error: {str(e)}")
        }
    except Exception as e:
        print("OTP_SERVICE_ERROR", str(e))
        return {
            'success': False,
            'error': 'OTP service error',
            'log': log_message('sms', phone_number, 'otp', 'error', f"Service error: {str(e)}")
        }


def verify_sms_otp(phone_number: str, code: str) -> dict:
    """
    Verify OTP code.
    - Fuente única: OTP interno (Redis + LabsMobile)
    """
    try:
        from services.otp_service import verify_otp, is_otp_configured
        if not is_otp_configured():
            return {
                'success': False,
                'valid': False,
                'error': 'OTP no configurado. Define REDIS_URL, LABSMOBILE_USERNAME, LABSMOBILE_API_TOKEN y LABSMOBILE_SENDER.',
                'demo_mode': False,
                'log': log_message('sms', phone_number, 'otp_verify', 'error', 'OTP provider not configured')
            }
        result = verify_otp(phone_number, code)
        return {
            'success': result.get('success', True),
            'valid': result.get('valid', False),
            'error': result.get('error'),
            'demo_mode': False,
            'log': log_message('sms', phone_number, 'otp_verify', 'valid' if result.get('valid') else 'invalid')
        }
    except ImportError:
        return {
            'success': False,
            'valid': False,
            'error': 'OTP service no disponible.',
            'demo_mode': False,
            'log': log_message('sms', phone_number, 'otp_verify', 'error', 'OTP service import error')
        }
    except Exception as e:
        logger.error("OTP verify error: %s", e)
        return {
            'success': False,
            'valid': False,
            'error': 'No se pudo verificar OTP.',
            'demo_mode': False,
            'log': log_message('sms', phone_number, 'otp_verify', 'error', str(e))
        }


# ==================== SMS FUNCTIONS (NON-OTP) ====================

def send_sms(
    phone_number: str,
    template: str,
    params: dict = None
) -> dict:
    """
    Send SMS using templates.
    REGLA: Mensajes ≤3 líneas para SMS
    """
    if template not in SMS_TEMPLATES:
        return {
            'success': False,
            'error': f'Unknown SMS template: {template}',
            'log': log_message('sms', phone_number, template, 'error', 'Unknown template')
        }
    
    params = params or {}
    message_body = SMS_TEMPLATES[template].format(**params) if params else SMS_TEMPLATES[template]
    
    if DEMO_MODE:
        logger.info(f"[DEMO] SMS to {phone_number}: {message_body[:100]}...")
        return {
            'success': True,
            'demo_mode': True,
            'message_preview': message_body[:100],
            'log': log_message('sms', phone_number, template, 'demo')
        }
    
    client = get_twilio_client()
    if not client or not TWILIO_SMS_FROM:
        return {
            'success': False,
            'error': 'Twilio SMS not configured',
            'log': log_message('sms', phone_number, template, 'error', 'Not configured')
        }
    
    try:
        message = client.messages.create(
            body=message_body,
            from_=TWILIO_SMS_FROM,
            to=phone_number
        )
        
        return {
            'success': True,
            'status': message.status,
            'sid': message.sid,
            'log': log_message('sms', phone_number, template, message.status)
        }
        
    except TwilioRestException as e:
        logger.error(f"Twilio SMS error: {e}")
        return {
            'success': False,
            'error': str(e),
            'log': log_message('sms', phone_number, template, 'error', str(e))
        }


# ==================== WHATSAPP FUNCTIONS ====================

def send_whatsapp(
    phone_number: str,
    template: str,
    params: dict
) -> dict:
    """
    Send WhatsApp message using templates.
    All Twilio calls must be server-side.
    """
    if template not in WHATSAPP_TEMPLATES:
        return {
            'success': False,
            'error': f'Unknown template: {template}',
            'log': log_message('whatsapp', phone_number, template, 'error', 'Unknown template')
        }

    # Regla MAQGO: el chat es el canal obligatorio entre cliente y proveedor.
    # Para evitar "contacto" fuera de la app, deshabilitamos WhatsApp en eventos
    # de coordinación cliente <-> proveedor (aunque el endpoint frontend lo llame).
    CONTACT_WHATSAPP_TEMPLATES = {
        # Cliente - coordinación
        'client_request_sent',
        'client_provider_accepted',
        'client_provider_arrived',
        'client_provider_arriving',
        'client_service_reminder',
        'confirmation_client',
        'provider_en_route',
        'provider_request_accepted',
        # Proveedor - coordinación
        'new_request_provider',
        # Ciclo de servicio
        'service_started',
        'service_finished',
        # Operador (asignación a través de eventos externos)
        'operator_assigned',
    }
    if template in CONTACT_WHATSAPP_TEMPLATES:
        logger.info(f"[WHATSAPP DISABLED][chat-only] template={template} to={phone_number}")
        return {
            'success': True,
            'demo_mode': DEMO_MODE,
            'disabled': True,
            'log': log_message('whatsapp', phone_number, template, 'disabled_chat_only')
        }
    
    message_body = WHATSAPP_TEMPLATES[template].format(**params)
    
    if DEMO_MODE:
        logger.info(f"[DEMO] WhatsApp to {phone_number}: {message_body[:100]}...")
        return {
            'success': True,
            'demo_mode': True,
            'message_preview': message_body[:100],
            'log': log_message('whatsapp', phone_number, template, 'demo')
        }
    
    client = get_twilio_client()
    if not client or not TWILIO_WHATSAPP_FROM:
        return {
            'success': False,
            'error': 'Twilio WhatsApp not configured',
            'log': log_message('whatsapp', phone_number, template, 'error', 'Not configured')
        }
    
    try:
        # Format WhatsApp number
        whatsapp_to = f"whatsapp:{phone_number}" if not phone_number.startswith('whatsapp:') else phone_number
        
        message = client.messages.create(
            body=message_body,
            from_=TWILIO_WHATSAPP_FROM,
            to=whatsapp_to
        )
        
        return {
            'success': True,
            'status': message.status,
            'sid': message.sid,
            'log': log_message('whatsapp', phone_number, template, message.status)
        }
        
    except TwilioRestException as e:
        logger.error(f"Twilio WhatsApp error: {e}")
        return {
            'success': False,
            'error': str(e),
            'log': log_message('whatsapp', phone_number, template, 'error', str(e))
        }


# ==================== EVENT-DRIVEN NOTIFICATIONS ====================

def notify_provider_new_request(
    provider_phone: str,
    machine: str,
    area: str,
    hours: int,
    amount: str,
    response_minutes: int = 10
) -> dict:
    """
    B) Solicitud inmediata (WhatsApp – PROVEEDOR)
    EVENT: Immediate reservation created
    """
    return send_whatsapp(
        phone_number=provider_phone,
        template='new_request_provider',
        params={
            'machine': machine,
            'area': area,
            'hours': hours,
            'amount': amount,
            'minutes': response_minutes
        }
    )


def notify_client_provider_confirmed(client_phone: str) -> dict:
    """
    D) Confirmación al cliente (WhatsApp)
    EVENT: Provider accepts
    """
    return send_whatsapp(
        phone_number=client_phone,
        template='confirmation_client',
        params={}
    )


def notify_client_provider_en_route(
    client_phone: str,
    eta: int,
    license_plate: str
) -> dict:
    """
    E) Llegada - Operador en camino
    """
    return send_whatsapp(
        phone_number=client_phone,
        template='provider_en_route',
        params={
            'eta': eta,
            'license_plate': license_plate
        }
    )


def notify_service_started(client_phone: str, hours: int) -> dict:
    """
    E) Inicio de servicio
    """
    return send_whatsapp(
        phone_number=client_phone,
        template='service_started',
        params={'hours': hours}
    )


def notify_service_finished(client_phone: str, amount: str) -> dict:
    """
    E) Fin de servicio
    """
    return send_whatsapp(
        phone_number=client_phone,
        template='service_finished',
        params={'amount': amount}
    )


# ==================== OWNER/SECRETARY NOTIFICATIONS ====================

def notify_owner_new_assignment(
    owner_phone: str,
    machine: str,
    license_plate: str,
    operator_name: str,
    location: str,
    amount: str
) -> dict:
    """
    Notificar al dueño/secretaria cuando se asigna un operador a un trabajo.
    Solo envía esta notificación (no satura con todas las del operador).
    """
    return send_whatsapp(
        phone_number=owner_phone,
        template='owner_new_assignment',
        params={
            'machine': machine,
            'license_plate': license_plate,
            'operator_name': operator_name,
            'location': location,
            'amount': amount
        }
    )


def notify_owner_service_finished(
    owner_phone: str,
    machine: str,
    license_plate: str,
    operator_name: str,
    net_amount: str
) -> dict:
    """
    Notificar al dueño/secretaria cuando el servicio finaliza.
    Incluye la ganancia neta (después de comisión MAQGO).
    """
    return send_whatsapp(
        phone_number=owner_phone,
        template='owner_service_finished',
        params={
            'machine': machine,
            'license_plate': license_plate,
            'operator_name': operator_name,
            'net_amount': net_amount
        }
    )


def notify_owner_critical_alert(
    owner_phone: str,
    machine: str,
    license_plate: str,
    operator_name: str,
    reason: str
) -> dict:
    """
    Notificar al dueño/secretaria de problemas críticos.
    Ej: No-show, cancelación, incidente grave.
    """
    return send_whatsapp(
        phone_number=owner_phone,
        template='owner_critical_alert',
        params={
            'machine': machine,
            'license_plate': license_plate,
            'operator_name': operator_name,
            'reason': reason
        }
    )


def notify_owner_weekly_summary(
    owner_phone: str,
    owner_name: str,
    weekly_earned: str,
    monthly_earned: str,
    services_count: int,
    to_invoice: int,
    to_collect: int
) -> dict:
    """
    Resumen semanal para el dueño.
    Se envía automáticamente cada lunes o manualmente.
    """
    return send_whatsapp(
        phone_number=owner_phone,
        template='owner_weekly_summary',
        params={
            'owner_name': owner_name,
            'weekly_earned': weekly_earned,
            'monthly_earned': monthly_earned,
            'services_count': services_count,
            'to_invoice': to_invoice,
            'to_collect': to_collect
        }
    )


def notify_service_approved_for_invoice(
    provider_phone: str,
    invoice_amount: str
) -> dict:
    """
    Notificar al proveedor que el servicio fue aprobado (Pago Ágil - 24h).
    Debe emitir factura a MAQGO (no al cliente).
    
    GATILLO: Se dispara automáticamente cuando un servicio pasa de
    'pending_review' a 'approved' después de 24 horas.
    """
    return send_whatsapp(
        phone_number=provider_phone,
        template='service_approved_invoice',
        params={
            'invoice_amount': invoice_amount
        }
    )


def notify_invoice_uploaded(
    provider_phone: str,
    invoice_number: str,
    net_amount: str
) -> dict:
    """
    Notificar al proveedor que su factura fue recibida.
    
    GATILLO: Se dispara cuando el proveedor sube su factura al sistema.
    """
    return send_whatsapp(
        phone_number=provider_phone,
        template='invoice_uploaded',
        params={
            'invoice_number': invoice_number,
            'net_amount': net_amount
        }
    )


def notify_payment_sent(
    provider_phone: str,
    invoice_number: str,
    net_amount: str
) -> dict:
    """
    Notificar al proveedor que el pago fue realizado.
    
    GATILLO: Se dispara cuando MAQGO marca el servicio como 'paid'.
    """
    return send_whatsapp(
        phone_number=provider_phone,
        template='payment_sent',
        params={
            'invoice_number': invoice_number,
            'net_amount': net_amount
        }
    )


# ==================== NEW NOTIFICATION FUNCTIONS (Enero 2025) ====================

def notify_client_request_sent(client_phone: str, use_whatsapp: bool = True) -> dict:
    """
    1️⃣ Solicitud enviada (sin cobro) - CLIENTE
    Canal: SMS + WhatsApp
    
    GATILLO: Cliente confirma solicitud (antes de que proveedor acepte)
    """
    results = []
    
    # Siempre enviar SMS
    results.append(send_sms(client_phone, 'client_request_sent'))
    
    # También WhatsApp si está habilitado
    if use_whatsapp:
        results.append(send_whatsapp(client_phone, 'client_request_sent', {}))
    
    return {
        'success': all(r.get('success') for r in results),
        'results': results,
        'demo_mode': DEMO_MODE
    }


def notify_client_provider_accepted(client_phone: str, use_whatsapp: bool = True) -> dict:
    """
    2️⃣ Proveedor aceptó (se ejecuta cobro) - CLIENTE
    Canal: SMS + WhatsApp
    
    GATILLO: Proveedor acepta la solicitud
    """
    results = []
    
    # Siempre enviar SMS
    results.append(send_sms(client_phone, 'client_provider_accepted'))
    
    # También WhatsApp
    if use_whatsapp:
        results.append(send_whatsapp(client_phone, 'client_provider_accepted', {}))
    
    return {
        'success': all(r.get('success') for r in results),
        'results': results,
        'demo_mode': DEMO_MODE
    }


def notify_client_provider_rejected(client_phone: str) -> dict:
    """
    3️⃣ Proveedor rechazó - CLIENTE
    Canal: SMS
    
    GATILLO: Rechazo explícito del proveedor
    """
    return send_sms(client_phone, 'client_provider_rejected')


def notify_client_request_expired(client_phone: str) -> dict:
    """
    4️⃣ Solicitud expirada (sin aceptación) - CLIENTE
    Canal: SMS
    
    GATILLO: Timeout sin respuesta del proveedor
    """
    return send_sms(client_phone, 'client_request_expired')


def notify_client_service_reminder(
    client_phone: str,
    machine: str,
    start_time: str,
    provider_name: str
) -> dict:
    """
    5️⃣ Recordatorio previo al servicio - CLIENTE
    Canal: WhatsApp
    
    GATILLO: X horas antes del servicio programado
    """
    return send_whatsapp(
        client_phone,
        'client_service_reminder',
        {
            'machine': machine,
            'start_time': start_time,
            'provider_name': provider_name
        }
    )


def notify_client_cancellation_no_charge(client_phone: str) -> dict:
    """
    6️⃣ Cancelación sin cargo (cliente) - CLIENTE
    Canal: SMS
    
    GATILLO: Cliente cancela con +2h de anticipación
    """
    return send_sms(client_phone, 'client_cancellation_no_charge')


def notify_client_cancellation_with_charge(client_phone: str) -> dict:
    """
    7️⃣ Cancelación con cargo (fuera de plazo) - CLIENTE
    Canal: SMS
    
    GATILLO: Cliente cancela fuera del plazo permitido
    """
    return send_sms(client_phone, 'client_cancellation_with_charge')


def notify_client_provider_arriving(client_phone: str) -> dict:
    """
    Proveedor llegando (~500m del lugar) - CLIENTE
    Canal: WhatsApp
    GATILLO: Proveedor detecta que está a 500m de la obra
    """
    return send_whatsapp(client_phone, 'client_provider_arriving', {})


def notify_client_provider_arrived(client_phone: str) -> dict:
    """
    Proveedor marcó llegada - CLIENTE
    Canal: SMS
    
    GATILLO: Proveedor marca llegada manualmente (POST /arrival)
    """
    return send_sms(client_phone, 'client_provider_arrived')


def notify_provider_new_request_sms(provider_phone: str, minutes: int = 10, use_whatsapp: bool = True) -> dict:
    """
    8️⃣ Nueva solicitud entrante - PROVEEDOR
    Canal: SMS + WhatsApp
    
    GATILLO: Nueva solicitud disponible para el proveedor
    """
    results = []
    
    # Siempre enviar SMS
    results.append(send_sms(provider_phone, 'provider_new_request', {'minutes': minutes}))
    
    return {
        'success': all(r.get('success') for r in results),
        'results': results,
        'demo_mode': DEMO_MODE
    }


def notify_provider_request_accepted_sms(provider_phone: str) -> dict:
    """
    9️⃣ Solicitud aceptada - PROVEEDOR
    Canal: SMS
    
    GATILLO: Proveedor acepta la solicitud
    """
    return send_sms(provider_phone, 'provider_request_accepted')


def notify_provider_request_expired(provider_phone: str) -> dict:
    """
    🔟 Solicitud expirada - PROVEEDOR
    Canal: SMS
    
    GATILLO: Timeout sin respuesta del proveedor
    """
    return send_sms(provider_phone, 'provider_request_expired')


def notify_operator_assigned(
    operator_phone: str,
    machine: str,
    address: str,
    start_time: str
) -> dict:
    """
    1️⃣1️⃣ Asignación a servicio - OPERADOR
    Canal: WhatsApp
    
    GATILLO: Operador es asignado a un servicio
    """
    return send_whatsapp(
        operator_phone,
        'operator_assigned',
        {
            'machine': machine,
            'address': address,
            'start_time': start_time
        }
    )


# ==================== PARALLEL NOTIFICATIONS ====================

import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for parallel SMS/WhatsApp sending
_executor = ThreadPoolExecutor(max_workers=10)


def notify_team_new_request_parallel(
    team_phones: list,
    machine: str,
    area: str,
    hours: int,
    amount: str,
    response_minutes: int = 10
) -> dict:
    """
    Notificación PARALELA a todo el equipo cuando llega una nueva solicitud.
    
    Notifica simultáneamente a:
    - Owner/Masters (SMS + WhatsApp con detalles financieros)
    - Operadores disponibles (SMS + WhatsApp con detalles operacionales)
    
    El PRIMERO en aceptar gana el trabajo.
    
    Args:
        team_phones: Lista de diccionarios con {phone, role, name}
        machine, area, hours, amount: Detalles del servicio
        response_minutes: Tiempo límite para responder
    
    Returns:
        dict con resultados de todas las notificaciones
    """
    results = {
        'total_notified': 0,
        'successful': [],
        'failed': [],
        'demo_mode': DEMO_MODE
    }
    
    for member in team_phones:
        phone = member.get('phone')
        role = member.get('role', 'operator')
        name = member.get('name', 'Usuario')
        
        if not phone:
            continue
        
        try:
            # Enviar SMS a todos
            sms_result = send_sms(phone, 'provider_new_request', {'minutes': response_minutes})
            
            # Enviar WhatsApp con detalles
            whatsapp_result = send_whatsapp(
                phone,
                'new_request_provider',
                {
                    'machine': machine,
                    'area': area,
                    'hours': hours,
                    'amount': amount,
                    'minutes': response_minutes
                }
            )
            
            if sms_result.get('success') or whatsapp_result.get('success'):
                results['successful'].append({
                    'phone': phone[-4:],  # Solo últimos 4 dígitos por privacidad
                    'name': name,
                    'role': role
                })
                results['total_notified'] += 1
            else:
                results['failed'].append({
                    'phone': phone[-4:],
                    'name': name,
                    'error': sms_result.get('error') or whatsapp_result.get('error')
                })
                
        except Exception as e:
            logger.error(f"Error notifying {name}: {e}")
            results['failed'].append({
                'phone': phone[-4:] if phone else 'N/A',
                'name': name,
                'error': str(e)
            })
    
    return results


async def notify_team_new_request_async(
    team_phones: list,
    machine: str,
    area: str,
    hours: int,
    amount: str,
    response_minutes: int = 10
) -> dict:
    """
    Versión async de notificaciones paralelas.
    Usa ThreadPoolExecutor para enviar todas las notificaciones en paralelo.
    """
    loop = asyncio.get_event_loop()
    
    # Ejecutar la función síncrona en un thread pool
    result = await loop.run_in_executor(
        _executor,
        lambda: notify_team_new_request_parallel(
            team_phones, machine, area, hours, amount, response_minutes
        )
    )
    
    return result


