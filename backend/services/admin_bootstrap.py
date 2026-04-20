import os
import uuid
from datetime import datetime, timezone

from routes.auth import hash_password


def _norm_email(value: str) -> str:
    return str(value or "").strip().lower()


async def ensure_initial_admin(db) -> dict:
    email = _norm_email(os.environ.get("MAQGO_BOOTSTRAP_ADMIN_EMAIL", ""))
    temp_password = str(os.environ.get("MAQGO_BOOTSTRAP_ADMIN_TEMP_PASSWORD", "")).strip()
    name = str(os.environ.get("MAQGO_BOOTSTRAP_ADMIN_NAME", "")).strip() or "Admin MAQGO"
    phone = str(os.environ.get("MAQGO_BOOTSTRAP_ADMIN_PHONE", "")).strip() or None

    if not email or not temp_password:
        return {"created": False, "reason": "missing_env"}

    existing = await db.users.find_one(
        {"$or": [{"role": "admin"}, {"roles": "admin"}]},
        {"_id": 0, "id": 1, "email": 1},
    )
    if existing:
        return {"created": False, "reason": "already_exists", "admin_id": existing.get("id")}

    now = datetime.now(timezone.utc).isoformat()
    admin_doc = {
        "id": str(uuid.uuid4()),
        "role": "admin",
        "roles": ["admin"],
        "name": name,
        "email": email,
        "phone": phone,
        "password": hash_password(temp_password),
        "createdAt": now,
        "phoneVerified": True,
        "isAvailable": False,
        "must_change_password": True,
        "temp_password_issued_at": now,
    }
    await db.users.insert_one(admin_doc)
    return {"created": True, "email": email, "admin_id": admin_doc["id"]}

