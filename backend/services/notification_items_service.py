from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _severity_for_kind(kind: str) -> str:
    k = str(kind or '').strip().lower()
    if k in {'arrival', 'entry_pending', 'entry_authorized', 'incident', 'cancelled', 'payment_failed'}:
        return 'critical'
    if k in {'confirmed', 'assigned', 'en_route', 'started', 'finished', 'incident_cleared'}:
        return 'important'
    return 'normal'


def _deep_link_for_kind(kind: str, service_request_id: str) -> str:
    _ = service_request_id
    k = str(kind or '').strip().lower()
    if k in {'confirmed', 'assigned', 'en_route', 'incident', 'incident_cleared'}:
        return '/client/assigned'
    if k in {'arrival', 'entry_pending', 'entry_authorized'}:
        return '/client/provider-arrived'
    if k == 'started':
        return '/client/service-active'
    if k == 'finished':
        return '/client/service-finished'
    if k == 'cancelled':
        return '/client/history'
    if k == 'payment_failed':
        return '/client/payment-result?simulate=connection_error'
    return '/client/home'


def _title_body_for_kind(kind: str, extra: Optional[dict] = None) -> Tuple[str, str]:
    k = str(kind or '').strip().lower()
    if k == 'confirmed':
        return 'Reserva confirmada', 'Tu reserva quedó confirmada. Revisa el estado del servicio.'
    if k == 'assigned':
        return 'Operador asignado', 'Se asignó un operador a tu servicio.'
    if k == 'en_route':
        return 'Operador en camino', 'El operador está en camino a tu ubicación.'
    if k == 'arrival':
        return 'Operador llegó', 'El operador marcó llegada. Autoriza el ingreso para iniciar.'
    if k == 'entry_pending':
        return 'Esperando autorización de ingreso', 'Autoriza el ingreso para que el servicio pueda comenzar.'
    if k == 'entry_authorized':
        return 'Ingreso autorizado', 'Autorizaste el ingreso. El servicio puede comenzar.'
    if k == 'started':
        return 'Servicio iniciado', 'El servicio comenzó.'
    if k == 'finished':
        return 'Servicio finalizado', 'El servicio se marcó como finalizado.'
    if k == 'incident':
        reason = str((extra or {}).get('reason') or '').strip()
        return 'Incidente reportado', (f'Motivo: {reason}' if reason else 'Se reportó un incidente/demora.')
    if k == 'incident_cleared':
        return 'Incidente resuelto', 'El incidente se marcó como resuelto.'
    if k == 'cancelled':
        return 'Servicio cancelado', 'Tu servicio fue cancelado.'
    if k == 'payment_failed':
        return 'Pago fallido', 'El cobro no pudo procesarse. Revisa el estado de tu reserva.'
    return 'Actualización', 'Revisa el estado en la app.'


def _dedupe_key(client_id: str, service_request_id: str, kind: str) -> str:
    return f'client:{str(client_id)}:sr:{str(service_request_id)}:{str(kind)}'


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.notification_items.create_index([('recipientUserId', 1), ('createdAt', -1)])
    await db.notification_items.create_index([('dedupeKey', 1)], unique=True, name='uniq_dedupe_key')
    await db.notification_items.create_index([('recipientUserId', 1), ('readAt', 1)])
    await db.notification_deliveries.create_index([('notificationId', 1), ('createdAt', -1)])
    await db.notification_deliveries.create_index([('notificationId', 1), ('channel', 1), ('createdAt', -1)])


async def upsert_notification_item(
    db: AsyncIOMotorDatabase,
    *,
    recipient_user_id: str,
    service_request_id: str,
    kind: str,
    extra: Optional[dict] = None,
    occurred_at: Optional[str] = None,
    action_required: bool = False,
    ack_required: bool = False,
    pinned: bool = False,
) -> dict:
    now = _now_iso()
    k = str(kind or '').strip().lower()
    dedupe = _dedupe_key(recipient_user_id, service_request_id, k)
    title, body = _title_body_for_kind(k, extra)
    occ = str(occurred_at or '').strip() or now
    doc = {
        'id': dedupe,
        'recipientUserId': str(recipient_user_id),
        'audienceRole': 'client',
        'subjectType': 'service_request',
        'subjectId': str(service_request_id),
        'eventType': k,
        'severity': _severity_for_kind(k),
        'title': title,
        'body': body,
        'extra': extra or {},
        'actionRequired': bool(action_required),
        'ackRequired': bool(ack_required),
        'pinned': bool(pinned),
        'deepLink': _deep_link_for_kind(k, service_request_id),
        'dedupeKey': dedupe,
        'occurredAt': occ,
        'updatedAt': now,
    }

    await db.notification_items.update_one(
        {'dedupeKey': dedupe},
        {'$set': doc, '$setOnInsert': {'createdAt': occ, 'readAt': None, 'ackAt': None}},
        upsert=True,
    )
    return {'id': dedupe}


async def mark_read(db: AsyncIOMotorDatabase, recipient_user_id: str, notification_id: str) -> dict:
    now = _now_iso()
    res = await db.notification_items.update_one(
        {'id': str(notification_id), 'recipientUserId': str(recipient_user_id)},
        {'$set': {'readAt': now, 'updatedAt': now}},
    )
    return {'success': bool(res.matched_count)}


