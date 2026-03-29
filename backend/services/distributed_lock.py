"""
Bloqueo distribuido opcional (Redis) alrededor de run_idempotent.
La corrección multi-instancia la garantiza el claim en Mongo (idempotency_store);
Redis reduce contención y esperas activas cuando todas las réplicas tienen REDIS_URL.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

_redis_client = None


def _redis_url() -> str:
    return (os.environ.get("REDIS_URL") or os.environ.get("MAQGO_REDIS_URL") or "").strip()


async def get_async_redis():
    global _redis_client
    url = _redis_url()
    if not url:
        return None
    if _redis_client is None:
        try:
            import redis.asyncio as redis

            _redis_client = redis.from_url(url, decode_responses=True)
        except Exception as e:
            logger.error("Redis no disponible: %s", e)
            return None
    return _redis_client


@asynccontextmanager
async def idempotency_distributed_lock(
    tenant_id: str,
    idempotency_key: str,
    *,
    timeout_sec: int = 120,
    blocking_timeout_sec: int = 90,
) -> AsyncIterator[None]:
    r = await get_async_redis()
    if not r:
        yield
        return
    name = f"maqgo:idem:{tenant_id}:{idempotency_key}"
    lock = r.lock(name, timeout=timeout_sec, blocking_timeout=blocking_timeout_sec)
    try:
        async with lock:
            yield
    except Exception as e:
        logger.warning("Redis lock idempotencia falló: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo adquirir bloqueo distribuido de idempotencia; reintenta con la misma Idempotency-Key.",
        ) from e
