from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from auth_dependency import get_current_admin
from db_config import get_db_name, get_mongo_url
from rate_limit import limiter

router = APIRouter(prefix="/support", tags=["support"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]

try:
    db.support_tickets.create_index([("status", 1), ("created_at", -1)])
    db.support_tickets.create_index([("phone9", 1), ("created_at", -1)])
except Exception:
    pass


SupportTicketReason = Literal["inactive_user", "phone_in_use", "otp_not_received", "other"]
SupportTicketStatus = Literal["open", "resolved"]


class SupportTicketCreate(BaseModel):
    reason: SupportTicketReason = Field(..., description="Motivo del ticket")
    phone9: Optional[str] = Field(None, min_length=0, max_length=16)
    email: Optional[EmailStr] = None
    rut: Optional[str] = Field(None, min_length=0, max_length=32)
    requested_role: Optional[Literal["client", "provider", "operator"]] = None
    notes: Optional[str] = Field(None, min_length=0, max_length=800)


class SupportTicketUpdate(BaseModel):
    status: SupportTicketStatus = Field(...)
    resolution: Optional[str] = Field(None, min_length=0, max_length=800)


def _only_digits(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _normalize_phone9(value: Optional[str]) -> str:
    digits = _only_digits(value or "")
    if digits.startswith("56") and len(digits) >= 11:
        digits = digits[2:]
    return digits[-9:] if len(digits) >= 9 else digits


@router.post("/tickets", response_model=dict)
@limiter.limit("3/minute")
async def create_support_ticket(request: Request, body: SupportTicketCreate):
    phone9 = _normalize_phone9(body.phone9)
    if phone9 and len(phone9) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")

    now = datetime.now(timezone.utc).isoformat()
    tid = str(uuid4())

    doc = {
        "id": tid,
        "created_at": now,
        "status": "open",
        "reason": body.reason,
        "phone9": phone9 or None,
        "email": str(body.email).strip().lower() if body.email else None,
        "rut": str(body.rut).strip() if body.rut else None,
        "requested_role": body.requested_role,
        "notes": str(body.notes).strip() if body.notes else None,
        "ua": str(request.headers.get("user-agent") or "")[:240],
    }

    await db.support_tickets.insert_one(doc)
    return {"success": True, "ticket_id": tid}


@router.get("/tickets", response_model=dict)
async def list_support_tickets(
    status: Optional[SupportTicketStatus] = "open",
    _: dict = Depends(get_current_admin),
):
    q = {}
    if status:
        q["status"] = status
    items = await db.support_tickets.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": items}


@router.patch("/tickets/{ticket_id}", response_model=dict)
async def update_support_ticket(
    ticket_id: str,
    body: SupportTicketUpdate,
    admin: dict = Depends(get_current_admin),
):
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "status": body.status,
        "updated_at": now,
        "updated_by": admin.get("id"),
    }
    if body.resolution is not None:
        update["resolution"] = str(body.resolution).strip()

    res = await db.support_tickets.update_one({"id": ticket_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return {"success": True, "id": ticket_id, **update}

