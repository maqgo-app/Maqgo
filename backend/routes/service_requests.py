import uuid
import os

from fastapi import APIRouter, HTTPException, Body, Depends, status, Request
from fastapi.responses import JSONResponse
from typing import List, Optional

from pydantic import BaseModel

from auth_dependency import get_current_user, get_current_admin_strict
from models.service_request import ServiceRequestCreate, ServiceRequest
from pricing.calculator import calculate_official_service_economics, get_high_demand_bonus_percent
from pricing.business_rules import (
    INCIDENT_PROTECTED_WINDOW_MINUTES,
    INCIDENT_MAX_AUTO_COUNT,
    INCIDENT_MAX_PROTECTED_MINUTES_TOTAL,
    TODAY_MAX_ABSOLUTE_DELAY_HOURS,
    TODAY_CANCEL_AFTER_ACCEPT_PERCENT,
    cancellation_fee_from_percent,
    scheduled_cancellation_percent,
    today_committed_time_utc,
)
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
from datetime import datetime, timezone, timedelta

from db_config import get_db_name, get_mongo_url
import logging
from rate_limit import limiter
import time

logger = logging.getLogger(__name__)
_offer_expires_warned_at = {}

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


async def _attach_approx_provider_location(viewer: dict, req: dict) -> None:
    role = viewer.get("role")
    if role not in ("admin", "client"):
        return

    provider_id = req.get("providerId") or req.get("currentOfferId")
    if not provider_id:
        return

    if role == "client":
        if str(req.get("clientId") or "") != str(viewer.get("id") or ""):
            return
        if str(req.get("status") or "") not in ("confirmed", "in_progress", "last_30", "finished", "rated"):
            return
        provider_id = req.get("providerId")
        if not provider_id:
            return

    provider = await db.users.find_one(
        {"id": str(provider_id)},
        {"_id": 0, "location": 1, "locationUpdatedAt": 1, "locationSource": 1},
    )
    if not isinstance(provider, dict):
        return

    loc = provider.get("location")
    if not isinstance(loc, dict) or loc.get("lat") is None or loc.get("lng") is None:
        return

    updated_at = provider.get("locationUpdatedAt")
    dt = updated_at if isinstance(updated_at, datetime) else _parse_iso_datetime(str(updated_at) if updated_at else None)
    now = datetime.now(timezone.utc)
    age_min = None
    if dt:
        age_min = max(0, int((now - dt).total_seconds() // 60))

    freshness = "unknown"
    if age_min is not None:
        if age_min <= 24 * 60:
            freshness = "ok"
        elif age_min > 72 * 60:
            freshness = "stale"
        else:
            freshness = "aging"

    dist_km = None
    try:
        rloc = req.get("location") if isinstance(req.get("location"), dict) else {}
        rlat = rloc.get("lat")
        rlng = rloc.get("lng")
        if rlat is not None and rlng is not None:
            meters = haversine_meters(float(loc.get("lat")), float(loc.get("lng")), float(rlat), float(rlng))
            dist_km = round(float(meters or 0) / 1000.0, 1)
    except Exception:
        dist_km = None

    req["approxProviderLocation"] = {
        "lat": float(loc.get("lat")),
        "lng": float(loc.get("lng")),
        "source": str(provider.get("locationSource") or ""),
        "updatedAt": dt.isoformat() if dt else None,
        "ageMinutes": age_min,
        "freshness": freshness,
        "distanceToServiceKm": dist_km,
    }

async def _notify_push_client_event(
    request_id: str,
    client_id: Optional[str],
    kind: str,
    extra: Optional[dict] = None,
) -> None:
    if not client_id:
        return
    try:
        from services.webpush_service import notify_service_event

        res = await notify_service_event(
            db=db,
            client_id=str(client_id),
            service_request_id=str(request_id),
            kind=str(kind),
            extra=extra,
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.service_requests.update_one(
            {"id": request_id},
            {
                "$push": {
                    "events": {
                        "type": "client_push_status",
                        "createdAt": now_iso,
                        "kind": str(kind),
                        "sent": int(res.get("sent", 0) or 0),
                        "skipped": int(res.get("skipped", 0) or 0),
                    }
                }
            },
        )

        try:
            from services.notification_items_service import record_delivery, upsert_notification_item

            item = await upsert_notification_item(
                db,
                recipient_user_id=str(client_id),
                audience_role='client',
                service_request_id=str(request_id),
                kind=str(kind),
                extra=extra,
                pinned=str(kind).strip().lower() in {'arrival', 'incident', 'finished'},
            )
            await record_delivery(
                db,
                notification_id=item['id'],
                channel='push_web',
                status='sent' if int(res.get('sent', 0) or 0) > 0 else 'skipped',
                meta={'sent': int(res.get('sent', 0) or 0), 'skipped': int(res.get('skipped', 0) or 0)},
            )

            k = str(kind or '').strip().lower()
            sms_fallback_enabled = os.environ.get('MAQGO_SMS_FALLBACK_ENABLED', 'true').lower() == 'true'
            should_fallback_to_sms = sms_fallback_enabled and k in {'arrival', 'incident'} and int(res.get('sent', 0) or 0) <= 0

            if should_fallback_to_sms:
                try:
                    already_sent = await db.notification_deliveries.find_one(
                        {'notificationId': item['id'], 'channel': 'sms', 'status': 'sent'},
                        {'_id': 0, 'id': 1},
                    )
                    if already_sent:
                        return

                    client_doc = await db.users.find_one({'id': str(client_id)}, {'_id': 0, 'phone': 1})
                    phone = _format_cl_phone_e164(client_doc.get('phone') if isinstance(client_doc, dict) else None)
                    if not phone:
                        await record_delivery(
                            db,
                            notification_id=item['id'],
                            channel='sms',
                            status='skipped',
                            meta={'reason': 'missing_phone'},
                        )
                        return

                    if k == 'arrival':
                        sms_text = 'MAQGO: El operador marcó llegada. Autoriza el ingreso en la app.'
                    else:
                        sms_text = 'MAQGO: El operador reportó una demora/incidente. Revisa el estado en la app.'

                    from services.otp_service import send_sms as send_sms_raw

                    ok, err = send_sms_raw(phone, sms_text)
                    await record_delivery(
                        db,
                        notification_id=item['id'],
                        channel='sms',
                        status='sent' if ok else 'failed',
                        meta={'error': err} if err else {},
                    )

                    try:
                        await db.service_requests.update_one(
                            {'id': request_id},
                            {
                                '$push': {
                                    'events': {
                                        'type': 'client_sms_fallback_status',
                                        'createdAt': datetime.now(timezone.utc).isoformat(),
                                        'kind': k,
                                        'status': 'sent' if ok else 'failed',
                                        'error': err,
                                    }
                                }
                            },
                        )
                    except Exception:
                        pass
                except Exception:
                    pass
        except Exception:
            pass
    except Exception as e:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.service_requests.update_one(
                {"id": request_id},
                {
                    "$push": {
                        "events": {
                            "type": "client_push_status",
                            "createdAt": now_iso,
                            "kind": str(kind),
                            "sent": 0,
                            "skipped": 0,
                            "error": str(e),
                        }
                    }
                },
            )
        except Exception:
            pass


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
    attempts = req.get("matchingAttempts") or []
    if isinstance(attempts, list):
        for a in attempts:
            if not isinstance(a, dict):
                continue
            if a.get("status") != "pending":
                continue
            if _provider_matches_user(user, a.get("providerId")):
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
    operatorId: Optional[str] = None
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

    if str(user.get("provider_role") or "").strip().lower() == "operator":
        operator_id = str(req.get("operator_id") or req.get("operatorId") or "").strip()
        if operator_id and operator_id != str(user.get("id") or "").strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el operador asignado puede realizar esta acción",
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

        bonus_percent = get_high_demand_bonus_percent(
            urgency_window_minutes=payload.urgencyWindowMinutes,
            scheduled_date_iso=payload.scheduledDate,
        )
        service_value = float(payload.basePrice or 0)

        transport_value = float(payload.transportFee or 0)
        try:
            from pricing.constants import MACHINERY_NO_TRANSPORT
            from services.machines_service import compute_transport_amount

            needs_transport = str(payload.machineryType or '').strip() not in set(MACHINERY_NO_TRANSPORT)
            machine_id = payload.machineId or payload.machine_id
            machine_doc = None
            if machine_id:
                machine_doc = await db.machines.find_one({"id": str(machine_id)}, {"_id": 0})
            if needs_transport and machine_doc:
                loc = payload.location.model_dump() if hasattr(payload.location, 'model_dump') else {}
                quote = compute_transport_amount(
                    machine=machine_doc,
                    provider=None,
                    service_location={
                        **loc,
                        'comuna': loc.get('comuna') or '',
                        'region': loc.get('region') or '',
                    },
                )
                transport_value = float(quote.get('amount') or 0)
            if not needs_transport:
                transport_value = 0.0
        except Exception:
            pass
        high_demand_bonus = float(service_value * bonus_percent)
        economic = calculate_official_service_economics(
            service_value=service_value,
            high_demand_bonus=high_demand_bonus,
            transport=transport_value,
        )

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
        selected_machine_id = create_data.get("machineId") or create_data.get("machine_id")
        if selected_machine_id:
            create_data["machineId"] = str(selected_machine_id)
            create_data["machine_id"] = str(selected_machine_id)
        create_data["bookingId"] = booking_id

        now_iso = datetime.now(timezone.utc).isoformat()
        service_obj = ServiceRequest(**create_data)
        service_obj.status = "matching"
        service_obj.paymentStatus = "validated"

        service_obj.economic = economic
        service_obj.basePrice = float(economic["client"]["service_value"])
        service_obj.totalAmount = float(economic["client"]["total_invoice"])
        service_obj.clientCommission = float(economic["client"]["maqgo_service_fee"])
        service_obj.providerCommission = float(economic["client"]["maqgo_service_fee"])
        service_obj.providerEarnings = float(economic["provider"]["total_provider_invoice"])
        service_obj.maqgoEarnings = float(economic["provider"]["maqgo_total_retained"])
        service_obj.events = [
            {
                "type": "created",
                "at": now_iso,
                "byUserId": current_user.get("id"),
                "byRole": current_user.get("role"),
            }
        ]

        doc = service_obj.model_dump()
        await db.service_requests.insert_one(doc)

        chosen_ids = []
        if payload.selectedProviderId:
            chosen_ids.append(payload.selectedProviderId)
        if payload.selectedProviderIds and len(payload.selectedProviderIds) > 0:
            chosen_ids.extend(list(payload.selectedProviderIds))
        chosen_ids = [str(x).strip() for x in chosen_ids if x is not None and str(x).strip()]
        dedup = []
        seen = set()
        for cid in chosen_ids:
            if cid not in seen:
                seen.add(cid)
                dedup.append(cid)
        chosen_ids = dedup

        matching_result = await start_matching(
            db,
            service_obj.id,
            selected_provider_ids=chosen_ids if chosen_ids else None,
        )

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
                "serviceValue": economic["client"]["service_value"],
                "highDemandBonus": economic["client"]["high_demand_bonus"],
                "transport": economic["client"]["transport"],
                "maqgoServiceFee": economic["client"]["maqgo_service_fee"],
                "subtotal": economic["client"]["subtotal"],
                "iva": economic["client"]["iva"],
                "totalClientInvoice": economic["client"]["total_invoice"],
                "providerInvoiceTotal": economic["provider"]["total_provider_invoice"],
            },
            "economic": economic,
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
            base = {
                "$or": [
                    {"providerId": ep},
                    {"currentOfferId": ep},
                    {"matchingAttempts": {"$elemMatch": {"providerId": ep, "status": "pending"}}},
                ]
            }
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
                query["matchingAttempts"] = {
                    "$elemMatch": {"providerId": providerId, "status": "pending"}
                }
        else:
            if str(current_user.get("provider_role") or "").strip().lower() == "operator":
                return []
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
            query["matchingAttempts"] = {
                "$elemMatch": {"providerId": effective_provider_id, "status": "pending"}
            }
        requests = await (
            db.service_requests.find(query, {"_id": 0}).sort("offerSentAt", -1).to_list(100)
        )
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


@router.get("/operator/assigned", response_model=List[dict])
@limiter.limit("60/minute")
async def get_assigned_requests_for_operator(
    request: Request,
    activeOnly: bool = True,
    current_user: dict = Depends(get_current_user),
):
    if str(current_user.get("role") or "").strip().lower() == "admin":
        raise HTTPException(status_code=403, detail="Ruta no disponible para admin")
    if str(current_user.get("provider_role") or "").strip().lower() != "operator":
        raise HTTPException(status_code=403, detail="Ruta solo para operador")
    operator_id = str(current_user.get("id") or "").strip()
    if not operator_id:
        raise HTTPException(status_code=401, detail="Sesión inválida")

    statuses = ["confirmed", "en_route", "in_progress", "last_30"] if activeOnly else None
    q: dict = {"operator_id": operator_id}
    if statuses:
        q["status"] = {"$in": statuses}
    reqs = await db.service_requests.find(q, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return reqs


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
    sr = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not sr:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_can_read_service(current_user, sr)

    # Calcular tiempo restante si hay oferta activa
    if sr.get('status') == 'offer_sent' and sr.get('offerExpiresAt'):
        now = datetime.now(timezone.utc)
        expires_at = _parse_iso_datetime(sr.get('offerExpiresAt'))
        if expires_at:
            remaining = (expires_at - now).total_seconds()
            sr['remainingSeconds'] = max(0, int(remaining))
        else:
            last = _offer_expires_warned_at.get(request_id)
            now_ts = time.time()
            if not last or (now_ts - float(last)) >= 600:
                _offer_expires_warned_at[request_id] = now_ts
                logger.warning(
                    "offerExpiresAt inválido; request_id=%s offerExpiresAt=%s",
                    request_id,
                    str(sr.get('offerExpiresAt')),
                )

    _attach_client_matching_view(sr)
    await _attach_approx_provider_location(current_user, sr)
    
    return sr


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
        if str(current_user.get("provider_role") or "").strip().lower() == "operator":
            raise HTTPException(status_code=403, detail="Como operador no puedes confirmar ofertas")
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
            ,
            "$push": {
                "events": {
                    "type": "provider_intent",
                    "at": now.isoformat(),
                    "byUserId": current_user.get("id"),
                    "byRole": role,
                    "etaCommitMinutes": eta,
                }
            },
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
                raise HTTPException(
                    status_code=403,
                    detail="Como operador no puedes aceptar solicitudes",
                )
            if not has_permission(current_user, "accept_requests"):
                raise HTTPException(
                    status_code=403,
                    detail="Tu rol no tiene permisos para aceptar esta solicitud",
                )

        now_iso = datetime.now(timezone.utc).isoformat()
        accepted_role = current_user.get("provider_role") or (
            "operator" if current_user.get("owner_id") else "super_master"
        )
        await db.service_requests.update_one(
            {"id": request_id, "status": "offer_sent"},
            {
                "$set": {
                    "acceptedByUserId": current_user.get("id"),
                    "acceptedByRole": accepted_role,
                    "acceptedAt": now_iso,
                }
                ,
                "$push": {
                    "events": {
                        "type": "accepted",
                        "at": now_iso,
                        "byUserId": current_user.get("id"),
                        "byRole": accepted_role,
                        "providerId": offered_provider_id,
                    }
                },
            },
        )

        result = await handle_offer_response(
            db,
            request_id,
            offered_provider_id,
            accepted=True,
            by_user_id=current_user.get("id"),
            by_role=accepted_role,
            source="api_accept",
        )

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

            await _notify_push_client_event(
                request_id=request_id,
                client_id=req.get("clientId"),
                kind="confirmed",
            )
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
    """Cancelación por cliente."""
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
    cancellable = status in ['matching', 'offer_sent', 'confirmed', 'en_route', 'in_progress', 'last_30']

    if not cancellable:
        raise HTTPException(
            status_code=400,
            detail="No se puede cancelar en el estado actual del servicio"
        )

    arrival_loc = request.get("arrivalLocation") if isinstance(request.get("arrivalLocation"), dict) else {}
    arrival_verified = bool(arrival_loc.get("verified") is True)

    st_lower = str(request.get("status") or "").strip().lower()
    service_started = bool(
        request.get("startedAt")
        or st_lower in {"in_progress", "last_30"}
    )
    arrival_confirmed = bool(
        (request.get("arrivalDetectedAt") and arrival_verified)
        or request.get("clientEntryConfirmedAt")
        or (request.get("autoStartedAt") and arrival_verified)
    )

    now = datetime.now(timezone.utc)

    total_client = float(request.get("totalAmount", 0))
    total_client_int = int(round(total_client))

    base_cancel_event = {
        "at": now.isoformat(),
        "byUserId": current_user.get("id"),
        "byRole": current_user.get("role"),
        "fromStatus": status,
    }

    fee_percent = 0.0

    if status in ['matching', 'offer_sent']:
        new_status = 'cancelled_client'
        cancelation_fee = 0
        refund_amount = 0
        cancel_event = {"type": "cancelled_client", **base_cancel_event}
    else:
        reservation_type = str(request.get('reservationType') or '').strip().lower()
        scheduled_date_raw = request.get('scheduledDate')
        is_scheduled = reservation_type == 'scheduled' or bool(scheduled_date_raw)

        if service_started or arrival_confirmed:
            fee_percent = 1.0
        elif is_scheduled:
            scheduled_dt = _parse_iso_datetime(scheduled_date_raw)
            hours_until_start = None
            if scheduled_dt:
                hours_until_start = (scheduled_dt - now).total_seconds() / 3600
            fee_percent = scheduled_cancellation_percent(hours_until_start=hours_until_start)
        else:
            committed_dt = today_committed_time_utc(
                eta_confirmed_at=request.get('etaConfirmedAt'),
                eta_commit_minutes=request.get('etaCommitMinutes'),
                confirmed_at=request.get('confirmedAt'),
                accepted_at=request.get('acceptedAt'),
                created_at=request.get('createdAt'),
            )
            limit_exceeded = False
            if committed_dt:
                limit_exceeded = now >= (committed_dt + timedelta(hours=TODAY_MAX_ABSOLUTE_DELAY_HOURS))
            if limit_exceeded:
                fee_percent = 0.0
            else:
                fee_percent = float(TODAY_CANCEL_AFTER_ACCEPT_PERCENT)

        fee = cancellation_fee_from_percent(total_client_int, fee_percent)
        cancelation_fee = int(fee.get("fee_amount") or 0)
        if cancelation_fee < 0:
            cancelation_fee = 0
        if cancelation_fee > total_client_int:
            cancelation_fee = total_client_int
        refund_amount = total_client_int - cancelation_fee

        if cancelation_fee > 0:
            new_status = 'cancelled_with_fee'
            cancel_event = {
                "type": "cancel_with_fee",
                **base_cancel_event,
                "newStatus": new_status,
                "lateFeeAmount": cancelation_fee,
                "refundAmount": refund_amount,
                "cancellationFeePercent": fee_percent,
            }
        else:
            cancelation_fee = 0
            new_status = 'cancelled_client'
            cancel_event = {"type": "cancelled_client", **base_cancel_event, "newStatus": new_status}

    update_data = {
        'status': new_status,
        'late_fee_amount': cancelation_fee,
        'cancelationFee': cancelation_fee if cancelation_fee > 0 else None,
        'cancellationFeePercent': float(fee_percent) if cancelation_fee > 0 else 0.0,
        'cancellation_reason': body.get('reason'),
        'cancelled_at': now.isoformat(),
    }

    refund_request_result = None
    if refund_amount > 0:
        # Devolución: solicitud → aprobación admin → Transbank
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

    mongo_update = {'$set': update_data, '$push': {'events': cancel_event}}

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
        'cancellation_fee_percent': float(fee_percent) if cancelation_fee > 0 else 0.0,
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

    provider_id = body.get('providerId')
    if current_user.get("role") != "admin":
        if str(current_user.get("provider_role") or "").strip().lower() == "operator":
            raise HTTPException(status_code=403, detail="Como operador no puedes rechazar solicitudes")
        effective = _effective_provider_account_id(current_user)
        if effective:
            provider_id = effective
    if not provider_id:
        provider_id = request.get('currentOfferId')
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
    
    role = current_user.get("provider_role") or (
        "operator" if current_user.get("owner_id") else "super_master"
    )
    if current_user.get("role") == "admin":
        role = "admin"

    result = await handle_offer_response(
        db,
        request_id,
        provider_id,
        accepted=False,
        by_user_id=current_user.get("id"),
        by_role=role,
        source="api_reject",
    )
    
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
    if str(current_user.get("provider_role") or "").strip().lower() == "operator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Como operador no puedes asignar operador",
        )
    st = (req.get("status") or "").lower()
    if st not in ("confirmed", "en_route", "in_progress", "last_30"):
        raise HTTPException(
            status_code=400,
            detail="Estado no permite actualizar operador",
        )

    nombre = (body.nombre or "").strip()
    apellido = (body.apellido or "").strip()
    rut_raw = body.rut
    rut = rut_raw.strip() if rut_raw else ""

    update: dict = {}
    operator_id = str(body.operatorId or '').strip()
    if operator_id:
        operator = await db.users.find_one({"id": operator_id}, {"_id": 0, "id": 1, "provider_role": 1, "owner_id": 1, "name": 1, "rut": 1})
        if not operator or str(operator.get("provider_role") or '').strip().lower() != 'operator':
            raise HTTPException(status_code=400, detail="Operador inválido")
        if str(operator.get("owner_id") or '').strip() != str(req.get("providerId") or '').strip():
            raise HTTPException(status_code=403, detail="El operador no pertenece a esta empresa")
        update["operator_id"] = operator_id
    if nombre:
        update["operatorFirstName"] = nombre
    if apellido:
        update["operatorLastName"] = apellido
    if rut:
        update["operatorRut"] = rut
    if nombre or apellido:
        update["providerOperatorName"] = f"{nombre} {apellido}".strip()

    if operator_id:
        if not rut:
            op_rut = str(operator.get("rut") or '').strip()
            if op_rut:
                update.setdefault("operatorRut", op_rut)
        if not (nombre or apellido):
            op_name = str(operator.get("name") or '').strip()
            if op_name:
                parts = [p for p in op_name.split(' ') if p]
                if parts:
                    update.setdefault("operatorFirstName", parts[0])
                    if len(parts) > 1:
                        update.setdefault("operatorLastName", ' '.join(parts[1:]))
                update.setdefault("providerOperatorName", op_name)

    if not update:
        return {"success": True, "message": "Sin cambios"}

    now = datetime.now(timezone.utc)
    if operator_id:
        update["operator_assigned_at"] = now.isoformat()
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    event = {
        "type": "assigned_operator_updated",
        "at": now.isoformat(),
        "byUserId": current_user.get("id"),
        "byRole": role,
        **update,
    }
    await db.service_requests.update_one(
        {"id": request_id},
        {"$set": update, "$push": {"events": event}},
    )
    return {"success": True}


@router.post("/{request_id}/mark-arrival", response_model=dict)
async def mark_arrival(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """
    Proveedor marca llegada (GPS o manual).
    Distancia máxima 300m desde jobLocation cuando hay coordenadas.
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
    source = str(body.get("source") or body.get("locationSource") or "gps").strip().lower()
    force_manual = bool(body.get("forceManual") or body.get("force_manual") or False)

    now = datetime.now(timezone.utc)
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")

    if lat is None or lng is None:
        arrival_location = {
            "capturedAt": now.isoformat(),
            "source": "manual",
            "verified": True,
        }
        arrival_event = {
            "type": "arrival",
            "at": now.isoformat(),
            "verified": True,
            "source": "manual",
            "byUserId": current_user.get("id"),
            "byRole": role,
        }
        await db.service_requests.update_one(
            {"id": request_id},
            {
                "$set": {
                    "arrivalDetectedAt": now.isoformat(),
                    "arrivalLocation": arrival_location,
                },
                "$push": {"events": arrival_event},
            },
        )
        await _notify_push_client_event(
            request_id=request_id,
            client_id=request.get("clientId"),
            kind="arrival",
        )
        return {"success": True, "arrivalDetectedAt": now.isoformat(), "verified": True, "source": "manual"}

    lat = float(lat)
    lng = float(lng)
    distance_meters = haversine_meters(job_lat, job_lng, lat, lng)

    verified = distance_meters <= 300
    if not verified and source == "gps" and not force_manual:
        raise HTTPException(
            status_code=400,
            detail=f"Ubicación fuera de rango. Distancia: {distance_meters:.0f}m (máx 300m)"
        )

    arrival_location = {
        'lat': lat,
        'lng': lng,
        'capturedAt': now.isoformat(),
        'distanceMeters': round(distance_meters, 2),
        "source": source if source else "gps",
        "verified": bool(verified),
    }

    arrival_event = {
        "type": "arrival",
        "at": now.isoformat(),
        "verified": bool(verified),
        "source": source if source else "gps",
        "byUserId": current_user.get("id"),
        "byRole": role,
    }
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

    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId"),
        kind="arrival",
    )
    return {
        'success': True,
        'distanceMeters': round(distance_meters, 2),
        'arrivalDetectedAt': now.isoformat(),
        "verified": bool(verified),
        "source": source if source else "gps",
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

    if str(current_user.get("provider_role") or "").strip().lower() == "operator":
        raise HTTPException(status_code=403, detail="Como operador no puedes iniciar el servicio")

    now = datetime.now(timezone.utc)
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    started_event = {
        "type": "started",
        "at": now.isoformat(),
        "byUserId": current_user.get("id"),
        "byRole": role,
    }
    result = await db.service_requests.update_one(
        {'id': request_id, 'status': {'$in': ['confirmed', 'en_route']}},
        {
            "$set": {
                "status": "in_progress",
                "startedAt": now.isoformat(),
                "startedByUserId": current_user.get("id"),
                "startedByRole": role,
            },
            "$push": {"events": started_event},
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Servicio no disponible para iniciar")

    hours = int(request.get("workdayHours") or request.get("totalDurationHours") or 0)
    if hours <= 0:
        hours = 8
    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId"),
        kind="started",
    )
    return {'message': 'Servicio iniciado', 'status': 'in_progress'}


@router.post("/{request_id}/auto-start", response_model=dict)
async def auto_start_service(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, request)

    if str(current_user.get("provider_role") or "").strip().lower() == "operator":
        raise HTTPException(status_code=403, detail="Como operador no puedes iniciar el servicio")

    status_now = str(request.get("status") or "").strip()
    if status_now == "in_progress":
        return {"success": True, "status": "in_progress", "already_started": True}

    if status_now not in {"confirmed", "en_route"}:
        raise HTTPException(status_code=400, detail="Servicio no disponible para auto-inicio")

    arrival_dt = _parse_iso_datetime(request.get("arrivalDetectedAt"))
    if not arrival_dt:
        raise HTTPException(status_code=400, detail="El operador aún no ha marcado llegada")

    arrival_location = request.get("arrivalLocation") or {}
    if arrival_location.get("verified") is not True:
        raise HTTPException(status_code=400, detail="La llegada debe estar verificada para auto-inicio")

    now = datetime.now(timezone.utc)
    if now < (arrival_dt + timedelta(minutes=30)):
        raise HTTPException(status_code=409, detail="Aún no corresponde auto-inicio")

    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    event = {
        "type": "auto_start",
        "at": now.isoformat(),
        "triggeredByUserId": current_user.get("id"),
        "triggeredByRole": role,
        "source": "provider_app",
    }

    result = await db.service_requests.update_one(
        {"id": request_id, "status": {"$in": ["confirmed", "en_route"]}},
        {
            "$set": {
                "status": "in_progress",
                "autoStartedAt": now.isoformat(),
                "autoStartClientNoticePendingAt": now.isoformat(),
                "startedAt": now.isoformat(),
                "startedByRole": "system",
            },
            "$push": {"events": event},
        },
    )
    if result.matched_count == 0:
        fresh = await db.service_requests.find_one({"id": request_id}, {"_id": 0, "status": 1})
        if (fresh or {}).get("status") == "in_progress":
            return {"success": True, "status": "in_progress", "already_started": True}
        raise HTTPException(status_code=400, detail="Servicio no disponible para auto-inicio")

    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId"),
        kind="started",
        extra={"source": "auto_start"},
    )
    return {"success": True, "status": "in_progress"}


@router.post("/{request_id}/confirm-entry", response_model=dict)
async def confirm_entry(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if request.get("clientId") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Solo el cliente puede confirmar el ingreso")

    if not request.get("arrivalDetectedAt"):
        raise HTTPException(status_code=400, detail="El operador aún no ha marcado llegada")

    now = datetime.now(timezone.utc)
    confirmed_at = request.get("clientEntryConfirmedAt")
    if confirmed_at:
        return {"success": True, "already_confirmed": True}

    event = {
        "type": "client_entry_confirmed",
        "at": now.isoformat(),
        "byUserId": current_user.get("id"),
        "byRole": "client",
    }

    update: dict = {
        "clientEntryConfirmedAt": now.isoformat(),
        "clientEntryConfirmedByUserId": current_user.get("id"),
    }

    raw_start = body.get("startNow") if "startNow" in body else body.get("start_now")
    if raw_start is None:
        start_now = True
    else:
        t = str(raw_start).strip().lower()
        start_now = t in {"1", "true", "yes", "y", "on"}
    if start_now and request.get("status") in {"confirmed", "en_route"}:
        update.update(
            {
                "status": "in_progress",
                "startedAt": now.isoformat(),
                "startedByUserId": current_user.get("id"),
                "startedByRole": "client",
            }
        )

    await db.service_requests.update_one(
        {"id": request_id},
        {"$set": update, "$push": {"events": event}},
    )

    provider_id = str(request.get("providerId") or "").strip()
    if provider_id:
        try:
            from services.webpush_service import notify_user

            await notify_user(
                db=db,
                user_id=provider_id,
                title="Ingreso autorizado",
                body=f"El cliente autorizo el ingreso en el servicio {request_id}.",
                url="/provider/arrival",
                tag=f"sr:{request_id}",
            )
        except Exception:
            pass

    if update.get("status") == "in_progress":
        await _notify_push_client_event(
            request_id=request_id,
            client_id=request.get("clientId"),
            kind="started",
            extra={"source": "client_entry_confirmed"},
        )

    return {"success": True, "status": update.get("status") or request.get("status")}


@router.post("/{request_id}/report-incident", response_model=dict)
async def report_incident(
    request_id: str,
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, request)

    reason = str(body.get("reason") or body.get("incidentReason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason requerido")
    if len(reason) > 200:
        reason = reason[:200]

    if request.get("activeIncident"):
        raise HTTPException(status_code=409, detail="Ya existe un incidente activo")

    stats = request.get("incidentStats") or {}
    try:
        auto_count = int(stats.get("autoCount") or 0)
    except Exception:
        auto_count = 0
    try:
        allocated_total = float(stats.get("protectedMinutesAllocatedTotal") or 0)
    except Exception:
        allocated_total = 0.0

    if auto_count >= INCIDENT_MAX_AUTO_COUNT or allocated_total >= INCIDENT_MAX_PROTECTED_MINUTES_TOTAL:
        raise HTTPException(
            status_code=409,
            detail="Incidente adicional requiere revisión manual MAQGO",
        )

    remaining = INCIDENT_MAX_PROTECTED_MINUTES_TOTAL - allocated_total
    minutes_i = int(min(float(INCIDENT_PROTECTED_WINDOW_MINUTES), float(remaining)))
    if minutes_i <= 0:
        raise HTTPException(
            status_code=409,
            detail="Incidente adicional requiere revisión manual MAQGO",
        )

    now = datetime.now(timezone.utc)
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    incident = {
        "reason": reason,
        "reportedAt": now.isoformat(),
        "reportedByUserId": current_user.get("id"),
        "reportedByRole": role,
        "protectedWindowMinutes": minutes_i,
        "protectedWindowEnd": (now + timedelta(minutes=minutes_i)).isoformat(),
    }
    event = {"type": "incident", "at": now.isoformat(), "reason": reason, "byRole": role}
    await db.service_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "activeIncident": incident,
                "incidentStats": {
                    **stats,
                    "autoCount": auto_count + 1,
                    "protectedMinutesAllocatedTotal": float(allocated_total) + float(minutes_i),
                },
            },
            "$push": {"events": event},
        },
    )
    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId"),
        kind="incident",
        extra={"reason": reason},
    )
    return {"success": True, "activeIncident": incident}


@router.delete("/{request_id}/incident", response_model=dict)
async def clear_incident(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    request = await db.service_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_assigned_provider(current_user, request)
    now = datetime.now(timezone.utc)
    role = current_user.get("provider_role") or ("operator" if current_user.get("owner_id") else "super_master")
    event = {"type": "incident_cleared", "at": now.isoformat(), "byRole": role}

    active = request.get("activeIncident") or {}
    reported_at = _parse_iso_datetime(active.get("reportedAt"))
    protected_end = _parse_iso_datetime(active.get("protectedWindowEnd"))
    protected_minutes = active.get("protectedWindowMinutes")
    try:
        protected_minutes_i = int(protected_minutes)
    except Exception:
        protected_minutes_i = INCIDENT_PROTECTED_WINDOW_MINUTES

    used_minutes = 0.0
    if reported_at and protected_end and now > reported_at:
        used_minutes = (min(now, protected_end) - reported_at).total_seconds() / 60
        if used_minutes < 0:
            used_minutes = 0.0

    if used_minutes > float(protected_minutes_i):
        used_minutes = float(protected_minutes_i)

    stats = request.get("incidentStats") or {}
    try:
        used_total = float(stats.get("protectedMinutesUsedTotal") or 0)
    except Exception:
        used_total = 0.0

    history_item = {
        "reason": active.get("reason"),
        "reportedAt": active.get("reportedAt"),
        "clearedAt": now.isoformat(),
        "protectedWindowEnd": active.get("protectedWindowEnd"),
        "protectedWindowMinutes": protected_minutes_i,
        "protectedMinutesUsed": round(float(used_minutes), 2),
        "clearedByUserId": current_user.get("id"),
        "clearedByRole": role,
    }

    await db.service_requests.update_one(
        {"id": request_id},
        {
            "$unset": {"activeIncident": ""},
            "$set": {
                "incidentStats": {
                    **stats,
                    "protectedMinutesUsedTotal": round(float(used_total) + float(used_minutes), 2),
                }
            },
            "$push": {"events": event, "incidentHistory": history_item},
        },
    )
    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId"),
        kind="incident_cleared",
    )
    return {"success": True}

@router.put("/{request_id}/finish", response_model=dict)
async def finish_service(
    request_id: str,
    body: dict = Body(default={}),
    current_admin: dict = Depends(get_current_admin_strict),
):
    now = datetime.now(timezone.utc)
    role = "admin"
    finished_event = {
        "type": "finished",
        "at": now.isoformat(),
        "byUserId": current_admin.get("id"),
        "byRole": "admin",
        "source": "admin_override",
    }

    override_reason = None
    if isinstance(body, dict):
        override_reason = body.get("reason")
    if override_reason is not None:
        override_reason = str(override_reason).strip()
        if not override_reason:
            override_reason = None

    override_event = {
        "type": "finished_override",
        "at": now.isoformat(),
        "byUserId": current_admin.get("id"),
        "reason": override_reason,
    }

    update_data = {
        'status': 'finished',
        'finishedAt': now.isoformat(),
        "finishedByUserId": current_admin.get("id"),
        "finishedByRole": role,
        "finishedOverrideAt": now.isoformat(),
        "finishedOverrideByUserId": current_admin.get("id"),
        "finishedOverrideReason": override_reason,
        'autoFinished': False  # Cierre manual
    }
    if body.get('endLocation'):
        update_data['finalLocation'] = body['endLocation']

    result = await db.service_requests.update_one(
        {'id': request_id, 'status': {'$in': ['in_progress', 'last_30']}},
        {'$set': update_data, '$push': {'events': {'$each': [finished_event, override_event]}}}
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

    await _notify_push_client_event(
        request_id=request_id,
        client_id=request.get("clientId") if request else None,
        kind="finished",
    )

    try:
        enabled_raw = str(os.environ.get("MAQGO_CLIENT_FINISHED_SUMMARY_EMAIL_ENABLED", "true") or "").strip().lower()
        enabled = enabled_raw in {"1", "true", "yes", "y", "on"}
        client_id = request.get("clientId") if request else None
        if enabled and client_id:
            client = await db.users.find_one({"id": str(client_id)}, {"_id": 0, "email": 1})
            email = str((client or {}).get("email") or "").strip().lower()
            if email:
                from services.client_emailer import send_client_event_email

                app_url = (os.environ.get("FRONTEND_URL", "").strip() or "").rstrip("/")
                out = await send_client_event_email(
                    db=db,
                    event_type="service_finished_summary",
                    to_email=email,
                    payload={
                        "service_request_id": request_id,
                        "app_url": app_url,
                        "finished_at": now.isoformat(),
                        "total_amount": request.get("totalAmount", 0) if request else 0,
                        "hours": request.get("hours") if request else None,
                        "machinery": (request.get("machineryType") if request else None) or (request.get("machineType") if request else None) or "—",
                        "location": request.get("location") if request else None,
                    },
                )
                if out.get("sent"):
                    await db.service_requests.update_one(
                        {"id": request_id},
                        {"$set": {"finishedSummaryClientEmailSentAt": now.isoformat(), "finishedSummaryClientEmail": email}},
                    )
    except Exception:
        pass
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
