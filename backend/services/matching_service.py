"""
SERVICIO DE MATCHING - MAQGO MVP v1

Lógica de matching:
- Filtro duro: disponibilidad, tipo maquinaria, zona, SIN servicio activo
- Ranking: services/matching_score.py (precio, distancia, responsividad, aceptación; normalización por batch)
- Lista candidata: como máximo los 5 mejores por score; orden tie-break con penalty de responsividad (match list)
- Sin selección explícita de cliente y con 2+ candidatos: rotación por olas (2 → 3–4 → 5), ventanas 120s / 300s
- Con selección o un solo candidato: oferta secuencial clásica (timeout MATCHING_CONFIG)
"""
import os
from typing import List, Optional, Tuple, Any, Dict, Mapping

from services.matching_score import (
    acceptance_rate_from_provider,
    build_price_distance_context,
    compute_provider_score,
    reference_price_for_machinery,
    responsiveness_rate_from_provider,
)
from services.provider_match_list import get_response_penalty
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import math
import logging

logger = logging.getLogger(__name__)

_DEBUG_MATCH = os.environ.get("DEBUG_MATCH", "").lower() == "true"

# Ventanas de respuesta (maquinaria pesada: no estilo Uber)
PRIMARY_RESPONSE_WINDOW = 120  # s — tras esto se amplía a proveedores 3–4 si sigue sin respuesta
SECONDARY_RESPONSE_WINDOW = 300  # s — ventana total antes de incluir al 5.º
# Tras la última ola, ventana global para aceptar (no estilo 60 s por proveedor)
ROTATION_GLOBAL_OFFER_TTL_SECONDS = 3600

# Configuración del matching (pesos de score en services/matching_score.py)
MATCHING_CONFIG = {
    'max_attempts': 5,
    'offer_timeout_seconds': 60,
    'max_distance_km': 20,
    'price_weight': 0.6,
    'distance_weight': 0.4,
}

# Campos opcionales en service_requests para rotación paralela
_ROTATION_UNSET = {
    'matchingRotationMode': '',
    'matchingCandidateIds': '',
    'matchingRotationStage': '',
    'matchingRotationStartedAt': '',
    'matchingRotationWave2At': '',
    'matchingRotationWave3At': '',
    'matchingWave2Applied': '',
    'matchingWave3Applied': '',
}

# Estados que indican que el proveedor está ocupado
ACTIVE_SERVICE_STATES = ['confirmed', 'in_progress', 'last_30']


def _rotation_waiting_for_more_waves(sr: Mapping[str, Any], now: datetime) -> bool:
    """
    True si aún puede entrar una ola futura (3–4 o 5) por tiempo, sin reiniciar matching.
    """
    if not sr.get("matchingRotationMode"):
        return False
    candidate_ids = list(sr.get("matchingCandidateIds") or [])
    offered = set(sr.get("offeredProviderIds") or [])
    if len(offered) >= len(candidate_ids):
        return False
    w2 = _parse_iso_utc(sr.get("matchingRotationWave2At"))
    w3 = _parse_iso_utc(sr.get("matchingRotationWave3At"))
    if not sr.get("matchingWave2Applied") and len(candidate_ids) >= 3 and w2 and now < w2:
        return True
    if (
        sr.get("matchingWave2Applied")
        and not sr.get("matchingWave3Applied")
        and len(candidate_ids) >= 5
        and w3
        and now < w3
    ):
        return True
    return False


