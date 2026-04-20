"""
MAQGO - Dependencia de autenticación para rutas protegidas.
Valida token Bearer contra sesiones en MongoDB.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import secrets

from db_config import get_db_name, get_mongo_url

security = HTTPBearer(auto_error=False)

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]


def _normalize_phone(phone: str) -> str:
    """Normaliza teléfono a E.164 para comparación."""
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        return f"+{digits}"
    return f"+56{digits}" if digits else ""


async def create_session_for_user(user_id: str) -> str:
    """
    Crea una sesión para el usuario y retorna el token.
    Usado tras verificación OTP, creación de usuario o join de operador.
    """
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "userId": user_id,
        "token": token,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    return token


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> dict:
    """
    Obtiene el usuario actual validando el token Bearer.
    Levanta 401 si no hay token o es inválido.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials.strip()

    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = session.get("userId")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """
    Variante opcional: no lanza 401 si no hay Bearer.
    Retorna None si el token falta o es inválido/expirado.
    """
    if not credentials or not credentials.credentials:
        return None

    token = credentials.credentials.strip()
    session = await db.sessions.find_one({"token": token})
    if not session:
        return None

    user_id = session.get("userId")
    if not user_id:
        return None

    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        return None

    return user


async def get_current_admin(
    user: dict = Depends(get_current_user)
) -> dict:
    """Requiere que el usuario autenticado sea admin."""
    roles = user.get("roles") or []
    is_admin = user.get("role") == "admin" or ("admin" in roles if isinstance(roles, list) else False)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido a administradores",
        )
    return user


async def get_current_admin_strict(
    user: dict = Depends(get_current_admin),
) -> dict:
    if user.get("must_change_password"):
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="Debes cambiar tu contraseña antes de acceder al panel",
        )
    return user


async def verify_user_access(
    user_id: str, current_user: dict = Depends(get_current_user)
) -> dict:
    """Verifica que el usuario acceda solo a sus datos o sea admin."""
    if current_user.get("id") == user_id:
        return current_user
    roles = current_user.get("roles") or []
    if current_user.get("role") == "admin" or ("admin" in roles if isinstance(roles, list) else False):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No puedes acceder a datos de otro usuario",
    )
