from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _severity_for_kind(kind: str) -> str:
    k = str(kind or '').strip().lower()
    if k in {
        'arrival',
        'entry_pending',
        'entry_authorized',
        'incident',
        'cancelled',
        'payment_failed',
        'nueva_oferta',
        'oferta_expira',
        'no_arrival_120',
        'no_arrival_180',
        'no_arrival_240',
    }:
        return 'critical'
    if k in {'confirmed', 'assigned', 'en_route', 'started', 'finished', 'incident_cleared', 'factura_lista', 'pago_enviado'}:
        return 'important'
    return 'normal'


def _deep_link_for_kind(kind: str, service_request_id: str, audience_role: str) -> str:
    k = str(kind or '').strip().lower()
    ar = str(audience_role or '').strip().lower() or 'client'
    if ar == 'provider':
        if k == 'confirmed':
            return '/provider/home'
        if k == 'assigned':
            return '/provider/accepted'
        if k == 'en_route':
            return '/provider/en-route'
        if k in {'arrival', 'entry_pending', 'entry_authorized'}:
            return '/provider/arrival'
        if k == 'started':
            return '/provider/service-active'
        if k == 'finished':
            return '/provider/service-finished'
        if k in {'incident', 'incident_cleared'}:
            return '/provider/in-progress'
        if k == 'cancelled':
            return '/provider/history'
        if k == 'factura_lista':
            return '/provider/upload-invoice'
        if k == 'pago_enviado':
            return '/provider/cobros'
        return '/provider/home'
    if ar == 'operator':
        if k in {'finished', 'cancelled'}:
            return '/operator/history'
        return '/operator/home'
    if k in {'confirmed', 'assigned', 'en_route', 'incident', 'incident_cleared', 'no_arrival_120', 'no_arrival_180', 'no_arrival_240'}:
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


def _title_body_for_kind(kind: str, extra: Optional[dict] = None, audience_role: str = 'client') -> Tuple[str, str]:
    k = str(kind or '').strip().lower()
    ar = str(audience_role or '').strip().lower() or 'client'
    if k == 'confirmed':
        if ar == 'provider':
            return 'Servicio confirmado', 'El servicio fue confirmado. Revisa el estado y próximos pasos.'
        if ar == 'operator':
            return 'Servicio confirmado', 'Servicio confirmado. Revisa tu operación.'
        return 'Reserva confirmada', 'Tu reserva quedó confirmada. Revisa el estado del servicio.'
    if k == 'assigned':
        if ar == 'operator':
            return 'Servicio asignado', 'Se te asignó un servicio.'
        return 'Operador asignado', 'Se asignó un operador a tu servicio.'
    if k == 'en_route':
        if ar == 'operator':
            return 'En camino', 'Estás en camino al servicio.'
        if ar == 'provider':
            return 'Operador en camino', 'El operador va en camino al servicio.'
        return 'Operador en camino', 'El operador está en camino a tu ubicación.'
    if k == 'arrival':
        if ar == 'operator':
            return 'Llegada registrada', 'Se registró llegada al servicio.'
        if ar == 'provider':
            return 'Operador llegó', 'El operador marcó llegada al servicio.'
        return 'Operador llegó', 'El operador marcó llegada. Autoriza el ingreso para iniciar.'
    if k == 'entry_pending':
        if ar == 'provider':
            return 'Esperando autorización de ingreso', 'Falta autorización de ingreso del cliente.'
        if ar == 'operator':
            return 'Esperando autorización de ingreso', 'Falta autorización de ingreso del cliente.'
        return 'Esperando autorización de ingreso', 'Autoriza el ingreso para que el servicio pueda comenzar.'
    if k == 'entry_authorized':
        if ar == 'provider':
            return 'Ingreso autorizado', 'El cliente autorizó el ingreso. El servicio puede comenzar.'
        if ar == 'operator':
            return 'Ingreso autorizado', 'El cliente autorizó el ingreso.'
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
    if k == 'no_arrival_120':
        return 'Demora crítica', 'Han pasado 120 minutos desde la aceptación sin llegada registrada. Revisa el estado y define el siguiente paso.'
    if k == 'no_arrival_180':
        return 'Demora crítica', 'Han pasado 180 minutos desde la aceptación sin llegada registrada. Revisa el estado y define el siguiente paso.'
    if k == 'no_arrival_240':
        return 'Demora crítica', 'Han pasado 240 minutos desde la aceptación sin llegada registrada. Revisa el estado y define el siguiente paso.'
    if k == 'cancelled':
        if ar == 'provider':
            return 'Servicio cancelado', 'El servicio fue cancelado.'
        if ar == 'operator':
            return 'Servicio cancelado', 'El servicio fue cancelado.'
        return 'Servicio cancelado', 'Tu servicio fue cancelado.'
    if k == 'payment_failed':
        return 'Pago fallido', 'El cobro no pudo procesarse. Revisa el estado de tu reserva.'
    if k == 'factura_lista':
        return 'Factura lista', 'Tienes una factura lista para revisar y gestionar.'
    if k == 'pago_enviado':
        return 'Pago enviado', 'Se registró un pago enviado asociado a un servicio.'
    if k == 'nueva_oferta':
        return 'Nueva oferta', 'Tienes una nueva oferta disponible.'
    if k == 'oferta_expira':
        return 'Oferta por expirar', 'Una oferta está por expirar. Revisa ahora.'
    return 'Actualización', 'Revisa el estado en la app.'


