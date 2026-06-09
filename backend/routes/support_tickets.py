from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from auth_dependency import get_current_admin
from db_config import get_db_name, get_mongo_url
from rate_limit import limiter
from services.access_block_service import find_active_phone_block as _find_active_phone_block
from services.access_block_service import normalize_phone9 as _normalize_phone9_service

router = APIRouter(prefix="/support", tags=["support"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]

try:
    db.support_tickets.create_index([("status", 1), ("created_at", -1)])
    db.support_tickets.create_index([("phone9", 1), ("created_at", -1)])
    db.blocked_login_phones.create_index([("phone9", 1)], unique=True)
    db.blocked_login_phones.create_index([("active", 1), ("updated_at", -1)])
except Exception:
    pass


SupportTicketReason = Literal[
    "inactive_user",
    "phone_in_use",
    "otp_not_received",
    "phone_blocked",
    "temporary_lock",
    "other",
]
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


class BlockedPhoneCreate(BaseModel):
    phone9: str = Field(..., min_length=9, max_length=16)
    reason: str = Field(..., min_length=3, max_length=120)
    notes: Optional[str] = Field(None, min_length=0, max_length=800)


def _only_digits(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _normalize_phone9(value: Optional[str]) -> str:
    return _normalize_phone9_service(value)


async def find_active_phone_block(phone9: Optional[str]) -> Optional[dict]:
    return await _find_active_phone_block(db, phone9)


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


@router.get("/blocked-phones", response_model=dict)
async def list_blocked_phones(
    active: bool = True,
    _: dict = Depends(get_current_admin),
):
    items = await db.blocked_login_phones.find(
        {"active": bool(active)},
        {"_id": 0},
    ).sort("updated_at", -1).limit(200).to_list(200)
    return {"items": items}


@router.post("/blocked-phones", response_model=dict)
async def create_blocked_phone(
    body: BlockedPhoneCreate,
    admin: dict = Depends(get_current_admin),
):
    phone9 = _normalize_phone9(body.phone9)
    if len(phone9) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.blocked_login_phones.find_one({"phone9": phone9}, {"_id": 0})
    doc = {
        "id": existing.get("id") if existing else str(uuid4()),
        "phone9": phone9,
        "active": True,
        "reason": str(body.reason).strip(),
        "notes": str(body.notes).strip() if body.notes else None,
        "created_at": existing.get("created_at") if existing else now,
        "created_by": existing.get("created_by") if existing else admin.get("id"),
        "updated_at": now,
        "updated_by": admin.get("id"),
    }
    await db.blocked_login_phones.update_one(
        {"phone9": phone9},
        {"$set": doc},
        upsert=True,
    )
    return {"success": True, "item": doc}


@router.delete("/blocked-phones/{phone9}", response_model=dict)
async def unblock_phone(
    phone9: str,
    admin: dict = Depends(get_current_admin),
):
    normalized = _normalize_phone9(phone9)
    if len(normalized) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")
    now = datetime.now(timezone.utc).isoformat()
    res = await db.blocked_login_phones.update_one(
        {"phone9": normalized},
        {
            "$set": {
                "active": False,
                "updated_at": now,
                "updated_by": admin.get("id"),
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bloqueo no encontrado")
    return {"success": True, "phone9": normalized, "active": False}


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
