"""
Payment Hardening — idempotencia, métricas persistentes (MongoDB) y modo enforced/legacy.

Métricas: colección payment_rollout_counters (compartida entre instancias).
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Optional, Tuple, Union

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.payment_metrics_store import build_hardening_snapshot_from_db, inc_fields
from services.payment_ledger import aggregate_ledger_admin_metrics
from services.payment_consistency_engine import count_open_inconsistencies

logger = logging.getLogger(__name__)

LOG_MISSING_IDEMPOTENCY = "payment_rollout.missing_idempotency_key"
LOG_BOOKING_ID_GENERATED = "payment_rollout.booking_id_generated"


def _parse_bool(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def is_hardening_enforced() -> bool:
    return _parse_bool("PAYMENT_HARDENING_ENFORCED", False)


def idempotency_mode_header_value(was_auto_generated_key: bool) -> str:
    """X-Idempotency-Mode: legacy si el servidor generó la clave; si no, enforced."""
    return "legacy" if was_auto_generated_key else "enforced"


def resolve_idempotency_key(
    raw: Union[None, str, Any],
    scope: str,
) -> Tuple[str, bool]:
    """
    Resuelve clave final (sin efectos secundarios de métricas).
    Tras llamar, usar await persist_idempotency_key_resolution(db, ...) en rutas async.
    """
    s = (_idempotency_header_from_raw(raw) or "").strip()
    if s:
        if len(s) > 128:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Idempotency-Key demasiado largo (máx 128)",
            )
        return s, False

    if is_hardening_enforced():
        logger.warning(
            "%s rejected scope=%s (PAYMENT_HARDENING_ENFORCED=true)",
            LOG_MISSING_IDEMPOTENCY,
            scope,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key es obligatoria",
        )

    safe_scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in scope)[:24] or "op"
    gen = f"leg-{safe_scope}-{uuid.uuid4().hex}"
    return gen, True


async def persist_idempotency_key_resolution(
    db: AsyncIOMotorDatabase,
    *,
    scope: str,
    endpoint: str,
    was_auto_generated: bool,
    generated_key_prefix: str = "",
) -> None:
    if was_auto_generated:
        await inc_fields(db, legacy_missing_idempotency_key=1)
        logger.warning(
            "%s scope=%s endpoint=%s generated_prefix=%s enforced=%s",
            LOG_MISSING_IDEMPOTENCY,
            scope,
            endpoint,
            generated_key_prefix[:32],
            is_hardening_enforced(),
            extra={
                "payment_metric": "missing_idempotency_key",
                "scope": scope,
                "endpoint": endpoint,
            },
        )
    else:
        await inc_fields(db, idempotency_key_from_header=1)
        logger.info(
            "payment_rollout idempotency_key_header scope=%s endpoint=%s",
            scope,
            endpoint,
            extra={
                "payment_metric": "idempotency_key_from_header",
                "scope": scope,
                "endpoint": endpoint,
            },
        )


async def record_metric(
    db: AsyncIOMotorDatabase,
    event: str,
    value: int = 1,
    *,
    scope: str = "",
    endpoint: str = "",
) -> None:
    """Incrementa contador persistente nombrado (snake_case)."""
    key = event.strip()
    if not key:
        return
    await inc_fields(db, **{key: value})
    logger.info(
        "payment_rollout metric event=%s value=%s scope=%s endpoint=%s",
        key,
        value,
        scope,
        endpoint,
        extra={"payment_metric": key, "scope": scope, "endpoint": endpoint},
    )


async def record_charge_attempt(
    db: AsyncIOMotorDatabase,
    service_request_id: Optional[str] = None,
    *,
    scope: str = "",
    endpoint: str = "",
) -> None:
    await inc_fields(db, charge_attempts=1)
    logger.info(
        "payment_rollout charge_attempt service_request_id=%s scope=%s endpoint=%s",
        service_request_id or "",
        scope,
        endpoint,
        extra={
            "payment_metric": "charge_attempt",
            "service_request_id": service_request_id,
            "scope": scope,
            "endpoint": endpoint,
        },
    )


async def record_charge_success(
    db: AsyncIOMotorDatabase,
    service_request_id: Optional[str] = None,
    *,
    scope: str = "",
    endpoint: str = "",
) -> None:
    await inc_fields(db, charge_successes=1)
    logger.info(
        "payment_rollout charge_success service_request_id=%s scope=%s endpoint=%s",
        service_request_id or "",
        scope,
        endpoint,
        extra={
            "payment_metric": "charge_success",
            "service_request_id": service_request_id,
            "scope": scope,
            "endpoint": endpoint,
        },
    )


async def record_charge_failure(
    db: AsyncIOMotorDatabase,
    service_request_id: Optional[str] = None,
    *,
    scope: str = "",
    endpoint: str = "",
) -> None:
    await inc_fields(db, charge_failures=1)
    logger.warning(
        "payment_rollout charge_failure service_request_id=%s scope=%s endpoint=%s",
        service_request_id or "",
        scope,
        endpoint,
        extra={
            "payment_metric": "charge_failure",
            "service_request_id": service_request_id,
            "scope": scope,
            "endpoint": endpoint,
        },
    )


async def record_booking_id_supplied(
    db: AsyncIOMotorDatabase,
    *,
    scope: str = "",
    endpoint: str = "",
) -> None:
    await inc_fields(db, booking_ids_supplied=1)
    logger.debug(
        "payment_rollout booking_id_supplied scope=%s endpoint=%s",
        scope,
        endpoint,
        extra={"scope": scope, "endpoint": endpoint},
    )


async def record_legacy_booking_id_generated(
    db: AsyncIOMotorDatabase,
    scope: str,
    client_hint: Optional[str] = None,
    booking_id: Optional[str] = None,
    *,
    endpoint: str = "",
) -> None:
    await inc_fields(db, legacy_missing_booking_id_generated=1)
    logger.info(
        "%s scope=%s endpoint=%s client=%s booking_id=%s",
        LOG_BOOKING_ID_GENERATED,
        scope,
        endpoint,
        (client_hint or "")[:24],
        (booking_id or "")[:48],
        extra={"payment_metric": "booking_id_generated", "scope": scope, "endpoint": endpoint},
    )


async def get_payment_hardening_metrics_snapshot(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    base = await build_hardening_snapshot_from_db(db)
    ledger = await aggregate_ledger_admin_metrics(db)
    inconsistency_count = await count_open_inconsistencies(db, limit=500)
    return {**base, **ledger, "inconsistency_count": inconsistency_count}


def _idempotency_header_from_raw(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    if hasattr(raw, "headers"):
        h = raw.headers
        v = h.get("Idempotency-Key") or h.get("idempotency-key")
        if v is not None and str(v).strip():
            return str(v).strip()
        return None
    if isinstance(raw, str):
        s = raw.strip()
        return s if s else None
    return None
