from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient

from db_config import get_db_name, get_mongo_url

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(get_mongo_url())
_db = _client[get_db_name()]
_users_collection = _db.users


async def require_active_operator(operator_id: Any, *, context: str) -> dict:
    op_id = ""
    if operator_id is not None:
        try:
            op_id = str(operator_id).strip()
        except Exception:
            op_id = ""

    if not op_id:
        logger.warning("operator_guard_blocked reason=OPERATOR_ID_REQUIRED context=%s", context)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "OPERATOR_ID_REQUIRED",
                "message": "Se requiere un operador asignado para completar la operación.",
                "context": context,
            },
        )

    user = await _users_collection.find_one(
        {"id": op_id},
        {"_id": 0, "id": 1, "status": 1, "provider_role": 1, "owner_id": 1, "name": 1},
    )

    if not user:
        logger.warning("operator_guard_blocked reason=OPERATOR_NOT_FOUND id=%s context=%s", op_id, context)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "OPERATOR_NOT_FOUND",
                "message": "El operador asignado no existe en el sistema.",
                "operator_id": op_id,
                "context": context,
            },
        )

    role_norm = str(user.get("provider_role") or "").strip().lower()
    if role_norm != "operator":
        logger.warning(
            "operator_guard_blocked reason=USER_NOT_OPERATOR_ROLE id=%s role=%s context=%s",
            op_id, role_norm, context,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "USER_NOT_OPERATOR_ROLE",
                "message": "El usuario asignado no tiene el rol de operador.",
                "operator_id": op_id,
                "found_role": role_norm or "null",
                "context": context,
            },
        )

    status_norm = str(user.get("status") or "").strip().lower()
    if status_norm != "active":
        logger.warning(
            "operator_guard_blocked reason=OPERATOR_NOT_ACTIVE id=%s found_status=%s context=%s",
            op_id, status_norm or "null", context,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OPERATOR_NOT_ACTIVE",
                "message": "No se puede completar la operación porque el operador asociado no está activado.",
                "hint": "El operador debe abrir el enlace recibido por SMS y confirmar su código OTP antes de asignarlo a servicios.",
                "operator_id": op_id,
                "operator_status_found": status_norm or "null",
                "context": context,
            },
        )

    return dict(user)