def _parse_iso_utc(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    try:
        s = str(raw).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

def _get_operator_display_name(provider: dict) -> str:
    """Nombre del operador para mostrar al cliente. Nunca empresa."""
    if not provider:
        return 'Operador'
    # machineData.operators[0].name (operadores por máquina)
    ops = provider.get('machineData', {}).get('operators', [])
    if ops and isinstance(ops, list) and len(ops) > 0:
        first = ops[0]
        if isinstance(first, dict) and first.get('name'):
            return first['name']
        if isinstance(first, str):
            return first
    # providerData.defaultOperatorName
    default_op = provider.get('providerData', {}).get('defaultOperatorName')
    if default_op:
        return default_op
    # provider.name = dueño/titular (persona)
    owner_name = provider.get('name')
    if owner_name and owner_name != provider.get('providerData', {}).get('businessName'):
        return owner_name
    return 'Operador'


def _get_operator_rut_for_service(provider: Optional[dict]) -> Optional[str]:
    """RUT del operador en faena (misma fuente aproximada que el nombre)."""
    if not provider:
        return None
    ops = provider.get('machineData', {}).get('operators', [])
    if ops and isinstance(ops, list) and len(ops) > 0:
        first = ops[0]
        if isinstance(first, dict):
            raw = first.get('rut') or first.get('operator_rut') or first.get('operatorRut')
            if raw:
                s = str(raw).strip()
                if s and s.lower() not in ('no registrado', 'sin rut', '-'):
                    return s
    pd = provider.get('providerData') or {}
    for key in ('defaultOperatorRut', 'operatorRut', 'operator_rut'):
        raw = pd.get(key)
        if raw:
            s = str(raw).strip()
            if s:
                return s
    return None


def _get_operator_name_parts_for_service(provider: Optional[dict]) -> Tuple[Optional[str], Optional[str]]:
    """nombre, apellido si vienen explícitos en machineData.operators[0]."""
    if not provider:
        return None, None
    ops = provider.get('machineData', {}).get('operators', [])
    if not ops or not isinstance(ops, list) or len(ops) < 1:
        return None, None
    first = ops[0]
    if not isinstance(first, dict):
        return None, None
    n = first.get('nombre') or first.get('firstName')
    a = first.get('apellido') or first.get('lastName')
    if n or a:
        return (str(n).strip() if n else None, str(a).strip() if a else None)
    return None, None


def _get_license_plate_for_service(provider: Optional[dict]) -> Optional[str]:
    """Patente del equipo asignado (usuario proveedor o primera máquina en machineData)."""
    if not provider:
        return None
    lp = provider.get('licensePlate') or provider.get('license_plate')
    if lp:
        return str(lp).strip() or None
    machine_data = provider.get('machineData') or {}
    machines = machine_data.get('machines') or []
    if machines and isinstance(machines, list) and len(machines) > 0:
        m0: Any = machines[0]
        if isinstance(m0, dict):
            plate = m0.get('licensePlate') or m0.get('license_plate') or m0.get('patente')
            if plate:
                return str(plate).strip() or None
    return None


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcula distancia en km usando fórmula de Haversine
    """
    R = 6371  # Radio de la Tierra en km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def _distance_to_provider_km(provider: dict, request_location: dict) -> float:
    provider_loc = provider.get('location', {})
    if not provider_loc or not provider_loc.get('lat'):
        return float(MATCHING_CONFIG['max_distance_km'])
    return calculate_distance(
        request_location['lat'],
        request_location['lng'],
        provider_loc.get('lat', 0),
        provider_loc.get('lng', 0),
    )

async def check_provider_has_active_service(
    db: AsyncIOMotorDatabase,
    provider_id: str
) -> bool:
    """
    Verifica si el proveedor tiene un servicio activo.
    Estados activos: confirmed, in_progress, last_30
    
    Returns: True si tiene servicio activo (NO disponible)
    """
    active_service = await db.service_requests.find_one({
        'providerId': provider_id,
        'status': {'$in': ACTIVE_SERVICE_STATES}
    }, {'_id': 0, 'id': 1})
    
    return active_service is not None

async def get_available_providers(
    db: AsyncIOMotorDatabase,
    machinery_type: str,
    request_location: dict,
    excluded_provider_ids: List[str] = None
) -> List[dict]:
    """
    Obtiene proveedores disponibles que pasan el filtro duro:
    - isAvailable = true
    - machineryType compatible
    - Dentro del radio máximo (20km)
    - No están en la lista de excluidos
    - NO tienen servicio activo (confirmed, in_progress, last_30)
    """
    query = {
        '$or': [{'role': 'provider'}, {'roles': 'provider'}],
        'isAvailable': True,
    }
    if machinery_type:
        query['machineryType'] = machinery_type
    if excluded_provider_ids:
        query['id'] = {'$nin': excluded_provider_ids}
    providers = await db.users.find(query, {'_id': 0}).to_list(100)

    if not providers and machinery_type:
        query_fallback = {
            '$or': [{'role': 'provider'}, {'roles': 'provider'}],
            'isAvailable': True,
        }
        if excluded_provider_ids:
            query_fallback['id'] = {'$nin': excluded_provider_ids}
        providers = await db.users.find(query_fallback, {'_id': 0}).to_list(100)
        if providers:
            logger.info(f"Usando fallback sin machineryType (encontrados {len(providers)})")
    
    # Filtrar proveedores con servicios activos
    available_providers = []
    for provider in providers:
        has_active = await check_provider_has_active_service(db, provider['id'])
        if not has_active:
            available_providers.append(provider)
        else:
            logger.info(f"Proveedor {provider['id']} excluido: tiene servicio activo")
    
    # Distancia y precio por proveedor; filtro duro por radio
    candidates: List[Tuple[dict, float, float]] = []
    for provider in available_providers:
        distance = _distance_to_provider_km(provider, request_location)
        if distance > MATCHING_CONFIG['max_distance_km']:
            continue
        price = float(provider.get('hourlyRate', 20000))
        candidates.append((provider, distance, price))

    if not candidates:
        logger.info(f"Encontrados 0 proveedores dentro de {MATCHING_CONFIG['max_distance_km']} km")
        return []

    context = build_price_distance_context([(c[2], c[1]) for c in candidates])
    if context is None:
        return []

    ref_for_soft = reference_price_for_machinery(machinery_type)

    scored_providers = []
    for provider, distance, price in candidates:
        pseudo = {
            'price': price,
            'distance_km': distance,
            'responsiveness_rate': responsiveness_rate_from_provider(provider),
            'acceptance_rate': acceptance_rate_from_provider(provider),
        }
        score = compute_provider_score(
            pseudo,
            context,
            reference_price=ref_for_soft,
        )
        provider['_matching_score'] = score
        provider['_distance_km'] = round(distance, 1)
        scored_providers.append(provider)
    
    # Ordenar por score (menor es mejor); pool máximo TOP 5 por solicitud
    scored_providers.sort(key=lambda p: p['_matching_score'])
    capped = scored_providers[: MATCHING_CONFIG['max_attempts']]
    # Mejor exposición primero: penalty de responsividad (match list) y luego score base
    capped.sort(
        key=lambda p: (
            -float(get_response_penalty(
                {
                    "responseTimeScore": p.get("responseTimeScore"),
                    "response_time_avg": p.get("responseTimeAvg"),
                }
            )),
            float(p.get("_matching_score", 99.0)),
        )
    )

    logger.info(
        "Encontrados %s proveedores (top %s) para %s",
        len(scored_providers),
        len(capped),
        machinery_type,
    )

    return capped

async def send_offer_to_provider(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_id: str
) -> dict:
    """
    Envía oferta a un proveedor específico (modo secuencial / compatibilidad).
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=MATCHING_CONFIG['offer_timeout_seconds'])
    
    await db.service_requests.update_one(
        {'id': service_request_id},
        {
            '$set': {
                'status': 'offer_sent',
                'currentOfferId': provider_id,
                'offeredProviderIds': [provider_id],
                'offerSentAt': now.isoformat(),
                'offerExpiresAt': expires_at.isoformat(),
            },
            '$unset': _ROTATION_UNSET,
            '$inc': {'attemptCount': 1},
            '$push': {
                'matchingAttempts': {
                    'providerId': provider_id,
                    'sentAt': now.isoformat(),
                    'expiresAt': expires_at.isoformat(),
                    'status': 'pending'
                }
            }
        }
    )
    
    logger.info(f"Oferta enviada a proveedor {provider_id} para solicitud {service_request_id}")
    
    return {
        'providerId': provider_id,
        'sentAt': now.isoformat(),
        'expiresAt': expires_at.isoformat(),
        'timeoutSeconds': MATCHING_CONFIG['offer_timeout_seconds']
    }


