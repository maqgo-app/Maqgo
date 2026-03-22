#!/usr/bin/env python3
"""
Crea usuarios demo para probar el login.
Ejecutar: python seed_demo_users.py
"""
import os
import bcrypt
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo_db')


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def main():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    demo_users = [
        {
            "id": "demo-client-001",
            "name": "Cliente Demo",
            "email": "cliente@demo.cl",
            "phone": "912345678",
            "password": hash_password("demo123"),
            "role": "client",
            "createdAt": "2024-01-01T00:00:00Z",
            "phoneVerified": True,
        },
        # Proveedores demo (IDs deben coincidir con get_demo_providers en providers.py)
        {
            "id": "demo-1",
            "name": "Transportes Silva",
            "email": "proveedor@demo.cl",
            "phone": "987654321",
            "password": hash_password("demo123"),
            "role": "provider",
            "isAvailable": True,
            "machineryType": "retroexcavadora",
            "location": {"lat": -33.45, "lng": -70.67},
            "hourlyRate": 45000,
            "createdAt": "2024-01-01T00:00:00Z",
            "phoneVerified": True,
        },
        {
            "id": "demo-2",
            "name": "Maquinarias del Sur",
            "email": "silva@demo.cl",
            "phone": "912345678",
            "password": hash_password("demo123"),
            "role": "provider",
            "isAvailable": True,
            "machineryType": "retroexcavadora",
            "location": {"lat": -33.44, "lng": -70.66},
            "hourlyRate": 52000,
            "createdAt": "2024-01-01T00:00:00Z",
            "phoneVerified": True,
        },
        {
            "id": "demo-3",
            "name": "Constructora Norte",
            "email": "centro@demo.cl",
            "phone": "998765432",
            "password": hash_password("demo123"),
            "role": "provider",
            "isAvailable": True,
            "machineryType": "retroexcavadora",
            "location": {"lat": -33.46, "lng": -70.68},
            "hourlyRate": 48000,
            "createdAt": "2024-01-01T00:00:00Z",
            "phoneVerified": True,
        },
        {
            "id": "admin-maqgo-001",
            "name": "Admin MAQGO",
            "email": "admin@maqgo.cl",
            "phone": "999999999",
            "password": hash_password("maqgo2026"),
            "role": "admin",
            "createdAt": "2024-01-01T00:00:00Z",
            "phoneVerified": True,
        },
    ]

    for user in demo_users:
        result = db.users.update_one(
            {"email": user["email"]},
            {"$set": user},
            upsert=True,
        )
        if result.upserted_id:
            print(f"✅ Creado: {user['email']} ({user['role']})")
        else:
            print(f"🔄 Actualizado: {user['email']} ({user['role']})")

    # Invitación demo para operador (código fijo, siempre se resetea a pending para pruebas)
    from datetime import datetime, timezone, timedelta
    demo_invitation = {
        "code": "DEMO01",
        "owner_id": "demo-1",
        "owner_name": "Transportes Silva",
        "invite_type": "operator",  # Explícito: es para operadores, no gerentes
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=365),
        "used_at": None,
        "used_by": None
    }
    db.invitations.update_one(
        {"code": "DEMO01"},
        {"$set": demo_invitation},
        upsert=True
    )
    print("✅ Invitación operador: DEMO01 (válida 1 año)")

    print("\n" + "="*50)
    print("CREDENCIALES DE PRUEBA")
    print("="*50)
    print("| Rol       | Email             | Contraseña  |")
    print("|-----------|-------------------|-------------|")
    print("| Cliente   | cliente@demo.cl   | demo123     |")
    print("| Proveedor | proveedor@demo.cl | demo123     |")
    print("| Admin     | admin@maqgo.cl    | maqgo2026   |")
    print("")
    print("Código enrolamiento operador: DEMO01")
    print("  (Soy operador → Unirme con código → DEMO01)")
    print("="*50)


if __name__ == "__main__":
    main()
