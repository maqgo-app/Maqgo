"""
MAQGO – Communications Module

Canales:
- OTP SMS → LabsMobile (via services.otp_service)
- SMS notificaciones transaccionales → deshabilitado (MVP; solo OTP activo)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional


logger = logging.getLogger(__name__)


def _phone_tail(phone: str) -> str:
    d = "".join(c for c in (phone or "") if c.isdigit())
    return f"***{d[-4:]}" if len(d) >= 4 else "***"


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
    'otp': 'Tu código de verificación es {otp}. Válido por 5 minutos.',
    
    # === CLIENTE - SMS ===
    'client_request_sent': """Recibimos tu solicitud de maquinaria.
Está pendiente de aceptación del proveedor.
No se ha realizado ningún cobro.
Revisa el estado del servicio en la app.""",

    'client_provider_accepted': """¡Servicio confirmado!
El proveedor aceptó tu solicitud y se ejecutó el cobro automáticamente.
Revisa los detalles en la app.""",

    'client_provider_rejected': """El proveedor rechazó la solicitud.
No se realizó ningún cobro.
Puedes seleccionar otro proveedor disponible.""",

    'client_request_expired': """La solicitud expiró por falta de confirmación del proveedor.
No se realizó ningún cobro.
Intenta nuevamente desde la app.""",

    'client_cancellation_no_charge': """Servicio cancelado correctamente.
No se realizó ningún cobro.""",

    'client_cancellation_with_charge': """Servicio cancelado fuera de plazo.
Se aplicó el cobro correspondiente según las condiciones.""",

    'client_provider_arrived': """El operador llegó a la ubicación.
Ya puedes autorizar el inicio del servicio en la app.""",

    # === PROVEEDOR - SMS ===
    'provider_new_request': """Nueva solicitud disponible.
Tienes {minutes} minutos para aceptar.
Al aceptar, se ejecuta el cobro automático al cliente.""",

    'provider_request_accepted': """Aceptaste el servicio.
El cliente fue notificado y el cobro se ejecutó correctamente.""",

    'provider_request_expired': """La solicitud expiró por falta de respuesta.""",

    'provider_service_approved_for_invoice': """Servicio aprobado.
Ya puedes emitir la factura a MAQGO.
Monto neto: {invoice_amount}""",

    'provider_payment_sent': """Pago realizado.
Hemos transferido {net_amount} a tu cuenta.
Factura: {invoice_number}""",
}


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
    logger.info("OTP_SERVICE_START channel=%s phone=%s", channel, _phone_tail(phone_number))

    if channel != 'sms':
        channel = 'sms'

    # OTP interno vía services.otp_service (Redis + LabsMobile)
    try:
        from services.otp_service import send_otp, is_otp_configured

        configured = is_otp_configured()
        logger.debug("OTP_CONFIG_CHECK_RESULT configured=%s", configured)

        if not configured:
            logger.warning("OTP_NOT_CONFIGURED")
            return {
                'success': False,
                'error': 'OTP service not configured. Check REDIS_URL, LABSMOBILE credentials.',
                'log': log_message('sms', phone_number, 'otp', 'error', 'OTP not configured')
            }
        
        result = send_otp(phone_number, channel)
        logger.info("OTP_SEND_RESULT success=%s phone=%s", result.get("success"), _phone_tail(phone_number))

        if result.get('success'):
            return {
                'success': True,
                'channel': result.get('channel', 'sms'),
                'demo_mode': False,
                'reused': bool(result.get('reused')),
                'ttl_seconds': result.get('ttl_seconds'),
                'log': log_message('sms', phone_number, 'otp', 'sent')
            }
        
        logger.warning("OTP_SEND_FAILED err=%s phone=%s", result.get('error'), _phone_tail(phone_number))
        return {
            'success': False,
            'error': result.get('error', 'OTP send failed'),
            'log': log_message('sms', phone_number, 'otp', 'error', result.get('error'))
        }
        
    except ImportError as e:
        logger.exception("OTP_IMPORT_ERROR")
        return {
            'success': False,
            'error': 'OTP service not available',
            'log': log_message('sms', phone_number, 'otp', 'error', f"Import error: {str(e)}")
        }
    except Exception as e:
        logger.exception("OTP_SERVICE_ERROR")
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
    
    return {
        'success': False,
        'error': 'SMS notificaciones deshabilitado',
        'log': log_message('sms', phone_number, template, 'disabled')
    }


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
    return send_sms(provider_phone, 'provider_service_approved_for_invoice', {'invoice_amount': invoice_amount})


def notify_invoice_uploaded(
    provider_phone: str,
    invoice_number: str,
    net_amount: str
) -> dict:
    """
    Notificar al proveedor que su factura fue recibida.
    
    GATILLO: Se dispara cuando el proveedor sube su factura al sistema.
    """
    return send_sms(provider_phone, 'provider_service_approved_for_invoice', {'invoice_amount': net_amount})


def notify_payment_sent(
    provider_phone: str,
    invoice_number: str,
    net_amount: str
) -> dict:
    """
    Notificar al proveedor que el pago fue realizado.
    
    GATILLO: Se dispara cuando MAQGO marca el servicio como 'paid'.
    """
    return send_sms(provider_phone, 'provider_payment_sent', {'invoice_number': invoice_number, 'net_amount': net_amount})


# ==================== NEW NOTIFICATION FUNCTIONS (Enero 2025) ====================

def notify_client_request_sent(client_phone: str, use_whatsapp: bool = True) -> dict:
    """
    1️⃣ Solicitud enviada (sin cobro) - CLIENTE
    Canal: SMS
    
    GATILLO: Cliente confirma solicitud (antes de que proveedor acepte)
    """
    results = []
    
    # Siempre enviar SMS
    results.append(send_sms(client_phone, 'client_request_sent'))
    
    use_whatsapp = False
    
    return {
        'success': all(r.get('success') for r in results),
        'results': results,
        'demo_mode': DEMO_MODE
    }


def notify_client_provider_accepted(client_phone: str, use_whatsapp: bool = True) -> dict:
    """
    2️⃣ Proveedor aceptó (se ejecuta cobro) - CLIENTE
    Canal: SMS
    
    GATILLO: Proveedor acepta la solicitud
    """
    results = []
    
    # Siempre enviar SMS
    results.append(send_sms(client_phone, 'client_provider_accepted'))
    
    use_whatsapp = False
    
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
    Canal: SMS (deshabilitado salvo demo)
    
    GATILLO: X horas antes del servicio programado
    """
    return send_sms(client_phone, 'client_request_sent')


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
    Canal: SMS
    GATILLO: Proveedor detecta que está a 500m de la obra
    """
    return send_sms(client_phone, 'client_request_sent')


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
    Canal: SMS
    
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