def _dedupe_key(recipient_user_id: str, service_request_id: str, kind: str, audience_role: str) -> str:
    ar = str(audience_role or '').strip().lower() or 'client'
    if ar == 'client':
        return f'client:{str(recipient_user_id)}:sr:{str(service_request_id)}:{str(kind)}'
    return f'{ar}:{str(recipient_user_id)}:sr:{str(service_request_id)}:{str(kind)}'


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
    audience_role: str,
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
    ar = str(audience_role or '').strip().lower() or 'client'
    dedupe = _dedupe_key(recipient_user_id, service_request_id, k, ar)
    title, body = _title_body_for_kind(k, extra, ar)
    occ = str(occurred_at or '').strip() or now
    doc = {
        'id': dedupe,
        'recipientUserId': str(recipient_user_id),
        'audienceRole': ar,
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
        'deepLink': _deep_link_for_kind(k, service_request_id, ar),
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
            audience_role='client',
            service_request_id=srid,
            kind='confirmed',
            occurred_at=str(sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    if status == 'en_route':
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='en_route',
            occurred_at=str(sr.get('operator_assigned_at') or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    operator_id = sr.get('operator_id') or sr.get('operatorId')
    operator_assigned_at = sr.get('operator_assigned_at') or sr.get('operatorAssignedAt')
    if operator_id or operator_assigned_at:
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='assigned',
            occurred_at=str(operator_assigned_at or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
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
                audience_role='client',
                service_request_id=srid,
                kind='confirmed',
                occurred_at=at,
            )
        elif et == 'accepted':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='assigned',
                occurred_at=at,
            )
        elif et == 'en_route':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='en_route',
                occurred_at=at,
            )
        elif et == 'arrival':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='arrival',
                occurred_at=at,
                pinned=True,
            )
        elif et == 'client_entry_confirmed':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='entry_authorized',
                occurred_at=at,
            )
        elif et == 'started':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='started',
                occurred_at=at,
            )
        elif et == 'finished':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='finished',
                occurred_at=at,
            )
        elif et == 'incident':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
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
                audience_role='client',
                service_request_id=srid,
                kind='incident_cleared',
                occurred_at=at,
            )
        elif et in {'cancelled_client', 'cancel_with_fee', 'cancelled_no_arrival'}:
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='cancelled',
                occurred_at=at,
                pinned=True,
            )
        elif et == 'payment_failed_reverted_to_matching':
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
                service_request_id=srid,
                kind='payment_failed',
                occurred_at=at,
                pinned=True,
            )

    if sr.get('arrivalDetectedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='arrival',
            occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
            pinned=True,
        )
        if not sr.get('clientEntryConfirmedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=client_id,
                audience_role='client',
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
            audience_role='client',
            service_request_id=srid,
            kind='entry_authorized',
            occurred_at=str(sr.get('clientEntryConfirmedAt') or _now_iso()),
        )
        await db.notification_items.update_one(
            {'dedupeKey': _dedupe_key(client_id, srid, 'entry_pending', 'client')},
            {'$set': {'pinned': False, 'updatedAt': _now_iso()}},
        )

    if status in {'in_progress', 'last_30'} or sr.get('startedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='started',
            occurred_at=str(sr.get('startedAt') or _now_iso()),
        )

    if sr.get('activeIncident'):
        inc = sr.get('activeIncident') if isinstance(sr.get('activeIncident'), dict) else {}
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
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
            audience_role='client',
            service_request_id=srid,
            kind='payment_failed',
            occurred_at=str(sr.get('paymentFailedAt') or _now_iso()),
            pinned=True,
        )

    if status.startswith('cancelled') or status in {'cancel_with_fee', 'cancelled_no_arrival'}:
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='cancelled',
            occurred_at=str(sr.get('cancelled_at') or _now_iso()),
            pinned=True,
        )

    if status == 'finished' or sr.get('finishedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=client_id,
            audience_role='client',
            service_request_id=srid,
            kind='finished',
            occurred_at=str(sr.get('finishedAt') or _now_iso()),
        )