async def send_offers_to_providers(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_ids: List[str]
) -> dict:
    """
    Envía oferta a varios proveedores a la vez. El primero que acepte se queda con el servicio.
    """
    if not provider_ids:
        return {'error': 'Sin proveedores'}
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=MATCHING_CONFIG['offer_timeout_seconds'])
    attempts = [
        {'providerId': pid, 'sentAt': now.isoformat(), 'expiresAt': expires_at.isoformat(), 'status': 'pending'}
        for pid in provider_ids
    ]
    await db.service_requests.update_one(
        {'id': service_request_id},
        {
            '$set': {
                'status': 'offer_sent',
                'offeredProviderIds': provider_ids,
                'offerSentAt': now.isoformat(),
                'offerExpiresAt': expires_at.isoformat(),
            },
            '$push': {'matchingAttempts': {'$each': attempts}}
        }
    )
    logger.info(f"Ofertas enviadas a {len(provider_ids)} proveedores para solicitud {service_request_id}")
    return {
        'providerIds': provider_ids,
        'sentAt': now.isoformat(),
        'expiresAt': expires_at.isoformat(),
        'timeoutSeconds': MATCHING_CONFIG['offer_timeout_seconds']
    }


async def send_rotation_wave_one(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    providers: List[dict],
) -> dict:
    """
    Ola 1: solo los 2 mejores del top 5; ventana global ampliada.
    Olas 2 y 3 las aplica apply_matching_rotation_waves (T+120s y T+300s).
    """
    candidate_ids = [p["id"] for p in providers[: MATCHING_CONFIG["max_attempts"]]]
    wave1 = candidate_ids[:2]
    if len(wave1) < 1:
        return {"error": "Sin proveedores para rotación"}

    now = datetime.now(timezone.utc)
    global_exp = now + timedelta(seconds=ROTATION_GLOBAL_OFFER_TTL_SECONDS)
    wave2_at = now + timedelta(seconds=PRIMARY_RESPONSE_WINDOW)
    wave3_at = now + timedelta(seconds=SECONDARY_RESPONSE_WINDOW)

    attempts = [
        {
            "providerId": pid,
            "sentAt": now.isoformat(),
            "expiresAt": global_exp.isoformat(),
            "status": "pending",
        }
        for pid in wave1
    ]

    await db.service_requests.update_one(
        {"id": service_request_id},
        {
            "$set": {
                "status": "offer_sent",
                "currentOfferId": wave1[0],
                "offeredProviderIds": wave1,
                "offerSentAt": now.isoformat(),
                "offerExpiresAt": global_exp.isoformat(),
                "matchingCandidateIds": candidate_ids,
                "matchingRotationMode": True,
                "matchingRotationStage": 1,
                "matchingRotationStartedAt": now.isoformat(),
                "matchingRotationWave2At": wave2_at.isoformat(),
                "matchingRotationWave3At": wave3_at.isoformat(),
                "matchingWave2Applied": False,
                "matchingWave3Applied": False,
            },
            "$push": {"matchingAttempts": {"$each": attempts}},
            "$inc": {"attemptCount": len(wave1)},
        },
    )

    if _DEBUG_MATCH:
        logger.info(
            "MATCH_ROTATION %s",
            {
                "serviceRequestId": service_request_id,
                "stage": 1,
                "sentProviderIds": wave1,
                "candidateIds": candidate_ids,
                "wave2At": wave2_at.isoformat(),
                "wave3At": wave3_at.isoformat(),
                "globalExpiresAt": global_exp.isoformat(),
            },
        )

    first = providers[0]
    return {
        "status": "offer_sent",
        "provider": {
            "id": first["id"],
            "name": first.get("name", "Proveedor"),
            "rating": first.get("rating", 5.0),
            "distance": first.get("_distance_km", 0),
        },
        "offer": {
            "providerIds": wave1,
            "sentAt": now.isoformat(),
            "expiresAt": global_exp.isoformat(),
            "timeoutSeconds": ROTATION_GLOBAL_OFFER_TTL_SECONDS,
            "rotation": True,
        },
        "attemptNumber": len(wave1),
        "maxAttempts": MATCHING_CONFIG["max_attempts"],
        "matchingRotation": True,
    }


