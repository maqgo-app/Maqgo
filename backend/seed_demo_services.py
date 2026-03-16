#!/usr/bin/env python3
"""
Crea servicios demo para el proveedor demo-provider-001.
Ejecutar: python seed_demo_services.py

Así Mis Cobros mostrará datos para probar.
"""
import os
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
# Usar mismo DB que routes/services.py (default 'maqgo')
DB_NAME = os.environ.get('DB_NAME', 'maqgo')


def main():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    services = db['services']

    now = datetime.utcnow()
    provider_id = 'demo-provider-001'

    demo_services = [
        {
            "provider_id": provider_id,
            "client_id": "demo-client-001",
            "client_name": "Cliente MAQGO",
            "client_billing": {"billingType": "empresa", "rut": "76.123.456-7", "razonSocial": "Constructora Demo", "giro": "Construcción", "direccion": "Santiago"},
            "machinery_type": "retroexcavadora",
            "hours": 4,
            "location": "Santiago Centro",
            "service_amount": 180000,
            "bonus_amount": 36000,
            "transport_amount": 25000,
            "gross_total": 241000,
            "service_fee": 25000,
            "net_total": 216000,
            "invoice_amount": 241000,
            "invoice_total": 286790,
            "status": "approved",
            "transaction_id": "MQ-12345678",
            "operator_name": "Juan Pérez",
            "created_at": now - timedelta(days=2),
            "updated_at": now,
        },
        {
            "provider_id": provider_id,
            "client_id": "demo-client-001",
            "client_name": "Cliente MAQGO",
            "client_billing": {},
            "machinery_type": "camion_aljibe",
            "hours": 1,
            "location": "Las Condes",
            "service_amount": 260000,
            "bonus_amount": 26000,
            "transport_amount": 0,
            "gross_total": 286000,
            "service_fee": 30000,
            "net_total": 256000,
            "invoice_amount": 286000,
            "invoice_total": 340340,
            "status": "pending_review",
            "transaction_id": "MQ-12345679",
            "operator_name": "María González",
            "created_at": now - timedelta(hours=2),
            "updated_at": now,
        },
        {
            "provider_id": provider_id,
            "client_id": "demo-client-001",
            "client_name": "Cliente MAQGO",
            "client_billing": {},
            "machinery_type": "excavadora",
            "hours": 6,
            "location": "Providencia",
            "service_amount": 660000,
            "bonus_amount": 99000,
            "transport_amount": 35000,
            "gross_total": 794000,
            "service_fee": 85000,
            "net_total": 709000,
            "invoice_amount": 794000,
            "invoice_total": 944860,
            "status": "paid",
            "transaction_id": "MQ-12345680",
            "operator_name": "Pedro López",
            "created_at": now - timedelta(days=5),
            "updated_at": now,
            "paid_at": now - timedelta(days=3),
        },
    ]

    inserted = 0
    for svc in demo_services:
        # Evitar duplicados por transaction_id
        existing = services.find_one({"provider_id": provider_id, "transaction_id": svc["transaction_id"]})
        if not existing:
            result = services.insert_one(svc)
            services.update_one({"_id": result.inserted_id}, {"$set": {"id": str(result.inserted_id)}})
            inserted += 1
            print(f"✅ Creado: {svc['machinery_type']} - {svc['transaction_id']} ({svc['status']})")

    if inserted == 0:
        print("ℹ️  Ya existen servicios demo para demo-provider-001")
    else:
        print(f"\n✅ {inserted} servicio(s) demo creado(s). Inicia sesión como proveedor@demo.cl / demo123 y ve a Mis Cobros.")


if __name__ == "__main__":
    main()
