"""
MAQGO - Provider Matching Routes
Algoritmo de matching basado en precio y distancia
"""
import logging
import math
import time
from typing import List, Optional

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from db_config import get_db_name, get_mongo_url

from ops_structured_log import log_ops_event
from pricing.constants import REFERENCE_PRICES_PER_SERVICE
from services.matching_score import reference_price_for_machinery
from services.provider_match_list import (
    calculate_match_score,
    enforce_diversity_ranked,
)

router = APIRouter(prefix="/providers", tags=["Providers"])
logger = logging.getLogger(__name__)

MONGO_URL = get_mongo_url()
DB_NAME = get_db_name()

# Maquinarias que NO necesitan traslado (son vehículos con patente)
MACHINERY_NO_TRANSPORT = ['camion_pluma', 'camion_aljibe', 'camion_tolva']
# Maquinarias cobradas por viaje (precio único en machineData.pricePerService)
MACHINERY_PER_SERVICE = ['camion_pluma', 'camion_aljibe', 'camion_tolva']

# Mínimos por tipo para considerar maquinaria pesada (no 3/4 ni equipos livianos)
# Si el proveedor tiene valor por debajo, no se expone en match (el cliente no ve ese proveedor como "tolva 10 m³")
MACHINERY_SPEC_MIN = {
    'camion_tolva': 12,      # m³ — menor = 3/4
    'camion_aljibe': 8000,   # L
    'camion_pluma': 8,       # ton·m
    'minicargador': 0.4,     # m³ balde
}

# Campo que diferencia a cada proveedor por tipo de maquinaria (para mostrar en P4 al cliente)
# clave en respuesta API (snake_case); valor desde machineData (camel o snake)
MACHINERY_SPEC_FIELD = {
    'camion_tolva': ('capacity_m3', ['capacityM3', 'capacity_m3']),
    'camion_aljibe': ('capacity_liters', ['capacityLiters', 'capacity_liters']),
    'camion_pluma': ('capacity_ton_m', ['capacityTonM', 'capacity_ton_m']),
    'grua': ('crane_ton', ['craneTon', 'crane_ton']),
    'retroexcavadora': ('bucket_m3', ['bucketM3', 'bucket_m3']),
    'excavadora': ('weight_ton', ['weightTon', 'weight_ton']),
    'excavadora_hidraulica': ('weight_ton', ['weightTon', 'weight_ton']),
    'bulldozer': ('power_hp', ['powerHp', 'power_hp']),
    'motoniveladora': ('blade_width_m', ['bladeWidthM', 'blade_width_m']),
    'compactadora': ('roller_ton', ['rollerTon', 'roller_ton']),
    'rodillo': ('roller_ton', ['rollerTon', 'roller_ton']),
    'minicargador': ('bucket_m3', ['bucketM3', 'bucket_m3']),
}

# ETA: preparación + ruta con buffer. 20 min sería imposible (máquina al lado).
# Mínimo realista: 40 min (preparación + traslado mínimo). Wow factor si llegan antes.
# Holgura por tipo de maquinaria (minutos de preparación mínima):
MIN_ETA_PREPARATION_MINUTES = {
    'camion_aljibe': 40,   # Llenar cisterna de agua
    'camion_tolva': 35,    # Carga / preparación
    'camion_pluma': 30,    # Revisión y preparación de grúa
}
DEFAULT_MIN_ETA = 30   # Resto: preparación base (revisión, salida)
MIN_ETA_GLOBAL = 40    # Nunca menos: 20 min sería tener la máquina al lado (irreal)

# Buffer en ruta: tráfico, accidentes, semáforos. Factor sobre tiempo de conducción.
ROUTE_BUFFER_FACTOR = 1.25  # +25% sobre tiempo teórico

