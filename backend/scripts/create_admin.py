import asyncio
import os
import sys
import secrets
import bcrypt
import re
import argparse
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
    """Valida complejidad de contraseña (8-64 chars, letras y números)."""
    if len(v) < 8 or len(v) > 64:
        return False
    if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
        return False
    return True

def _is_admin_doc(doc: dict) -> bool:
    if not doc or not isinstance(doc, dict):
        return False
    if doc.get("role") == "admin":
        return True
    roles = doc.get("roles")
    return isinstance(roles, list) and "admin" in roles

def generate_password(length: int = 14) -> str:
    length = int(length or 14)
    length = max(8, min(64, length))
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if validate_password(pw):
            return pw

def _parse_args():
    parser = argparse.ArgumentParser(description="MAQGO: crear o resetear usuario admin en MongoDB.")
    parser.add_argument("--email", type=str, default="", help="Email del admin (si no se pasa, pregunta por stdin).")
    parser.add_argument("--password", type=str, default="", help="Contraseña (si no se pasa, pregunta por stdin).")
    parser.add_argument("--generate", action="store_true", help="Genera una contraseña segura automáticamente.")
    parser.add_argument("--length", type=int, default=14, help="Largo para --generate (8-64).")
    parser.add_argument("--reset-existing", action="store_true", help="Si el usuario existe, resetea su contraseña.")
    parser.add_argument(
        "--require-change",
        action="store_true",
        help="Marca must_change_password=True (recomendado si es contraseña temporal).",
    )
    parser.add_argument(
        "--no-require-change",
        action="store_true",
        help="Marca must_change_password=False (solo si ya es contraseña final).",
    )
    return parser.parse_args()

async def main():
    load_env_from_dotenv()
    args = _parse_args()
    
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
    
    email = (args.email or "").strip().lower()
    if not email:
        email = input("📧 Email del Admin: ").strip().lower()
    if not email:
        print("❌ El email es obligatorio.")
        return

    existing = await db.users.find_one({"email": email})
    if existing:
        if not args.reset_existing:
            print(f"⚠️ Ya existe un usuario con el email {email}.")
            choice = input("¿Quieres resetear la contraseña de este usuario admin? (y/N): ").strip().lower()
            if choice != "y":
                print("Cancelado.")
                return
        if not _is_admin_doc(existing):
            print("❌ El usuario existe, pero no es admin. Por seguridad, este script no lo promoverá automáticamente.")
            print("Si necesitas acceso admin, crea un usuario admin con otro email o promuévelo manualmente en la DB.")
            return

        if args.generate:
            password = generate_password(args.length)
        else:
            password = (args.password or "").strip()
            if not password:
                password = input("🔑 Nueva contraseña (8-64, letras y números): ").strip()
        if not validate_password(password):
            print("❌ La contraseña no cumple con los requisitos (8-64 caracteres, letras y números).")
            return

        now = datetime.now(timezone.utc).isoformat()
        require_change = True
        if args.no_require_change:
            require_change = False
        elif args.require_change:
            require_change = True
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "password": hash_password(password),
                    "role": "admin",
                    "roles": ["admin"],
                    "must_change_password": require_change,
                    "temp_password_issued_at": now if require_change else existing.get("temp_password_issued_at"),
                    "password_changed_at": None if require_change else now,
                }
            },
        )
        print(f"\n✅ Contraseña reseteada para: {email}")
        if args.generate:
            print(f"🔑 Contraseña generada: {password}")
        print("Ahora puedes iniciar sesión en /admin con estas credenciales.")
        if require_change:
            print("Al entrar, te pedirá cambiar la contraseña.")
        return

    if args.generate:
        password = generate_password(args.length)
    else:
        password = (args.password or "").strip()
        if not password:
            password = input("🔑 Contraseña (8-64, letras y números): ").strip()
    if not validate_password(password):
        print("❌ La contraseña no cumple con los requisitos de seguridad (8-64 caracteres, letras y números).")
        return

    name = input("👤 Nombre Completo: ").strip()
    phone = input("📱 Teléfono (+569...): ").strip()

    now = datetime.now(timezone.utc).isoformat()
    admin_doc = {
        "id": str(uuid.uuid4()),
        "role": "admin",
        "roles": ["admin"],
        "name": name if name else "Admin Maqgo",
        "email": email,
        "phone": phone if phone else None,
        "password": hash_password(password),
        "createdAt": now,
        "phoneVerified": True,
        "isAvailable": False,
        "must_change_password": True,
        "temp_password_issued_at": now,
    }

    try:
        await db.users.insert_one(admin_doc)
        print(f"\n✅ Administrador creado con éxito: {email}")
        if args.generate:
            print(f"🔑 Contraseña generada: {password}")
        print("Ahora puedes iniciar sesión en /admin con estas credenciales.")
        print("Al entrar, te pedirá cambiar la contraseña.")
    except Exception as e:
        print(f"❌ Error al insertar en la base de datos: {e}")

if __name__ == "__main__":
    asyncio.run(main())
