"""
SERVICIO DE MATCHING - MAQGO MVP v1

Lógica de matching:
- Filtro duro: disponibilidad, tipo maquinaria, zona, SIN servicio activo
- Ranking simple: 60% precio + 40% distancia
- Envío a todos los seleccionados a la vez (hasta 5); el primero que acepta se queda con el servicio.
- Timeout: 90 segundos para que responda alguno.
- Máximo: 5 proveedores notificados por solicitud.
"""
from typing import List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import math
import logging

logger = logging.getLogger(__name__)

# Configuración del matching
MATCHING_CONFIG = {
    'max_attempts': 5,
    'offer_timeout_seconds': 90,
    'max_distance_km': 20,
    'price_weight': 0.6,
    'distance_weight': 0.4,
}

# Estados que indican que el proveedor está ocupado
ACTIVE_SERVICE_STATES = ['confirmed', 'in_progress', 'last_30']

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

def calculate_provider_score(
    provider: dict, 
    request_location: dict,
    avg_price: float
) -> Tuple[float, float]:
    """
    Calcula el score de un proveedor:
    SCORE = (Precio ponderado * 0.6) + (Distancia ponderada * 0.4)
    
    Menor score = mejor proveedor
    
    Returns: (score, distance_km)
    """
    # Calcular distancia
    provider_loc = provider.get('location', {})
    if not provider_loc or not provider_loc.get('lat'):
        distance = MATCHING_CONFIG['max_distance_km']
    else:
        distance = calculate_distance(
            request_location['lat'],
            request_location['lng'],
            provider_loc.get('lat', 0),
            provider_loc.get('lng', 0)
        )
    
    # Normalizar precio (menor es mejor)
    price = provider.get('hourlyRate', avg_price)
    if avg_price > 0:
        price_score = price / avg_price
    else:
        price_score = 1.0
    
    # Normalizar distancia (menor es mejor)
    distance_score = distance / MATCHING_CONFIG['max_distance_km']
    
    # Calcular score final
    score = (
        MATCHING_CONFIG['price_weight'] * price_score +
        MATCHING_CONFIG['distance_weight'] * distance_score
    )
    
    return score, distance

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
    
    # Calcular precios promedio para normalización
    if available_providers:
        avg_price = sum(p.get('hourlyRate', 20000) for p in available_providers) / len(available_providers)
    else:
        avg_price = 20000
    
    # Calcular score y filtrar por distancia
    scored_providers = []
    for provider in available_providers:
        score, distance = calculate_provider_score(provider, request_location, avg_price)
        
        if distance <= MATCHING_CONFIG['max_distance_km']:
            provider['_matching_score'] = score
            provider['_distance_km'] = round(distance, 1)
            scored_providers.append(provider)
    
    # Ordenar por score (menor es mejor)
    scored_providers.sort(key=lambda p: p['_matching_score'])
    
    logger.info(f"Encontrados {len(scored_providers)} proveedores disponibles para {machinery_type}")
    
    return scored_providers

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
                'offerSentAt': now.isoformat(),
                'offerExpiresAt': expires_at.isoformat(),
            },
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
    
    excluded_ids = [a['providerId'] for a in request.get('matchingAttempts', [])]
    
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
        
        result = await db.service_requests.update_one(
            {'id': service_request_id, 'currentOfferId': provider_id},
            {
                '$set': {
                    'status': 'confirmed',
                    'providerId': provider_id,
                    'providerName': provider.get('providerData', {}).get('businessName', 'Proveedor') if provider else 'Proveedor',
                    'providerOperatorName': operator_display,
                    'confirmedAt': now.isoformat(),
                    'startTime': now.isoformat(),
                    'endTime': end_time.isoformat(),
                    'last30Time': last_30_time.isoformat(),  # Para el scheduler
                    'matchingAttempts.$[elem].status': 'accepted',
                    # Estado de pago
                    'paymentStatus': 'charged',
                    'chargedAt': now.isoformat()
                }
            },
            array_filters=[{'elem.providerId': provider_id}]
        )
        
        # Actualizar proveedor como ocupado
        await db.users.update_one(
            {'id': provider_id},
            {
                '$inc': {'acceptedServices': 1, 'totalServices': 1},
                '$set': {'isAvailable': False}
            }
        )
        
        logger.info(f"Servicio {service_request_id} confirmado. Pago procesado. Fin: {end_time}")
        
        return {
            'status': 'confirmed',
            'message': '¡Servicio confirmado! El pago ha sido procesado.',
            'providerId': provider_id,
            'startTime': now.isoformat(),
            'endTime': end_time.isoformat(),
            'paymentStatus': 'charged'
        }
    else:
        # Proveedor rechazó
        await db.service_requests.update_one(
            {'id': service_request_id},
            {
                '$set': {
                    'matchingAttempts.$[elem].status': 'rejected'
                }
            },
            array_filters=[{'elem.providerId': provider_id}]
        )
        
        await db.users.update_one(
            {'id': provider_id},
            {'$inc': {'rejectedServices': 1, 'totalServices': 1}}
        )
        
        logger.info(f"Proveedor {provider_id} rechazó solicitud {service_request_id}")
        
        return await start_matching(db, service_request_id)

async def handle_offer_expired(
    db: AsyncIOMotorDatabase,
    service_request_id: str,
    provider_id: str
) -> dict:
    """
    Maneja cuando una oferta expira sin respuesta.
    """
    await db.service_requests.update_one(
        {'id': service_request_id},
        {
            '$set': {
                'matchingAttempts.$[elem].status': 'expired'
            }
        },
        array_filters=[{'elem.providerId': provider_id}]
    )
    
    logger.info(f"Oferta expirada para proveedor {provider_id}")
    
    return await start_matching(db, service_request_id)
