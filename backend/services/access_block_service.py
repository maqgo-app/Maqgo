from __future__ import annotations

from typing import Optional


def normalize_phone9(value: Optional[str]) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        digits = digits[2:]
    return digits[-9:] if len(digits) >= 9 else digits


async def find_active_phone_block(db, phone9: Optional[str]) -> Optional[dict]:
    normalized = normalize_phone9(phone9)
    if len(normalized) != 9:
        return None
    return await db.blocked_login_phones.find_one(
        {"phone9": normalized, "active": True},
        {"_id": 0},
    )
