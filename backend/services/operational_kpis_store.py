from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Iterable

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

COLLECTION = "operational_kpi_counters_daily"


def _bucket_id_from_datetime(value: datetime) -> str:
    dt = value.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d")


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[COLLECTION].create_index("_id", name="idx_operational_kpi_bucket_id")
    except Exception as e:
        logger.warning("operational_kpi_counters_daily index: %s", e)


async def inc_metric(
    db: AsyncIOMotorDatabase,
    metric_name: str,
    *,
    when: datetime | None = None,
    delta: int = 1,
) -> None:
    metric = str(metric_name or "").strip()
    if not metric or int(delta or 0) == 0:
        return
    now = (when or datetime.now(timezone.utc)).astimezone(timezone.utc)
    await db[COLLECTION].update_one(
        {"_id": _bucket_id_from_datetime(now)},
        {
            "$inc": {metric: int(delta)},
            "$set": {"updatedAt": now.isoformat()},
            "$setOnInsert": {"bucketDate": _bucket_id_from_datetime(now), "createdAt": now.isoformat()},
        },
        upsert=True,
    )


def _iter_bucket_ids(start_at: datetime, end_at: datetime) -> Iterable[str]:
    current = start_at.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    end_bucket = end_at.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    while current <= end_bucket:
        yield _bucket_id_from_datetime(current)
        current = current + timedelta(days=1)


async def sum_metric(
    db: AsyncIOMotorDatabase,
    metric_name: str,
    *,
    start_at: datetime,
    end_at: datetime,
) -> int:
    metric = str(metric_name or "").strip()
    if not metric:
        return 0
    bucket_ids = list(_iter_bucket_ids(start_at, end_at))
    if not bucket_ids:
        return 0
    rows = await db[COLLECTION].find({"_id": {"$in": bucket_ids}}, {"_id": 0, metric: 1}).to_list(len(bucket_ids))
    total = 0
    for row in rows or []:
        try:
            total += int(row.get(metric) or 0)
        except Exception:
            continue
    return total
