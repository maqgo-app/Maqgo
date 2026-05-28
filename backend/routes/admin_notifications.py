from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
import os

from auth_dependency import get_current_admin_strict
from db_config import get_db_name, get_mongo_url
from services.admin_emailer import send_admin_event_email


router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]


class AdminEventEmailBody(BaseModel):
    event_type: str = Field(..., min_length=1)
    payload: dict = Field(default_factory=dict)


@router.post("/emails/send")
async def admin_send_event_email(
    body: AdminEventEmailBody,
    dry_run: bool = Query(False),
    force: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    return await send_admin_event_email(db=db, event_type=body.event_type, payload=body.payload, dry_run=dry_run, force=force)

