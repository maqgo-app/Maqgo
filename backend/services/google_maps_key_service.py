import os
import time
from typing import Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorClient

from db_config import get_db_name, get_mongo_url


_CACHE_TTL_SECONDS = 120
_cache: Tuple[float, Optional[str]] = (0.0, None)
_client: Optional[AsyncIOMotorClient] = None


def _sanitize_key(value: Optional[str]) -> str:
    k = str(value or "").strip()
    if k in ("undefined", "null"):
        return ""
    return k


def _get_env_key() -> str:
    return _sanitize_key(
        os.environ.get("GOOGLE_MAPS_API_KEY")
        or os.environ.get("WEB_GOOGLE_MAPS_API_KEY")
        or os.environ.get("VITE_GOOGLE_MAPS_API_KEY")
        or os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY")
    )


def _get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(get_mongo_url())
    return _client


async def get_google_maps_api_key() -> str:
    global _cache
    now = time.time()
    cached_at, cached_key = _cache
    if cached_at and now - cached_at < _CACHE_TTL_SECONDS:
        return cached_key or ""

    env_key = _get_env_key()
    if env_key:
        _cache = (now, env_key)
        return env_key

    try:
        db = _get_client()[get_db_name()]
        doc = await db.config.find_one({"_id": "google_maps"}, {"_id": 0, "apiKey": 1})
        db_key = _sanitize_key((doc or {}).get("apiKey"))
        _cache = (now, db_key or "")
        return db_key
    except Exception:
        _cache = (now, "")
        return ""


async def set_google_maps_api_key(api_key: str) -> bool:
    global _cache
    key = _sanitize_key(api_key)
    db = _get_client()[get_db_name()]
    await db.config.update_one(
        {"_id": "google_maps"},
        {"$set": {"apiKey": key, "updatedAt": time.time()}},
        upsert=True,
    )
    _cache = (time.time(), key)
    return True