async def ack(db: AsyncIOMotorDatabase, recipient_user_id: str, notification_id: str) -> dict:
    now = _now_iso()
    res = await db.notification_items.update_one(
        {'id': str(notification_id), 'recipientUserId': str(recipient_user_id)},
        {'$set': {'ackAt': now, 'readAt': now, 'pinned': False, 'updatedAt': now}},
    )
    return {'success': bool(res.matched_count)}


async def unread_count(db: AsyncIOMotorDatabase, recipient_user_id: str) -> dict:
    n = await db.notification_items.count_documents({'recipientUserId': str(recipient_user_id), 'readAt': None})
    return {'unread': int(n)}


async def list_notifications(
    db: AsyncIOMotorDatabase,
    recipient_user_id: str,
    limit: int = 50,
    cursor: Optional[str] = None,
) -> dict:
    q: Dict[str, Any] = {'recipientUserId': str(recipient_user_id)}
    if cursor:
        q['createdAt'] = {'$lt': str(cursor)}
    cur = db.notification_items.find(q, {'_id': 0}).sort('createdAt', -1).limit(int(limit))
    items = await cur.to_list(int(limit))
    next_cursor = items[-1].get('createdAt') if items else None
    return {'items': items, 'nextCursor': next_cursor}


async def record_delivery(
    db: AsyncIOMotorDatabase,
    *,
    notification_id: str,
    channel: str,
    status: str,
    meta: Optional[dict] = None,
) -> None:
    now = _now_iso()
    await db.notification_deliveries.insert_one(
        {
            'notificationId': str(notification_id),
            'channel': str(channel),
            'status': str(status),
            'meta': meta or {},
            'createdAt': now,
        }
    )


async def backfill_service_notifications_for_client(db: AsyncIOMotorDatabase, client_id: str, sr: dict) -> None:
    srid = str(sr.get('id') or '')
    if not srid:
        return

    status = str(sr.get('status') or '').strip().lower()
    payment_status = str(sr.get('paymentStatus') or '').strip().lower()

    if status in {'confirmed', 'en_route', 'in_progress', 'last_30', 'finished'}:
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='confirmed',
            occurred_at=str(sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    if status == 'en_route':
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='en_route',
            occurred_at=str(sr.get('operator_assigned_at') or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    events = sr.get('events') if isinstance(sr.get('events'), list) else []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        et = str(ev.get('type') or '').strip()
        at = str(ev.get('at') or ev.get('createdAt') or '')
        if et == 'confirmed':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='confirmed',
                occurred_at=at,
            )
        elif et == 'accepted':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='assigned',
                occurred_at=at,
            )
        elif et == 'en_route':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='en_route',
                occurred_at=at,
            )
        elif et == 'arrival':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='arrival',
                occurred_at=at,
                pinned=True,
            )
        elif et == 'client_entry_confirmed':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='entry_authorized',
                occurred_at=at,
            )
        elif et == 'started':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='started',
                occurred_at=at,
            )
        elif et == 'finished':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='finished',
                occurred_at=at,
            )
        elif et == 'incident':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='incident',
                occurred_at=at,
                extra={'reason': ev.get('reason')},
                pinned=True,
            )
        elif et == 'incident_cleared':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='incident_cleared',
                occurred_at=at,
            )
        elif et in {'cancelled_client', 'cancel_with_fee', 'cancelled_no_arrival'}:
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='cancelled',
                occurred_at=at,
                pinned=True,
            )
        elif et == 'payment_failed_reverted_to_matching':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='payment_failed',
                occurred_at=at,
                pinned=True,
            )

    if sr.get('arrivalDetectedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='arrival',
            occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
            pinned=True,
        )
        if not sr.get('clientEntryConfirmedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                service_request_id=srid,
                kind='entry_pending',
                occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
                action_required=True,
                ack_required=True,
                pinned=True,
            )

    if sr.get('clientEntryConfirmedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='entry_authorized',
            occurred_at=str(sr.get('clientEntryConfirmedAt') or _now_iso()),
        )
        await db.notification_items.update_one(
            {'dedupeKey': _dedupe_key(client_id, srid, 'entry_pending')},
            {'$set': {'pinned': False, 'updatedAt': _now_iso()}},
        )

    if status in {'in_progress', 'last_30'} or sr.get('startedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='started',
            occurred_at=str(sr.get('startedAt') or _now_iso()),
        )

    if sr.get('activeIncident'):
        inc = sr.get('activeIncident') if isinstance(sr.get('activeIncident'), dict) else {}
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='incident',
            occurred_at=str(inc.get('reportedAt') or _now_iso()),
            extra={'reason': inc.get('reason')},
            pinned=True,
        )

    if payment_status == 'failed' or sr.get('paymentFailedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='payment_failed',
            occurred_at=str(sr.get('paymentFailedAt') or _now_iso()),
            pinned=True,
        )

    if status.startswith('cancelled') or status in {'cancel_with_fee', 'cancelled_no_arrival'}:
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='cancelled',
            occurred_at=str(sr.get('cancelled_at') or _now_iso()),
            pinned=True,
        )

    if status == 'finished' or sr.get('finishedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            service_request_id=srid,
            kind='finished',
            occurred_at=str(sr.get('finishedAt') or _now_iso()),
        )
