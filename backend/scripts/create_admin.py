import asyncio
import os
import sys
import secrets
import bcrypt
import re
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

# Asegura que el root del backend esté en el path
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

def load_env_from_dotenv():
    """Carga variables desde backend/.env si existen."""
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
            os.environ.setdefault(key, value)

def hash_password(password: str) -> str:
    """Hash seguro con bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def validate_password(v: str) -> bool:
    """Valida complejidad de contraseña (8-12 chars, letras y números)."""
    if len(v) < 8 or len(v) > 12:
        return False
    if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
        return False
    return True

async def main():
    load_env_from_dotenv()
    
    # Importaciones diferidas para asegurar que el path y env estén listos
    try:
        from db_config import get_db_name, get_mongo_url
    except ImportError:
        print("❌ Error: No se pudo importar db_config. Asegúrate de ejecutar desde la raíz del proyecto.")
        return

    mongo_url = get_mongo_url()
    db_name = get_db_name()
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"\n--- MAQGO: Creación de Administrador ---")
    print(f"Conectando a: {db_name}\n")
    
    email = input("📧 Email del Admin: ").strip().lower()
    if not email:
        print("❌ El email es obligatorio.")
        return

    existing = await db.users.find_one({"email": email})
    if existing:
        print(f"❌ Error: Ya existe un usuario con el email {email}.")
        return

    password = input("🔑 Contraseña (8-12 caracteres, letras y números): ").strip()
    if not validate_password(password):
        print("❌ La contraseña no cumple con los requisitos de seguridad (8-12 caracteres, letras y números).")
        return

    name = input("👤 Nombre Completo: ").strip()
    phone = input("📱 Teléfono (+569...): ").strip()

    admin_doc = {
        "id": str(uuid.uuid4()),
        "role": "admin",
        "roles": ["admin"],
        "name": name if name else "Admin Maqgo",
        "email": email,
        "phone": phone if phone else None,
        "password": hash_password(password),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "phoneVerified": True,
        "isAvailable": False
    }

    try:
        await db.users.insert_one(admin_doc)
        print(f"\n✅ Administrador creado con éxito: {email}")
        print("Ahora puedes iniciar sesión en www.maqgo.cl/login con estas credenciales.")
    except Exception as e:
        print(f"❌ Error al insertar en la base de datos: {e}")

if __name__ == "__main__":
    asyncio.run(main())
