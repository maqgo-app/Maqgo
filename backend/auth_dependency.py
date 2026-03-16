"""
MAQGO - Dependencia de autenticación para rutas protegidas.
Valida token Bearer contra sesiones en MongoDB.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
import os

security = HTTPBearer(auto_error=False)

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo_db')]


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


async def get_current_admin(
    user: dict = Depends(get_current_user)
) -> dict:
    """Requiere que el usuario autenticado sea admin."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido a administradores",
        )
    return user