async def backfill_service_notifications_for_provider(db: AsyncIOMotorDatabase, provider_user_id: str, sr: dict) -> None:
    srid = str(sr.get('id') or '')
    if not srid:
        return
    status = str(sr.get('status') or '').strip().lower()

    if status in {'confirmed', 'en_route', 'in_progress', 'last_30', 'finished'}:
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='confirmed',
            occurred_at=str(sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    operator_id = sr.get('operator_id') or sr.get('operatorId')
    operator_assigned_at = sr.get('operator_assigned_at') or sr.get('operatorAssignedAt')
    if operator_id or operator_assigned_at:
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='assigned',
            occurred_at=str(operator_assigned_at or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    if status == 'en_route':
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='en_route',
            occurred_at=str(operator_assigned_at or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
        )

    if sr.get('arrivalDetectedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='arrival',
            occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
            pinned=True,
        )
        if not sr.get('clientEntryConfirmedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=provider_user_id,
                audience_role='provider',
                service_request_id=srid,
                kind='entry_pending',
                occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
                action_required=True,
                ack_required=False,
                pinned=True,
            )

    if sr.get('clientEntryConfirmedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='entry_authorized',
            occurred_at=str(sr.get('clientEntryConfirmedAt') or _now_iso()),
        )
        await db.notification_items.update_one(
            {'dedupeKey': _dedupe_key(provider_user_id, srid, 'entry_pending', 'provider')},
            {'$set': {'pinned': False, 'updatedAt': _now_iso()}},
        )

    if status in {'in_progress', 'last_30'} or sr.get('startedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='started',
            occurred_at=str(sr.get('startedAt') or _now_iso()),
        )

    if sr.get('activeIncident'):
        inc = sr.get('activeIncident') if isinstance(sr.get('activeIncident'), dict) else {}
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='incident',
            occurred_at=str(inc.get('reportedAt') or _now_iso()),
            extra={'reason': inc.get('reason')},
            pinned=True,
        )

    if status.startswith('cancelled') or status in {'cancel_with_fee', 'cancelled_no_arrival'}:
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='cancelled',
            occurred_at=str(sr.get('cancelled_at') or _now_iso()),
            pinned=True,
        )

    if status == 'finished' or sr.get('finishedAt'):
        await upsert_notification_item(
            db,
            recipient_user_id=provider_user_id,
            audience_role='provider',
            service_request_id=srid,
            kind='finished',
            occurred_at=str(sr.get('finishedAt') or _now_iso()),
        )


