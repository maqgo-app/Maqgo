import uuid

from fastapi import APIRouter, HTTPException, Body, Depends, status, Request
from fastapi.responses import JSONResponse
from typing import List, Optional

from pydantic import BaseModel

from auth_dependency import get_current_user, get_current_admin
from models.service_request import ServiceRequest, ServiceRequestCreate, Location, calculate_commissions
from pricing.business_rules import LATE_CANCELLATION_FEE_PERCENT
from services.utils import haversine_meters
from services.matching_service import (
    start_matching,
    handle_offer_response,
    handle_offer_expired,
    revert_confirmed_offer_after_payment_failure,
    MATCHING_CONFIG,
)
from services.payment_service import PaymentService
from services.timer_service import TimerService
from services.refund_request_service import RefundRequestService
from services.idempotency import run_idempotent, get_tenant_id
from services.payment_intent_service import PaymentIntentService, PI_PAYMENT_PENDING, PI_PROVIDER_ACCEPTED
from services.payment_metrics_store import ensure_indexes as ensure_payment_metrics_indexes
from services.payment_rollout import (
    idempotency_mode_header_value,
    persist_idempotency_key_resolution,
    record_booking_id_supplied,
    record_legacy_booking_id_generated,
    resolve_idempotency_key,
)
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError
from datetime import datetime, timezone

from db_config import get_db_name, get_mongo_url
import logging
from rate_limit import limiter

logger = logging.getLogger(__name__)


def _attach_client_matching_view(req: dict) -> None:
    """Campos derivados para UX cliente (polling): fase + contador de intentos."""
    st = req.get("status")
    if st == "matching":
        req["clientPhase"] = "searching"
    elif st == "offer_sent":
        req["clientPhase"] = "contacting"
    elif st in ("confirmed", "in_progress", "last_30", "finished"):
        req["clientPhase"] = "assigned"
    else:
        req["clientPhase"] = "searching"
    req["matchingAttemptCount"] = len(req.get("matchingAttempts") or [])


