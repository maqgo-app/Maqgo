"""
Ranking y diversidad para la lista de proveedores visibles (cliente /providers/match).

Mayor match_score = mejor candidato. No excluye proveedores: diversidad acotada + fallback.
"""

from __future__ import annotations

import logging
import math
import os
from typing import Any, Mapping

from services.matching_score import calculate_price_score

logger = logging.getLogger(__name__)

# Pesos (suma = 1.0): precio con influencia suave, sin dominar.
W_DISTANCE = 0.30
W_ACCEPTANCE = 0.30
W_RESPONSE = 0.20
W_PRICE = 0.20

DEFAULT_ACCEPTANCE_SCORE = 0.7
DEFAULT_RESPONSE_SCORE = 0.7
PRICE_SCORE_FALLBACK = 0.8

# Diversidad: máximo por bucket de precio relativo a referencia y por empresa
MAX_PER_PRICE_BUCKET = 2
MAX_PER_COMPANY = 2

# Tras penalización por respuesta, el score no cae por debajo de este piso (no elimina oferta).
MIN_SCORE_AFTER_PENALTY = 0.5

_DEBUG_MATCH_RANKING = os.environ.get("DEBUG_MATCH", "").lower() == "true"


def normalize_distance_for_match(distance_km: float, max_distance_km: float) -> float:
    """Más cerca → mayor score en [0, 1]."""
    try:
        d = max(0.0, float(distance_km))
        mx = float(max_distance_km)
    except (TypeError, ValueError):
        return 0.7
    if mx <= 0:
        return 1.0
    return max(0.0, min(1.0, 1.0 - (d / mx)))


def acceptance_score_from_row(accepted: int, rejected: int) -> float:
    total = int(accepted) + int(rejected)
    if total <= 0:
        return DEFAULT_ACCEPTANCE_SCORE
    return max(0.0, min(1.0, int(accepted) / total))


def get_response_penalty(row: Mapping[str, Any]) -> float:
    """
    Multiplicador suave (1 = sin castigo) para reducir exposición de quienes responden lento.
    Usa responseTimeScore como lentitud 0–1 si existe; si no, minutos/60 (puede superar 1).
    Sin datos de tiempo → 1.0 (sin penalización extra).
    """
    raw = row.get("responseTimeScore")
    if raw is not None:
        try:
            response = float(raw)
        except (TypeError, ValueError):
            response = 0.7
        response = max(0.0, response)
    else:
        rt = row.get("response_time_avg")
        if rt is None:
            return 1.0
        try:
            response = max(float(rt), 0.0) / 60.0
        except (TypeError, ValueError):
            return 1.0
    if response > 1.2:
        return 0.8
    if response > 0.9:
        return 0.9
    return 1.0


def response_score_from_row(response_time_avg: Any) -> float:
    if response_time_avg is None:
        return DEFAULT_RESPONSE_SCORE
    try:
        rt_val = max(float(response_time_avg), 0.0)
    except (TypeError, ValueError):
        return DEFAULT_RESPONSE_SCORE
    return max(0.0, min(1.0, 1.0 - min(rt_val / 60.0, 1.0)))


def calculate_match_score(
    row: Mapping[str, Any],
    *,
    reference_price: float | None,
    max_distance: float,
) -> float:
    distance = float(row.get("distance") or 0)
    distance_score = normalize_distance_for_match(distance, max_distance)

    acceptance_score = acceptance_score_from_row(
        int(row.get("accepted_services") or 0),
        int(row.get("rejected_services") or 0),
    )

    response_score = response_score_from_row(row.get("response_time_avg"))

    price = float(row.get("price_per_hour") or 0)
    if reference_price is not None and reference_price > 0 and price > 0:
        price_score = calculate_price_score(price, reference_price)
    else:
        price_score = PRICE_SCORE_FALLBACK

    base_score = (
        W_DISTANCE * distance_score
        + W_ACCEPTANCE * acceptance_score
        + W_RESPONSE * response_score
        + W_PRICE * price_score
    )
    if not math.isfinite(base_score):
        base_score = 0.5

    penalty = get_response_penalty(row)
    final_score = base_score * penalty
    final_score = max(MIN_SCORE_AFTER_PENALTY, final_score)
    if not math.isfinite(final_score):
        final_score = 0.5

    log_match_ranking_debug(row, base_score=base_score, penalty=penalty, final_score=final_score)
    return final_score


