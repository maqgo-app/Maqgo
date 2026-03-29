"""
Payment intent: única fuente de verdad de estado de pago en el flujo booking.
Solo el backend transiciona estados.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from services.payment_ledger import (
    EVT_PAYMENT_INTENT_CREATED,
    EVT_PAYMENT_INTENT_UPDATED,
    append_event,
)

logger = logging.getLogger(__name__)

COLLECTION = "payment_intents"

# Estados permitidos (backend-only transitions)
PI_INIT = "INIT"
PI_CARD_PENDING = "CARD_PENDING"
PI_CARD_REGISTERED = "CARD_REGISTERED"
PI_PAYMENT_PENDING = "PAYMENT_PENDING"
PI_PAYMENT_AUTHORIZED = "PAYMENT_AUTHORIZED"
PI_PAYMENT_FAILED = "PAYMENT_FAILED"
PI_PROVIDER_PENDING = "PROVIDER_PENDING"
PI_PROVIDER_ACCEPTED = "PROVIDER_ACCEPTED"
PI_COMPLETED = "COMPLETED"

ALL_STATES = frozenset(
    {
        PI_INIT,
        PI_CARD_PENDING,
        PI_CARD_REGISTERED,
        PI_PAYMENT_PENDING,
        PI_PAYMENT_AUTHORIZED,
        PI_PAYMENT_FAILED,
        PI_PROVIDER_PENDING,
        PI_PROVIDER_ACCEPTED,
        PI_COMPLETED,
    }
)

# Captura de cargo al aceptar proveedor (bloqueo duro; nombres alineados a contrato API)
CAPTURE_IDLE = "idle"
CAPTURE_PROCESSING = "processing"
CAPTURE_SUCCEEDED = "succeeded"
CAPTURE_FAILED = "failed"


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[COLLECTION].create_index("booking_id", unique=True, name="uniq_booking_id")
        await db[COLLECTION].create_index("client_id", name="idx_client_id")
    except Exception as e:
        logger.warning("payment_intents index: %s", e)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PaymentIntentService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[COLLECTION]

    async def get_by_booking_id(self, booking_id: str) -> Optional[dict]:
        return await self.col.find_one({"booking_id": booking_id}, {"_id": 0})

    async def create_if_absent(
        self,
        *,
        booking_id: str,
        client_id: str,
        state: str = PI_INIT,
    ) -> dict:
        if state not in ALL_STATES:
            raise ValueError(f"Estado inválido: {state}")
        doc = {
            "id": f"pi_{uuid.uuid4().hex[:16]}",
            "booking_id": booking_id,
            "client_id": client_id,
            "state": state,
            "version": 1,
            "service_request_id": None,
            "last_idempotency_key": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        try:
            await self.col.insert_one(doc)
            out = {k: v for k, v in doc.items() if k != "_id"}
            await append_event(
                self.db,
                EVT_PAYMENT_INTENT_CREATED,
                {
                    "intent_id": out.get("id"),
                    "booking_id": booking_id,
                    "client_id": client_id,
                    "state": state,
                },
            )
            return out
        except DuplicateKeyError:
            existing = await self.get_by_booking_id(booking_id)
            if existing:
                return existing
            raise

    async def set_state(
        self,
        booking_id: str,
        new_state: str,
        *,
        last_idempotency_key: Optional[str] = None,
        service_request_id: Optional[str] = None,
        extra_set: Optional[dict] = None,
    ) -> Optional[dict]:
        if new_state not in ALL_STATES:
            raise ValueError(f"Estado inválido: {new_state}")
        prev = await self.get_by_booking_id(booking_id)
        update: dict[str, Any] = {
            "$set": {
                "state": new_state,
                "updated_at": _now(),
            },
            "$inc": {"version": 1},
        }
        if last_idempotency_key is not None:
            update["$set"]["last_idempotency_key"] = last_idempotency_key
        if service_request_id is not None:
            update["$set"]["service_request_id"] = service_request_id
        if extra_set:
            update["$set"].update(extra_set)

        doc = await self.col.find_one_and_update(
            {"booking_id": booking_id},
            update,
            return_document=ReturnDocument.AFTER,
        )
        if doc and "_id" in doc:
            doc = {k: v for k, v in doc.items() if k != "_id"}
        if doc:
            await append_event(
                self.db,
                EVT_PAYMENT_INTENT_UPDATED,
                {
                    "intent_id": doc.get("id"),
                    "booking_id": booking_id,
                    "field": "state",
                    "from_state": (prev or {}).get("state"),
                    "to_state": new_state,
                    "version": doc.get("version"),
                },
            )
        return doc

    async def upsert_for_client(
        self,
        *,
        booking_id: str,
        client_id: str,
        state: str,
        last_idempotency_key: Optional[str] = None,
    ) -> dict:
        """Crea o actualiza intent asegurando client_id coherente."""
        existing = await self.get_by_booking_id(booking_id)
        if existing:
            if existing.get("client_id") != client_id:
                raise ValueError("booking_id pertenece a otro cliente")
            return (
                await self.set_state(
                    booking_id,
                    state,
                    last_idempotency_key=last_idempotency_key,
                )
                or existing
            )
        doc = await self.create_if_absent(booking_id=booking_id, client_id=client_id, state=state)
        if last_idempotency_key:
            await self.col.update_one(
                {"booking_id": booking_id},
                {"$set": {"last_idempotency_key": last_idempotency_key, "updated_at": _now()}},
            )
            doc["last_idempotency_key"] = last_idempotency_key
        return doc

    async def claim_payment_capture(self, booking_id: str) -> tuple[bool, Optional[dict]]:
        """
        Intenta pasar payment_capture_status a processing.
        Returns:
            (True, doc) si este worker tiene el token de captura.
            (False, doc_actual) si otro proceso ya procesa o ya cerró.
        """
        res = await self.col.find_one_and_update(
            {
                "booking_id": booking_id,
                "$or": [
                    {"payment_capture_status": {"$exists": False}},
                    {"payment_capture_status": None},
                    {"payment_capture_status": CAPTURE_IDLE},
                    {"payment_capture_status": CAPTURE_FAILED},
                ],
            },
            {
                "$set": {
                    "payment_capture_status": CAPTURE_PROCESSING,
                    "capture_started_at": _now(),
                    "updated_at": _now(),
                },
                "$inc": {"version": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        if res:
            doc = {k: v for k, v in res.items() if k != "_id"}
            await append_event(
                self.db,
                EVT_PAYMENT_INTENT_UPDATED,
                {
                    "intent_id": doc.get("id"),
                    "booking_id": booking_id,
                    "field": "payment_capture_status",
                    "to_capture": CAPTURE_PROCESSING,
                    "phase": "claim",
                },
            )
            return True, doc
        cur = await self.get_by_booking_id(booking_id)
        return False, cur

    async def set_payment_capture_outcome(self, booking_id: str, outcome: str) -> None:
        if outcome not in (CAPTURE_IDLE, CAPTURE_SUCCEEDED, CAPTURE_FAILED):
            raise ValueError(f"outcome inválido: {outcome}")
        prev = await self.get_by_booking_id(booking_id)
        await self.col.update_one(
            {"booking_id": booking_id},
            {
                "$set": {
                    "payment_capture_status": outcome,
                    "updated_at": _now(),
                },
                "$inc": {"version": 1},
            },
        )
        await append_event(
            self.db,
            EVT_PAYMENT_INTENT_UPDATED,
            {
                "intent_id": (prev or {}).get("id"),
                "booking_id": booking_id,
                "field": "payment_capture_status",
                "from_capture": (prev or {}).get("payment_capture_status"),
                "to_capture": outcome,
                "phase": "outcome",
            },
        )
