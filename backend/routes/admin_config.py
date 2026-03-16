"""
MAQGO Admin - Configuración (Precios de referencia)
Permite editar precios sugeridos por maquinaria desde el admin.
"""
from fastapi import APIRouter, HTTPException, Depends

from auth_dependency import get_current_admin
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Dict, Optional
import os
import copy

from pricing.constants import (
    REFERENCE_PRICES_PER_HOUR,
    REFERENCE_PRICES_PER_SERVICE,
)

router = APIRouter(prefix="/admin", tags=["admin-config"])

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo')]  # Alineado con services.py

CONFIG_KEY = "reference_prices"


@router.get("/stats")
async def get_admin_pending_stats(_: dict = Depends(get_current_admin)):
    """
    Estadísticas ligeras para badge/alertas en admin.
    Usado por WelcomeScreen para mostrar iconografía de pendientes.
    """
    try:
        services = await db.services.find({}, {"status": 1}).to_list(10000)
        stats = {
            "pending_review": sum(1 for s in services if s.get("status") == "pending_review"),
            "invoiced": sum(1 for s in services if s.get("status") == "invoiced"),
            "disputed": sum(1 for s in services if s.get("status") == "disputed"),
            "pending_total": 0,
        }
        stats["pending_total"] = stats["pending_review"] + stats["invoiced"] + stats["disputed"]
        return stats
    except Exception:
        return {"pending_review": 0, "invoiced": 0, "disputed": 0, "pending_total": 0}


def _get_defaults():
    """Valores por defecto desde constants.py"""
    return {
        "per_hour": copy.deepcopy(REFERENCE_PRICES_PER_HOUR),
        "per_service": copy.deepcopy(REFERENCE_PRICES_PER_SERVICE),
    }


async def _get_stored():
    """Obtiene precios guardados en MongoDB (si existen)"""
    try:
        doc = await db.config.find_one({"_id": CONFIG_KEY})
        if doc:
            return {
                "per_hour": doc.get("per_hour", {}),
                "per_service": doc.get("per_service", {}),
            }
    except Exception:
        pass
    return None


def _merge(defaults: dict, stored: dict) -> dict:
    """Fusiona defaults con stored (stored tiene prioridad)"""
    result = {"per_hour": {}, "per_service": {}}
    for key in ["per_hour", "per_service"]:
        for machine_id, vals in defaults[key].items():
            merged = dict(vals)
            if key in stored and machine_id in stored[key]:
                merged.update(stored[key][machine_id])
            result[key][machine_id] = merged
    return result


@router.get("/reference-prices")
async def get_reference_prices(_: dict = Depends(get_current_admin)):
    """
    Obtiene los precios de referencia (sugeridos para proveedores).
    Fusiona constantes con valores guardados en MongoDB.
    """
    defaults = _get_defaults()
    stored = await _get_stored()
    if stored:
        return _merge(defaults, stored)
    return defaults


class UpdateReferencePricesRequest(BaseModel):
    per_hour: Optional[Dict[str, Dict[str, int]]] = None
    per_service: Optional[Dict[str, Dict[str, int]]] = None


@router.get("/users")
async def get_admin_users(_: dict = Depends(get_current_admin)):
    """
    Lista todos los usuarios (clientes y proveedores) para el admin.
    Excluye password y datos sensibles.
    """
    try:
        clients = await db.users.find(
            {"role": "client"},
            {"_id": 0, "password": 0}
        ).to_list(1000)
        providers = await db.users.find(
            {"role": "provider"},
            {"_id": 0, "password": 0}
        ).to_list(1000)
        return {
            "clients": clients,
            "providers": providers,
            "total_clients": len(clients),
            "total_providers": len(providers)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/reference-prices")
async def update_reference_prices(request: UpdateReferencePricesRequest, _: dict = Depends(get_current_admin)):
    """
    Actualiza los precios de referencia en MongoDB.
    Solo se actualizan los campos enviados.
    """
    try:
        defaults = _get_defaults()
        stored = await _get_stored()
        current = _merge(defaults, stored) if stored else defaults

        if request.per_hour:
            for machine_id, vals in request.per_hour.items():
                if machine_id in current["per_hour"]:
                    current["per_hour"][machine_id].update(vals)

        if request.per_service:
            for machine_id, vals in request.per_service.items():
                if machine_id in current["per_service"]:
                    current["per_service"][machine_id].update(vals)

        await db.config.update_one(
            {"_id": CONFIG_KEY},
            {"$set": {"per_hour": current["per_hour"], "per_service": current["per_service"]}},
            upsert=True,
        )
        return {"ok": True, "message": "Precios actualizados"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
