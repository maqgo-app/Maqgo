import asyncio
import os
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

def load_env_from_dotenv():
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
            os.environ.setdefault(key.strip(), value.strip())

async def find_dual_role_users():
    load_env_from_dotenv()
    from db_config import get_db_name, get_mongo_url
    mongo_url = get_mongo_url()
    db_name = get_db_name()
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Buscando usuarios con doble rol en {db_name}...")
    
    # Usuarios que tienen 'client' y 'provider' en su lista de roles
    cursor = db.users.find({
        "$and": [
            {"roles": "client"},
            {"roles": "provider"}
        ]
    })
    
    found = False
    async for user in cursor:
        found = True
        print(f"ID: {user.get('id')}, Email: {user.get('email')}, Phone: {user.get('phone')}, Roles: {user.get('roles')}")
    
    if not found:
        # También buscar si tienen roles como manager/operator que impliquen provider
        cursor = db.users.find({
            "$and": [
                {"roles": "client"},
                {"roles": {"$in": ["owner", "manager", "operator"]}}
            ]
        })
        async for user in cursor:
            found = True
            print(f"ID: {user.get('id')}, Email: {user.get('email')}, Phone: {user.get('phone')}, Roles: {user.get('roles')}")

    if not found:
        print("No se encontraron usuarios con roles explícitos mixtos.")

if __name__ == "__main__":
    asyncio.run(find_dual_role_users())
