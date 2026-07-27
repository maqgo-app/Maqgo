from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorClient

from auth_dependency import get_current_admin_strict
from db_config import get_db_name, get_mongo_url
from ops_structured_log import log_ops_event
from services.operational_kpis_service import build_operational_kpis_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/observability", tags=["admin-observability"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


@router.get("/operational-kpis")
async def get_operational_kpis(
    days: int = Query(14, ge=1, le=90),
    current_admin: dict = Depends(get_current_admin_strict),
):
    _ = current_admin
    report = await build_operational_kpis_snapshot(db, days=days)
    log_ops_event(
        logger,
        event="operational_kpis_snapshot",
        days=int(days),
        fill_rate=report.get("kpis", {}).get("fill_rate", {}).get("value"),
        offers_sent=report.get("kpis", {}).get("offers_sent"),
        wave2_triggered=report.get("kpis", {}).get("wave2_triggered"),
        wave3_triggered=report.get("kpis", {}).get("wave3_triggered"),
        success=True,
    )
    return report
