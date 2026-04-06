"""
Idempotencia con bloqueo distribuido (Redis opcional) + serialización fuerte en MongoDB.

- Redis (REDIS_URL / MAQGO_REDIS_URL): reduce contención entre instancias.
- Mongo: documento único (tenant_id, idempotency_key) con fase running → completed;
  garantiza que no haya dos ejecuciones concurrentes del mismo efecto aunque no haya Redis.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from services.distributed_lock import idempotency_distributed_lock
from services.payment_metrics_store import ensure_indexes as ensure_payment_metrics_indexes
from services.payment_metrics_store import inc_fields
from services.payment_ledger import (
    EVT_IDEMPOTENCY_CONFLICT,
    EVT_IDEMPOTENCY_REPLAY,
    append_event,
    ensure_indexes as ensure_payment_ledger_indexes,
)

logger = logging.getLogger(__name__)

COLLECTION = "idempotency_store"
DEFAULT_TTL_DAYS = int(os.environ.get("MAQGO_IDEMPOTENCY_TTL_DAYS", "30"))

_IDEM_POLL_SEC = float(os.environ.get("MAQGO_IDEMPOTENCY_POLL_INTERVAL_SEC", "0.25"))
_IDEM_WAIT_MAX = float(os.environ.get("MAQGO_IDEMPOTENCY_WAIT_MAX_SEC", "90"))


def get_tenant_id() -> str:
    return (os.environ.get("MAQGO_TENANT_ID") or "maqgo").strip() or "maqgo"


def canonical_json_hash(payload: Any) -> str:
    if payload is None:
        raw = b"null"
    elif isinstance(payload, (dict, list)):
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    else:
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _infer_row_status(doc: dict) -> str:
    st = doc.get("status")
    if st in ("running", "completed"):
        return st
    if doc.get("response_body") is not None:
        return "completed"
    return "completed"


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await ensure_payment_metrics_indexes(db)
    await ensure_payment_ledger_indexes(db)
    try:
        await db[COLLECTION].create_index(
            [("tenant_id", 1), ("idempotency_key", 1)],
            unique=True,
            name="uniq_tenant_idempotency",
        )
        if DEFAULT_TTL_DAYS > 0:
            await db[COLLECTION].create_index(
                "created_at",
                expireAfterSeconds=DEFAULT_TTL_DAYS * 24 * 3600,
                name="ttl_created_at",
            )
    except Exception as e:
        logger.warning("idempotency_store index: %s", e)


async def _persist_idempotency_metrics(
    db: AsyncIOMotorDatabase,
    *,
    kind: str,
    scope: str,
    endpoint: str,
) -> None:
    field = {
        "replay": "idempotency_replays",
        "race_replay": "idempotency_race_replays",
        "fresh": "idempotency_fresh_executions",
        "conflict": "idempotency_conflicts",
    }.get(kind)
    if not field:
        return
    await inc_fields(db, **{field: 1})
    logger.info(
        "payment_rollout idempotency_%s scope=%s endpoint=%s",
        kind,
        scope,
        endpoint,
        extra={
            "payment_metric": f"idempotency_{kind}",
            "scope": scope,
            "endpoint": endpoint,
        },
    )
    if kind == "replay":
        await append_event(
            db,
            EVT_IDEMPOTENCY_REPLAY,
            {"scope": scope, "endpoint": endpoint, "variant": "replay"},
        )
    elif kind == "race_replay":
        await append_event(
            db,
            EVT_IDEMPOTENCY_REPLAY,
            {"scope": scope, "endpoint": endpoint, "variant": "race_replay"},
        )
    elif kind == "conflict":
        await append_event(
            db,
            EVT_IDEMPOTENCY_CONFLICT,
            {"scope": scope, "endpoint": endpoint},
        )


async def _wait_for_completed_row(
    coll,
    *,
    tenant_id: str,
    key: str,
    req_hash: str,
    scope: str,
    endpoint: str,
    db: AsyncIOMotorDatabase,
) -> tuple[int, Any]:
    deadline = time.monotonic() + _IDEM_WAIT_MAX
    while time.monotonic() < deadline:
        await asyncio.sleep(_IDEM_POLL_SEC)
        doc = await coll.find_one({"tenant_id": tenant_id, "idempotency_key": key}, {"_id": 0})
        if not doc:
            continue
        eh = doc.get("request_hash")
        if eh is not None and eh != req_hash:
            await _persist_idempotency_metrics(db, kind="conflict", scope=scope, endpoint=endpoint)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key reutilizada con payload distinto",
            )
        row_st = _infer_row_status(doc)
        if row_st == "completed":
            await _persist_idempotency_metrics(db, kind="race_replay", scope=scope, endpoint=endpoint)
            return int(doc.get("http_status") or 200), doc.get("response_body")
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Idempotencia: timeout esperando resultado de otra instancia; reintenta con la misma clave.",
    )


async def run_idempotent(
    db: AsyncIOMotorDatabase,
    *,
    tenant_id: str,
    idempotency_key: str,
    scope: str,
    endpoint: str,
    body_for_hash: Any,
    execute: Callable[[], Coroutine[Any, Any, tuple[int, Any]]],
) -> tuple[int, Any]:
    if not idempotency_key or not str(idempotency_key).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header es obligatorio para esta operación",
        )
    key = str(idempotency_key).strip()
    if len(key) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key demasiado largo (máx 128)",
        )

    req_hash = canonical_json_hash(body_for_hash)
    now = datetime.now(timezone.utc)
    coll = db[COLLECTION]

    async def _body() -> tuple[int, Any]:
        existing = await coll.find_one({"tenant_id": tenant_id, "idempotency_key": key}, {"_id": 0})
        if existing:
            eh0 = existing.get("request_hash")
            if eh0 is not None and eh0 != req_hash:
                await _persist_idempotency_metrics(db, kind="conflict", scope=scope, endpoint=endpoint)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key reutilizada con payload distinto",
                )
            row_st = _infer_row_status(existing)
            if row_st == "completed":
                await _persist_idempotency_metrics(db, kind="replay", scope=scope, endpoint=endpoint)
                return int(existing.get("http_status") or 200), existing.get("response_body")
            if row_st == "running":
                return await _wait_for_completed_row(
                    coll,
                    tenant_id=tenant_id,
                    key=key,
                    req_hash=req_hash,
                    scope=scope,
                    endpoint=endpoint,
                    db=db,
                )

        running_doc = {
            "tenant_id": tenant_id,
            "idempotency_key": key,
            "scope": scope,
            "endpoint": endpoint,
            "request_hash": req_hash,
            "status": "running",
            "started_at": now,
            "created_at": now,
            "response_body": None,
            "http_status": None,
        }
        try:
            await coll.insert_one(running_doc)
        except DuplicateKeyError:
            return await _wait_for_completed_row(
                coll,
                tenant_id=tenant_id,
                key=key,
                req_hash=req_hash,
                scope=scope,
                endpoint=endpoint,
                db=db,
            )

        try:
            try:
                http_status, response_body = await execute()
            except (HTTPException, StarletteHTTPException) as he:
                http_status = int(he.status_code)
                detail = he.detail
                if isinstance(detail, dict):
                    response_body = detail
                elif isinstance(detail, list):
                    response_body = {"detail": detail}
                else:
                    response_body = {"detail": str(detail)}

            await coll.update_one(
                {"tenant_id": tenant_id, "idempotency_key": key, "status": "running"},
                {
                    "$set": {
                        "status": "completed",
                        "http_status": int(http_status),
                        "response_body": response_body,
                        "completed_at": datetime.now(timezone.utc),
                    }
                },
            )
            await _persist_idempotency_metrics(db, kind="fresh", scope=scope, endpoint=endpoint)
            return int(http_status), response_body
        except Exception:
            try:
                await coll.delete_one({"tenant_id": tenant_id, "idempotency_key": key, "status": "running"})
            except Exception as del_e:
                logger.warning("idempotency cleanup running row: %s", del_e)
            raise

    async with idempotency_distributed_lock(tenant_id, key):
        return await _body()


def require_idempotency_header(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Header Idempotency-Key es obligatorio",
        )
    return str(raw).strip()
