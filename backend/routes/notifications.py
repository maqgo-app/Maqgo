from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from services.notification_items_service import (
    ack,
    backfill_service_notifications_for_client,
    list_notifications,
    mark_read,
    unread_count,
)


router = APIRouter(prefix="/notifications", tags=["notifications"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


@router.get("", response_model=dict)
async def get_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'client':
        raise HTTPException(status_code=403, detail='Solo cliente')
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')

    srs = await db.service_requests.find(
        {'clientId': str(uid)},
        {'_id': 0},
    ).sort('createdAt', -1).limit(20).to_list(20)
    for sr in srs:
        await backfill_service_notifications_for_client(db, str(uid), sr)

    return await list_notifications(db, str(uid), limit=limit, cursor=cursor)


@router.get("/unread-count", response_model=dict)
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'client':
        raise HTTPException(status_code=403, detail='Solo cliente')
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    return await unread_count(db, str(uid))


@router.post("/{notification_id}/read", response_model=dict)
async def post_mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'client':
        raise HTTPException(status_code=403, detail='Solo cliente')
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    return await mark_read(db, str(uid), notification_id)


@router.post("/{notification_id}/ack", response_model=dict)
async def post_ack(notification_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'client':
        raise HTTPException(status_code=403, detail='Solo cliente')
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    return await ack(db, str(uid), notification_id)
