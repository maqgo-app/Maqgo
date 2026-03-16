"""
Endpoint público para social proof en landing/welcome.
Devuelve conteos para atraer clientes y proveedores.
"""
from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
import os

router = APIRouter(prefix="/public", tags=["public"])

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo_db')]


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