router = APIRouter(prefix="/service-requests", tags=["service_requests"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

# Índices para rutas consultadas por polling:
# - /pending filtra por status y currentOfferId
# - /{request_id} usa find_one por id
try:
    ensure_payment_metrics_indexes(db)
except Exception:
    pass

try:
    db.service_requests.create_index([("id", 1)])
    db.service_requests.create_index([("bookingId", 1)], sparse=True, name="idx_booking_id")
    db.service_requests.create_index([("status", 1), ("currentOfferId", 1)])
    db.service_requests.create_index([("offerExpiresAt", 1)])
    # Un solo cobro "charged" por solicitud (idempotencia ante requests concurrentes)
    db.payments.create_index(
        [("serviceRequestId", 1)],
        unique=True,
        partialFilterExpression={"status": "charged"},
        name="uniq_charged_per_service_request",
    )
except Exception:
    pass

# Servicios
payment_service = PaymentService(db)
payment_intent_service = PaymentIntentService(db)
timer_service = TimerService(db)
refund_request_service = RefundRequestService(db)


def _provider_matches_user(user: dict, provider_account_id: str) -> bool:
    """Dueño de cuenta proveedor o miembro de equipo (owner_id)."""
    if not provider_account_id:
        return False
    if user.get("id") == provider_account_id:
        return True
    if user.get("owner_id") == provider_account_id:
        return True
    return False


def _effective_provider_account_id(user: dict) -> Optional[str]:
    """ID de cuenta proveedor para listados (titular u operador bajo un dueño)."""
    role = user.get("role")
    uid = user.get("id")
    owner_id = user.get("owner_id")
    if role == "client" or role == "admin":
        return None
    if role == "provider":
        return uid
    if owner_id:
        return owner_id
    return uid


def _can_read_service_request(user: dict, req: dict) -> bool:
    if user.get("role") == "admin":
        return True
    uid = user.get("id")
    if req.get("clientId") == uid:
        return True
    pid = req.get("providerId")
    if pid and _provider_matches_user(user, pid):
        return True
    oid = req.get("currentOfferId")
    if oid and _provider_matches_user(user, oid):
        return True
    return False


def _assert_can_read_service(user: dict, req: dict) -> None:
    if not _can_read_service_request(user, req):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver esta solicitud",
        )


class AssignedOperatorUpdate(BaseModel):
    """Payload desde app proveedor tras elegir operador (SelectOperator)."""
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    rut: Optional[str] = None


def _assert_assigned_provider(user: dict, req: dict) -> None:
    pid = req.get("providerId")
    if not pid or not _provider_matches_user(user, pid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el proveedor asignado puede realizar esta acción",
        )


@router.post("", response_model=dict)
async def create_service_request(
    req: Request,
    payload: ServiceRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Crear nueva solicitud de servicio.
    Idempotency-Key: resuelta con resolve_idempotency_key(req, ...) (header opcional en modo compatible).
    """
    idempotency_key, key_legacy = resolve_idempotency_key(req, "create")
    await persist_idempotency_key_resolution(
        db,
        scope="create",
        endpoint=str(req.url.path),
        was_auto_generated=key_legacy,
        generated_key_prefix=idempotency_key if key_legacy else "",
    )
    body_hash = payload.model_dump()

    async def execute() -> tuple[int, dict]:
        # --- LÓGICA DE NEGOCIO: RESERVA Y PAGO ATÓMICO ---
        # Intentamos marcar el servicio como en proceso de pago solo si está disponible.
        # Esto garantiza que UN solo proveedor entre al flujo de cobro.
        req = await db.service_requests.find_one_and_update(
            {"id": request_id, "status": {"$in": ["SEARCHING", "OPEN"]}},
            {"$set": {"status": "PROCESSING_PAYMENT", "provider_id": provider_id}},
            return_document=True
        )

        if not req:
            return 409, {"error": "Servicio ya asignado o no disponible"}

        try:
            # El cobro es condición obligatoria para la aceptación final
            payment_result = await payment_service.charge_for_accept(service_obj=req)
            if not payment_result.get('success'):
                # Si falla el pago, liberamos el servicio inmediatamente
                await db.service_requests.update_one(
                    {"id": request_id},
                    {"$set": {"status": "SEARCHING"}, "$unset": {"provider_id": ""}}
                )
                return 402, {"error": "Pago rechazado", "details": payment_result.get('error')}
        except Exception as e:
            # Reversión de seguridad ante errores inesperados
            await db.service_requests.update_one({"id": request_id}, {"$set": {"status": "SEARCHING"}})
            raise e

        # Si llegamos aquí, el pago fue exitoso. Procedemos con la lógica de éxito.
        return 200, {"message": "Servicio aceptado y pagado correctamente", "request": req}

        if not _provider_matches_user(current_user, offered_provider_id):
            raise HTTPException(status_code=403, detail="Solo puedes aceptar ofertas dirigidas a ti")

        if req.get("status") != "offer_sent":
            raise HTTPException(status_code=400, detail="Esta solicitud ya no está disponible")

        result = await handle_offer_response(db, request_id, offered_provider_id, accepted=True)

        if result.get("status") == "error":
            raise HTTPException(
                status_code=400,
                detail=result.get("message", "No se pudo confirmar la solicitud"),
            )

        if result.get("status") == "confirmed":
            payment_result = await payment_service.charge_for_accept(
                request_id,
                req["clientId"],
                req["totalAmount"],
                booking_id=req.get("bookingId"),
            )

            if not payment_result.get("success"):
                await revert_confirmed_offer_after_payment_failure(db, request_id, offered_provider_id)
                await payment_service.rollback_charge(request_id, "payment_failed")
                error_code = payment_result.get("error") or "PAYMENT_FAILED"
                if error_code == "ONECLICK_REQUIRED":
                    raise HTTPException(
                        status_code=409,
                        detail="Cliente sin tarjeta registrada en OneClick para cobro real",
                    )
                raise HTTPException(status_code=400, detail="Error procesando el pago")

            result["payment"] = payment_result
            booking_id = req.get("bookingId")
            if booking_id:
                try:
                    await payment_intent_service.set_state(
                        booking_id,
                        PI_PROVIDER_ACCEPTED,
                        last_idempotency_key=idempotency_key,
                        service_request_id=request_id,
                        extra_set={"payment_authorized": True},
                    )
                except Exception as e:
                    logger.warning("payment_intent accept update: %s", e)

        return 200, result

    code, payload = await run_idempotent(
        db,
        tenant_id=get_tenant_id(),
        idempotency_key=idempotency_key,
        scope="accept",
        endpoint=str(req.url.path),
        body_for_hash=body_hash,
        execute=execute,
    )
    r = JSONResponse(content=payload, status_code=code)
    r.headers["X-Idempotency-Mode"] = idempotency_mode_header_value(key_legacy)
    return r

@router.put("/{request_id}/cancel", response_model=dict)
async def cancel_service_client(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user)
):
    """
    Cancelación por cliente.
    Ventana gratuita 1h: reembolso total. > 1h: 20%.
    Si arrivalDetectedAt existe: cancelación bloqueada.
    Solo el cliente dueño de la solicitud puede cancelar.
    """
    request = await db.service_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    client_id = request.get('clientId')
    if client_id and client_id != current_user.get('id'):
        raise HTTPException(
            status_code=403,
            detail="Solo el cliente de esta reserva puede cancelarla"
        )

    status = request.get('status', '')
    # Mapear a estados del doc: pending_provider, accepted, en_route
    cancellable = status in ['matching', 'offer_sent', 'confirmed']

    if not cancellable:
        raise HTTPException(
            status_code=400,
            detail="No se puede cancelar en el estado actual del servicio"
        )

    if request.get('arrivalDetectedAt'):
        raise HTTPException(
            status_code=400,
            detail="No se puede cancelar una vez que el operador ha llegado"
        )

    now = datetime.now(timezone.utc)
    scheduled_start_str = request.get('confirmedAt') or request.get('createdAt') or now.isoformat()
    try:
        scheduled_start = datetime.fromisoformat(scheduled_start_str.replace('Z', '+00:00'))
    except Exception:
        scheduled_start = now

    minutes_elapsed = (now - scheduled_start).total_seconds() / 60
    total_client = float(request.get('totalAmount', 0))

    if status in ['matching', 'offer_sent']:
        new_status = 'cancelled_client'
        cancelation_fee = 0
        refund_amount = 0
        cancel_event = None
    else:
        if minutes_elapsed > 90:
            cancelation_fee = int(total_client * LATE_CANCELLATION_FEE_PERCENT)
            refund_amount = total_client - cancelation_fee
            new_status = 'cancelled_with_fee'
            cancel_event = {'type': 'cancel_with_fee', 'at': now.isoformat()}
        else:
            cancelation_fee = 0
            refund_amount = total_client
            new_status = 'cancelled_client'
            cancel_event = None

    update_data = {
        'status': new_status,
        'late_fee_amount': cancelation_fee,
        'cancelationFee': cancelation_fee if cancelation_fee > 0 else None,
        'cancellation_reason': body.get('reason'),
        'cancelled_at': now.isoformat(),
    }

    refund_request_result = None
    if refund_amount > 0:
        # Devolución pasa por MAQGO: solicitud → aprobación admin → Transbank
        refund_request_result = await refund_request_service.create_request(
            service_request_id=request_id,
            amount=refund_amount,
            reason="client_cancelled",
            requested_by_user_id=current_user.get("id"),
            source="client_cancel",
            meta={
                "late_fee_amount": cancelation_fee,
                "new_status": new_status,
            },
        )
        update_data["paymentStatus"] = "refund_requested"

    mongo_update = {'$set': update_data}
    if cancel_event:
        mongo_update['$push'] = {'events': cancel_event}

    await db.service_requests.update_one(
        {'id': request_id},
        mongo_update
    )

    rr_doc = (refund_request_result or {}).get("refundRequest") if refund_request_result else None
    return {
        'status': new_status,
        'refund_amount': refund_amount,
        'late_fee_amount': cancelation_fee,
        'cancelationFee': cancelation_fee if cancelation_fee > 0 else None,
        'refund_request_id': rr_doc.get("id") if rr_doc else None,
        'refund_request_status': rr_doc.get("status") if rr_doc else None,
        'refund_pending_approval': bool(refund_amount > 0),
    }


@router.put("/{request_id}/reject", response_model=dict)
async def reject_service_request(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user)
):
    """
    Proveedor rechaza la solicitud.
    En modo rotación, cualquier proveedor con intento pendiente puede rechazar; si quedan otros pendientes, no se fuerza el siguiente proveedor aún.
    NO HAY COBRO.
    """
    request = await db.service_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    provider_id = body.get('providerId') or request.get('currentOfferId')
    if not provider_id:
        raise HTTPException(status_code=400, detail="providerId requerido o no hay oferta activa")
    pending_ids = [
        a.get('providerId')
        for a in (request.get('matchingAttempts') or [])
        if a.get('status') == 'pending'
    ]
    if provider_id not in pending_ids:
        raise HTTPException(status_code=400, detail="No hay oferta pendiente para rechazar")
    if not _provider_matches_user(current_user, provider_id):
        raise HTTPException(status_code=403, detail="Solo el proveedor con oferta pendiente puede rechazar")
    
    result = await handle_offer_response(db, request_id, provider_id, accepted=False)
    
    return result

@router.patch("/{request_id}/assigned-operator", response_model=dict)
async def patch_assigned_operator(
    request_id: str,
    body: AssignedOperatorUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Persiste nombre/RUT del operador asignado para que el cliente los vea vía GET service-requests.
    Llamar tras seleccionar operador en el flujo proveedor (p. ej. SelectOperatorScreen).
    """
    req = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, req)
    st = (req.get("status") or "").lower()
    if st not in ("confirmed", "in_progress", "last_30"):
        raise HTTPException(
            status_code=400,
            detail="Estado no permite actualizar operador",
        )

    nombre = (body.nombre or "").strip()
    apellido = (body.apellido or "").strip()
    rut_raw = body.rut
    rut = rut_raw.strip() if rut_raw else ""

    update: dict = {}
    if nombre:
        update["operatorFirstName"] = nombre
    if apellido:
        update["operatorLastName"] = apellido
    if rut:
        update["operatorRut"] = rut
    if nombre or apellido:
        update["providerOperatorName"] = f"{nombre} {apellido}".strip()

    if not update:
        return {"success": True, "message": "Sin cambios"}

    await db.service_requests.update_one({"id": request_id}, {"$set": update})
    return {"success": True}


@router.post("/{request_id}/mark-arrival", response_model=dict)
async def mark_arrival(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """
    Proveedor marca llegada validada por GPS.
    Distancia máxima 500m desde jobLocation.
    """
    request = await db.service_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, request)

    if request.get('arrivalDetectedAt'):
        raise HTTPException(status_code=400, detail="La llegada ya fue registrada")

    job_location = request.get('location') or {}
    job_lat = job_location.get('lat')
    job_lng = job_location.get('lng')
    if job_lat is None or job_lng is None:
        raise HTTPException(status_code=400, detail="El servicio no tiene ubicación de obra")

    lat = body.get('lat')
    lng = body.get('lng')
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Se requieren lat y lng")

    lat = float(lat)
    lng = float(lng)
    distance_meters = haversine_meters(job_lat, job_lng, lat, lng)

    if distance_meters > 500:
        raise HTTPException(
            status_code=400,
            detail=f"Ubicación fuera de rango. Distancia: {distance_meters:.0f}m (máx 500m)"
        )

    now = datetime.now(timezone.utc)
    arrival_location = {
        'lat': lat,
        'lng': lng,
        'capturedAt': now.isoformat(),
        'distanceMeters': round(distance_meters, 2),
    }

    arrival_event = {'type': 'arrival', 'at': now.isoformat()}
    await db.service_requests.update_one(
        {'id': request_id},
        {
            '$set': {
                'arrivalDetectedAt': now.isoformat(),
                'arrivalLocation': arrival_location,
            },
            '$push': {'events': arrival_event}
        }
    )

    return {
        'success': True,
        'distanceMeters': round(distance_meters, 2),
        'arrivalDetectedAt': now.isoformat(),
    }


@router.put("/{request_id}/start", response_model=dict)
async def start_service(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Iniciar ejecución del servicio (proveedor llegó al lugar)"""
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, request)

    result = await db.service_requests.update_one(
        {'id': request_id, 'status': 'confirmed'},
        {'$set': {'status': 'in_progress'}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Servicio no disponible para iniciar")
    
    return {'message': 'Servicio iniciado', 'status': 'in_progress'}

@router.put("/{request_id}/finish", response_model=dict)
async def finish_service(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """
    Finalizar servicio (proveedor asignado o admin).
    """
    if current_user.get("role") != "admin":
        request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
        if not request:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        _assert_assigned_provider(current_user, request)

    now = datetime.now(timezone.utc)
    finished_event = {'type': 'finished', 'at': now.isoformat()}

    update_data = {
        'status': 'finished',
        'finishedAt': now.isoformat(),
        'autoFinished': False  # Cierre manual
    }
    if body.get('endLocation'):
        update_data['finalLocation'] = body['endLocation']

    result = await db.service_requests.update_one(
        {'id': request_id, 'status': {'$in': ['in_progress', 'last_30']}},
        {'$set': update_data, '$push': {'events': finished_event}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Servicio no disponible para finalizar")
    
    # Liberar proveedor
    request = await db.service_requests.find_one({'id': request_id}, {'_id': 0})
    if request and request.get('providerId'):
        await db.users.update_one(
            {'id': request['providerId']},
            {'$set': {'isAvailable': True}}
        )
    
    return {
        'message': 'Servicio finalizado',
        'status': 'finished',
        'totalAmount': request.get('totalAmount', 0) if request else 0,
        'finishedAt': now.isoformat()
    }

@router.post("/timers/check", response_model=dict)
async def run_timer_check(_: dict = Depends(get_current_admin)):
    """
    Ejecuta verificación de timers manualmente (solo admin).
    En producción, esto se ejecuta automáticamente cada minuto.
    """
    result = await timer_service.run_all_checks()
    return result

@router.get("/matching/config", response_model=dict)
async def get_matching_config(current_user: dict = Depends(get_current_user)):
    """Obtener configuración del sistema de matching (requiere sesión)."""
    _ = current_user
    return MATCHING_CONFIG