async def apply_matching_rotation_waves(db: AsyncIOMotorDatabase, service_request_id: str) -> None:
    """
    En T+120s añade proveedores 3–4; en T+300s al 5. No revoca ofertas previas.
    Idempotente por matchingWave2Applied / matchingWave3Applied.
    """
    sr = await db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
    if not sr or sr.get("status") != "offer_sent" or not sr.get("matchingRotationMode"):
        return
    if sr.get("providerId"):
        return

    now = datetime.now(timezone.utc)
    candidate_ids = list(sr.get("matchingCandidateIds") or [])
    if not candidate_ids:
        return

    global_exp = _parse_iso_utc(sr.get("offerExpiresAt")) or (
        now + timedelta(seconds=ROTATION_GLOBAL_OFFER_TTL_SECONDS)
    )

    wave2_at = _parse_iso_utc(sr.get("matchingRotationWave2At"))
    wave3_at = _parse_iso_utc(sr.get("matchingRotationWave3At"))
    t0 = _parse_iso_utc(sr.get("matchingRotationStartedAt")) or now

    # Ola 2: índices 2 y 3 (tercero y cuarto)
    if not sr.get("matchingWave2Applied") and len(candidate_ids) >= 3 and wave2_at and now >= wave2_at:
        new_ids = candidate_ids[2:4]
        if new_ids:
            attempts = [
                {
                    "providerId": pid,
                    "sentAt": now.isoformat(),
                    "expiresAt": global_exp.isoformat() if global_exp else now.isoformat(),
                    "status": "pending",
                }
                for pid in new_ids
            ]
            offered = list(sr.get("offeredProviderIds") or [])
            for pid in new_ids:
                if pid not in offered:
                    offered.append(pid)
            await db.service_requests.update_one(
                {"id": service_request_id},
                {
                    "$set": {
                        "offeredProviderIds": offered,
                        "matchingRotationStage": 2,
                        "matchingWave2Applied": True,
                    },
                    "$push": {"matchingAttempts": {"$each": attempts}},
                    "$inc": {"attemptCount": len(new_ids)},
                },
            )
            if _DEBUG_MATCH:
                dt_s = (now - t0).total_seconds()
                logger.info(
                    "MATCH_ROTATION %s",
                    {
                        "serviceRequestId": service_request_id,
                        "stage": 2,
                        "sentProviderIds": new_ids,
                        "elapsedSecondsApprox": round(dt_s, 2),
                    },
                )

    sr = await db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
    if not sr or sr.get("status") != "offer_sent" or not sr.get("matchingRotationMode"):
        return

    candidate_ids = list(sr.get("matchingCandidateIds") or [])
    global_exp = _parse_iso_utc(sr.get("offerExpiresAt")) or (
        now + timedelta(seconds=ROTATION_GLOBAL_OFFER_TTL_SECONDS)
    )
    t0 = _parse_iso_utc(sr.get("matchingRotationStartedAt")) or now

    # Ola 3: índice 4 (quinto) — requiere haber aplicado ola 2 (aunque haya 0 ids nuevos en pool pequeño)
    if (
        sr.get("matchingWave2Applied")
        and not sr.get("matchingWave3Applied")
        and len(candidate_ids) >= 5
        and wave3_at
        and now >= wave3_at
    ):
        new_ids = candidate_ids[4:5]
        if new_ids:
            attempts = [
                {
                    "providerId": pid,
                    "sentAt": now.isoformat(),
                    "expiresAt": global_exp.isoformat() if global_exp else now.isoformat(),
                    "status": "pending",
                }
                for pid in new_ids
            ]
            offered = list(sr.get("offeredProviderIds") or [])
            for pid in new_ids:
                if pid not in offered:
                    offered.append(pid)
            await db.service_requests.update_one(
                {"id": service_request_id},
                {
                    "$set": {
                        "offeredProviderIds": offered,
                        "matchingRotationStage": 3,
                        "matchingWave3Applied": True,
                    },
                    "$push": {"matchingAttempts": {"$each": attempts}},
                    "$inc": {"attemptCount": len(new_ids)},
                },
            )
            if _DEBUG_MATCH:
                dt_s = (now - t0).total_seconds()
                logger.info(
                    "MATCH_ROTATION %s",
                    {
                        "serviceRequestId": service_request_id,
                        "stage": 3,
                        "sentProviderIds": new_ids,
                        "elapsedSecondsApprox": round(dt_s, 2),
                    },
                )


