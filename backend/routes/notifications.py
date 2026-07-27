import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from services.notification_items_service import (
    ack,
    backfill_service_notifications_for_client,
    backfill_service_notifications_for_operator,
    backfill_service_notifications_for_provider,
    list_notifications,
    mark_read,
    unread_count,
)

logger = logging.getLogger(__name__)


def _audience_role_for_user(user: dict) -> str:
    session = user.get('_session') if isinstance(user, dict) else None
    session_role = str((session or {}).get('activeRole') or '').strip().lower()
    role = session_role or str(user.get('role') or '').strip().lower()
    provider_role = str(user.get('provider_role') or '').strip().lower()
    if role != 'client':
        return 'operator' if provider_role == 'operator' else 'provider'
    return 'client'


def _effective_provider_account_id(user: dict) -> Optional[str]:
    session = user.get('_session') if isinstance(user, dict) else None
    role = str((session or {}).get('activeRole') or user.get('role') or '').strip().lower()
    uid = user.get('id')
    owner_id = user.get('owner_id')
    if role == 'client' or role == 'admin':
        return None
    if role == 'provider':
        return uid
    if owner_id:
        return owner_id
    return uid


async def _run_backfill_in_batches(coros: List[object], *, batch_size: int = 10) -> None:
    pending = [c for c in coros if c is not None]
    if not pending:
        return
    size = max(1, int(batch_size or 1))
    for start in range(0, len(pending), size):
        await asyncio.gather(*pending[start : start + size])


router = APIRouter(prefix="/notifications", tags=["notifications"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


@router.get("", response_model=dict)
async def get_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')

    audience_role = _audience_role_for_user(current_user)

    if audience_role == 'client':
        srs = await db.service_requests.find(
            {'clientId': str(uid)},
            {'_id': 0},
        ).sort('createdAt', -1).limit(20).to_list(20)
        await _run_backfill_in_batches(
            [backfill_service_notifications_for_client(db, str(uid), sr) for sr in srs]
        )

    elif audience_role == 'provider':
        provider_account_id = _effective_provider_account_id(current_user) or str(uid)
        base = {
            '$or': [
                {'providerId': str(provider_account_id)},
                {'currentOfferId': str(provider_account_id)},
                {'matchingAttempts': {'$elemMatch': {'providerId': str(provider_account_id), 'status': 'pending'}}},
            ]
        }
        srs = await db.service_requests.find(base, {'_id': 0}).sort('createdAt', -1).limit(40).to_list(40)
        await _run_backfill_in_batches(
            [backfill_service_notifications_for_provider(db, str(uid), sr) for sr in srs]
        )

    else:
        assigned_srs = await db.service_requests.find(
            {'operator_id': str(uid)},
            {'_id': 0},
        ).sort('createdAt', -1).limit(40).to_list(40)

        await _run_backfill_in_batches(
            [backfill_service_notifications_for_operator(db, str(uid), sr) for sr in assigned_srs]
        )

    return await list_notifications(db, str(uid), audience_role, limit=limit, cursor=cursor)


@router.get("/unread-count", response_model=dict)
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    audience_role = _audience_role_for_user(current_user)
    started_at = time.perf_counter()
    try:
        result = await unread_count(db, str(uid), audience_role)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "notifications.unread_count_ok audience_role=%s user_id=%s unread=%s elapsed_ms=%s",
            audience_role,
            str(uid),
            result.get('unread'),
            elapsed_ms,
        )
        return result
    except Exception:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.exception(
            "notifications.unread_count_failed audience_role=%s user_id=%s elapsed_ms=%s",
            audience_role,
            str(uid),
            elapsed_ms,
        )
        raise


@router.post("/{notification_id}/read", response_model=dict)
async def post_mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    audience_role = _audience_role_for_user(current_user)
    return await mark_read(db, str(uid), notification_id, audience_role)


@router.post("/{notification_id}/ack", response_model=dict)
async def post_ack(notification_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    audience_role = _audience_role_for_user(current_user)
    return await ack(db, str(uid), notification_id, audience_role)
