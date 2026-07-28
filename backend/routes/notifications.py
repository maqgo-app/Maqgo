import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List, Dict, Tuple

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from services.operational_kpis_store import inc_metric
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
_BACKFILL_TTL_SECONDS = 45.0
_recent_backfill_by_user_role: Dict[Tuple[str, str], float] = {}
_PROVIDER_OFFER_EVENT_TYPES = {"nueva_oferta", "oferta_expira"}


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


def _parse_iso_utc(raw: Optional[str]) -> Optional[datetime]:
    value = str(raw or "").strip()
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _provider_offer_still_open(sr: Optional[dict], provider_account_id: str) -> bool:
    if not isinstance(sr, dict):
        return False
    status = str(sr.get("status") or "").strip().lower()
    if status != "offer_sent":
        return False

    now = datetime.now(timezone.utc)
    global_exp = _parse_iso_utc(sr.get("offerExpiresAt"))
    if not global_exp or global_exp <= now:
        return False

    provider_id = str(provider_account_id or "").strip()
    if not provider_id:
        return False

    if str(sr.get("currentOfferId") or "").strip() == provider_id:
        return True

    attempts = sr.get("matchingAttempts") if isinstance(sr.get("matchingAttempts"), list) else []
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        if str(attempt.get("providerId") or "").strip() != provider_id:
            continue
        if str(attempt.get("status") or "").strip().lower() != "pending":
            continue
        attempt_exp = _parse_iso_utc(attempt.get("expiresAt")) or global_exp
        if attempt_exp and attempt_exp > now:
            return True
    return False


async def _close_stale_provider_offer_notifications(
    *,
    recipient_user_id: str,
    provider_account_id: str,
    items: Optional[List[dict]] = None,
) -> None:
    if not recipient_user_id or not provider_account_id:
        return

    candidate_items = list(items or [])
    if not candidate_items:
        candidate_items = await db.notification_items.find(
            {
                "recipientUserId": str(recipient_user_id),
                "audienceRole": "provider",
                "eventType": {"$in": list(_PROVIDER_OFFER_EVENT_TYPES)},
                "readAt": None,
            },
            {"_id": 0, "id": 1, "subjectId": 1, "eventType": 1, "readAt": 1},
        ).to_list(200)

    if not candidate_items:
        return

    service_ids = list(
        {
            str(item.get("subjectId") or "").strip()
            for item in candidate_items
            if str(item.get("eventType") or "").strip().lower() in _PROVIDER_OFFER_EVENT_TYPES
            and str(item.get("subjectId") or "").strip()
        }
    )
    if not service_ids:
        return

    rows = await db.service_requests.find(
        {"id": {"$in": service_ids}},
        {"_id": 0, "id": 1, "status": 1, "currentOfferId": 1, "offerExpiresAt": 1, "matchingAttempts": 1},
    ).to_list(len(service_ids))
    services_by_id = {str(row.get("id") or ""): row for row in rows}

    stale_ids = []
    for item in candidate_items:
        event_type = str(item.get("eventType") or "").strip().lower()
        if event_type not in _PROVIDER_OFFER_EVENT_TYPES:
            continue
        service_id = str(item.get("subjectId") or "").strip()
        sr = services_by_id.get(service_id)
        if not _provider_offer_still_open(sr, provider_account_id):
            stale_ids.append(str(item.get("id") or "").strip())

    stale_ids = [item_id for item_id in stale_ids if item_id]
    if not stale_ids:
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.notification_items.update_many(
        {"id": {"$in": stale_ids}},
        {"$set": {"readAt": now_iso, "ackAt": now_iso, "pinned": False, "updatedAt": now_iso}},
    )


def _filter_stale_provider_offer_items(items: List[dict], provider_account_id: str, services_by_id: Dict[str, dict]) -> List[dict]:
    filtered: List[dict] = []
    for item in items:
        event_type = str(item.get("eventType") or "").strip().lower()
        if event_type not in _PROVIDER_OFFER_EVENT_TYPES:
            filtered.append(item)
            continue
        service_id = str(item.get("subjectId") or "").strip()
        if _provider_offer_still_open(services_by_id.get(service_id), provider_account_id):
            filtered.append(item)
    return filtered


