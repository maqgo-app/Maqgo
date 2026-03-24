"""
MAQGO – Communications API Routes

Server-side only (no frontend Twilio calls)
Event-driven triggers
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from rate_limit import limiter

from communications import (
    send_sms_otp,
    verify_sms_otp,
    notify_provider_new_request,
    notify_client_provider_confirmed,
    notify_client_provider_en_route,
    notify_client_provider_arriving,
    notify_service_started,
    notify_service_finished,
    notify_owner_new_assignment,
    notify_owner_service_finished,
    notify_owner_critical_alert,
    notify_owner_weekly_summary,
    # New notification functions (Enero 2025)
    notify_client_request_sent,
    notify_client_provider_accepted,
    notify_client_provider_rejected,
    notify_client_request_expired,
    notify_client_service_reminder,
    notify_client_cancellation_no_charge,
    notify_client_cancellation_with_charge,
    notify_provider_new_request_sms,
    notify_provider_request_accepted_sms,
    notify_provider_request_expired,
    notify_operator_assigned,
    # Parallel notifications
    notify_team_new_request_parallel,
    notify_team_new_request_async,
    DEMO_MODE
)

router = APIRouter(prefix="/communications", tags=["communications"])


# ==================== REQUEST MODELS ====================

class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format (+56912345678)")
    channel: str = Field(default="sms", description="Channel: 'sms' or 'whatsapp'")


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")


class NotifyProviderRequest(BaseModel):
    provider_phone: str
    machine: str
    area: str
    hours: int
    amount: str
    response_minutes: int = 10


class NotifyClientRequest(BaseModel):
    client_phone: str


class NotifyEnRouteRequest(BaseModel):
    client_phone: str
    eta: int
    license_plate: str


class NotifyServiceRequest(BaseModel):
    client_phone: str
    hours: Optional[int] = None
    amount: Optional[str] = None


class NotifyOwnerAssignmentRequest(BaseModel):
    owner_phone: str
    machine: str
    license_plate: str
    operator_name: str
    location: str
    amount: str


class NotifyOwnerFinishedRequest(BaseModel):
    owner_phone: str
    machine: str
    license_plate: str
    operator_name: str
    net_amount: str


class NotifyOwnerAlertRequest(BaseModel):
    owner_phone: str
    machine: str
    license_plate: str
    operator_name: str
    reason: str


# ==================== SMS ENDPOINTS ====================

@router.post("/sms/send-otp")
@limiter.limit("5/minute")
async def api_send_otp(request: Request, body: SendOTPRequest):
    """
    Send 6-digit OTP via SMS (Redis + LabsMobile).
    - OTP valid for 5 minutes, max 3 attempts, rate limit 3/10min
    """
    result = send_sms_otp(body.phone_number, body.channel)
    
    if not result['success'] and not result.get('demo_mode'):
        err = result.get('error', 'Failed to send OTP')
        status = 429 if 'Demasiados intentos' in (err or '') else 400
        raise HTTPException(status_code=status, detail=err)
    
    channel_name = 'WhatsApp' if body.channel == 'whatsapp' else 'SMS'
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'channel': body.channel,
        'message': f'OTP enviado correctamente por {channel_name}' if not result.get('demo_mode') else result.get('message')
    }


@router.post("/sms/verify-otp")
@limiter.limit("10/minute")
async def api_verify_otp(request: Request, body: VerifyOTPRequest):
    """
    Verify OTP code.
    - Returns valid + error (for invalid/expired/too many attempts)
    - Si OTP válido y existe usuario con ese teléfono: crea sesión y retorna token
    """
    from auth_dependency import create_session_for_user, _normalize_phone
    from motor.motor_asyncio import AsyncIOMotorClient
    import os

    result = verify_sms_otp(body.phone_number, body.code)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Verification failed"))

    response = {
        "success": True,
        "valid": result.get("valid", False),
        "error": result.get("error"),
        "demo_mode": result.get("demo_mode", False),
    }

    # Si OTP válido: buscar usuario por teléfono y crear sesión si existe
    if result.get("valid") and body.phone_number:
        digits = "".join(c for c in body.phone_number if c.isdigit())
        if len(digits) >= 9:
            digits = digits[-9:]
            from db_config import get_db_name, get_mongo_url

            mongo_url = get_mongo_url()
            db_client = AsyncIOMotorClient(mongo_url)
            db = db_client[get_db_name()]
            phone_norm = _normalize_phone(body.phone_number)
            # Buscar usuario por teléfono (auth guarda en E.164 o 9 dígitos)
            user = await db.users.find_one(
                {"$or": [{"phone": phone_norm}, {"phone": body.phone_number}, {"phone": digits}]},
                {"_id": 0, "id": 1},
            )
        else:
            user = None
        if user:
            token = await create_session_for_user(user["id"])
            response["token"] = token
            response["userId"] = user["id"]

    return response


# ==================== WHATSAPP ENDPOINTS ====================

@router.post("/whatsapp/notify-provider")
async def api_notify_provider(request: NotifyProviderRequest):
    """
    Send new request notification to provider via WhatsApp.
    EVENT: Immediate reservation created
    """
    result = notify_provider_new_request(
        provider_phone=request.provider_phone,
        machine=request.machine,
        area=request.area,
        hours=request.hours,
        amount=request.amount,
        response_minutes=request.response_minutes
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación enviada al proveedor'
    }


@router.post("/whatsapp/confirm-client")
async def api_confirm_client(request: NotifyClientRequest):
    """
    Send confirmation to client via WhatsApp.
    EVENT: Provider accepts
    """
    result = notify_client_provider_confirmed(request.client_phone)
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Confirmación enviada al cliente'
    }


@router.post("/whatsapp/en-route")
async def api_notify_en_route(request: NotifyEnRouteRequest):
    """
    Notify client that provider is on the way.
    """
    result = notify_client_provider_en_route(
        client_phone=request.client_phone,
        eta=request.eta,
        license_plate=request.license_plate
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de llegada enviada'
    }


@router.post("/whatsapp/provider-arriving")
async def api_provider_arriving(request: NotifyClientRequest):
    """
    Notify client that provider is arriving at the access point (~500m).
    Canal: WhatsApp
    """
    result = notify_client_provider_arriving(request.client_phone)
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de llegada enviada'
    }


@router.post("/whatsapp/service-started")
async def api_service_started(request: NotifyServiceRequest):
    """
    Notify client that service has started.
    """
    result = notify_service_started(request.client_phone, request.hours or 0)
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de inicio enviada'
    }


@router.post("/whatsapp/service-finished")
async def api_service_finished(request: NotifyServiceRequest):
    """
    Notify client that service has finished.
    """
    result = notify_service_finished(request.client_phone, request.amount or '$0')
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de fin de servicio enviada'
    }


# ==================== OWNER/SECRETARY ENDPOINTS ====================

@router.post("/whatsapp/owner/new-assignment")
async def api_owner_new_assignment(request: NotifyOwnerAssignmentRequest):
    """
    Notify owner/secretary when operator is assigned to a job.
    Reduced notifications: Only assignment + finish + critical alerts.
    """
    result = notify_owner_new_assignment(
        owner_phone=request.owner_phone,
        machine=request.machine,
        license_plate=request.license_plate,
        operator_name=request.operator_name,
        location=request.location,
        amount=request.amount
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de asignación enviada al dueño'
    }


@router.post("/whatsapp/owner/service-finished")
async def api_owner_service_finished(request: NotifyOwnerFinishedRequest):
    """
    Notify owner/secretary when service finishes.
    Includes net earnings after MAQGO commission.
    """
    result = notify_owner_service_finished(
        owner_phone=request.owner_phone,
        machine=request.machine,
        license_plate=request.license_plate,
        operator_name=request.operator_name,
        net_amount=request.net_amount
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Notificación de servicio finalizado enviada al dueño'
    }


@router.post("/whatsapp/owner/critical-alert")
async def api_owner_critical_alert(request: NotifyOwnerAlertRequest):
    """
    Notify owner/secretary of critical issues.
    E.g.: No-show, cancellation, serious incident.
    """
    result = notify_owner_critical_alert(
        owner_phone=request.owner_phone,
        machine=request.machine,
        license_plate=request.license_plate,
        operator_name=request.operator_name,
        reason=request.reason
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Alerta crítica enviada al dueño'
    }


class WeeklySummaryRequest(BaseModel):
    owner_phone: str
    owner_name: str
    weekly_earned: str
    monthly_earned: str
    services_count: int
    to_invoice: int
    to_collect: int


@router.post("/whatsapp/owner/weekly-summary")
async def api_owner_weekly_summary(request: WeeklySummaryRequest):
    """
    Send weekly summary to owner/secretary.
    Can be triggered manually or by a scheduled job.
    """
    result = notify_owner_weekly_summary(
        owner_phone=request.owner_phone,
        owner_name=request.owner_name,
        weekly_earned=request.weekly_earned,
        monthly_earned=request.monthly_earned,
        services_count=request.services_count,
        to_invoice=request.to_invoice,
        to_collect=request.to_collect
    )
    
    if not result['success'] and not result.get('demo_mode'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to send WhatsApp'))
    
    return {
        'success': True,
        'demo_mode': result.get('demo_mode', False),
        'message': 'Resumen semanal enviado'
    }


# ==================== NEW NOTIFICATION ENDPOINTS (Enero 2025) ====================

class ClientPhoneRequest(BaseModel):
    phone: str = Field(..., description="Client phone number")


class ServiceReminderRequest(BaseModel):
    phone: str
    machine: str
    start_time: str
    provider_name: str


class OperatorAssignmentRequest(BaseModel):
    phone: str
    machine: str
    address: str
    start_time: str


@router.post("/client/request-sent")
async def api_client_request_sent(request: ClientPhoneRequest):
    """
    1️⃣ Notify client that request was sent (no charge yet).
    Canal: SMS + WhatsApp
    """
    result = notify_client_request_sent(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/provider-accepted")
async def api_client_provider_accepted(request: ClientPhoneRequest):
    """
    2️⃣ Notify client that provider accepted (charge executed).
    Canal: SMS + WhatsApp
    """
    result = notify_client_provider_accepted(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/provider-rejected")
async def api_client_provider_rejected(request: ClientPhoneRequest):
    """
    3️⃣ Notify client that provider rejected (no charge).
    Canal: SMS
    """
    result = notify_client_provider_rejected(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/request-expired")
async def api_client_request_expired(request: ClientPhoneRequest):
    """
    4️⃣ Notify client that request expired (no charge).
    Canal: SMS
    """
    result = notify_client_request_expired(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/service-reminder")
async def api_client_service_reminder(request: ServiceReminderRequest):
    """
    5️⃣ Send service reminder to client.
    Canal: WhatsApp
    """
    result = notify_client_service_reminder(
        request.phone,
        request.machine,
        request.start_time,
        request.provider_name
    )
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/cancellation-no-charge")
async def api_client_cancellation_no_charge(request: ClientPhoneRequest):
    """
    6️⃣ Notify client of cancellation without charge.
    Canal: SMS
    """
    result = notify_client_cancellation_no_charge(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/client/cancellation-with-charge")
async def api_client_cancellation_with_charge(request: ClientPhoneRequest):
    """
    7️⃣ Notify client of cancellation with charge.
    Canal: SMS
    """
    result = notify_client_cancellation_with_charge(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


class ProviderNewRequestSMSRequest(BaseModel):
    phone: str
    minutes: int = 10


@router.post("/provider/new-request-sms")
async def api_provider_new_request_sms(request: ProviderNewRequestSMSRequest):
    """
    8️⃣ Notify provider of new request (SMS version).
    Canal: SMS
    """
    result = notify_provider_new_request_sms(request.phone, request.minutes)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/provider/request-accepted-sms")
async def api_provider_request_accepted_sms(request: ClientPhoneRequest):
    """
    9️⃣ Notify provider that they accepted (charge executed).
    Canal: SMS
    """
    result = notify_provider_request_accepted_sms(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/provider/request-expired")
async def api_provider_request_expired(request: ClientPhoneRequest):
    """
    🔟 Notify provider that request expired.
    Canal: SMS
    """
    result = notify_provider_request_expired(request.phone)
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


@router.post("/operator/assigned")
async def api_operator_assigned(request: OperatorAssignmentRequest):
    """
    1️⃣1️⃣ Notify operator of service assignment.
    Canal: WhatsApp
    """
    result = notify_operator_assigned(
        request.phone,
        request.machine,
        request.address,
        request.start_time
    )
    return {'success': True, 'demo_mode': result.get('demo_mode', False)}


# ==================== PARALLEL NOTIFICATIONS ====================

class TeamMember(BaseModel):
    phone: str
    role: str = "operator"  # owner, master, operator
    name: str = "Usuario"


class ParallelNotificationRequest(BaseModel):
    team_phones: list  # List of TeamMember dicts
    machine: str
    area: str
    hours: int
    amount: str
    response_minutes: int = 10


@router.post("/team/new-request")
async def api_notify_team_new_request(request: ParallelNotificationRequest):
    """
    🔔 NOTIFICACIÓN PARALELA: Nueva solicitud a todo el equipo.
    
    Notifica simultáneamente a owner/masters y operadores disponibles.
    El PRIMERO en aceptar gana el trabajo.
    
    Canales: SMS + WhatsApp a todos los miembros del equipo.
    
    Uso típico:
    1. Cliente envía solicitud de servicio
    2. Backend llama a este endpoint con lista de teléfonos del equipo
    3. Todos reciben notificación al mismo tiempo
    4. El primero en aceptar en la app toma el servicio
    """
    result = await notify_team_new_request_async(
        team_phones=request.team_phones,
        machine=request.machine,
        area=request.area,
        hours=request.hours,
        amount=request.amount,
        response_minutes=request.response_minutes
    )
    
    return {
        'success': True,
        'total_notified': result.get('total_notified', 0),
        'successful': result.get('successful', []),
        'failed': result.get('failed', []),
        'demo_mode': result.get('demo_mode', False)
    }


@router.post("/team/new-request-sync")
def api_notify_team_new_request_sync(request: ParallelNotificationRequest):
    """
    Versión síncrona de notificación paralela (para compatibilidad).
    """
    result = notify_team_new_request_parallel(
        team_phones=request.team_phones,
        machine=request.machine,
        area=request.area,
        hours=request.hours,
        amount=request.amount,
        response_minutes=request.response_minutes
    )
    
    return {
        'success': True,
        'total_notified': result.get('total_notified', 0),
        'successful': result.get('successful', []),
        'failed': result.get('failed', []),
        'demo_mode': result.get('demo_mode', False)
    }


# ==================== STATUS ENDPOINT ====================

@router.get("/status")
async def api_communications_status():
    """
    Check communications module status.
    """
    import os
    otp_ready = False
    try:
        from services.otp_service import is_otp_configured
        otp_ready = is_otp_configured()
    except ImportError:
        pass

    return {
        'demo_mode': DEMO_MODE,
        'otp_configured': otp_ready,
        'labsmobile_configured': bool(os.environ.get('LABSMOBILE_USERNAME')) and bool(os.environ.get('LABSMOBILE_API_TOKEN')),
        'twilio_configured': bool(os.environ.get('TWILIO_ACCOUNT_SID')),
        'whatsapp_configured': bool(os.environ.get('TWILIO_WHATSAPP_FROM')),
        'sms_configured': bool(os.environ.get('LABSMOBILE_USERNAME')) and bool(os.environ.get('LABSMOBILE_API_TOKEN'))
    }
