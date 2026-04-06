"""
Utilidades MAQGO - sin dependencias externas.
"""

import math


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcula la distancia en metros entre dos coordenadas usando la fórmula de Haversine.

    Args:
        lat1, lng1: Primera coordenada (grados)
        lat2, lng2: Segunda coordenada (grados)

    Returns:
        Distancia en metros como float.
    """
    R = 6371000  # Radio de la Tierra en metros
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c
