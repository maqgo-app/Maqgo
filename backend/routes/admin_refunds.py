"""
Admin: cola de solicitudes de devolución (requested → aprobación → Transbank).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin
from motor.motor_asyncio import AsyncIOMotorClient
import os

from services.refund_request_service import RefundRequestService
from services.payment_service import PaymentService

router = APIRouter(prefix="/admin/refund-requests", tags=["admin-refunds"])

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "maqgo_db")]


class ApproveBody(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class RejectBody(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


@router.get("")
async def list_refund_requests(
    status: Optional[str] = None,
    _: dict = Depends(get_current_admin),
):
    svc = RefundRequestService(db)
    items = await svc.list_by_status(status=status, limit=200)
    return {"items": items, "count": len(items)}


@router.post("/{refund_request_id}/approve")
async def approve_refund_request(
    refund_request_id: str,
    body: ApproveBody = None,
    admin: dict = Depends(get_current_admin),
):
    svc = RefundRequestService(db)
    ps = PaymentService(db)
    result = await svc.approve(
        refund_request_id,
        admin_user_id=admin.get("id", ""),
        note=(body.note if body else None) or None,
        payment_service=ps,
    )
    if not result.get("success") and result.get("status") == "failed":
        raise HTTPException(
            status_code=502,
            detail=result.get("rollback", {}).get("message")
            or "Transbank no confirmó el reembolso",
        )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "No se pudo aprobar"))
    return result


@router.post("/{refund_request_id}/reject")
async def reject_refund_request(
    refund_request_id: str,
    body: RejectBody = None,
    admin: dict = Depends(get_current_admin),
):
    svc = RefundRequestService(db)
    result = await svc.reject(
        refund_request_id,
        admin_user_id=admin.get("id", ""),
        note=(body.note if body else None) or None,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "No se pudo rechazar"))
    return result
