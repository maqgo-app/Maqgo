import uuid

from fastapi import APIRouter, HTTPException, Body, Depends, status, Request
from fastapi.responses import JSONResponse
from typing import List, Optional

from pydantic import BaseModel

from auth_dependency import get_current_user, get_current_admin_strict
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
from utils.rbac import has_permission
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError
from datetime import datetime, timezone

from db_config import get_db_name, get_mongo_url
import logging
from rate_limit import limiter

logger = logging.getLogger(__name__)

def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        s = str(value).strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _operator_gps_confirmed_for_accept(user: dict, req: dict) -> bool:
    if user.get("provider_role") != "operator":
        return False
    loc = req.get("confirmedDepartureLocation") or {}
    if str(loc.get("source") or "").lower() != "gps":
        return False
    if str(loc.get("confirmedByUserId") or "") != str(user.get("id") or ""):
        return False
    eta = req.get("etaCommitMinutes")
    if not isinstance(eta, int) or eta <= 0:
        return False
    eta_by = req.get("etaConfirmedByUserId")
    if eta_by and str(eta_by) != str(user.get("id") or ""):
        return False
    confirmed_at = _parse_iso_datetime(loc.get("confirmedAt")) or _parse_iso_datetime(req.get("etaConfirmedAt"))
    if not confirmed_at:
        return False
    age_sec = (datetime.now(timezone.utc) - confirmed_at).total_seconds()
    if age_sec < 0:
        age_sec = 0
    return age_sec <= 15 * 60