async def _supersede_pending_attempts_for_winner(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    winner_id: str,
) -> None:
    sr = await db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
    if not sr:
        return
    attempts = list(sr.get("matchingAttempts") or [])
    changed = False
    for a in attempts:
        if a.get("providerId") != winner_id and a.get("status") == "pending":
            a["status"] = "superseded"
            changed = True
    if changed:
        await db.service_requests.update_one(
            {"id": service_request_id},
            {"$set": {"matchingAttempts": attempts}},
        )


async def handle_rotation_round_expired(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
) -> dict:
    """
    Tras ROTATION_GLOBAL_OFFER_TTL sin confirmación: expira todos los pendientes y reintenta matching.
    """
    sr = await db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
    if not sr or not sr.get("matchingRotationMode"):
        return {"status": "skipped"}

    attempts = list(sr.get("matchingAttempts") or [])
    pending_ids: List[str] = []
    for a in attempts:
        if a.get("status") == "pending":
            a["status"] = "expired"
            pid = a.get("providerId")
            if pid:
                pending_ids.append(pid)

    await db.service_requests.update_one(
        {"id": service_request_id},
        {"$set": {"matchingAttempts": attempts}, "$unset": _ROTATION_UNSET},
    )
    for pid in pending_ids:
        try:
            await db.users.update_one({"id": pid}, {"$inc": {"matchingOffersExpired": 1}})
        except Exception as e:
            logger.warning("matchingOffersExpired increment failed: %s", e)

    if _DEBUG_MATCH:
        logger.info(
            "MATCH_ROTATION_EXPIRED %s pendingCount=%s",
            service_request_id,
            len(pending_ids),
        )

    return await start_matching(db, service_request_id)