async def backfill_service_notifications_for_operator(
    db: AsyncIOMotorDatabase,
    operator_user_id: str,
    sr: dict,
    *,
    effective_provider_account_id: Optional[str] = None,
) -> None:
    srid = str(sr.get('id') or '')
    if not srid:
        return
    status = str(sr.get('status') or '').strip().lower()

    if status == 'offer_sent' and effective_provider_account_id:
        oid = str(sr.get('currentOfferId') or '')
        attempts = sr.get('matchingAttempts') if isinstance(sr.get('matchingAttempts'), list) else []
        has_pending = False
        for a in attempts:
            if not isinstance(a, dict):
                continue
            if a.get('status') != 'pending':
                continue
            if str(a.get('providerId') or '') == str(effective_provider_account_id):
                has_pending = True
                break
        if oid == str(effective_provider_account_id) or has_pending:
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='nueva_oferta',
                occurred_at=str(sr.get('offerSentAt') or sr.get('createdAt') or _now_iso()),
                pinned=True,
            )
            expires_at = str(sr.get('offerExpiresAt') or '').strip()
            if expires_at:
                try:
                    exp_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                    now_dt = datetime.now(timezone.utc)
                    remaining = (exp_dt - now_dt).total_seconds()
                    if remaining <= 120:
                        await upsert_notification_item(
                            db,
                            recipient_user_id=operator_user_id,
                            audience_role='operator',
                            service_request_id=srid,
                            kind='oferta_expira',
                            occurred_at=expires_at,
                            pinned=True,
                        )
                except Exception:
                    pass

    operator_id = sr.get('operator_id') or sr.get('operatorId')
    if operator_id and str(operator_id) == str(operator_user_id):
        if status in {'confirmed', 'en_route', 'in_progress', 'last_30', 'finished'}:
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='confirmed',
                occurred_at=str(sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
            )

        operator_assigned_at = sr.get('operator_assigned_at') or sr.get('operatorAssignedAt')
        if operator_assigned_at:
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='assigned',
                occurred_at=str(operator_assigned_at or _now_iso()),
            )

        if status == 'en_route':
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='en_route',
                occurred_at=str(operator_assigned_at or sr.get('confirmedAt') or sr.get('createdAt') or _now_iso()),
            )

        if sr.get('arrivalDetectedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='arrival',
                occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
            )
            if not sr.get('clientEntryConfirmedAt'):
                await upsert_notification_item(
                    db,
                    recipient_user_id=operator_user_id,
                    audience_role='operator',
                    service_request_id=srid,
                    kind='entry_pending',
                    occurred_at=str(sr.get('arrivalDetectedAt') or _now_iso()),
                    action_required=True,
                    ack_required=False,
                )

        if sr.get('clientEntryConfirmedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='entry_authorized',
                occurred_at=str(sr.get('clientEntryConfirmedAt') or _now_iso()),
            )

        if status in {'in_progress', 'last_30'} or sr.get('startedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='started',
                occurred_at=str(sr.get('startedAt') or _now_iso()),
            )

        if sr.get('activeIncident'):
            inc = sr.get('activeIncident') if isinstance(sr.get('activeIncident'), dict) else {}
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='incident',
                occurred_at=str(inc.get('reportedAt') or _now_iso()),
                extra={'reason': inc.get('reason')},
                pinned=True,
            )

        if status.startswith('cancelled') or status in {'cancel_with_fee', 'cancelled_no_arrival'}:
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='cancelled',
                occurred_at=str(sr.get('cancelled_at') or _now_iso()),
                pinned=True,
            )

        if status == 'finished' or sr.get('finishedAt'):
            await upsert_notification_item(
                db,
                recipient_user_id=operator_user_id,
                audience_role='operator',
                service_request_id=srid,
                kind='finished',
                occurred_at=str(sr.get('finishedAt') or _now_iso()),
            )