def _format_cl_phone_e164(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s.startswith("+"):
        return s
    digits = "".join([c for c in s if c.isdigit()])
    if not digits:
        return None
    if digits.startswith("56") and len(digits) >= 11:
        return f"+{digits}"
    if len(digits) == 9 and digits.startswith("9"):
        return f"+56{digits}"
    return f"+{digits}"


def _format_clp(amount: Optional[float]) -> str:
    try:
        n = float(amount or 0)
        return f"${int(round(n)):,}".replace(",", ".")
    except Exception:
        return "$0"


def _best_location_string(req: dict) -> str:
    loc = req.get("location")
    if isinstance(loc, dict):
        a = loc.get("address") or loc.get("name")
        if a:
            return str(a)
    if loc:
        return str(loc)
    for k in ("locationName", "location_name", "location_name_text", "address"):
        v = req.get(k)
        if v:
            return str(v)
    return "Ubicación no disponible"


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
# Nota: La creación de índices se movió a la tarea de inicio (lifespan) para evitar advertencias de corrutinas no esperadas.

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
        if payload.clientId and payload.clientId != current_user.get("id"):
            raise HTTPException(
                status_code=403,
                detail="Solo puedes crear solicitudes a tu nombre",
            )
        if not payload.workdayAccepted:
            raise HTTPException(
                status_code=400,
                detail="Debes aceptar la jornada de trabajo para continuar",
            )

        existing = await db.users.find_one({"id": payload.clientId}, {"_id": 0})
        if not existing and payload.clientEmail:
            await db.users.insert_one(
                {
                    "id": payload.clientId,
                    "email": payload.clientEmail,
                    "name": payload.clientName or "Cliente MAQGO",
                    "role": "client",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            logger.info("Usuario cliente creado: %s", payload.clientId)

        commissions = calculate_commissions(payload.basePrice, payload.transportFee)

        raw_bid = (payload.booking_id or "").strip()
        if not raw_bid:
            booking_id = str(uuid.uuid4())
            await record_legacy_booking_id_generated(
                db,
                "create",
                payload.clientId,
                booking_id,
                endpoint=str(req.url.path),
            )
        else:
            booking_id = raw_bid
            await record_booking_id_supplied(
                db, scope="create", endpoint=str(req.url.path)
            )

        dump = payload.model_dump()
        dump.pop("booking_id", None)
        create_data = {
            k: v
            for k, v in dump.items()
            if k
            not in (
                "transportFee",
                "clientEmail",
                "selectedProviderId",
                "selectedProviderIds",
                "totalAmount",
                "needsInvoice",
            )
        }
        create_data["bookingId"] = booking_id

        service_obj = ServiceRequest(**create_data)
        service_obj.status = "matching"
        service_obj.paymentStatus = "validated"

        if payload.totalAmount is not None and payload.totalAmount > 0:
            service_obj.totalAmount = float(payload.totalAmount)
        else:
            service_obj.totalAmount = commissions["totalAmount"]
        service_obj.basePrice = commissions["basePrice"]
        service_obj.clientCommission = commissions["clientCommission"]
        service_obj.providerCommission = commissions["providerCommission"]
        service_obj.providerEarnings = commissions["providerEarnings"]
        service_obj.maqgoEarnings = commissions["maqgoEarnings"]
        service_obj.events = []

        doc = service_obj.model_dump()
        await db.service_requests.insert_one(doc)

        chosen_id = payload.selectedProviderId
        if not chosen_id and payload.selectedProviderIds and len(payload.selectedProviderIds) > 0:
            chosen_id = payload.selectedProviderIds[0]
        matching_result = await start_matching(db, service_obj.id, selected_provider_id=chosen_id)

        try:
            if not await payment_intent_service.get_by_booking_id(booking_id):
                await payment_intent_service.create_if_absent(
                    booking_id=booking_id,
                    client_id=payload.clientId,
                    state=PI_PAYMENT_PENDING,
                )
            await payment_intent_service.set_state(
                booking_id,
                PI_PAYMENT_PENDING,
                last_idempotency_key=idempotency_key,
                service_request_id=service_obj.id,
            )
        except Exception as e:
            logger.warning("payment_intent update (non-fatal): %s", e)

        out = {
            "id": service_obj.id,
            "booking_id": booking_id,
            "status": matching_result.get("status", "matching"),
            "matching": matching_result,
            "paymentStatus": "validated",
            "message": "Buscando proveedor disponible...",
            "pricing": {
                "basePrice": commissions["basePrice"],
                "clientCommission": commissions["clientCommission"],
                "clientCommissionIVA": commissions["clientCommissionIVA"],
                "totalClient": service_obj.totalAmount,
                "providerCommission": commissions["providerCommission"],
                "providerCommissionIVA": commissions["providerCommissionIVA"],
                "providerEarnings": commissions["providerEarnings"],
                "maqgoEarnings": commissions["maqgoEarnings"],
            },
        }
        return 200, out

    code, payload = await run_idempotent(
        db,
        tenant_id=get_tenant_id(),
        idempotency_key=idempotency_key,
        scope="create",
        endpoint=str(req.url.path),
        body_for_hash=body_hash,
        execute=execute,
    )
    r = JSONResponse(content=payload, status_code=code)
    r.headers["X-Idempotency-Mode"] = idempotency_mode_header_value(key_legacy)
    return r

@router.get("", response_model=List[dict])
async def get_service_requests(
    service_status: Optional[str] = None,
    clientId: Optional[str] = None,
    providerId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Listado acotado al usuario autenticado (admin puede filtrar con cuidado)."""
    try:
        role = current_user.get("role")
        if role == "admin":
            query = {}
            if service_status:
                query["status"] = service_status
            if clientId:
                query["clientId"] = clientId
            if providerId:
                query["providerId"] = providerId
        elif role == "client":
            query = {"clientId": current_user.get("id")}
            if service_status:
                query["status"] = service_status
        else:
            ep = _effective_provider_account_id(current_user)
            if not ep:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Sin permiso para listar solicitudes",
                )
            base = {"$or": [{"providerId": ep}, {"currentOfferId": ep}]}
            if service_status:
                query = {"$and": [base, {"status": service_status}]}
            else:
                query = base
        requests = await db.service_requests.find(query, {"_id": 0}).to_list(1000)
        return requests
    except ServerSelectionTimeoutError:
        logger.warning("MongoDB no disponible en get_service_requests")
        return []

@router.get("/pending", response_model=List[dict])
@limiter.limit("60/minute")
async def get_pending_requests_for_provider(
    request: Request,
    providerId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Obtener solicitudes con ofertas pendientes para el proveedor.
    """
    try:
        now = datetime.now(timezone.utc)
        query = {"status": "offer_sent"}
        if current_user.get("role") == "admin":
            if providerId:
                query["currentOfferId"] = providerId
        else:
            effective_provider_id = _effective_provider_account_id(current_user)
            if not effective_provider_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Sin permiso para consultar ofertas",
                )
            if providerId and not _provider_matches_user(current_user, providerId):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="providerId no coincide con tu sesión",
                )
            query["currentOfferId"] = effective_provider_id
        requests = await db.service_requests.find(query, {"_id": 0}).to_list(100)
    except ServerSelectionTimeoutError:
        logger.warning("MongoDB no disponible en /pending")
        return []
    
    # Best practice: este endpoint debe ser "read-only".
    # La expiración de ofertas y el avance al siguiente proveedor la ejecuta el scheduler (TimerService),
    # no un GET llamado por polling desde el frontend.
    active_requests = []
    for req in requests:
        expires_at_str = req.get('offerExpiresAt')
        if expires_at_str:
            try:
                expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                if expires_at > now:
                    remaining = (expires_at - now).total_seconds()
                    req['remainingSeconds'] = max(0, int(remaining))
                    active_requests.append(req)
                else:
                    # Oferta expirada: se ignora aquí. El scheduler se encarga de expirar y re-match.
                    pass
            except:
                pass
    
    return active_requests


@router.get("/admin/active", response_model=List[dict])
async def admin_active_service_requests(
    limit: int = 200,
    current_admin: dict = Depends(get_current_admin_strict),
):
    statuses = ["matching", "offer_sent", "confirmed", "in_progress", "last_30"]
    q = {"status": {"$in": statuses}}
    reqs = await db.service_requests.find(q, {"_id": 0}).sort("createdAt", -1).to_list(max(1, min(limit, 500)))
    return reqs


@router.post("/{request_id}/admin/expire-offer", response_model=dict)
async def admin_expire_offer_now(
    request_id: str,
    current_admin: dict = Depends(get_current_admin_strict),
):
    req = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if req.get("status") != "offer_sent":
        raise HTTPException(status_code=409, detail="La solicitud no está en estado offer_sent")
    provider_id = req.get("currentOfferId")
    if not provider_id:
        raise HTTPException(status_code=409, detail="La solicitud no tiene currentOfferId activo")
    out = await handle_offer_expired(db, request_id, provider_id)
    return {"status": "ok", "result": out}


@router.post("/{request_id}/admin/retry-matching", response_model=dict)
async def admin_retry_matching(
    request_id: str,
    current_admin: dict = Depends(get_current_admin_strict),
):
    req = await db.service_requests.find_one({"id": request_id}, {"_id": 0, "status": 1})
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    out = await start_matching(db, request_id)
    return {"status": "ok", "result": out}

@router.get("/{request_id}", response_model=dict)
@limiter.limit("120/minute")
async def get_service_request(
    request: Request,
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Obtener una solicitud específica (cliente, proveedor involucrado o admin)."""
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_can_read_service(current_user, request)

    # Calcular tiempo restante si hay oferta activa
    if request.get('status') == 'offer_sent' and request.get('offerExpiresAt'):
        now = datetime.now(timezone.utc)
        try:
            expires_at = datetime.fromisoformat(request['offerExpiresAt'].replace('Z', '+00:00'))
            remaining = (expires_at - now).total_seconds()
            request['remainingSeconds'] = max(0, int(remaining))
        except:
            pass

    _attach_client_matching_view(request)
    
    return request


class ProviderIntentBody(BaseModel):
    departureLocation: dict
    etaMinutes: int


@router.post("/{request_id}/intent", response_model=dict)
async def provider_intent(
    request_id: str,
    body: ProviderIntentBody,
    current_user: dict = Depends(get_current_user),
):
    """
    Preconfirmación sin cobro (especialmente para Inicio hoy):
    - Confirma ubicación real de salida (coords)
    - Registra ETA comprometido (minutos)
    """
    req = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if req.get("status") != "offer_sent":
        raise HTTPException(status_code=400, detail="Esta solicitud ya no está disponible")

    if current_user.get("role") != "admin":
        ep = _effective_provider_account_id(current_user)
        if not ep or req.get("currentOfferId") != ep:
            raise HTTPException(status_code=403, detail="Sin permiso para confirmar esta oferta")

    loc = body.departureLocation or {}
    lat = loc.get("lat")
    lng = loc.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="departureLocation requiere lat y lng")

    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except Exception:
        raise HTTPException(status_code=400, detail="departureLocation lat/lng inválidos")

    eta = int(body.etaMinutes or 0)
    if eta <= 0:
        raise HTTPException(status_code=400, detail="etaMinutes inválido")

    now = datetime.now(timezone.utc)
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    confirmed_loc = {
        "lat": lat_f,
        "lng": lng_f,
        "address": loc.get("address") or "",
        "source": loc.get("source") or "manual",
        "confirmedAt": now.isoformat(),
        "confirmedByUserId": current_user.get("id"),
        "confirmedByRole": role,
    }

    await db.service_requests.update_one(
        {"id": request_id, "status": "offer_sent"},
        {
            "$set": {
                "providerIntentAt": now.isoformat(),
                "providerIntentByUserId": current_user.get("id"),
                "providerIntentByRole": role,
                "confirmedDepartureLocation": confirmed_loc,
                "etaCommitMinutes": eta,
                "etaConfirmedAt": now.isoformat(),
                "etaConfirmedByUserId": current_user.get("id"),
                "etaConfirmedByRole": role,
            }
        },
    )

    urgency_window = req.get("urgencyWindowMinutes")
    ready = True
    if str(req.get("reservationType") or "").lower() == "immediate":
        ready = bool(lat_f and lng_f and eta > 0)
        if isinstance(urgency_window, int) and urgency_window > 0:
            ready = ready and eta <= urgency_window

    return {
        "success": True,
        "readyForAccept": bool(ready),
        "confirmedDepartureLocation": confirmed_loc,
        "etaCommitMinutes": eta,
    }

@router.put("/{request_id}/accept", response_model=dict)
async def accept_service_request(
    request_id: str,
    req: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Proveedor acepta la solicitud.
    ESTO DISPARA EL COBRO AL CLIENTE.
    Idempotency-Key: resolve_idempotency_key(req, ...) (legacy si falta).
    """
    idempotency_key, key_legacy = resolve_idempotency_key(req, "accept")
    await persist_idempotency_key_resolution(
        db,
        scope="accept",
        endpoint=str(req.url.path),
        was_auto_generated=key_legacy,
        generated_key_prefix=idempotency_key if key_legacy else "",
    )

    provider_id = body.get("providerId")
    if current_user.get("role") != "admin":
        effective = _effective_provider_account_id(current_user)
        if effective:
            provider_id = effective
    if not provider_id:
        raise HTTPException(status_code=400, detail="providerId requerido")

    body_hash = {"request_id": request_id, "providerId": provider_id}

    async def execute() -> tuple[int, dict]:
        req = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
        if not req:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")

        reservation_type = str(req.get("reservationType") or "").lower()
        if reservation_type == "immediate":
            loc = req.get("confirmedDepartureLocation") or {}
            has_coords = loc.get("lat") is not None and loc.get("lng") is not None
            eta = req.get("etaCommitMinutes")
            if not has_coords or not isinstance(eta, int) or eta <= 0:
                raise HTTPException(
                    status_code=409,
                    detail="Antes de aceptar una solicitud inmediata debes confirmar ubicación de salida y tiempo de llegada.",
                )
            urgency_window = req.get("urgencyWindowMinutes")
            if isinstance(urgency_window, int) and urgency_window > 0 and eta > urgency_window:
                raise HTTPException(
                    status_code=409,
                    detail="El tiempo de llegada informado no cumple la urgencia del cliente.",
                )

        offered_provider_id = provider_id
        pending_ids = [
            a.get("providerId")
            for a in (req.get("matchingAttempts") or [])
            if a.get("status") == "pending"
        ]
        if offered_provider_id not in pending_ids:
            raise HTTPException(
                status_code=400,
                detail="No hay oferta pendiente para ti en esta solicitud",
            )
        if not _provider_matches_user(current_user, offered_provider_id):
            raise HTTPException(status_code=403, detail="Solo puedes aceptar ofertas dirigidas a ti")

        if req.get("status") != "offer_sent":
            raise HTTPException(status_code=400, detail="Esta solicitud ya no está disponible")

        provider_role = current_user.get("provider_role") or (
            "operator" if current_user.get("owner_id") else "super_master"
        )
        if current_user.get("role") != "admin":
            if provider_role == "operator":
                if not _operator_gps_confirmed_for_accept(current_user, req):
                    raise HTTPException(
                        status_code=403,
                        detail="Como operador, para aceptar debes tener GPS activo y confirmar ubicación/tiempo de llegada.",
                    )
            elif not has_permission(current_user, "accept_requests"):
                raise HTTPException(
                    status_code=403,
                    detail="Tu rol no tiene permisos para aceptar esta solicitud",
                )

        accepted_role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
        await db.service_requests.update_one(
            {"id": request_id, "status": "offer_sent"},
            {
                "$set": {
                    "acceptedByUserId": current_user.get("id"),
                    "acceptedByRole": accepted_role,
                }
            },
        )

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

            if provider_role == "operator" and current_user.get("owner_id"):
                owner = await db.users.find_one(
                    {"id": current_user.get("owner_id")},
                    {"_id": 0, "phone": 1, "name": 1},
                )
                owner_phone = _format_cl_phone_e164(owner.get("phone") if isinstance(owner, dict) else None)
                operator_name = str(current_user.get("name") or "").strip() or "Operador"
                eta_minutes = int(req.get("etaCommitMinutes") or 0)
                location_text = _best_location_string(req)
                amount_text = _format_clp(req.get("providerEarnings"))

                mirror_status = "skipped"
                mirror_error = None
                mirror_channel = "whatsapp"
                mirror_to = owner_phone or ""

                if owner_phone:
                    try:
                        from communications import notify_owner_operator_accepted

                        r_notify = notify_owner_operator_accepted(
                            owner_phone=owner_phone,
                            operator_name=operator_name,
                            location=location_text,
                            eta_minutes=eta_minutes,
                            amount=amount_text,
                            request_id=str(request_id),
                        )
                        if r_notify.get("success"):
                            mirror_status = "sent"
                        else:
                            mirror_status = "failed"
                            mirror_error = r_notify.get("error")
                    except Exception as e:
                        mirror_status = "failed"
                        mirror_error = str(e)
                else:
                    mirror_status = "failed"
                    mirror_error = "owner_phone_missing"

                now_iso = datetime.now(timezone.utc).isoformat()
                await db.service_requests.update_one(
                    {"id": request_id, "$or": [{"events": {"$exists": False}}, {"events": None}]},
                    {"$set": {"events": []}},
                )
                await db.service_requests.update_one(
                    {"id": request_id},
                    {
                        "$set": {
                            "ownerMirrorNotifiedAt": now_iso,
                            "ownerMirrorNotifiedChannel": mirror_channel,
                            "ownerMirrorNotifiedTo": mirror_to,
                            "ownerMirrorNotifiedStatus": mirror_status,
                            "ownerMirrorNotifiedError": mirror_error,
                        },
                        "$push": {
                            "events": {
                                "type": "owner_mirror_operator_accept",
                                "createdAt": now_iso,
                                "channel": mirror_channel,
                                "to": mirror_to,
                                "status": mirror_status,
                                "error": mirror_error,
                            }
                        },
                    },
                )
            booking_id = req.get("bookingId")
            if booking_id:
                try:
                    await payment_intent_service.set_state(
                        booking_id,
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
async def run_timer_check(_: dict = Depends(get_current_admin_strict)):
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
