from fastapi import APIRouter, Body, Depends, Request
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from services.webpush_service import get_vapid_public_key, upsert_subscription, remove_subscription, webpush_enabled

router = APIRouter(prefix="/push", tags=["push"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


@router.get("/vapid-public-key", response_model=dict)
async def vapid_public_key():
    key = get_vapid_public_key()
    return {"enabled": bool(webpush_enabled()), "publicKey": key}


@router.post("/subscribe", response_model=dict)
async def subscribe(
    req: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("id") or "").strip()
    ua = str(req.headers.get("user-agent") or "").strip()
    subscription = body.get("subscription") if isinstance(body, dict) else None
    if subscription is None and isinstance(body, dict):
        subscription = body
    result = await upsert_subscription(db, user_id=user_id, subscription=subscription, user_agent=ua)
    return result


@router.post("/unsubscribe", response_model=dict)
async def unsubscribe(
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("id") or "").strip()
    endpoint = None
    if isinstance(body, dict):
        endpoint = body.get("endpoint")
    endpoint_s = str(endpoint).strip() if endpoint else None
    return await remove_subscription(db, user_id=user_id, endpoint=endpoint_s)