async def start_matching(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    selected_provider_id: str = None
) -> dict:
    """
    Inicia el proceso de matching para una solicitud.
    Si selected_provider_id está definido, envía la oferta al proveedor elegido por el cliente.
    Si no, busca el mejor disponible por score y envía al primero.
    """
    request = await db.service_requests.find_one({'id': service_request_id}, {'_id': 0})
    if not request:
        return {'error': 'Solicitud no encontrada'}
    
    # No excluir intentos con fallo de pago post-aceptación: el proveedor puede volver a recibir oferta.
    excluded_ids = [
        a['providerId']
        for a in request.get('matchingAttempts', [])
        if a.get('status') != 'payment_failed'
    ]
    
    if len(excluded_ids) >= MATCHING_CONFIG['max_attempts']:
        await db.service_requests.update_one(
            {'id': service_request_id},
            {'$set': {'status': 'no_providers_available'}}
        )
        return {
            'status': 'no_providers_available',
            'message': 'No hay proveedores disponibles en este momento. Intenta más tarde.'
        }
    
    request_location = {
        'lat': request['location']['lat'],
        'lng': request['location']['lng']
    }
    
    providers = await get_available_providers(
        db,
        request.get('machineryType'),
        request_location,
        excluded_ids
    )
    
    # Si el cliente eligió proveedor, enviar a ese (si está disponible y no excluido)
    if selected_provider_id:
        if selected_provider_id in excluded_ids:
            # Ya fue contactado y rechazó: buscar siguiente
            providers = [p for p in providers if p['id'] != selected_provider_id]
        else:
            target = next((p for p in providers if p['id'] == selected_provider_id), None)
            if target:
                target_provider = target
            else:
                # El elegido no está disponible: buscar el mejor
                target_provider = providers[0] if providers else None
    else:
        target_provider = providers[0] if providers else None
    
    if not target_provider:
        await db.service_requests.update_one(
            {'id': service_request_id},
            {'$set': {'status': 'no_providers_available'}}
        )
        return {
            'status': 'no_providers_available',
            'message': 'No hay proveedores disponibles en este momento. Intenta más tarde.'
        }

    # Rotación por olas: 2 + (3–4) + (5); sin presión tipo 60 s por cabeza
    if not selected_provider_id and len(providers) >= 2:
        return await send_rotation_wave_one(db, service_request_id, providers)

    offer = await send_offer_to_provider(db, service_request_id, target_provider['id'])

    return {
        'status': 'offer_sent',
        'provider': {
            'id': target_provider['id'],
            'name': target_provider.get('name', 'Proveedor'),
            'rating': target_provider.get('rating', 5.0),
            'distance': target_provider.get('_distance_km', 0)
        },
        'offer': offer,
        'attemptNumber': len(excluded_ids) + 1,
        'maxAttempts': MATCHING_CONFIG['max_attempts']
    }

