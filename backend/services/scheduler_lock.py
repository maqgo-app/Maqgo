from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError


async def try_acquire_mongo_lock(
    db: AsyncIOMotorDatabase,
    lock_id: str,
    *,
    owner: str,
    ttl_sec: int,
    now: Optional[datetime] = None,
) -> bool:
    if not lock_id or not str(lock_id).strip():
        return False
    if not owner or not str(owner).strip():
        return False

    now_dt = now or datetime.now(timezone.utc)
    expires_at = now_dt + timedelta(seconds=max(5, int(ttl_sec)))

    coll = db.maqgo_runtime_locks

    renew = await coll.update_one(
        {"_id": str(lock_id), "owner": str(owner)},
        {"$set": {"expiresAt": expires_at, "renewedAt": now_dt}},
        upsert=False,
    )
    if int(getattr(renew, "modified_count", 0) or 0) > 0:
        return True

    take = await coll.update_one(
        {
            "_id": str(lock_id),
            "$or": [
                {"expiresAt": {"$exists": False}},
                {"expiresAt": None},
                {"expiresAt": {"$lte": now_dt}},
            ],
        },
        {"$set": {"owner": str(owner), "expiresAt": expires_at, "acquiredAt": now_dt}},
        upsert=False,
    )
    if int(getattr(take, "modified_count", 0) or 0) > 0:
        return True

    try:
        await coll.insert_one(
            {
                "_id": str(lock_id),
                "owner": str(owner),
                "expiresAt": expires_at,
                "acquiredAt": now_dt,
            }
        )
        return True
    except DuplicateKeyError:
        return False

