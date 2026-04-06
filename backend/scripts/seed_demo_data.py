import asyncio
import os
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def load_env_from_dotenv():
    """
    Carga variables desde backend/.env si existen,
    sin depender de que el servidor las haya exportado.
    """
    backend_root = Path(__file__).resolve().parents[1]
    env_path = backend_root / ".env"
    if not env_path.exists():
        return

    with env_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            # No sobreescribir si ya viene del entorno
            os.environ.setdefault(key, value)


async def main():
    # Asegura que MONGO_URL y DB_NAME se carguen desde backend/.env
    load_env_from_dotenv()

    from db_config import get_db_name, get_mongo_url

    mongo_url = get_mongo_url()
    db_name = get_db_name()

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Conectando a MongoDB en {mongo_url} (DB: {db_name})...")

    # Limpia usuarios demo anteriores para no duplicar
    await db.users.delete_many({"email": {"$in": ["demo.cliente@maqgo.cl", "demo.proveedor@maqgo.cl"]}})

    now = datetime.now(timezone.utc).isoformat()

    # Cliente demo
    client_id = str(uuid.uuid4())
    client_doc = {
        "id": client_id,
        "role": "client",
        "name": "Cliente Demo",
        "email": "demo.cliente@maqgo.cl",
        "phone": "+56911111111",
        "rating": 5.0,
        "totalRatings": 0,
        "isAvailable": False,
        "hourlyRate": 0.0,
        "location": None,
        "provider_role": "super_master",
        "owner_id": None,
        "operator_permissions": None,
        "rut": None,
        "totalServices": 0,
        "acceptedServices": 0,
        "rejectedServices": 0,
        "responseTimeAvg": 0.0,
        "createdAt": now,
    }

    # Proveedor demo
    provider_id = str(uuid.uuid4())
    provider_doc = {
        "id": provider_id,
        "role": "provider",
        "name": "Proveedor Demo Retro",
        "email": "demo.proveedor@maqgo.cl",
        "phone": "+56922222222",
        "rating": 5.0,
        "totalRatings": 0,
        "isAvailable": True,
        "machineryType": "retroexcavadora",
        "machinery": {
            "type": "retroexcavadora",
            "brand": "Caterpillar",
            "model": "320D",
            "year": 2020,
            "licensePlate": "AA-BB-11",
            "hourlyRate": 80000.0,
        },
        "hourlyRate": 80000.0,
        "location": {"lat": -33.45, "lng": -70.66},
        "provider_role": "super_master",
        "owner_id": None,
        "operator_permissions": None,
        "rut": "11.111.111-1",
        "totalServices": 0,
        "acceptedServices": 0,
        "rejectedServices": 0,
        "responseTimeAvg": 0.0,
        "createdAt": now,
    }

    await db.users.insert_many([client_doc, provider_doc])

    print("✅ Datos demo creados:")
    print(f"- Cliente demo: {client_doc['email']} (id={client_id})")
    print(f"- Proveedor demo: {provider_doc['email']} (id={provider_id})")


if __name__ == "__main__":
    asyncio.run(main())

