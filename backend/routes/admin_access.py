import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth_dependency import get_current_admin
from db_config import get_db_name, get_mongo_url
from routes.auth import hash_password, verify_password

router = APIRouter(prefix="/admin", tags=["admin-access"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


class AdminChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=12)


def _validate_new_password(v: str) -> None:
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe incluir letras y números",
        )


@router.get("/access")
async def admin_access(_: Request, user: dict = Depends(get_current_admin)):
    return {
        "ok": True,
        "user_id": user.get("id"),
        "email": user.get("email"),
        "must_change_password": bool(user.get("must_change_password")),
    }


@router.post("/change-password")
async def admin_change_password(request: Request, body: AdminChangePasswordRequest, user: dict = Depends(get_current_admin)):
    _validate_new_password(body.new_password)

    doc = await db.users.find_one({"id": user.get("id")}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not verify_password(body.current_password, doc.get("password", "")):
        raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta")

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": doc["id"]},
        {
            "$set": {
                "password": hash_password(body.new_password),
                "must_change_password": False,
                "password_changed_at": now,
            }
        },
    )

    return {"ok": True, "must_change_password": False}

