"""
Solicitudes de devolución (reembolso) con aprobación humana MAQGO.
Flujo: requested → admin aprueba → ejecución Transbank (rollback_charge) → completed | failed.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

REFUND_STATUS_REQUESTED = "requested"
REFUND_STATUS_APPROVED = "approved"  # transición breve antes de ejecutar TBK
REFUND_STATUS_REJECTED = "rejected"
REFUND_STATUS_COMPLETED = "completed"
REFUND_STATUS_FAILED = "failed"


class RefundRequestService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def create_request(
        self,
        *,
        service_request_id: str,
        amount: float,
        reason: str,
        requested_by_user_id: Optional[str],
        source: str,
        meta: Optional[dict] = None,
    ) -> dict:
        """Crea solicitud en estado 'requested'. Idempotente si ya hay una pending para el mismo servicio."""
        existing = await self.db.refund_requests.find_one(
            {
                "serviceRequestId": service_request_id,
                "status": REFUND_STATUS_REQUESTED,
            }
        )
        if existing:
            return {"success": True, "refundRequest": existing, "duplicate": True}

        payment = await self.db.payments.find_one(
            {
                "serviceRequestId": service_request_id,
                "status": "charged",
            }
        )
        rid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": rid,
            "serviceRequestId": service_request_id,
            "paymentId": (payment or {}).get("id"),
            "amount": float(amount),
            "reason": reason,
            "source": source,
            "status": REFUND_STATUS_REQUESTED,
            "requestedByUserId": requested_by_user_id,
            "createdAt": now,
            "meta": meta or {},
        }
        await self.db.refund_requests.insert_one(doc)
        logger.info(
            "Refund request created %s service=%s amount=%s",
            rid,
            service_request_id,
            amount,
        )
        return {"success": True, "refundRequest": doc, "duplicate": False}

    async def list_by_status(self, status: Optional[str] = None, limit: int = 100) -> list:
        q: dict = {}
        if status:
            q["status"] = status
        cur = self.db.refund_requests.find(q, {"_id": 0}).sort("createdAt", -1).limit(limit)
        return await cur.to_list(limit)

    async def approve(
        self,
        refund_request_id: str,
        admin_user_id: str,
        note: Optional[str] = None,
        payment_service: Any = None,
    ) -> dict:
        from services.payment_service import PaymentService

        req = await self.db.refund_requests.find_one(
            {"id": refund_request_id}, {"_id": 0}
        )
        if not req:
            return {"success": False, "message": "Solicitud no encontrada"}
        if req["status"] != REFUND_STATUS_REQUESTED:
            return {
                "success": False,
                "message": f"Estado inválido: {req['status']} (solo se aprueba 'requested')",
            }

        now = datetime.now(timezone.utc).isoformat()
        await self.db.refund_requests.update_one(
            {"id": refund_request_id},
            {
                "$set": {
                    "status": REFUND_STATUS_APPROVED,
                    "reviewedByUserId": admin_user_id,
                    "reviewedAt": now,
                    "adminNote": note,
                }
            },
        )

        ps = payment_service or PaymentService(self.db)
        rr = await ps.rollback_charge(
            req["serviceRequestId"],
            reason=req.get("reason", "admin_approved_refund"),
            refund_amount=req["amount"],
            skip_service_request_update=False,
            refund_payment_status_only=True,
        )

        if rr.get("success"):
            await self.db.refund_requests.update_one(
                {"id": refund_request_id},
                {
                    "$set": {
                        "status": REFUND_STATUS_COMPLETED,
                        "completedAt": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )
            return {"success": True, "status": REFUND_STATUS_COMPLETED, "rollback": rr}

        await self.db.refund_requests.update_one(
            {"id": refund_request_id},
            {
                "$set": {
                    "status": REFUND_STATUS_FAILED,
                    "failedAt": datetime.now(timezone.utc).isoformat(),
                    "failureDetail": rr.get("message") or rr.get("error"),
                }
            },
        )
        await self.db.service_requests.update_one(
            {"id": req["serviceRequestId"]},
            {"$set": {"paymentStatus": "refund_pending"}},
        )
        return {"success": False, "status": REFUND_STATUS_FAILED, "rollback": rr}

    async def reject(
        self,
        refund_request_id: str,
        admin_user_id: str,
        note: Optional[str] = None,
    ) -> dict:
        req = await self.db.refund_requests.find_one({"id": refund_request_id})
        if not req:
            return {"success": False, "message": "Solicitud no encontrada"}
        if req["status"] != REFUND_STATUS_REQUESTED:
            return {"success": False, "message": f"Estado inválido: {req['status']}"}

        now = datetime.now(timezone.utc).isoformat()
        await self.db.refund_requests.update_one(
            {"id": refund_request_id},
            {
                "$set": {
                    "status": REFUND_STATUS_REJECTED,
                    "reviewedByUserId": admin_user_id,
                    "reviewedAt": now,
                    "adminNote": note,
                }
            },
        )
        # La reserva sigue cancelada pero el cobro permanece (política de negocio explícita)
        await self.db.service_requests.update_one(
            {"id": req["serviceRequestId"]},
            {"$set": {"paymentStatus": "charged", "refundRejectedAt": now}},
        )
        return {"success": True, "status": REFUND_STATUS_REJECTED}

