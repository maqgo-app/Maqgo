"""
MAQGO location resolver.

Passive utility: centralizes the order in which we resolve a machine's current
location without wiring it into matching/booking flows yet.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _first_present(mapping: dict, keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in mapping and mapping.get(key) not in (None, ""):
            return mapping.get(key)
    return None


def _extract_lat_lng(raw: Any) -> Optional[tuple[float, float]]:
    if not isinstance(raw, dict):
        return None
    lat = _to_float(_first_present(raw, ("lat", "latitude")))
    lng = _to_float(_first_present(raw, ("lng", "lon", "longitude")))
    if lat is None or lng is None:
        coords = raw.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            # GeoJSON commonly stores [lng, lat].
            lng = _to_float(coords[0])
            lat = _to_float(coords[1])
    if lat is None or lng is None:
        return None
    return lat, lng


def _timestamp_from(raw: dict) -> Optional[Any]:
    return _first_present(
        raw,
        (
            "capturedAt",
            "updatedAt",
            "locationUpdatedAt",
            "confirmedAt",
            "timestamp",
            "ts",
        ),
    )


def _resolved(lat: float, lng: float, *, source: str, freshness: str, raw: dict, entity: Optional[dict] = None) -> dict:
    out = {
        "found": True,
        "lat": lat,
        "lng": lng,
        "source": source,
        "freshness": freshness,
        "capturedAt": _timestamp_from(raw),
    }
    if entity:
        out["entity"] = {k: v for k, v in entity.items() if v is not None}
    return out


def _unresolved() -> dict:
    return {
        "found": False,
        "lat": None,
        "lng": None,
        "source": "unavailable",
        "freshness": "unknown",
        "capturedAt": None,
    }


def _location_from_doc(doc: Optional[dict], fields: tuple[str, ...], *, source: str, freshness: str, entity: Optional[dict] = None) -> Optional[dict]:
    if not isinstance(doc, dict):
        return None
    for field in fields:
        raw = doc.get(field)
        coords = _extract_lat_lng(raw)
        if coords:
            return _resolved(coords[0], coords[1], source=source, freshness=freshness, raw=raw, entity=entity)
    coords = _extract_lat_lng(doc)
    if coords:
        return _resolved(coords[0], coords[1], source=source, freshness=freshness, raw=doc, entity=entity)
    return None


def _provider_address_location(provider: Optional[dict]) -> Optional[dict]:
    pdata = provider.get("providerData") if isinstance(provider, dict) else None
    if not isinstance(pdata, dict):
        return None
    lat = _to_float(pdata.get("addressLat"))
    lng = _to_float(pdata.get("addressLng"))
    if lat is None or lng is None:
        return None
    return _resolved(
        lat,
        lng,
        source="provider_address",
        freshness="static",
        raw={"lat": lat, "lng": lng},
        entity={"kind": "provider", "id": provider.get("id") if isinstance(provider, dict) else None},
    )


async def _find_operator_locations(db, machine: Optional[dict], provider_id: Optional[str]) -> list[dict]:
    operator_ids: list[str] = []
    if isinstance(machine, dict):
        for op in machine.get("operators") or []:
            if isinstance(op, dict) and op.get("id"):
                operator_ids.append(str(op.get("id")))

    query = None
    if operator_ids:
        query = {"id": {"$in": list(dict.fromkeys(operator_ids))}}
    elif provider_id:
        query = {"owner_id": provider_id, "provider_role": "operator"}
    if not query:
        return []

    cursor = db.users.find(query, {"_id": 0, "id": 1, "name": 1, "location": 1, "locationUpdatedAt": 1})
    docs = await cursor.to_list(20)
    out = []
    for doc in docs:
        loc = doc.get("location") if isinstance(doc, dict) else None
        resolved = _location_from_doc(
            {"location": loc, "locationUpdatedAt": doc.get("locationUpdatedAt")},
            ("location",),
            source="operator_gps",
            freshness="dynamic",
            entity={"kind": "operator", "id": doc.get("id"), "name": doc.get("name")},
        )
        if resolved:
            if resolved.get("capturedAt") is None:
                resolved["capturedAt"] = doc.get("locationUpdatedAt")
            out.append(resolved)
    return out


async def resolve_machine_location(
    db,
    machine_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    service_request_id: Optional[str] = None,
) -> dict:
    """
    Resolve the best known location for a machine/provider.

    Priority:
    1. OEM GPS fields on machines (future-compatible; no external calls).
    2. Physical machine GPS/location fields on machines.
    3. Operator GPS from service_request confirmedDepartureLocation or operator user location.
    4. Provider/user location.
    5. Provider registered address coordinates.
    """
    machine = None
    if machine_id:
        machine = await db.machines.find_one({"id": str(machine_id), "status": {"$ne": "deleted"}}, {"_id": 0})
        if isinstance(machine, dict) and not provider_id:
            provider_id = machine.get("provider_id")

    provider = None
    if provider_id:
        provider = await db.users.find_one({"id": str(provider_id)}, {"_id": 0, "password": 0})

    # 1) OEM GPS (Komatsu/CAT/etc.) if future integrations persist any of these fields.
    resolved = _location_from_doc(
        machine,
        ("oemLocation", "oemGps", "oemGPS", "gpsOem", "gps_oem"),
        source="oem_gps",
        freshness="dynamic",
        entity={"kind": "machine", "id": machine_id, "provider_id": provider_id},
    )
    if resolved:
        return resolved

    # 2) Physical machine GPS/location fields if present in db.machines.
    resolved = _location_from_doc(
        machine,
        ("location", "gps", "coordinates", "currentLocation", "lastKnownLocation"),
        source="machine_gps",
        freshness="dynamic",
        entity={"kind": "machine", "id": machine_id, "provider_id": provider_id},
    )
    if resolved:
        return resolved

    # 3a) Operator/provider departure GPS event stored on the active service request.
    if service_request_id:
        req = await db.service_requests.find_one({"id": str(service_request_id)}, {"_id": 0, "confirmedDepartureLocation": 1})
        loc = req.get("confirmedDepartureLocation") if isinstance(req, dict) else None
        if isinstance(loc, dict) and str(loc.get("source") or "").lower() == "gps":
            coords = _extract_lat_lng(loc)
            if coords:
                return _resolved(
                    coords[0],
                    coords[1],
                    source="operator_confirmed_departure",
                    freshness="event",
                    raw=loc,
                    entity={
                        "kind": "service_request",
                        "id": service_request_id,
                        "confirmedByUserId": loc.get("confirmedByUserId"),
                    },
                )

    # 3b) Latest operator location stored on operator user docs, when available.
    operator_locations = await _find_operator_locations(db, machine, provider_id)
    if operator_locations:
        # Freshness ordering is best-effort; ISO timestamps sort lexically.
        operator_locations.sort(key=lambda x: str(x.get("capturedAt") or ""), reverse=True)
        return operator_locations[0]

    # 4) Provider live/base location stored on user.
    resolved = _location_from_doc(
        provider,
        ("location",),
        source="provider_location",
        freshness="dynamic",
        entity={"kind": "provider", "id": provider_id},
    )
    if resolved:
        if resolved.get("capturedAt") is None and isinstance(provider, dict):
            resolved["capturedAt"] = provider.get("locationUpdatedAt")
        return resolved

    # 5) Provider registered address coordinates.
    resolved = _provider_address_location(provider)
    if resolved:
        return resolved

    return _unresolved()


__all__ = ["resolve_machine_location"]
