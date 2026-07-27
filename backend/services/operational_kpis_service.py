from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.operational_kpis_store import sum_metric

ASSIGNED_STATUSES = {"confirmed", "en_route", "in_progress", "last_30", "finished"}
NO_ARRIVAL_EVENT_TYPES = {"no_arrival_alert_120", "no_arrival_alert_180", "no_arrival_alert_240"}


def _parse_iso_utc(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.astimezone(timezone.utc) if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        text = str(raw).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _rate(num: int, den: int) -> float:
    return round((float(num) / float(den)) if den > 0 else 0.0, 6)


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    idx = max(0, min(len(sorted_values) - 1, int(round((len(sorted_values) - 1) * pct))))
    return round(float(sorted_values[idx]), 3)


def _sum_attempts(
    service_requests: Iterable[dict],
    *,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, int]:
    offers_sent = 0
    offers_rejected = 0
    offers_expired = 0
    for request in service_requests:
        for attempt in request.get("matchingAttempts") or []:
            sent_at = _parse_iso_utc(attempt.get("sentAt"))
            if not sent_at or sent_at < start_at or sent_at >= end_at:
                continue
            offers_sent += 1
            status = str(attempt.get("status") or "").strip().lower()
            if status == "rejected":
                offers_rejected += 1
            if status == "expired":
                offers_expired += 1
    return {
        "offers_sent": offers_sent,
        "offers_rejected": offers_rejected,
        "offers_expired": offers_expired,
    }


def _sum_event_counts(
    service_requests: Iterable[dict],
    *,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, int]:
    wave2_triggered = 0
    wave3_triggered = 0
    duplicate_no_arrival = 0
    for request in service_requests:
        no_arrival_counts: dict[str, int] = {}
        for event in request.get("events") or []:
            occurred_at = _parse_iso_utc(event.get("at"))
            if not occurred_at or occurred_at < start_at or occurred_at >= end_at:
                continue
            event_type = str(event.get("type") or "").strip().lower()
            if event_type == "matching_rotation_wave_added":
                stage = int(event.get("stage") or 0)
                if stage == 2:
                    wave2_triggered += 1
                if stage == 3:
                    wave3_triggered += 1
            if event_type in NO_ARRIVAL_EVENT_TYPES:
                no_arrival_counts[event_type] = int(no_arrival_counts.get(event_type) or 0) + 1
        duplicate_no_arrival += sum(max(0, count - 1) for count in no_arrival_counts.values())
    return {
        "wave2_triggered": wave2_triggered,
        "wave3_triggered": wave3_triggered,
        "duplicate_no_arrival": duplicate_no_arrival,
    }


def build_operational_kpis_snapshot_from_docs(
    *,
    service_requests: list[dict],
    notifications_seen: int,
    notifications_acknowledged: int,
    notifications_opened: int,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, Any]:
    created_count = 0
    assigned_count = 0
    assignment_times_seconds: list[float] = []
    for request in service_requests:
        created_at = _parse_iso_utc(request.get("createdAt"))
        if not created_at or created_at < start_at or created_at >= end_at:
            continue
        created_count += 1
        status = str(request.get("status") or "").strip().lower()
        assigned_at = _parse_iso_utc(request.get("confirmedAt")) or _parse_iso_utc(request.get("acceptedAt"))
        is_assigned = bool(request.get("providerId")) or status in ASSIGNED_STATUSES
        if is_assigned:
            assigned_count += 1
        if assigned_at and is_assigned:
            delta = (assigned_at - created_at).total_seconds()
            if delta >= 0:
                assignment_times_seconds.append(delta)

    assignment_times_seconds.sort()
    attempts = _sum_attempts(service_requests, start_at=start_at, end_at=end_at)
    event_counts = _sum_event_counts(service_requests, start_at=start_at, end_at=end_at)
    assignment_avg = round(sum(assignment_times_seconds) / len(assignment_times_seconds), 3) if assignment_times_seconds else 0.0

    return {
        "window": {
            "startAt": start_at.isoformat(),
            "endAt": end_at.isoformat(),
            "days": max(1, int((end_at - start_at).total_seconds() // 86400)),
        },
        "kpis": {
            "fill_rate": {
                "value": _rate(assigned_count, created_count),
                "numerator": assigned_count,
                "denominator": created_count,
            },
            "assignment_time": {
                "count": len(assignment_times_seconds),
                "avg_seconds": assignment_avg,
                "p50_seconds": _percentile(assignment_times_seconds, 0.50),
                "p95_seconds": _percentile(assignment_times_seconds, 0.95),
            },
            **attempts,
            **event_counts,
            "notifications_seen": int(notifications_seen or 0),
            "notifications_opened": int(notifications_opened or 0),
            "notifications_acknowledged": int(notifications_acknowledged or 0),
        },
        "sources": {
            "service_requests": "service_requests.createdAt, confirmedAt, acceptedAt, providerId, status, matchingAttempts, events",
            "notifications_seen": "notification_items.readAt",
            "notifications_acknowledged": "notification_items.ackAt",
            "notifications_opened": "operational_kpi_counters_daily.notifications_opened",
        },
        "impact_on_business_rules": "none",
    }


async def build_operational_kpis_snapshot(
    db: AsyncIOMotorDatabase,
    *,
    days: int = 14,
    now: datetime | None = None,
) -> dict[str, Any]:
    safe_days = max(1, min(int(days or 14), 90))
    end_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    start_at = end_at - timedelta(days=safe_days)
    start_iso = start_at.isoformat()
    end_iso = end_at.isoformat()

    service_requests = await db.service_requests.find(
        {"createdAt": {"$gte": start_iso, "$lt": end_iso}},
        {
            "_id": 0,
            "id": 1,
            "createdAt": 1,
            "acceptedAt": 1,
            "confirmedAt": 1,
            "providerId": 1,
            "status": 1,
            "matchingAttempts": 1,
            "events": 1,
        },
    ).to_list(20000)

    notifications_seen = await db.notification_items.count_documents({"readAt": {"$gte": start_iso, "$lt": end_iso}})
    notifications_acknowledged = await db.notification_items.count_documents({"ackAt": {"$gte": start_iso, "$lt": end_iso}})
    notifications_opened = await sum_metric(
        db,
        "notifications_opened",
        start_at=start_at,
        end_at=end_at,
    )

    return build_operational_kpis_snapshot_from_docs(
        service_requests=service_requests,
        notifications_seen=int(notifications_seen or 0),
        notifications_acknowledged=int(notifications_acknowledged or 0),
        notifications_opened=int(notifications_opened or 0),
        start_at=start_at,
        end_at=end_at,
    )
