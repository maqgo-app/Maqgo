"""
Score de matching para ordenar proveedores (menor score = mejor).

Pesos por defecto: precio 50%, distancia 30%, responsividad 15%, tasa de aceptación 5%.
"""

from __future__ import annotations

from collections.abc import Collection
from typing import Any, Mapping

from pricing.constants import REFERENCE_PRICES_PER_HOUR, REFERENCE_PRICES_PER_SERVICE

# Peso máximo de la influencia suave vs precio de referencia (no reemplaza el score base).
W_REFERENCE_PRICE_SOFT = 0.10

# Pesos (suma = 1.0)
W_PRICE = 0.5
W_DISTANCE = 0.3
W_RESPONSIVENESS = 0.15
W_ACCEPTANCE = 0.05


def normalize(value: float, min_val: float, max_val: float) -> float:
    if max_val == min_val:
        return 0.0
    return (value - min_val) / (max_val - min_val)


def acceptance_rate_from_provider(provider: Mapping[str, Any]) -> float:
    """
    Tasa de aceptación para ranking: aceptaciones vs (aceptaciones + ofertas expiradas sin respuesta).
    Los rechazos explícitos no penalizan el score (FASE 5).
    """
    a = int(provider.get("acceptedServices", 0) or 0)
    nr = int(provider.get("matchingOffersExpired", 0) or 0)
    total = a + nr
    if total > 0:
        return a / total
    return 0.5


def calculate_price_score(provider_price: float, reference_price: float) -> float:
    """
    Influencia suave vs referencia de mercado (MAQGO: no excluye por precio).
    ratio = reference / provider → valores altos si el proveedor cobra poco vs referencia.
    Acotado a [0.6, 1.1]; sin lanzar errores.
    """
    try:
        pp = float(provider_price)
        ref = float(reference_price)
    except (TypeError, ValueError):
        return 0.8
    if not pp or not ref or pp <= 0 or ref <= 0:
        return 0.8
    ratio = ref / pp
    return max(0.6, min(1.1, ratio))


def reference_price_for_machinery(machinery_type: str | None) -> float | None:
    """
    Precio referencia (`default`) desde pricing.constants.
    Si no hay entrada para el tipo, no se aplica ajuste (None).
    """
    if not machinery_type or not str(machinery_type).strip():
        return None
    mt = str(machinery_type).strip().lower()
    row = REFERENCE_PRICES_PER_HOUR.get(mt) or REFERENCE_PRICES_PER_SERVICE.get(mt)
    if not row:
        return None
    try:
        v = float(row.get("default", 0) or 0)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    return v


def responsiveness_rate_from_provider(provider: Mapping[str, Any]) -> float:
    """
    0–1, mayor = más responsivo (menor tiempo de respuesta típico).
    Sin dato → 0.5 (neutro), alineado con routes/providers.py.
    """
    rt = provider.get("responseTimeAvg")
    if rt is None:
        return 0.5
    try:
        rt_val = max(float(rt), 0.0)
    except (TypeError, ValueError):
        return 0.5
    # 0 min → 1.0, 60+ min → 0.0
    return max(0.0, 1.0 - min(rt_val / 60.0, 1.0))


def compute_provider_score(
    provider: Mapping[str, Any],
    context: Mapping[str, float],
    *,
    reference_price: float | None = None,
) -> float:
    """
    provider:
        price (CLP / hora o unidad coherente con el batch)
        distance_km
        responsiveness_rate  # 0–1, mayor = mejor
        acceptance_rate      # 0–1, mayor = mejor

    context:
        min_price, max_price, min_distance, max_distance para normalización en el batch actual

    reference_price:
        Opcional. Si viene de la tabla de referencia, suma un término acotado (10% máx)
        sin sustituir el score base ni excluir proveedores.
    """
    price = float(provider["price"])
    distance_km = float(provider["distance_km"])
    responsiveness_rate = float(provider.get("responsiveness_rate", 0.5))
    acceptance_rate = float(provider.get("acceptance_rate", 0.5))

    price_norm = normalize(price, context["min_price"], context["max_price"])
    distance_norm = normalize(distance_km, context["min_distance"], context["max_distance"])

    # Peor desempeño en tasas → mayor aporte al score (penalización)
    responsiveness_norm = 1.0 - responsiveness_rate
    acceptance_norm = 1.0 - acceptance_rate

    base = (
        price_norm * W_PRICE
        + distance_norm * W_DISTANCE
        + responsiveness_norm * W_RESPONSIVENESS
        + acceptance_norm * W_ACCEPTANCE
    )
    if reference_price is None or reference_price <= 0:
        return base
    ps = calculate_price_score(price, reference_price)
    return base + W_REFERENCE_PRICE_SOFT * ps


def build_price_distance_context(
    entries: list[tuple[float, float]],
) -> dict[str, float] | None:
    """entries: (price, distance_km). None si entries vacío."""
    if not entries:
        return None
    prices = [e[0] for e in entries]
    distances = [e[1] for e in entries]
    return {
        "min_price": min(prices),
        "max_price": max(prices),
        "min_distance": min(distances),
        "max_distance": max(distances),
    }


def select_top_providers(
    providers: list[Mapping[str, Any]],
    context: Mapping[str, float],
    excluded_ids: Collection[str],
    *,
    limit: int = 5,
) -> list[Mapping[str, Any]]:
    """
    Filtra excluidos, puntúa con compute_provider_score y devuelve los `limit` mejores.

    Cada elemento de `providers` debe incluir `id` y los campos esperados por
    compute_provider_score: price, distance_km, responsiveness_rate, acceptance_rate
    (o rates por defecto vía .get en compute_provider_score).
    """
    excluded = {str(x) for x in excluded_ids}
    scored: list[tuple[Mapping[str, Any], float]] = []
    for p in providers:
        pid = p.get("id")
        if pid is None or str(pid) in excluded:
            continue
        score = compute_provider_score(p, context)
        scored.append((p, score))
    scored.sort(key=lambda x: x[1])
    return [row for row, _ in scored[:limit]]


class InMemoryMatchingBatch:
    """
    Lotes sucesivos en memoria sin repetir ids (tests / simulación).
    No sustituye matchingAttempts en Mongo ni start_matching en matching_service.
    """

    def __init__(self) -> None:
        self.attempted_provider_ids: set[str] = set()

    def next_batch(
        self,
        providers: list[Mapping[str, Any]],
        context: Mapping[str, float],
        *,
        limit: int = 5,
    ) -> list[Mapping[str, Any]]:
        batch = select_top_providers(
            providers,
            context,
            self.attempted_provider_ids,
            limit=limit,
        )
        for p in batch:
            pid = p.get("id")
            if pid is not None:
                self.attempted_provider_ids.add(str(pid))
        return batch


__all__ = [
    "W_PRICE",
    "W_DISTANCE",
    "W_RESPONSIVENESS",
    "W_ACCEPTANCE",
    "W_REFERENCE_PRICE_SOFT",
    "calculate_price_score",
    "reference_price_for_machinery",
    "normalize",
    "acceptance_rate_from_provider",
    "responsiveness_rate_from_provider",
    "compute_provider_score",
    "build_price_distance_context",
    "select_top_providers",
    "InMemoryMatchingBatch",
]