def get_db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _get_operator_display_name(provider: dict) -> str:
    """Nombre del operador para mostrar al cliente. Nunca empresa."""
    if not provider:
        return 'Operador'
    ops = provider.get('machineData', {}).get('operators', [])
    if ops and isinstance(ops, list) and len(ops) > 0:
        first = ops[0]
        if isinstance(first, dict) and first.get('name'):
            return first['name']
        if isinstance(first, str):
            return first
    default_op = provider.get('providerData', {}).get('defaultOperatorName')
    if default_op:
        return default_op
    owner_name = provider.get('name')
    if owner_name and owner_name != provider.get('providerData', {}).get('businessName'):
        return owner_name
    return 'Operador'


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia en km entre dos puntos usando la fórmula Haversine
    """
    R = 6371  # Radio de la Tierra en km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_eta(distance_km: float) -> int:
    """
    Tiempo de viaje en minutos (conducción) con buffer por tráfico/imprevistos.
    Velocidad efectiva ~25 km/h (urbano + tráfico, accidentes, semáforos).
    Se aplica ROUTE_BUFFER_FACTOR sobre el tiempo teórico.
    """
    speed_kmh = 25  # Más realista en ciudad con tráfico
    driving_theoretical = (distance_km / speed_kmh) * 60  # minutos
    driving_with_buffer = int(driving_theoretical * ROUTE_BUFFER_FACTOR)
    return max(15, driving_with_buffer)  # Mínimo 15 min solo de ruta (cualquier traslado real)


def get_eta_minutes(distance_km: float, machinery_type: str) -> int:
    """
    ETA total = tiempo de preparación (por tipo) + tiempo de viaje (con buffer).
    No se comprometen menos de MIN_ETA_GLOBAL minutos (preparación + margen).
    """
    driving_min = calculate_eta(distance_km)
    min_prep = MIN_ETA_PREPARATION_MINUTES.get(machinery_type, DEFAULT_MIN_ETA)
    total = min_prep + driving_min
    return max(MIN_ETA_GLOBAL, total)


def _provider_response_id(provider: dict) -> str:
    """
    Identificador único del proveedor para la respuesta API.
    El frontend (P4/P5) requiere "id" en cada proveedor; el resto del backend usa "id" (UUID).
    En MongoDB el documento tiene "id" (app) o "_id" (siempre presente).
    """
    app_id = provider.get("id")
    if app_id is not None and app_id != "":
        return str(app_id)
    oid = provider.get("_id")
    return str(oid) if oid is not None else ""

def _get_provider_coords(provider: dict) -> tuple[float, float]:
    loc = provider.get("location")
    if isinstance(loc, dict):
        lat = loc.get("lat")
        lng = loc.get("lng")
        try:
            if lat is not None and lng is not None:
                return float(lat), float(lng)
        except (TypeError, ValueError):
            pass
    pdata = provider.get("providerData")
    if isinstance(pdata, dict):
        lat = pdata.get("addressLat")
        lng = pdata.get("addressLng")
        try:
            if lat is not None and lng is not None:
                return float(lat), float(lng)
        except (TypeError, ValueError):
            pass
    lat = provider.get("latitude", -33.45)
    lng = provider.get("longitude", -70.66)
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return -33.45, -70.66

@router.get("/match")
async def match_providers(
    machinery_type: str = Query(..., description="Tipo de maquinaria requerida"),
    client_lat: float = Query(..., description="Latitud del cliente"),
    client_lng: float = Query(..., description="Longitud del cliente"),
    max_radius: float = Query(30, description="Radio máximo en km"),
    limit: int = Query(5, description="Máximo de proveedores a retornar"),
    needs_invoice: bool = Query(False, description="Si el cliente necesita factura (solo informativo; no filtra proveedores)")
):
    """
    PRICING + DISTANCE MATCHING (MVP)
    
    1. Filtra proveedores por:
       - availability = true
       - onboarding_completed = true
       - compatible machinery
       - within max radius (30 km default)
    
    2. Calcula score:
       score = (0.6 * normalized_price) + (0.4 * normalized_distance)
    
    3. Retorna ordenados por menor score (mejor primero)
    """
    db = get_db()
    t0 = time.perf_counter()

    try:
        # Buscar proveedores que cumplan los criterios
        query = {
            "role": "provider",
            # Campo de disponibilidad alineado con el resto del backend
            "isAvailable": True,
            "onboarding_completed": True
        }
        
        # Proyección: solo campos necesarios para matching y respuesta (nunca password ni datos sensibles)
        match_projection = {
            "_id": 1,
            "id": 1,
            "name": 1,
            "providerData": 1,
            "machineData": 1,
            "latitude": 1,
            "longitude": 1,
            "location": 1,
            "rating": 1,
            "acceptedServices": 1,
            "rejectedServices": 1,
            "responseTimeAvg": 1,
        }
        providers_cursor = db.users.find(query, match_projection)
        all_providers = await providers_cursor.to_list(100)
        
        if not all_providers:
            duration_ms = int((time.perf_counter() - t0) * 1000)
            log_ops_event(
                logger,
                event="provider_match",
                machinery_type=machinery_type,
                count=0,
                returned=3,
                is_demo=True,
                duration_ms=duration_ms,
                success=True,
            )
            # Retornar datos demo si no hay proveedores reales
            return {
                "providers": get_demo_providers(machinery_type, client_lat, client_lng),
                "total": 3,
                "is_demo": True,
                "tomorrow_available": False,
                "tomorrow_count": 0
            }
        
        # Filtrar por maquinaria compatible y distancia
        eligible_providers = []
        
        for provider in all_providers:
            # No filtrar por factura: cliente con factura ve a todos; el precio mostrado ya refleja con/sin IVA
            # Verificar maquinaria compatible
            machine_data = provider.get('machineData', {})
            if machine_data.get('machineryType') != machinery_type:
                continue
            
            # Calcular distancia
            provider_lat, provider_lng = _get_provider_coords(provider)
            distance = haversine_distance(client_lat, client_lng, provider_lat, provider_lng)
            
            # Filtrar por radio máximo
            if distance > max_radius:
                continue
            
            # Obtener precio: por hora (pricePerHour) o por servicio (pricePerService) según tipo de maquinaria
            is_per_service = machinery_type in MACHINERY_PER_SERVICE
            if is_per_service:
                price = machine_data.get('pricePerService') or provider.get('price_per_hour') or 50000
            else:
                price = machine_data.get('pricePerHour') or provider.get('price_per_hour') or 50000
            price = int(price)
            
            # Determinar si necesita traslado
            needs_transport = machinery_type not in MACHINERY_NO_TRANSPORT
            transport_fee = int(distance * 2000) if needs_transport else 0  # $2000 por km
            
            accepted_services = int(provider.get('acceptedServices', 0) or 0)
            rejected_services = int(provider.get('rejectedServices', 0) or 0)
            response_time_avg = provider.get('responseTimeAvg', None)

            operator_name = _get_operator_display_name(provider)
            emits_invoice = provider.get('providerData', {}).get('emitsInvoice', False)
            row = {
                "id": _provider_response_id(provider),
                "name": provider.get('providerData', {}).get('businessName', 'Proveedor'),
                "operator_name": operator_name,
                "emits_invoice": emits_invoice,
                "price_per_hour": price,
                "transport_fee": transport_fee,
                "distance": round(distance, 1),
                "eta_minutes": get_eta_minutes(distance, machinery_type),
                "rating": provider.get('rating', 4.5),
                "machinery_type": machinery_type,
                "needs_transport": needs_transport,
                "accepted_services": accepted_services,
                "rejected_services": rejected_services,
                "response_time_avg": response_time_avg
            }
            spec_info = MACHINERY_SPEC_FIELD.get(machinery_type)
            if spec_info:
                key_out, keys_in = spec_info
                val = None
                for k in keys_in:
                    val = machine_data.get(k)
                    if val is not None and val != '':
                        break
                if val is not None and val != '':
                    try:
                        v = float(val)
                        min_val = MACHINERY_SPEC_MIN.get(machinery_type)
                        if min_val is not None and v < min_val:
                            continue  # no exponer capacidad de equipo liviano/3/4
                    except (TypeError, ValueError):
                        pass
                    row[key_out] = val
            eligible_providers.append(row)
        
        if not eligible_providers:
            # Contar proveedores para mañana (misma maquinaria, sin filtro de disponibilidad inmediata)
            tomorrow_count = 0
            tomorrow_cursor = db.users.find(
                {"role": "provider", "onboarding_completed": True},
                {"machineData": 1, "latitude": 1, "longitude": 1, "providerData": 1, "location": 1}
            )
            async for p in tomorrow_cursor:
                if p.get('machineData', {}).get('machineryType') == machinery_type:
                    ploc = _get_provider_coords(p)
                    if haversine_distance(client_lat, client_lng, ploc[0], ploc[1]) <= max_radius:
                        tomorrow_count += 1
            duration_ms = int((time.perf_counter() - t0) * 1000)
            log_ops_event(
                logger,
                event="provider_match",
                machinery_type=machinery_type,
                count=0,
                returned=3,
                is_demo=True,
                tomorrow_available=tomorrow_count > 0,
                duration_ms=duration_ms,
                success=True,
            )
            return {
                "providers": get_demo_providers(machinery_type, client_lat, client_lng),
                "total": 3,
                "is_demo": True,
                "tomorrow_available": tomorrow_count > 0,
                "tomorrow_count": tomorrow_count
            }
        
        # Ranking visible: match score (mayor = mejor) + diversidad suave; sin excluir oferta
        max_distance = max(float(p["distance"]) for p in eligible_providers) or 1.0
        ref_price = reference_price_for_machinery(machinery_type)

        for provider in eligible_providers:
            ms = calculate_match_score(
                provider,
                reference_price=ref_price,
                max_distance=max_distance,
            )
            provider["_match_score"] = ms

        eligible_providers.sort(key=lambda x: x["_match_score"], reverse=True)
        result_providers = enforce_diversity_ranked(
            eligible_providers,
            limit=limit,
            reference_price=ref_price,
        )
        
        # Remover campos internos del resultado final
        for p in result_providers:
            p.pop("_match_score", None)
            p.pop('accepted_services', None)
            p.pop('rejected_services', None)
            p.pop('response_time_avg', None)

        duration_ms = int((time.perf_counter() - t0) * 1000)
        log_ops_event(
            logger,
            event="provider_match",
            machinery_type=machinery_type,
            count=len(result_providers),
            is_demo=False,
            duration_ms=duration_ms,
            success=True,
        )

        return {
            "providers": result_providers,
            "total": len(result_providers),
            "is_demo": False
        }

    except Exception as e:
        duration_ms = int((time.perf_counter() - t0) * 1000)
        logger.exception("match_providers failed: %s", e)
        log_ops_event(
            logger,
            event="provider_match_failed",
            machinery_type=machinery_type,
            success=False,
            duration_ms=duration_ms,
            error_type=type(e).__name__,
        )
        return {
            "providers": get_demo_providers(machinery_type, client_lat, client_lng),
            "total": 3,
            "is_demo": True,
            "tomorrow_available": False,
            "tomorrow_count": 0,
            "error": "match_unavailable",
        }


# Valores demo del campo diferenciador: solo maquinaria pesada real (evitar 3/4, equipos livianos)
# Tolva: desde 12 m³ (tolva pesada; <12 = camión 3/4). Aljibe/pluma: rangos industriales.
DEMO_SPEC_VALUES = {
    'camion_tolva': [12, 14, 16, 18, 20],       # m³ — solo tolva pesada
    'camion_aljibe': [10000, 12000, 15000, 18000, 20000],  # L — estanque industrial
    'camion_pluma': [8, 10, 12, 15, 18],        # ton·m — pluma pesada
    'grua': [25, 30, 35, 40],                   # ton — grúa móvil
    'retroexcavadora': [0.4, 0.5, 0.6],         # m³ balde — estándar
    'excavadora': [20, 25, 30, 35],             # ton — peso operativo
    'excavadora_hidraulica': [20, 25, 30, 35],
    'bulldozer': [180, 200, 220, 250],          # HP — dozer pesado
    'motoniveladora': [3, 3.5, 4],              # m — ancho hoja
    'compactadora': [5, 6, 8, 10],              # ton — rodillo pesado
    'rodillo': [5, 6, 8, 10],
    'minicargador': [0.4, 0.5, 0.4, 0.5, 0.5], # m³ — balde estándar (no 0.3)
}


def get_demo_providers(machinery_type: str, client_lat: float, client_lng: float) -> List[dict]:
    """
    Retorna 5 proveedores demo para testing.
    Incluye el campo diferenciador (ton, m³, L, etc.) para que el cliente lo vea en P4.
    """
    needs_transport = machinery_type not in MACHINERY_NO_TRANSPORT
    is_per_service = machinery_type in MACHINERY_PER_SERVICE
    if is_per_service:
        ref = REFERENCE_PRICES_PER_SERVICE.get(machinery_type, {"min": 200000, "max": 300000, "default": 240000})
        prices = [ref["min"], int(ref["default"] * 0.9), ref["default"], int(ref["default"] * 1.1), ref["max"]]
    else:
        prices = [45000, 52000, 48000, 42000, 55000]

    spec_info = MACHINERY_SPEC_FIELD.get(machinery_type)
    demo_values = DEMO_SPEC_VALUES.get(machinery_type, []) if spec_info else []

    def _spec_extra(i: int) -> dict:
        if not spec_info or i >= len(demo_values):
            return {}
        key_out, _ = spec_info
        return {key_out: demo_values[i]}

    base_providers = [
        {
            "id": "demo-1",
            "name": "Transportes Silva",
            "emits_invoice": True,
            "price_per_hour": prices[0],
            "transport_fee": 25000 if needs_transport else 0,
            **_spec_extra(0),
            "distance": 5.2,
            "eta_minutes": get_eta_minutes(5.2, machinery_type),
            "rating": 4.8,
            "machinery_type": machinery_type,
            "closing_time": "20:00",
            "operator_name": "Carlos Silva",
            "operator_rut": "12.345.678-9",
            "license_plate": "BGKL-45",
            "needs_transport": needs_transport
        },
        {
            "id": "demo-2",
            "name": "Maquinarias del Sur",
            "emits_invoice": True,
            "price_per_hour": prices[1],
            "transport_fee": 30000 if needs_transport else 0,
            **_spec_extra(1),
            "distance": 8.1,
            "eta_minutes": get_eta_minutes(8.1, machinery_type),
            "rating": 4.6,
            "machinery_type": machinery_type,
            "closing_time": "21:00",
            "operator_name": "Pedro González",
            "operator_rut": "11.222.333-4",
            "license_plate": "HJKL-78",
            "needs_transport": needs_transport
        },
        {
            "id": "demo-3",
            "name": "Constructora Norte",
            "emits_invoice": True,
            "price_per_hour": prices[2],
            "transport_fee": 22000 if needs_transport else 0,
            **_spec_extra(2),
            "distance": 12.5,
            "eta_minutes": get_eta_minutes(12.5, machinery_type),
            "rating": 4.9,
            "machinery_type": machinery_type,
            "closing_time": "19:00",
            "operator_name": "Juan Martínez",
            "operator_rut": "15.678.901-2",
            "license_plate": "MNOP-12",
            "needs_transport": needs_transport
        },
        {
            "id": "demo-4",
            "name": "Excavaciones Rápidas",
            "emits_invoice": False,
            "price_per_hour": prices[3],
            "transport_fee": 35000 if needs_transport else 0,
            **_spec_extra(3),
            "distance": 15.3,
            "eta_minutes": get_eta_minutes(15.3, machinery_type),
            "rating": 4.7,
            "machinery_type": machinery_type,
            "closing_time": "20:00",
            "operator_name": "Roberto Díaz",
            "operator_rut": "14.567.890-K",
            "license_plate": "QRST-34",
            "needs_transport": needs_transport
        },
        {
            "id": "demo-5",
            "name": "Movitierras SpA",
            "emits_invoice": True,
            "price_per_hour": prices[4],
            "transport_fee": 20000 if needs_transport else 0,
            **_spec_extra(4),
            "distance": 6.8,
            "eta_minutes": get_eta_minutes(6.8, machinery_type),
            "rating": 4.5,
            "machinery_type": machinery_type,
            "closing_time": "18:30",
            "operator_name": "Miguel Torres",
            "operator_rut": "13.456.789-0",
            "license_plate": "UVWX-56",
            "needs_transport": needs_transport
        }
    ]
    return base_providers


@router.post("/request/{provider_id}")
async def send_request_to_provider(
    provider_id: str,
    request_data: dict
):
    """
    Envía solicitud a un proveedor específico
    El proveedor tiene 60 segundos para aceptar
    """
    db = get_db()
    
    # Crear la solicitud
    from datetime import datetime, timezone
    from uuid import uuid4
    
    service_request = {
        "id": str(uuid4()),
        "provider_id": provider_id,
        "client_id": request_data.get("client_id"),
        "machinery_type": request_data.get("machinery_type"),
        "hours": request_data.get("hours"),
        "location": request_data.get("location"),
        "total_amount": request_data.get("total_amount"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc).isoformat(),  # + 60 seconds handled by timer
        "attempt_number": request_data.get("attempt_number", 1)
    }
    
    await db.service_requests.insert_one(service_request)
    
    return {
        "success": True,
        "request_id": service_request["id"],
        "message": f"Solicitud enviada al proveedor. Esperando respuesta (60s timeout)."
    }
