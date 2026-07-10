"""                
SERVICIO DE TIMERS - MAQGO MVP v1

Timers automáticos para:
- last_30: Se activa 30 minutos antes de endTime
- finished: Se activa exactamente en endTime
- Cierre automático con GPS

Este servicio debe ejecutarse periódicamente (intervalo definido en server.timer_scheduler).
"""
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import os
import time
from typing import Optional, Any

logger = logging.getLogger(__name__)


def _parse_offer_expires_at_utc(raw: Any) -> Optional[datetime]:
    """Unifica Z / +00:00 / sin TZ para comparar con now UTC (evita fallos de $lte entre strings)."""
    if raw is None:
        return None
    if isinstance(raw, datetime):
        dt = raw
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        logger.warning("_parse_offer_expires_at_utc: value no parseable raw=%r", raw)
        return None

# Heartbeat de logs para producción (grep: CHECK_EXPIRED_OFFERS_RUNNING)
_CHECK_EXPIRED_HEARTBEAT_SEC = 60.0

class TimerService:
    """
    Servicio de timers automáticos para MAQGO.
    Gestiona transiciones automáticas de estado basadas en tiempo.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._last_check_expired_heartbeat: Optional[float] = None
    
    async def check_expired_incident_protected_windows(self) -> int:
        now = datetime.now(timezone.utc)
        cursor = (
            self.db.service_requests.find(
                {
                    'activeIncident.protectedWindowEnd': {'$exists': True, '$ne': None},
                },
                {'_id': 0, 'id': 1, 'activeIncident': 1, 'incidentStats': 1},
            )
            .sort([('_id', 1)])
        )
        cleared = 0
        async for sr in cursor:
            srid = str(sr.get('id') or '').strip()
            if not srid:
                continue
            active = sr.get('activeIncident') or {}
            end_dt = _parse_offer_expires_at_utc(active.get('protectedWindowEnd'))
            if not end_dt or end_dt > now:
                continue
            minutes_raw = active.get('protectedWindowMinutes')
            try:
                minutes_i = int(minutes_raw)
            except Exception:
                minutes_i = 0
            if minutes_i < 0:
                minutes_i = 0

            stats = sr.get('incidentStats') or {}
            try:
                used_total = float(stats.get('protectedMinutesUsedTotal') or 0)
            except Exception:
                used_total = 0.0
            if used_total < 0:
                used_total = 0.0

            history_item = {
                'reason': active.get('reason'),
                'reportedAt': active.get('reportedAt'),
                'expiredAt': now.isoformat(),
                'protectedWindowEnd': active.get('protectedWindowEnd'),
                'protectedWindowMinutes': minutes_i,
                'protectedMinutesUsed': float(minutes_i),
                'endedBy': 'timer',
            }
            event = {'type': 'incident_window_ended', 'at': now.isoformat()}

            await self.db.service_requests.update_one(
                {'id': srid},
                {
                    '$unset': {'activeIncident': ''},
                    '$set': {
                        'incidentStats': {
                            **stats,
                            'protectedMinutesUsedTotal': round(float(used_total) + float(minutes_i), 2),
                        }
                    },
                    '$push': {'incidentHistory': history_item, 'events': event},
                },
            )
            cleared += 1
        return cleared

    async def check_confirmed_no_arrival_timeout(self) -> int:
        from pricing.business_rules import TODAY_MAX_ABSOLUTE_DELAY_HOURS, incident_protected_minutes_used_total, today_committed_time_utc

        now = datetime.now(timezone.utc)
        cursor = (
            self.db.service_requests.find(
                {
                    'status': {'$in': ['confirmed', 'en_route']},
                    '$and': [
                        {'$or': [{'arrivalDetectedAt': {'$exists': False}}, {'arrivalDetectedAt': None}]},
                        {'$or': [
                            {'reservationType': {'$exists': False}},
                            {'reservationType': None},
                            {'reservationType': ''},
                            {'reservationType': 'immediate'},
                        ]},
                    ],
                },
                {
                    '_id': 0,
                    'id': 1,
                    'clientId': 1,
                    'acceptedAt': 1,
                    'confirmedAt': 1,
                    'createdAt': 1,
                    'etaCommitMinutes': 1,
                    'etaConfirmedAt': 1,
                    'etaFirstCommitMinutes': 1,
                    'etaFirstConfirmedAt': 1,
                    'lateMaxDelayNotifiedAt': 1,
                    'incidentStats': 1,
                    'activeIncident': 1,
                },
            )
            .sort([('_id', 1)])
        )

        async def send_alert(client_id: str, srid: str, kind: str) -> None:
            from services.notification_items_service import record_delivery, upsert_notification_item
            from services.webpush_service import notify_user

            titles = {
                'late_limit_4h': 'Demora crítica',
            }
            bodies = {
                'late_limit_4h': 'Se superó el límite máximo absoluto de atraso (4 horas). Puedes cancelar sin costo.',
            }

            item = await upsert_notification_item(
                self.db,
                recipient_user_id=str(client_id),
                audience_role='client',
                service_request_id=str(srid),
                kind=str(kind),
                extra={},
                pinned=True,
            )

            push = await notify_user(
                db=self.db,
                user_id=str(client_id),
                title=titles.get(str(kind), 'Actualización del servicio'),
                body=bodies.get(str(kind), 'Revisa el estado del servicio en la app.'),
                url='/client/assigned',
                tag=f'sr:{str(srid)}',
            )
            await record_delivery(
                self.db,
                notification_id=item['id'],
                channel='push_web',
                status='sent' if int(push.get('sent', 0) or 0) > 0 else 'skipped',
                meta={'sent': int(push.get('sent', 0) or 0), 'skipped': int(push.get('skipped', 0) or 0)},
            )

        alerted = 0
        async for sr in cursor:
            srid = str(sr.get('id') or '').strip()
            client_id = str(sr.get('clientId') or '').strip()
            if not srid or not client_id:
                continue

            if sr.get('lateMaxDelayNotifiedAt'):
                continue

            committed_dt = today_committed_time_utc(
                eta_first_confirmed_at=sr.get('etaFirstConfirmedAt'),
                eta_first_commit_minutes=sr.get('etaFirstCommitMinutes'),
                eta_confirmed_at=sr.get('etaConfirmedAt'),
                eta_commit_minutes=sr.get('etaCommitMinutes'),
                confirmed_at=sr.get('confirmedAt'),
                accepted_at=sr.get('acceptedAt'),
                created_at=sr.get('createdAt'),
            ) or now

            protected_minutes = incident_protected_minutes_used_total(
                incident_stats=sr.get("incidentStats"),
                active_incident=sr.get("activeIncident"),
                now=now,
            )

            if now < (
                committed_dt
                + timedelta(hours=int(TODAY_MAX_ABSOLUTE_DELAY_HOURS))
                + timedelta(minutes=float(protected_minutes or 0))
            ):
                continue

            await send_alert(client_id, srid, 'late_limit_4h')
            await self.db.service_requests.update_one(
                {'id': srid, 'status': {'$in': ['confirmed', 'en_route']}},
                {'$set': {'lateMaxDelayNotifiedAt': now.isoformat()}},
            )
            alerted += 1

        return alerted

    async def check_auto_start_post_arrival(self) -> int:
        """
        Auto inicio post llegada: si status=confirmed/en_route, arrivalDetectedAt existe,
        y la llegada fue verificada,
        y now >= arrivalDetectedAt + 30 minutos → status in_progress, autoStartedAt.
        """
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(minutes=30)

        cursor = (
            self.db.service_requests.find(
                {
                    'status': {'$in': ['confirmed', 'en_route']},
                    'arrivalDetectedAt': {'$exists': True, '$ne': None},
                    'arrivalLocation.verified': True,
                },
                {'_id': 0, 'id': 1, 'clientId': 1, 'arrivalDetectedAt': 1},
            )
            .sort([('_id', 1)])
        )

        updated_count = 0
        async for service in cursor:
            arrival_dt = _parse_offer_expires_at_utc(service.get('arrivalDetectedAt'))
            if not arrival_dt:
                continue
            if arrival_dt > threshold:
                continue
            auto_start_event = {
                'type': 'auto_start',
                'at': now.isoformat(),
            }
            result = await self.db.service_requests.update_one(
                {'id': service['id'], 'status': {'$in': ['confirmed', 'en_route']}},
                {
                    '$set': {
                        'status': 'in_progress',
                        'autoStartedAt': now.isoformat(),
                        'autoStartClientNoticePendingAt': now.isoformat(),
                        'startedAt': now.isoformat(),
                        'startedByRole': 'system',
                    },
                    '$push': {'events': auto_start_event}
                }
            )
            if result.modified_count > 0:
                updated_count += 1
                client_id = str(service.get("clientId") or "").strip()
                if client_id:
                    try:
                        from services.webpush_service import notify_service_event

                        await notify_service_event(
                            db=self.db,
                            client_id=client_id,
                            service_request_id=str(service.get("id") or ""),
                            kind="started",
                            extra={"source": "auto_start"},
                        )
                    except Exception:
                        pass
                logger.info(f"Servicio {service['id']} -> in_progress (auto_start post llegada)")
        return updated_count

    async def check_pending_client_auto_start_emails(self) -> int:
        now = datetime.now(timezone.utc)
        app_url = (os.environ.get("FRONTEND_URL", "").strip() or "").rstrip("/")
        cursor = (
            self.db.service_requests.find(
                {
                    "status": "in_progress",
                    "autoStartClientNoticePendingAt": {"$exists": True, "$ne": None},
                    "$or": [{"autoStartClientNoticeSentAt": {"$exists": False}}, {"autoStartClientNoticeSentAt": None}],
                    "clientId": {"$exists": True, "$ne": None},
                },
                {"_id": 0, "id": 1, "clientId": 1},
            )
            .sort([("_id", 1)])
        )
        sent_count = 0
        async for service in cursor:
            srid = str(service.get("id") or "").strip()
            client_id = str(service.get("clientId") or "").strip()
            if not srid or not client_id:
                continue
            client = await self.db.users.find_one({"id": client_id}, {"_id": 0, "email": 1})
            email = str((client or {}).get("email") or "").strip().lower()
            if not email:
                await self.db.service_requests.update_one(
                    {"id": srid, "status": "in_progress"},
                    {"$set": {"autoStartClientNoticeSkippedAt": now.isoformat(), "autoStartClientNoticeSkipReason": "missing_email"}},
                )
                continue
            try:
                from services.client_emailer import send_client_event_email

                out = await send_client_event_email(
                    db=self.db,
                    event_type="service_auto_started",
                    to_email=email,
                    payload={"service_request_id": srid, "app_url": app_url},
                )
                if out.get("sent"):
                    await self.db.service_requests.update_one(
                        {"id": srid, "status": "in_progress"},
                        {"$set": {"autoStartClientNoticeSentAt": now.isoformat(), "autoStartClientNoticeEmail": email}},
                    )
                    sent_count += 1
            except Exception as e:
                await self.db.service_requests.update_one(
                    {"id": srid, "status": "in_progress"},
                    {"$set": {"autoStartClientNoticeLastError": str(e), "autoStartClientNoticeLastErrorAt": now.isoformat()}},
                )
        return sent_count

    async def check_auto_arrival_from_tracking(self) -> int:
        enabled_raw = str(os.environ.get("MAQGO_AUTO_ARRIVAL_ENABLED", "false") or "").strip().lower()
        enabled = enabled_raw in {"1", "true", "yes", "y", "on"}
        if not enabled:
            return 0

        now = datetime.now(timezone.utc)
        radius_m = float(os.environ.get("MAQGO_ARRIVAL_RADIUS_METERS", "300") or 300)
        dwell_seconds = float(os.environ.get("MAQGO_ARRIVAL_DWELL_SECONDS", "60") or 60)
        max_age_telem_min = float(os.environ.get("MAQGO_TELEMETRY_MAX_AGE_MINUTES", "10") or 10)
        max_age_gps_min = float(os.environ.get("MAQGO_GPS_MAX_AGE_MINUTES", "5") or 5)
        max_candidates = int(str(os.environ.get("MAQGO_AUTO_ARRIVAL_MAX_CANDIDATES", "120") or "120").strip() or "120")
        if max_candidates <= 0:
            max_candidates = 120

        from services.utils import haversine_meters

        query = {
            "status": "confirmed",
            "$or": [{"arrivalDetectedAt": {"$exists": False}}, {"arrivalDetectedAt": None}],
            "location.lat": {"$exists": True},
            "location.lng": {"$exists": True},
        }
        projection = {
            "_id": 0,
            "id": 1,
            "clientId": 1,
            "providerId": 1,
            "machineId": 1,
            "machine_id": 1,
            "location": 1,
            "arrivalCandidateAt": 1,
            "arrivalCandidateSource": 1,
        }
        candidates = (
            await self.db.service_requests.find(query, projection).sort([("_id", -1)]).limit(max_candidates).to_list(max_candidates)
        )

        def _dt(raw: Any) -> Optional[datetime]:
            return _parse_offer_expires_at_utc(raw)

        updated = 0
        machine_ids = set()
        provider_ids = set()
        for req in candidates:
            mid = str(req.get("machineId") or req.get("machine_id") or "").strip()
            pid = str(req.get("providerId") or "").strip()
            if mid:
                machine_ids.add(mid)
            if pid:
                provider_ids.add(pid)

        machines_by_id: dict[str, dict] = {}
        if machine_ids:
            ms = await self.db.machines.find(
                {"id": {"$in": list(machine_ids)}},
                {"_id": 0, "id": 1, "location": 1, "locationUpdatedAt": 1, "locationSource": 1},
            ).to_list(len(machine_ids))
            for m in ms:
                mid = str(m.get("id") or "").strip()
                if mid:
                    machines_by_id[mid] = m

        users_by_id: dict[str, dict] = {}
        if provider_ids:
            us = await self.db.users.find(
                {"id": {"$in": list(provider_ids)}},
                {"_id": 0, "id": 1, "location": 1, "locationUpdatedAt": 1, "locationSource": 1},
            ).to_list(len(provider_ids))
            for u in us:
                uid = str(u.get("id") or "").strip()
                if uid:
                    users_by_id[uid] = u

        for req in candidates:
            req_id = str(req.get("id") or "").strip()
            if not req_id:
                continue

            provider_id = str(req.get("providerId") or "").strip()
            machine_id = str(req.get("machineId") or req.get("machine_id") or "").strip()
            job = req.get("location") if isinstance(req.get("location"), dict) else {}
            jlat = job.get("lat")
            jlng = job.get("lng")
            if jlat is None or jlng is None:
                continue
            try:
                jlat_f = float(jlat)
                jlng_f = float(jlng)
            except Exception:
                continue

            tracked_loc = None
            tracked_at = None
            tracked_source = ""
            is_telem = False

            if machine_id:
                m = machines_by_id.get(machine_id)
                if isinstance(m, dict):
                    loc = m.get("location") if isinstance(m.get("location"), dict) else None
                    if loc and loc.get("lat") is not None and loc.get("lng") is not None:
                        tracked_loc = {"lat": loc.get("lat"), "lng": loc.get("lng")}
                        tracked_at = _dt(m.get("locationUpdatedAt"))
                        tracked_source = str(m.get("locationSource") or "").strip() or "telematics"
                        is_telem = tracked_source in {"komatsu", "cat", "telematics"}

            if tracked_loc is None and provider_id:
                u = users_by_id.get(provider_id)
                if isinstance(u, dict):
                    loc = u.get("location") if isinstance(u.get("location"), dict) else None
                    if loc and loc.get("lat") is not None and loc.get("lng") is not None:
                        tracked_loc = {"lat": loc.get("lat"), "lng": loc.get("lng")}
                        tracked_at = _dt(u.get("locationUpdatedAt"))
                        tracked_source = str(u.get("locationSource") or "").strip() or "gps"
                        is_telem = tracked_source in {"komatsu", "cat", "telematics"}

            if not tracked_loc or tracked_at is None:
                continue

            age_min = (now - tracked_at).total_seconds() / 60.0
            max_age = max_age_telem_min if is_telem else max_age_gps_min
            if age_min < 0 or age_min > max_age:
                continue

            try:
                plat = float(tracked_loc.get("lat"))
                plng = float(tracked_loc.get("lng"))
            except Exception:
                continue

            dist_m = haversine_meters(jlat_f, jlng_f, plat, plng)
            if dist_m > radius_m:
                await self.db.service_requests.update_one(
                    {"id": req_id, "status": "confirmed"},
                    {"$unset": {"arrivalCandidateAt": "", "arrivalCandidateSource": ""}},
                )
                continue

            cand_at = _dt(req.get("arrivalCandidateAt"))
            cand_src = str(req.get("arrivalCandidateSource") or "").strip()
            if cand_at is None or cand_src != tracked_source:
                await self.db.service_requests.update_one(
                    {"id": req_id, "status": "confirmed"},
                    {"$set": {"arrivalCandidateAt": now.isoformat(), "arrivalCandidateSource": tracked_source}},
                )
                continue

            if (now - cand_at).total_seconds() < dwell_seconds:
                continue

            arrival_location = {
                "lat": plat,
                "lng": plng,
                "capturedAt": now.isoformat(),
                "distanceMeters": round(float(dist_m or 0), 2),
                "source": tracked_source,
                "verified": True,
            }
            arrival_event = {
                "type": "arrival",
                "at": now.isoformat(),
                "verified": True,
                "source": tracked_source,
                "byRole": "system",
            }
            result = await self.db.service_requests.update_one(
                {"id": req_id, "status": "confirmed", "$or": [{"arrivalDetectedAt": {"$exists": False}}, {"arrivalDetectedAt": None}]},
                {
                    "$set": {"arrivalDetectedAt": now.isoformat(), "arrivalLocation": arrival_location},
                    "$unset": {"arrivalCandidateAt": "", "arrivalCandidateSource": ""},
                    "$push": {"events": arrival_event},
                },
            )
            if result.modified_count > 0:
                updated += 1
                client_id = str(req.get("clientId") or "").strip()
                if client_id:
                    try:
                        from services.webpush_service import notify_service_event

                        await notify_service_event(
                            db=self.db,
                            client_id=client_id,
                            service_request_id=req_id,
                            kind="arrival",
                            extra={"source": tracked_source},
                        )
                    except Exception:
                        pass
                logger.info("Servicio %s -> arrivalDetectedAt (auto tracking source=%s dist=%.0fm)", req_id, tracked_source, dist_m)

        return updated

    async def check_last_30_services(self) -> int:
        """
        Verifica servicios que deben pasar a estado 'last_30'.
        Se activa 30 minutos antes de endTime.
        
        Returns:
            Número de servicios actualizados
        """
        now = datetime.now(timezone.utc)
        threshold = now + timedelta(minutes=30)
        
        # Buscar servicios in_progress cuyo endTime está a 30 min o menos
        cursor = (
            self.db.service_requests.find(
                {
                    'status': 'in_progress',
                    'endTime': {'$exists': True, '$ne': None},
                },
                {'_id': 0, 'id': 1, 'providerId': 1, 'clientId': 1, 'operator_id': 1, 'operatorId': 1, 'endTime': 1},
            )
            .sort([('_id', 1)])
        )
        
        updated_count = 0
        async for service in cursor:
            end_dt = _parse_offer_expires_at_utc(service.get('endTime'))
            if not end_dt:
                continue
            if end_dt > threshold:
                continue
            result = await self.db.service_requests.update_one(
                {'id': service['id'], 'status': 'in_progress'},
                {
                    '$set': {
                        'status': 'last_30',
                        'last30TriggeredAt': now.isoformat()
                    },
                    '$push': {
                        'events': {
                            'type': 'last_30',
                            'at': now.isoformat(),
                        }
                    },
                }
            )
            
            if result.modified_count > 0:
                updated_count += 1
                logger.info(f"Servicio {service['id']} -> last_30 (últimos 30 minutos)")

                try:
                    from services.notification_items_service import upsert_notification_item, record_delivery
                    from services.webpush_service import notify_user

                    sid = str(service.get('id'))
                    client_id = str(service.get('clientId') or '').strip()
                    operator_id = str(service.get('operator_id') or service.get('operatorId') or '').strip()

                    if client_id:
                        item = await upsert_notification_item(
                            self.db,
                            recipient_user_id=client_id,
                            audience_role='client',
                            service_request_id=sid,
                            kind='last_30',
                            extra={},
                            pinned=False,
                        )
                        push = await notify_user(
                            db=self.db,
                            user_id=client_id,
                            title='Últimos 30 minutos',
                            body='El servicio finalizará próximamente.',
                            url='/client/in-progress',
                            tag=f'sr:{sid}',
                        )
                        await record_delivery(
                            self.db,
                            notification_id=item['id'],
                            channel='push_web',
                            status='sent' if int(push.get('sent', 0) or 0) > 0 else 'skipped',
                            meta={'sent': int(push.get('sent', 0) or 0), 'skipped': int(push.get('skipped', 0) or 0)},
                        )

                    if operator_id:
                        item = await upsert_notification_item(
                            self.db,
                            recipient_user_id=operator_id,
                            audience_role='operator',
                            service_request_id=sid,
                            kind='last_30',
                            extra={},
                            pinned=False,
                        )
                        push = await notify_user(
                            db=self.db,
                            user_id=operator_id,
                            title='Últimos 30 minutos',
                            body='El servicio finalizará próximamente.',
                            url='/operator/home',
                            tag=f'sr:{sid}',
                        )
                        await record_delivery(
                            self.db,
                            notification_id=item['id'],
                            channel='push_web',
                            status='sent' if int(push.get('sent', 0) or 0) > 0 else 'skipped',
                            meta={'sent': int(push.get('sent', 0) or 0), 'skipped': int(push.get('skipped', 0) or 0)},
                        )
                except Exception as e:
                    logger.warning("last_30 notify error id=%s err=%s", service.get('id'), e)
        
        return updated_count
    
    async def check_finished_services(self) -> int:
        """
        Verifica servicios que deben cerrarse automáticamente.
        Se activa exactamente en endTime.
        Guarda ubicación GPS final.
        
        Returns:
            Número de servicios finalizados
        """
        now = datetime.now(timezone.utc)
        
        # Buscar servicios cuyo endTime ya pasó
        cursor = (
            self.db.service_requests.find(
                {
                    'status': {'$in': ['in_progress', 'last_30']},
                    'endTime': {'$exists': True, '$ne': None},
                },
                {'_id': 0, 'id': 1, 'providerId': 1, 'clientId': 1, 'operator_id': 1, 'operatorId': 1, 'endTime': 1},
            )
            .sort([('_id', 1)])
        )
        
        finished_count = 0
        async for service in cursor:
            sid = service.get("id")
            if not sid:
                continue
            end_dt = _parse_offer_expires_at_utc(service.get('endTime'))
            if not end_dt:
                continue
            if end_dt > now:
                continue
            # Obtener ubicación del proveedor (si está disponible)
            provider = await self.db.users.find_one(
                {'id': service.get('providerId')},
                {'_id': 0, 'location': 1}
            )
            
            final_location = None
            if provider and provider.get('location'):
                final_location = {
                    'lat': provider['location'].get('lat'),
                    'lng': provider['location'].get('lng'),
                    'capturedAt': now.isoformat()
                }
            
            finished_event = {'type': 'finished', 'at': now.isoformat()}
            update_data = {
                'status': 'finished',
                'finishedAt': now.isoformat(),
                'autoFinished': True,  # Marca que fue cierre automático
            }
            if final_location:
                update_data['finalLocation'] = final_location

            result = await self.db.service_requests.update_one(
                {'id': sid, 'status': {'$in': ['in_progress', 'last_30']}},
                {'$set': update_data, '$push': {'events': finished_event}}
            )
            
            if result.modified_count > 0:
                finished_count += 1
                logger.info(f"Servicio {sid} -> finished (cierre automático)")
                
                # Liberar al proveedor
                if service.get('providerId'):
                    from services.matching_service import ACTIVE_SERVICE_STATES

                    provider_id = service['providerId']
                    other_active = await self.db.service_requests.find_one(
                        {
                            'providerId': provider_id,
                            'id': {'$ne': sid},
                            'status': {'$in': ACTIVE_SERVICE_STATES},
                        },
                        {'_id': 0, 'id': 1, 'status': 1},
                    )
                    if other_active:
                        logger.warning(
                            "Skip provider release: active service exists providerId=%s serviceRequestId=%s otherServiceId=%s otherStatus=%s",
                            provider_id,
                            sid,
                            other_active.get('id'),
                            other_active.get('status'),
                        )
                    else:
                        await self.db.users.update_one(
                            {
                                'id': provider_id,
                                '$and': [
                                    {'$or': [{'status': {'$exists': False}}, {'status': 'active'}]},
                                    {'$or': [{'deleted': {'$exists': False}}, {'deleted': False}]},
                                ],
                            },
                            {'$set': {'isAvailable': True}}
                        )
                        logger.info(f"Proveedor {provider_id} liberado")

                sr = await self.db.service_requests.find_one({'id': sid}, {'_id': 0, 'clientId': 1, 'totalAmount': 1})
                client_id = sr.get('clientId') if isinstance(sr, dict) else None
                total = float(sr.get('totalAmount', 0) if isinstance(sr, dict) else 0)

                try:
                    from services.webpush_service import notify_service_event

                    if client_id:
                        res_push = await notify_service_event(self.db, str(client_id), str(sid), "finished", None)
                        await self.db.service_requests.update_one(
                            {'id': sid},
                            {
                                '$push': {
                                    'events': {
                                        'type': 'client_push_status',
                                        'createdAt': now.isoformat(),
                                        'kind': 'finished',
                                        'sent': int(res_push.get('sent', 0) or 0),
                                        'skipped': int(res_push.get('skipped', 0) or 0),
                                    }
                                }
                            },
                        )

                        try:
                            from services.notification_items_service import upsert_notification_item, record_delivery

                            item = await upsert_notification_item(
                                self.db,
                                recipient_user_id=str(client_id),
                                audience_role='client',
                                service_request_id=str(sid),
                                kind='finished',
                                extra={},
                                pinned=True,
                            )
                            await record_delivery(
                                self.db,
                                notification_id=item['id'],
                                channel='push_web',
                                status='sent' if int(res_push.get('sent', 0) or 0) > 0 else 'skipped',
                                meta={'sent': int(res_push.get('sent', 0) or 0), 'skipped': int(res_push.get('skipped', 0) or 0)},
                            )
                        except Exception as e:
                            logger.warning("auto-finish client aviso error id=%s err=%s", sid, e)
                except Exception as e:
                    logger.warning("auto-finish push notify error id=%s err=%s", sid, e)

                try:
                    from services.notification_items_service import upsert_notification_item, record_delivery
                    from services.webpush_service import notify_user

                    operator_id = str(service.get('operator_id') or service.get('operatorId') or '').strip()
                    if operator_id:
                        item = await upsert_notification_item(
                            self.db,
                            recipient_user_id=operator_id,
                            audience_role='operator',
                            service_request_id=str(sid),
                            kind='finished',
                            extra={},
                            pinned=True,
                        )
                        push = await notify_user(
                            db=self.db,
                            user_id=operator_id,
                            title='Servicio finalizado',
                            body='El servicio finalizó automáticamente.',
                            url='/operator/home',
                            tag=f'sr:{str(sid)}',
                        )
                        await record_delivery(
                            self.db,
                            notification_id=item['id'],
                            channel='push_web',
                            status='sent' if int(push.get('sent', 0) or 0) > 0 else 'skipped',
                            meta={'sent': int(push.get('sent', 0) or 0), 'skipped': int(push.get('skipped', 0) or 0)},
                        )
                except Exception as e:
                    logger.warning("auto-finish operator notify error id=%s err=%s", sid, e)

                try:
                    enabled_raw = str(os.environ.get("MAQGO_CLIENT_FINISHED_SUMMARY_EMAIL_ENABLED", "true") or "").strip().lower()
                    enabled = enabled_raw in {"1", "true", "yes", "y", "on"}
                    if enabled and client_id:
                        client = await self.db.users.find_one({'id': str(client_id)}, {'_id': 0, 'email': 1})
                        email = str((client or {}).get('email') or '').strip().lower()
                        if email:
                            from services.client_emailer import send_client_event_email

                            app_url = (os.environ.get("FRONTEND_URL", "").strip() or "").rstrip("/")
                            sr_full = await self.db.service_requests.find_one(
                                {'id': sid},
                                {
                                    '_id': 0,
                                    'id': 1,
                                    'finishedAt': 1,
                                    'totalAmount': 1,
                                    'hours': 1,
                                    'machineryType': 1,
                                    'machineType': 1,
                                    'location': 1,
                                },
                            )
                            out = await send_client_event_email(
                                db=self.db,
                                event_type='service_finished_summary',
                                to_email=email,
                                payload={
                                    'service_request_id': sid,
                                    'app_url': app_url,
                                    'finished_at': (sr_full or {}).get('finishedAt') or now.isoformat(),
                                    'total_amount': (sr_full or {}).get('totalAmount') if isinstance(sr_full, dict) else None,
                                    'hours': (sr_full or {}).get('hours') if isinstance(sr_full, dict) else None,
                                    'machinery': (sr_full or {}).get('machineryType') or (sr_full or {}).get('machineType') or '—',
                                    'location': (sr_full or {}).get('location') if isinstance(sr_full, dict) else None,
                                },
                            )
                            if out.get('sent'):
                                await self.db.service_requests.update_one(
                                    {'id': sid},
                                    {'$set': {'finishedSummaryClientEmailSentAt': now.isoformat(), 'finishedSummaryClientEmail': email}},
                                )
                except Exception as e:
                    logger.warning("auto-finish summary email error id=%s err=%s", sid, e)
        
        return finished_count
    
    async def check_pending_review_services(self) -> int:
        """
        Verifica servicios en 'pending_review' que ya pasaron 24 horas.
        Auto-aprueba y notifica al proveedor para que emita factura.
        
        REGLA DE NEGOCIO MAQGO - "Pago Ágil":
        1. Servicio finaliza → pending_review (ventana de 24h para reportes críticos)
        2. Si pasan 24h → approved automáticamente
        3. Se notifica al proveedor: "Emite factura a MAQGO por $X (neto menos tarifa)"
        4. Proveedor sube factura → invoiced
        5. MAQGO paga → paid
        
        Nota: Disputas se manejan en paralelo vía soporte,
        NO bloquean el flujo de pago estándar.
        
        Returns:
            Número de servicios auto-aprobados
        """
        from pricing.business_rules import AUTO_APPROVAL_HOURS
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(hours=AUTO_APPROVAL_HOURS)
        
        # Buscar servicios pending_review creados hace más de 24h
        try:
            # Usamos la colección 'services' del módulo de facturación
            services_collection = self.db.services
            
            cursor = (
                services_collection.find(
                    {
                        'status': 'pending_review',
                        'created_at': {'$lte': threshold}
                    }
                )
                .sort([('created_at', 1), ('_id', 1)])
            )
            
            approved_count = 0
            async for service in cursor:
                # Auto-aprobar
                result = await services_collection.update_one(
                    {'_id': service['_id'], 'status': 'pending_review'},
                    {
                        '$set': {
                            'status': 'approved',
                            'approved_at': now,
                            'auto_approved': True,
                            'approval_reason': f'Pago Ágil - {AUTO_APPROVAL_HOURS} horas completadas'
                        }
                    }
                )
                
                if result.modified_count > 0:
                    approved_count += 1
                    logger.info(f"Servicio {service['_id']} auto-aprobado ({AUTO_APPROVAL_HOURS}h - Pago Ágil)")
                    
                    try:
                        await self._notify_provider_invoice_ready(service)
                    except Exception as notify_err:
                        logger.warning("notify_provider_invoice_ready error id=%s err=%s", service.get('_id'), notify_err)
            
            return approved_count
            
        except Exception as e:
            logger.error(f"Error en check_pending_review_services: {e}")
            return 0
    
    async def _notify_provider_invoice_ready(self, service: dict):
        from communications import notify_service_approved_for_invoice
        from services.notification_items_service import upsert_notification_item

        provider_id = str(service.get('provider_id') or service.get('owner_id') or '').strip()
        if not provider_id:
            return

        net_amount = service.get('net_total', 0)
        try:
            invoice_amount = str(int(float(net_amount or 0)))
        except Exception:
            invoice_amount = "0"

        provider_phone = None
        provider = await self.db.users.find_one({'id': provider_id}, {'_id': 0, 'phone': 1, 'owner_id': 1})
        if provider:
            if provider.get('owner_id'):
                owner_id = str(provider.get('owner_id') or '').strip()
                if owner_id:
                    owner = await self.db.users.find_one({'id': owner_id}, {'_id': 0, 'phone': 1})
                    provider_phone = (owner or {}).get('phone') or provider.get('phone')
            else:
                provider_phone = provider.get('phone')
        provider_phone = str(provider_phone or '').strip()

        service_id = str(service.get('id') or service.get('_id') or '').strip()
        if service_id:
            await upsert_notification_item(
                self.db,
                recipient_user_id=provider_id,
                audience_role='provider',
                service_request_id=service_id,
                kind='factura_lista',
                extra={'invoice_amount': invoice_amount},
                occurred_at=datetime.now(timezone.utc).isoformat(),
                action_required=True,
                pinned=True,
            )

        if provider_phone:
            notify_service_approved_for_invoice(provider_phone, invoice_amount)
    
    async def check_expired_offers(self) -> int:
        """
        Verifica ofertas que han expirado (timeout según MATCHING_CONFIG, ej. 60 s).
        Automáticamente pasa al siguiente proveedor.
        
        Returns:
            Número de ofertas expiradas
        """
        from services.matching_service import (
            handle_offer_expired,
            handle_parallel_offers_expired,
            handle_rotation_round_expired,
        )

        now_m = time.monotonic()
        if (
            self._last_check_expired_heartbeat is None
            or (now_m - self._last_check_expired_heartbeat) >= _CHECK_EXPIRED_HEARTBEAT_SEC
        ):
            logger.info("CHECK_EXPIRED_OFFERS_RUNNING")
            self._last_check_expired_heartbeat = now_m
        
        now = datetime.now(timezone.utc)

        # Candidatas: no filtrar solo por string en Mongo (Z vs +00:00 rompe $lte).
        cursor = (
            self.db.service_requests.find(
                {
                    'status': 'offer_sent',
                    'offerExpiresAt': {'$exists': True, '$ne': None},
                },
                {
                    '_id': 0,
                    'id': 1,
                    'currentOfferId': 1,
                    'offerExpiresAt': 1,
                    'matchingRotationMode': 1,
                    'matchingAttempts': 1,
                },
            ).sort([('_id', 1)])
        )

        services = []
        expiring = []
        async for doc in cursor:
            exp_dt = _parse_offer_expires_at_utc(doc.get('offerExpiresAt'))
            if exp_dt is None:
                logger.warning(
                    "check_expired_offers: offerExpiresAt no parseable id=%s raw=%r",
                    doc.get('id'),
                    doc.get('offerExpiresAt'),
                )
                continue
            remaining = (exp_dt - now).total_seconds()
            if 0 < remaining <= 120:
                expiring.append(doc)
            if exp_dt <= now:
                services.append(doc)

        if expiring:
            try:
                from services.notification_items_service import record_delivery, upsert_notification_item
                from services.webpush_service import notify_user

                for doc in expiring:
                    sid = str(doc.get('id') or '').strip()
                    if not sid:
                        continue
                    exp_raw = str(doc.get('offerExpiresAt') or '').strip()
                    if not exp_raw:
                        continue
                    pending_ids = []
                    attempts = doc.get('matchingAttempts') if isinstance(doc.get('matchingAttempts'), list) else []
                    for a in attempts:
                        if not isinstance(a, dict):
                            continue
                        if a.get('status') != 'pending':
                            continue
                        pid = str(a.get('providerId') or '').strip()
                        if pid and pid not in pending_ids:
                            pending_ids.append(pid)
                    if doc.get('currentOfferId'):
                        pid = str(doc.get('currentOfferId') or '').strip()
                        if pid and pid not in pending_ids:
                            pending_ids.append(pid)

                    for pid in pending_ids:
                        item = await upsert_notification_item(
                            self.db,
                            recipient_user_id=pid,
                            audience_role='provider',
                            service_request_id=sid,
                            kind='oferta_expira',
                            occurred_at=exp_raw,
                            pinned=True,
                        )

                        already = await self.db.notification_deliveries.find_one(
                            {'notificationId': item['id'], 'channel': 'push_web', 'status': {'$in': ['sent', 'skipped']}},
                            {'_id': 0, 'id': 1},
                        )
                        if already:
                            continue

                        push = await notify_user(
                            db=self.db,
                            user_id=pid,
                            title='Oferta por expirar',
                            body='Tu oferta está por expirar. Revisa ahora.',
                            url='/provider/request-received',
                            tag=f'sr:{sid}',
                        )
                        await record_delivery(
                            self.db,
                            notification_id=item['id'],
                            channel='push_web',
                            status='sent' if int(push.get('sent', 0) or 0) > 0 else 'skipped',
                            meta={'sent': int(push.get('sent', 0) or 0), 'skipped': int(push.get('skipped', 0) or 0)},
                        )
            except Exception as e:
                logger.warning("offer expiring notify error err=%s", e)

        expired_count = 0
        for service in services:
            sid = service.get('id')
            if not sid:
                continue
            if service.get('matchingRotationMode'):
                await handle_rotation_round_expired(self.db, sid)
                expired_count += 1
                logger.info("Oferta rotación expirada (TTL global) servicio %s", sid)
            elif service.get('currentOfferId'):
                await handle_offer_expired(
                    self.db,
                    sid,
                    service['currentOfferId'],
                )
                expired_count += 1
                logger.info(f"Oferta expirada para servicio {sid}")
            else:
                await handle_parallel_offers_expired(self.db, sid)
                expired_count += 1
                logger.info("Oferta paralela expirada servicio %s", sid)

        return expired_count

    async def check_matching_rotation_waves(self) -> int:
        """Amplía olas 2 y 3 según PRIMARY/SECONDARY_RESPONSE_WINDOW (no bloquea ofertas previas)."""
        from services.matching_service import apply_matching_rotation_waves

        cursor = (
            self.db.service_requests.find(
                {'status': 'offer_sent', 'matchingRotationMode': True},
                {'_id': 0, 'id': 1},
            )
            .sort([('_id', 1)])
        )
        count = 0
        async for d in cursor:
            rid = d.get('id')
            if rid:
                await apply_matching_rotation_waves(self.db, rid)
                count += 1
        return count

    async def run_all_checks(self) -> dict:
        """
        Ejecuta todas las verificaciones de timers.
        Este método debe llamarse periódicamente (cada minuto).
        
        Returns:
            Resumen de acciones realizadas
        """
        logger.debug("Ejecutando verificación de timers...")
        
        expired_incident_windows = await self.check_expired_incident_protected_windows()
        no_arrival_alerts = await self.check_confirmed_no_arrival_timeout()
        auto_arrival = await self.check_auto_arrival_from_tracking()
        auto_started = await self.check_auto_start_post_arrival()
        auto_start_emails = await self.check_pending_client_auto_start_emails()
        rotation_waves = await self.check_matching_rotation_waves()
        expired_offers = await self.check_expired_offers()
        last_30_services = await self.check_last_30_services()
        finished_services = await self.check_finished_services()
        auto_approved = await self.check_pending_review_services()
        
        summary = {
            'expired_incident_windows': expired_incident_windows,
            'no_arrival_alerts': no_arrival_alerts,
            'auto_arrival': auto_arrival,
            'auto_started': auto_started,
            'auto_start_emails': auto_start_emails,
            'matching_rotation_waves': rotation_waves,
            'expired_offers': expired_offers,
            'last_30_triggered': last_30_services,
            'auto_finished': finished_services,
            'auto_approved_6h': auto_approved,
            'checked_at': datetime.now(timezone.utc).isoformat()
        }
        
        if expired_incident_windows or no_arrival_alerts or auto_arrival or auto_started or auto_start_emails or rotation_waves or expired_offers or last_30_services or finished_services or auto_approved:
            logger.info(f"Timer check completado: {summary}")
        
        return summary