async def handle_offer_response(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_id: str,
    accepted: bool
) -> dict:
    """
    Maneja la respuesta del proveedor a una oferta.
    Si acepta: confirma el servicio y procesa pago
    Si rechaza: marca la oferta y busca siguiente proveedor
    """
    now = datetime.now(timezone.utc)
    
    if accepted:
        # Calcular tiempos de jornada (8h trabajo + 1h colación = 9h total)
        end_time = now + timedelta(hours=9)
        last_30_time = end_time - timedelta(minutes=30)
        
        provider = await db.users.find_one({'id': provider_id}, {'_id': 0})
        # Cliente ve solo operador, nunca empresa (providerName interno para facturas)
        operator_display = _get_operator_display_name(provider) if provider else 'Operador'
        license_plate = _get_license_plate_for_service(provider)
        operator_rut = _get_operator_rut_for_service(provider)
        op_first, op_last = _get_operator_name_parts_for_service(provider)

        # paymentStatus=charging hasta que PaymentService.charge_service confirme TBK (evita "cobrado" sin pago).
        set_confirmed: Dict[str, Any] = {
            'status': 'confirmed',
            'providerId': provider_id,
            'providerName': provider.get('providerData', {}).get('businessName', 'Proveedor') if provider else 'Proveedor',
            'providerOperatorName': operator_display,
            **({'license_plate': license_plate} if license_plate else {}),
            'confirmedAt': now.isoformat(),
            'startTime': now.isoformat(),
            'endTime': end_time.isoformat(),
            'last30Time': last_30_time.isoformat(),
            'matchingAttempts.$[elem].status': 'accepted',
            'paymentStatus': 'charging',
        }
        if operator_rut:
            set_confirmed['operatorRut'] = operator_rut
        if op_first:
            set_confirmed['operatorFirstName'] = op_first
        if op_last:
            set_confirmed['operatorLastName'] = op_last

        accept_filter: Dict[str, Any] = {
            'id': service_request_id,
            'status': 'offer_sent',
            'matchingAttempts': {'$elemMatch': {'providerId': provider_id, 'status': 'pending'}},
            '$or': [
                {'providerId': {'$exists': False}},
                {'providerId': None},
                {'providerId': ''},
            ],
        }

        result = await db.service_requests.update_one(
            accept_filter,
            {'$set': set_confirmed, '$unset': _ROTATION_UNSET},
            array_filters=[{'elem.providerId': provider_id}],
        )

        if result.matched_count == 0:
            return {
                'status': 'error',
                'message': 'No hay oferta pendiente para este proveedor o la solicitud ya fue asignada.',
            }

        await _supersede_pending_attempts_for_winner(db, service_request_id, provider_id)

        # Actualizar proveedor como ocupado
        await db.users.update_one(
            {'id': provider_id},
            {
                '$inc': {'acceptedServices': 1, 'totalServices': 1},
                '$set': {'isAvailable': False}
            }
        )

        if _DEBUG_MATCH:
            sr_dbg = await db.service_requests.find_one({'id': service_request_id}, {'_id': 0, 'matchingAttempts': 1})
            attempts_dbg = sr_dbg.get('matchingAttempts') or [] if sr_dbg else []
            logger.info(
                "MATCH_ACCEPT winner=%s request=%s attempts=%s",
                provider_id,
                service_request_id,
                len(attempts_dbg),
            )

        logger.info(f"Servicio {service_request_id} confirmado (pago en proceso OneClick). Fin jornada: {end_time}")

        return {
            'status': 'confirmed',
            'message': '¡Servicio confirmado! Procesando pago…',
            'providerId': provider_id,
            'startTime': now.isoformat(),
            'endTime': end_time.isoformat(),
            'paymentStatus': 'charging'
        }
    else:
        # Proveedor rechazó
        rej = await db.service_requests.update_one(
            {
                'id': service_request_id,
                'matchingAttempts': {'$elemMatch': {'providerId': provider_id, 'status': 'pending'}},
            },
            {'$set': {'matchingAttempts.$[elem].status': 'rejected'}},
            array_filters=[{'elem.providerId': provider_id}],
        )
        if rej.matched_count == 0:
            return {'status': 'error', 'message': 'No hay oferta pendiente para rechazar.'}

        await db.users.update_one(
            {'id': provider_id},
            {'$inc': {'rejectedServices': 1, 'totalServices': 1}}
        )

        logger.info(f"Proveedor {provider_id} rechazó solicitud {service_request_id}")

        sr = await db.service_requests.find_one({'id': service_request_id}, {'_id': 0})
        if sr and sr.get('matchingRotationMode') and sr.get('status') == 'offer_sent':
            await apply_matching_rotation_waves(db, service_request_id)
            sr2 = await db.service_requests.find_one({'id': service_request_id}, {'_id': 0})
            pending = [
                a for a in (sr2.get('matchingAttempts') or [])
                if a.get('status') == 'pending'
            ]
            if pending:
                return {
                    'status': 'rejected',
                    'message': 'Oferta rechazada. Siguen activas otras ofertas para esta solicitud.',
                    'matchingRotation': True,
                }
            if sr2 and _rotation_waiting_for_more_waves(sr2, now):
                return {
                    'status': 'rejected',
                    'message': 'Oferta rechazada. Se ampliará la convocatoria según la ventana programada.',
                    'matchingRotation': True,
                }
            return await start_matching(db, service_request_id)

        return await start_matching(db, service_request_id)