def get_price_bucket(price: Any, reference_price: float | None) -> int:
    """Buckets ~relativos a la referencia del tipo de máquina (5 franjas aprox.)."""
    try:
        p = float(price or 0)
        ref = float(reference_price or 0)
    except (TypeError, ValueError):
        return 0
    if not p or not ref or p <= 0 or ref <= 0:
        return 0
    relative = p / ref
    return int(round(relative * 5))


def normalize_company_name(name: str | None) -> str:
    return (name or "").lower().strip()


def company_key_from_row(row: Mapping[str, Any]) -> str:
    cid = row.get("companyId") or row.get("company_id")
    if cid is not None and str(cid).strip():
        return str(cid).strip()[:240]
    return normalize_company_name(str(row.get("name") or ""))[:240]


def enforce_diversity_ranked(
    ranked: list[dict],
    *,
    limit: int,
    reference_price: float | None = None,
) -> list[dict]:
    """
    Recorre en orden de mejor score; máx 2 por bucket de precio relativo y máx 2 por empresa.
    Si quedan huecos, rellena con el resto en orden sin aplicar diversidad.
    """
    if not ranked:
        return []
    if limit <= 0:
        return []

    by_id = {str(p["id"]): p for p in ranked if p.get("id") is not None}
    order = [str(p["id"]) for p in ranked if p.get("id") is not None]

    selected_ids: list[str] = []
    price_bucket_counts: dict[int, int] = {}
    company_counts: dict[str, int] = {}

    def can_add(pid: str) -> bool:
        p = by_id.get(pid)
        if not p:
            return False
        b = get_price_bucket(p.get("price_per_hour"), reference_price)
        c = company_key_from_row(p)
        if price_bucket_counts.get(b, 0) >= MAX_PER_PRICE_BUCKET:
            return False
        if company_counts.get(c, 0) >= MAX_PER_COMPANY:
            return False
        return True

    def register(pid: str) -> None:
        p = by_id[pid]
        b = get_price_bucket(p.get("price_per_hour"), reference_price)
        c = company_key_from_row(p)
        price_bucket_counts[b] = price_bucket_counts.get(b, 0) + 1
        company_counts[c] = company_counts.get(c, 0) + 1

    for pid in order:
        if len(selected_ids) >= limit:
            break
        if pid in selected_ids:
            continue
        if can_add(pid):
            selected_ids.append(pid)
            register(pid)

    if len(selected_ids) < limit:
        for pid in order:
            if len(selected_ids) >= limit:
                break
            if pid in selected_ids:
                continue
            selected_ids.append(pid)

    return [by_id[i] for i in selected_ids[:limit]]


def log_match_ranking_debug(
    row: Mapping[str, Any],
    *,
    base_score: float,
    penalty: float,
    final_score: float,
) -> None:
    """Log estructurado solo si DEBUG_MATCH=true."""
    if not _DEBUG_MATCH_RANKING:
        return
    try:
        acc = acceptance_score_from_row(
            int(row.get("accepted_services") or 0),
            int(row.get("rejected_services") or 0),
        )
        resp = response_score_from_row(row.get("response_time_avg"))
        logger.info(
            "MATCH_RANKING %s",
            {
                "providerId": row.get("id"),
                "base_score": round(float(base_score), 6),
                "penalty": round(float(penalty), 4),
                "final_score": round(float(final_score), 6),
                "distance": row.get("distance"),
                "acceptance": round(acc, 4),
                "response": round(resp, 4),
                "price": row.get("price_per_hour"),
            },
        )
    except Exception:
        logger.debug("MATCH_RANKING log skipped", exc_info=False)


__all__ = [
    "W_DISTANCE",
    "W_ACCEPTANCE",
    "W_RESPONSE",
    "W_PRICE",
    "calculate_match_score",
    "company_key_from_row",
    "get_response_penalty",
    "enforce_diversity_ranked",
    "get_price_bucket",
    "log_match_ranking_debug",
    "normalize_company_name",
    "normalize_distance_for_match",
    "acceptance_score_from_row",
    "response_score_from_row",
]
