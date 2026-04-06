"""
Lectura agregada booking + payment_intent + service_request (fuente de verdad backend).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from motor.motor_asyncio import AsyncIOMotorClient
from services.payment_intent_service import PaymentIntentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]
payment_intent_service = PaymentIntentService(db)


def _can_read_booking(user: dict, pi: dict) -> bool:
    if user.get("role") == "admin":
        return True
    return pi.get("client_id") == user.get("id")


@router.get("/{booking_id}")
async def get_booking_aggregate(
    booking_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Estado agregado para el flujo de pago/reserva.
    El cliente solo ve su propio booking_id.
    """
    pi = await payment_intent_service.get_by_booking_id(booking_id)
    if not pi:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking no encontrado")

    if not _can_read_booking(current_user, pi):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a este booking")

    sr_id = pi.get("service_request_id")
    service_request: Optional[dict] = None
    if sr_id:
        service_request = await db.service_requests.find_one({"id": sr_id}, {"_id": 0})
    if not service_request:
        service_request = await db.service_requests.find_one({"bookingId": booking_id}, {"_id": 0})

    return {
        "booking_id": booking_id,
        "payment_intent": pi,
        "service_request": service_request,
    }