async def _run_backfill_in_batches(coros: List[object], *, batch_size: int = 10) -> None:
    pending = [c for c in coros if c is not None]
    if not pending:
        return
    size = max(1, int(batch_size or 1))
    for start in range(0, len(pending), size):
        await asyncio.gather(*pending[start : start + size])


def _should_run_feed_backfill(*, user_id: str, audience_role: str, cursor: Optional[str]) -> bool:
    if cursor:
        return False
    key = (str(user_id), str(audience_role or 'client'))
    now = time.monotonic()
    last = _recent_backfill_by_user_role.get(key)
    if last is not None and (now - last) < _BACKFILL_TTL_SECONDS:
        return False
    _recent_backfill_by_user_role[key] = now
    return True


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
    should_backfill = _should_run_feed_backfill(
        user_id=str(uid),
        audience_role=audience_role,
        cursor=cursor,
    )
    started_at = time.perf_counter()

    if should_backfill and audience_role == 'client':
        srs = await db.service_requests.find(
            {'clientId': str(uid)},
            {'_id': 0},
        ).sort('createdAt', -1).limit(20).to_list(20)
        await _run_backfill_in_batches(
            [backfill_service_notifications_for_client(db, str(uid), sr) for sr in srs]
        )

    elif should_backfill and audience_role == 'provider':
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
        await _close_stale_provider_offer_notifications(
            recipient_user_id=str(uid),
            provider_account_id=str(provider_account_id),
        )

    elif should_backfill:
        assigned_srs = await db.service_requests.find(
            {'operator_id': str(uid)},
            {'_id': 0},
        ).sort('createdAt', -1).limit(40).to_list(40)

        await _run_backfill_in_batches(
            [backfill_service_notifications_for_operator(db, str(uid), sr) for sr in assigned_srs]
        )

    result = await list_notifications(db, str(uid), audience_role, limit=limit, cursor=cursor)
    if audience_role == 'provider':
        provider_account_id = _effective_provider_account_id(current_user) or str(uid)
        items = list(result.get('items') or [])
        service_ids = list(
            {
                str(item.get("subjectId") or "").strip()
                for item in items
                if str(item.get("eventType") or "").strip().lower() in _PROVIDER_OFFER_EVENT_TYPES
                and str(item.get("subjectId") or "").strip()
            }
        )
        if service_ids:
            rows = await db.service_requests.find(
                {"id": {"$in": service_ids}},
                {"_id": 0, "id": 1, "status": 1, "currentOfferId": 1, "offerExpiresAt": 1, "matchingAttempts": 1},
            ).to_list(len(service_ids))
            services_by_id = {str(row.get("id") or ""): row for row in rows}
            result["items"] = _filter_stale_provider_offer_items(items, str(provider_account_id), services_by_id)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    logger.info(
        "notifications.feed_ok audience_role=%s user_id=%s limit=%s cursor=%s backfill=%s items=%s elapsed_ms=%s",
        audience_role,
        str(uid),
        int(limit),
        bool(cursor),
        should_backfill,
        len(result.get('items') or []),
        elapsed_ms,
    )
    if not cursor:
        try:
            await inc_metric(db, "notifications_opened")
        except Exception as e:
            logger.warning("notifications.feed_open_metric_failed user_id=%s err=%s", str(uid), e)
    return result


@router.get("/unread-count", response_model=dict)
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    uid = current_user.get('id')
    if not uid:
        raise HTTPException(status_code=401, detail='Sesión inválida')
    audience_role = _audience_role_for_user(current_user)
    started_at = time.perf_counter()
    try:
        if audience_role == 'provider':
            provider_account_id = _effective_provider_account_id(current_user) or str(uid)
            await _close_stale_provider_offer_notifications(
                recipient_user_id=str(uid),
                provider_account_id=str(provider_account_id),
            )
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
