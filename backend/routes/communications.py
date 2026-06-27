"""MAQGO – Communications API Routes

Server-side only (OTP por SMS).
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from rate_limit import limiter

from communications import send_sms_otp, verify_sms_otp


router = APIRouter(prefix="/communications", tags=["communications"])


class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format (+56912345678)")


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")


@router.post("/sms/send-otp")
@limiter.limit("5/minute")
async def api_send_otp(request: Request, body: SendOTPRequest):
    result = send_sms_otp(body.phone_number, channel="sms")
    if not result.get("success") and not result.get("demo_mode"):
        err = result.get("error") or "Failed to send OTP"
        status = 429 if "Demasiados intentos" in (err or "") else 400
        raise HTTPException(status_code=status, detail=err)
    return {
        "success": True,
        "demo_mode": bool(result.get("demo_mode")),
        "channel": "sms",
        "reused": bool(result.get("reused")),
        "ttl_seconds": result.get("ttl_seconds"),
        "message": result.get("message") or "OTP enviado correctamente por SMS",
    }


@router.post("/sms/verify-otp")
@limiter.limit("10/minute")
async def api_verify_otp(request: Request, body: VerifyOTPRequest):
    from auth_dependency import create_session_for_user, _normalize_phone
    from motor.motor_asyncio import AsyncIOMotorClient
    import os

    result = verify_sms_otp(body.phone_number, body.code)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or "No se pudo verificar OTP")

    phone_e164 = _normalize_phone(body.phone_number)
    mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
    if not mongo_url:
        return {"success": True, "valid": bool(result.get("valid")), "token": None}

    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get("DB_NAME", "maqgo")]
    user = await db.users.find_one({"phone": phone_e164}, {"_id": 0})
    if not user:
        return {"success": True, "valid": True, "token": None}

    session = await create_session_for_user(user)
    return {"success": True, "valid": True, **session}


@router.get("/sms/status")
async def sms_status():
    return {
        "otp_sms": "enabled",
        "transactional_sms": "disabled",
    }

