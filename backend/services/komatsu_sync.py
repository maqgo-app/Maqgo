from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.machines_service import ensure_machine_indexes, sync_user_machine_mirror


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _to_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _extract_lat_lng(payload: Any) -> Tuple[Optional[float], Optional[float]]:
    if isinstance(payload, dict):
        for k_lat, k_lng in (
            ("lat", "lng"),
            ("latitude", "longitude"),
            ("Latitude", "Longitude"),
        ):
            lat = _to_float(payload.get(k_lat))
            lng = _to_float(payload.get(k_lng))
            if lat is not None and lng is not None:
                return lat, lng
        loc = payload.get("location")
        if isinstance(loc, dict):
            return _extract_lat_lng(loc)
        pos = payload.get("position")
        if isinstance(pos, dict):
            return _extract_lat_lng(pos)
        gps = payload.get("gps")
        if isinstance(gps, dict):
            return _extract_lat_lng(gps)
    return None, None


class KomatsuClient:
    def __init__(self) -> None:
        self.base_url = _clean_str(os.environ.get("KOMATSU_API_BASE_URL"))
        self.bearer_token = _clean_str(os.environ.get("KOMATSU_BEARER_TOKEN"))
        self.api_key = _clean_str(os.environ.get("KOMATSU_API_KEY"))
        self.asset_location_path = _clean_str(os.environ.get("KOMATSU_ASSET_LOCATION_PATH")) or "/assets/{asset_id}/location"

    def is_configured(self) -> bool:
        return bool(self.base_url) and (bool(self.bearer_token) or bool(self.api_key))

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"accept": "application/json"}
        if self.bearer_token:
            headers["authorization"] = f"Bearer {self.bearer_token}"
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    async def fetch_asset_location(self, asset_id: str) -> Dict[str, Any]:
        asset_id = _clean_str(asset_id)
        if not asset_id:
            raise ValueError("asset_id_required")
        if not self.is_configured():
            raise RuntimeError("komatsu_not_configured")

        path = self.asset_location_path.format(asset_id=asset_id)
        url = self.base_url.rstrip("/") + "/" + path.lstrip("/")
        timeout_s = float(os.environ.get("KOMATSU_TIMEOUT_S", "12") or 12)
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json()


async def sync_komatsu_machine_locations(
    db: AsyncIOMotorDatabase,
    *,
    limit: int = 500,
    dry_run: bool = False,
) -> Dict[str, Any]:
    await ensure_machine_indexes(db)

    client = KomatsuClient()
    if not client.is_configured():
        return {
            "ok": True,
            "skipped": True,
            "reason": "komatsu_not_configured",
            "updated_machines": 0,
            "updated_providers": 0,
            "scanned": 0,
        }

    cursor = db.machines.find(
        {
            "status": {"$ne": "deleted"},
            "external.komatsu.assetId": {"$exists": True, "$ne": ""},
        },
        {"_id": 0, "id": 1, "provider_id": 1, "external": 1, "locationUpdatedAt": 1},
    ).limit(int(limit))

    scanned = 0
    updated_machines = 0
    updated_providers = 0

    async for m in cursor:
        scanned += 1
        machine_id = _clean_str(m.get("id"))
        provider_id = _clean_str(m.get("provider_id"))
        external = m.get("external") if isinstance(m.get("external"), dict) else {}
        komatsu = external.get("komatsu") if isinstance(external.get("komatsu"), dict) else {}
        asset_id = _clean_str(komatsu.get("assetId"))
        if not machine_id or not provider_id or not asset_id:
            continue

        try:
            payload = await client.fetch_asset_location(asset_id)
        except Exception:
            continue

        lat, lng = _extract_lat_lng(payload)
        if lat is None or lng is None:
            continue

        now = _utcnow()
        machine_set: Dict[str, Any] = {
            "location": {"lat": lat, "lng": lng},
            "locationSource": "komatsu",
            "locationUpdatedAt": now,
            "updatedAt": now,
            "external.komatsu.lastSyncAt": now,
        }

        if not dry_run:
            await db.machines.update_one({"id": machine_id}, {"$set": machine_set})
            await sync_user_machine_mirror(db, provider_id)
        updated_machines += 1

        provider = await db.users.find_one({"id": provider_id}, {"_id": 0, "location": 1, "locationUpdatedAt": 1, "locationSource": 1})
        provider_loc = provider.get("location") if isinstance(provider, dict) else None
        provider_has_loc = isinstance(provider_loc, dict) and provider_loc.get("lat") is not None and provider_loc.get("lng") is not None
        provider_src = _clean_str((provider or {}).get("locationSource"))
        provider_loc_updated = (provider or {}).get("locationUpdatedAt")
        should_update_provider = (not provider_has_loc) or (provider_src == "komatsu") or (provider_loc_updated is None)

        if should_update_provider:
            provider_set: Dict[str, Any] = {
                "location": {"lat": lat, "lng": lng},
                "locationSource": "komatsu",
                "locationUpdatedAt": now,
            }
            if not dry_run:
                await db.users.update_one({"id": provider_id}, {"$set": provider_set})
            updated_providers += 1

    return {
        "ok": True,
        "dry_run": bool(dry_run),
        "scanned": scanned,
        "updated_machines": updated_machines,
        "updated_providers": updated_providers,
    }

