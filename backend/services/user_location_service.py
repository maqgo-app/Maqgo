from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional


LOCATION_SOURCES = {"profile_update", "availability", "service_event"}


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_user_location(location: Any, source: str, *, now_iso: Optional[str] = None) -> dict:
    if source not in LOCATION_SOURCES:
        raise ValueError("source de ubicación inválido")
    if not isinstance(location, dict):
        raise ValueError("location debe ser un objeto con lat y lng")

    lat = _to_float(location.get("lat"))
    lng = _to_float(location.get("lng"))
    if lat is None or lng is None:
        raise ValueError("location requiere lat y lng numéricos")

    return {
        "lat": lat,
        "lng": lng,
        "updatedAt": now_iso or _now_iso(),
        "source": source,
    }


def location_meta_from_user(user: Optional[dict]) -> dict:
    loc = user.get("location") if isinstance(user, dict) else None
    if not isinstance(loc, dict):
        return {"updatedAt": None, "source": None, "isStale": False}
    return {
        "updatedAt": loc.get("updatedAt"),
        "source": loc.get("source"),
        # Informativo solamente: no se usa en matching ni backend decisions.
        "isStale": False,
    }


async def update_user_location(db, user_id: str, location: Any, source: str) -> dict:
    normalized = normalize_user_location(location, source)
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"location": normalized}},
    )
    if result.matched_count == 0:
        raise LookupError("Usuario no encontrado")
    return normalized


__all__ = ["LOCATION_SOURCES", "location_meta_from_user", "normalize_user_location", "update_user_location"]