async def revert_confirmed_offer_after_payment_failure(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_id: str,
) -> None:
    """
    Si OneClick falla tras la aceptación del proveedor, deshace la confirmación:
    - No dejar servicio en estado charged sin pago real
    - Restaurar disponibilidad del proveedor
    - Volver a matching para reintentar (el intento pasa a payment_failed y no bloquea re-oferta)
    """
    sr = await db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
    if not sr:
        logger.warning("revert_confirmed_offer_after_payment_failure: solicitud %s no existe", service_request_id)
        return
    if sr.get("status") != "confirmed" or sr.get("paymentStatus") != "charging":
        logger.warning(
            "revert_confirmed_offer_after_payment_failure: estado inesperado id=%s status=%s pay=%s",
            service_request_id,
            sr.get("status"),
            sr.get("paymentStatus"),
        )
        return

    now = datetime.now(timezone.utc)
    attempts = list(sr.get("matchingAttempts") or [])
    for att in attempts:
        if att.get("providerId") == provider_id and att.get("status") == "accepted":
            att["status"] = "payment_failed"

    unset_fields = [
        "providerId",
        "providerName",
        "providerOperatorName",
        "confirmedAt",
        "startTime",
        "endTime",
        "last30Time",
        "chargedAt",
        "license_plate",
        "operatorRut",
        "operatorFirstName",
        "operatorLastName",
    ]

    set_doc: Dict[str, Any] = {
        "status": "matching",
        "paymentStatus": "failed",
        "paymentFailedAt": now.isoformat(),
        "currentOfferId": None,
        "offerExpiresAt": None,
        "matchingAttempts": attempts,
    }

    res = await db.service_requests.update_one(
        {"id": service_request_id, "status": "confirmed", "paymentStatus": "charging"},
        {"$set": set_doc, "$unset": {k: "" for k in unset_fields}},
    )
    if res.matched_count == 0:
        logger.warning(
            "revert_confirmed_offer_after_payment_failure: no match al actualizar id=%s (condición charging)",
            service_request_id,
        )
        return

    prov = await db.users.find_one({"id": provider_id}, {"_id": 0, "acceptedServices": 1, "totalServices": 1})
    if prov:
        inc_accepted = -1 if (prov.get("acceptedServices") or 0) > 0 else 0
        inc_total = -1 if (prov.get("totalServices") or 0) > 0 else 0
        if inc_accepted or inc_total:
            await db.users.update_one(
                {"id": provider_id},
                {"$inc": {"acceptedServices": inc_accepted, "totalServices": inc_total}, "$set": {"isAvailable": True}},
            )
        else:
            await db.users.update_one({"id": provider_id}, {"$set": {"isAvailable": True}})
    else:
        logger.warning(
            "revert_confirmed_offer_after_payment_failure: proveedor %s no encontrado al revertir stats",
            provider_id,
        )

    try:
        await start_matching(db, service_request_id)
    except Exception as e:
        logger.exception("revert_confirmed_offer_after_payment_failure: start_matching falló: %s", e)


async def handle_offer_expired(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_id: str
) -> dict:
    """
    Maneja cuando una oferta expira sin respuesta.
    Penaliza ranking futuro (matchingOffersExpired); no aplica a rechazos explícitos.
    En modo rotación las expiraciones globales van por handle_rotation_round_expired.
    """
    sr = await db.service_requests.find_one({'id': service_request_id}, {'_id': 0, 'matchingRotationMode': 1})
    if sr and sr.get('matchingRotationMode'):
        return {'status': 'skipped_rotation'}

    await db.service_requests.update_one(
        {'id': service_request_id},
        {
            '$set': {
                'matchingAttempts.$[elem].status': 'expired'
            }
        },
        array_filters=[{'elem.providerId': provider_id}]
    )
    try:
        await db.users.update_one(
            {'id': provider_id},
            {'$inc': {'matchingOffersExpired': 1}},
        )
    except Exception as e:
        logger.warning("matchingOffersExpired increment failed: %s", e)
    
    logger.info(f"Oferta expirada para proveedor {provider_id}")
    
    return await start_matching(db, service_request_id)
