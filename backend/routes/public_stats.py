"""
Endpoint público para social proof en landing/welcome.
Devuelve conteos para atraer clientes y proveedores.
"""
from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/public", tags=["public"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]


@router.get("/stats")
async def get_landing_stats():
    """
    Estadísticas públicas para la pantalla de bienvenida.
    Social proof: clientes, proveedores, servicios completados.
    """
    try:
        clients_count = await db.users.count_documents({"role": "client"})
        providers_count = await db.users.count_documents({"role": "provider"})
        services_count = await db.services.count_documents({"status": "paid"})
        return {
            "total_clients": clients_count,
            "total_providers": providers_count,
            "services_completed": services_count,
        }
    except Exception:
        return {
            "total_clients": 0,
            "total_providers": 0,
            "services_completed": 0,
        }
