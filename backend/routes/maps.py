# Google Maps Integration for MAQGO
# Autocomplete (Places API) + ETA (Distance Matrix API)

import os
import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter(prefix="/api/maps", tags=["maps"])

GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# =============================================================================
# PLACES AUTOCOMPLETE - Para sugerir direcciones mientras el usuario escribe
# =============================================================================

@router.get("/autocomplete")
async def autocomplete_address(
    input: str = Query(..., min_length=3, description="Texto de búsqueda"),
    session_token: Optional[str] = None
):
    """
    Autocomplete de direcciones usando Google Places API.
    
    - Filtra solo direcciones en Chile
    - Retorna hasta 5 sugerencias
    - Usa session_token para agrupar llamadas y reducir costos
    """
    if not GOOGLE_MAPS_KEY:
        # Fallback cuando no hay API key - retorna sugerencias mock
        return {
            "predictions": [
                {"description": f"{input}, Santiago, Chile", "place_id": "mock_1"},
                {"description": f"{input}, Providencia, Chile", "place_id": "mock_2"},
                {"description": f"{input}, Las Condes, Chile", "place_id": "mock_3"},
            ],
            "status": "MOCK_MODE"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            params = {
                "input": input,
                "key": GOOGLE_MAPS_KEY,
                "types": "address",
                "components": "country:cl",  # Solo Chile
                "language": "es"
            }
            if session_token:
                params["sessiontoken"] = session_token
            
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/autocomplete/json",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") not in ["OK", "ZERO_RESULTS"]:
                raise HTTPException(502, f"Google API error: {data.get('status')}")
            
            return {
                "predictions": [
                    {
                        "description": p["description"],
                        "place_id": p["place_id"],
                        "main_text": p.get("structured_formatting", {}).get("main_text", ""),
                        "secondary_text": p.get("structured_formatting", {}).get("secondary_text", "")
                    }
                    for p in data.get("predictions", [])[:5]
                ],
                "status": data.get("status")
            }
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Error connecting to Google Maps: {str(e)}")


# =============================================================================
# PLACE DETAILS - Para obtener coordenadas de una dirección seleccionada
# =============================================================================

@router.get("/place-details")
async def get_place_details(
    place_id: str = Query(..., description="Place ID de Google"),
    session_token: Optional[str] = None
):
    """
    Obtiene detalles de un lugar, incluyendo coordenadas.
    """
    if not GOOGLE_MAPS_KEY:
        # Mock response
        return {
            "location": {"lat": -33.4489, "lng": -70.6693},  # Santiago centro
            "formatted_address": "Dirección de ejemplo, Santiago, Chile",
            "status": "MOCK_MODE"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            params = {
                "place_id": place_id,
                "key": GOOGLE_MAPS_KEY,
                "fields": "geometry,formatted_address",
                "language": "es"
            }
            if session_token:
                params["sessiontoken"] = session_token
            
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") != "OK":
                raise HTTPException(502, f"Google API error: {data.get('status')}")
            
            result = data.get("result", {})
            geometry = result.get("geometry", {}).get("location", {})
            
            return {
                "location": {
                    "lat": geometry.get("lat"),
                    "lng": geometry.get("lng")
                },
                "formatted_address": result.get("formatted_address"),
                "status": "OK"
            }
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Error connecting to Google Maps: {str(e)}")


# =============================================================================
# DISTANCE MATRIX - Para calcular ETA real con tráfico
# =============================================================================

@router.get("/eta")
async def calculate_eta(
    origin_lat: float = Query(..., description="Latitud origen (proveedor)"),
    origin_lng: float = Query(..., description="Longitud origen (proveedor)"),
    dest_lat: float = Query(..., description="Latitud destino (cliente)"),
    dest_lng: float = Query(..., description="Longitud destino (cliente)")
):
    """
    Calcula ETA real usando Google Distance Matrix API.
    
    - Considera tráfico en tiempo real
    - Retorna duración en minutos y distancia en km
    """
    if not GOOGLE_MAPS_KEY:
        # Cálculo mock: 40 min mínimo (preparación + ruta); 20 min sería máquina al lado (irreal)
        import math
        distance_deg = math.sqrt((dest_lat - origin_lat)**2 + (dest_lng - origin_lng)**2)
        distance_km = distance_deg * 111  # Aproximación: 1 grado ≈ 111 km
        driving_min = max(15, int((distance_km / 25) * 60 * 1.25))
        eta_minutes = max(40, 30 + driving_min)
        
        return {
            "duration_minutes": eta_minutes,
            "duration_text": f"{eta_minutes} min",
            "distance_km": round(distance_km, 1),
            "distance_text": f"{round(distance_km, 1)} km",
            "status": "MOCK_MODE"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/distancematrix/json",
                params={
                    "origins": f"{origin_lat},{origin_lng}",
                    "destinations": f"{dest_lat},{dest_lng}",
                    "key": GOOGLE_MAPS_KEY,
                    "mode": "driving",
                    "departure_time": "now",  # Considera tráfico actual
                    "traffic_model": "best_guess",
                    "language": "es"
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") != "OK":
                raise HTTPException(502, f"Google API error: {data.get('status')}")
            
            element = data["rows"][0]["elements"][0]
            
            if element.get("status") != "OK":
                raise HTTPException(404, "No se pudo calcular la ruta")
            
            # Usar duration_in_traffic si está disponible
            duration = element.get("duration_in_traffic", element.get("duration", {}))
            distance = element.get("distance", {})
            
            return {
                "duration_minutes": duration.get("value", 0) // 60,
                "duration_text": duration.get("text", ""),
                "distance_km": round(distance.get("value", 0) / 1000, 1),
                "distance_text": distance.get("text", ""),
                "status": "OK"
            }
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Error connecting to Google Maps: {str(e)}")


# =============================================================================
# STATUS - Para verificar si la API está configurada
# =============================================================================

@router.get("/status")
async def maps_status():
    """
    Verifica el estado de la configuración de Google Maps.
    """
    return {
        "configured": bool(GOOGLE_MAPS_KEY),
        "mode": "PRODUCTION" if GOOGLE_MAPS_KEY else "MOCK",
        "message": "Google Maps API configurada" if GOOGLE_MAPS_KEY else "Usando modo MOCK - Agrega GOOGLE_MAPS_API_KEY al .env"
    }
