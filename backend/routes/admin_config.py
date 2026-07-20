"""
MAQGO Admin - Configuración (Precios de referencia)
Permite editar precios sugeridos por maquinaria desde el admin.
"""
from fastapi import APIRouter, HTTPException, Depends, Query

from auth_dependency import get_current_admin_strict
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, Literal
from datetime import datetime, timezone
import copy
import os

from db_config import get_db_name, get_mongo_url

from pricing.constants import (
    REFERENCE_PRICES_PER_HOUR,
    REFERENCE_PRICES_PER_SERVICE,
    REFERENCE_TRANSPORT,
)

from services.payment_auto_healer import run_auto_heal
from services.payment_consistency_engine import run_consistency_check
from services.machines_service import delete_machine, delete_provider_machines, list_admin_machines, serialize_machine, update_machine
from services.payment_rollout import get_payment_hardening_metrics_snapshot
from services.payment_saga_recovery import recover_saga
from services.reconciliation_service import reconcile_payment_intents
from services.komatsu_sync import sync_komatsu_machine_locations
from services.testdata_purge_service import purge_user_testdata
from services.google_maps_key_service import get_google_maps_api_key, set_google_maps_api_key

router = APIRouter(prefix="/admin", tags=["admin-config"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

CONFIG_KEY = "reference_prices"


class GoogleMapsKeyPayload(BaseModel):
    apiKey: str = Field(..., min_length=0, max_length=300)


def _mask_key(raw: Optional[str]) -> str:
    v = str(raw or "")
    if not v:
        return ""
    if len(v) <= 8:
        return "****"
    return f"{v[:4]}…{v[-4:]}"


@router.get("/google-maps", response_model=dict)
async def admin_get_google_maps_config(current_admin: dict = Depends(get_current_admin_strict)):
    void = current_admin
    key = await get_google_maps_api_key()
    return {"configured": bool(key), "maskedKey": _mask_key(key)}


@router.put("/google-maps", response_model=dict)
async def admin_set_google_maps_config(
    payload: GoogleMapsKeyPayload,
    current_admin: dict = Depends(get_current_admin_strict),
):
    void = current_admin
    await set_google_maps_api_key(payload.apiKey)
    key = await get_google_maps_api_key()
    return {"success": True, "configured": bool(key), "maskedKey": _mask_key(key)}

CAPACITY_REFERENCE_CONFIG = {
    "retroexcavadora": {"options": [0.4, 0.5, 0.6], "anchor": 0.5},
    "excavadora": {"options": [20, 25, 30, 35], "anchor": 25},
    "bulldozer": {"options": [180, 200, 220, 250], "anchor": 200},
    "motoniveladora": {"options": [3, 3.5, 4], "anchor": 3.5},
    "grua": {"options": [25, 30, 35, 40], "anchor": 30},
    "compactadora": {"options": [5, 6, 8, 10], "anchor": 6},
    "minicargador": {"options": [0.4, 0.5], "anchor": 0.4},
    "camion_pluma": {"options": [8, 10, 12, 15, 18], "anchor": 12},
    "camion_aljibe": {"options": [8000, 10000, 12000, 15000], "anchor": 10000},
    "camion_tolva": {"options": [12, 14, 16, 18, 20], "anchor": 16},
}

TRANSPORT_REFERENCE_DEFAULT = {
    "min": 15000,
    "max": int(REFERENCE_TRANSPORT * 2),
    "default": int(REFERENCE_TRANSPORT),
    "same_comuna": {
        "min": 10000,
        "max": int(REFERENCE_TRANSPORT * 1.2),
        "default": int(REFERENCE_TRANSPORT * 0.7),
    },
    "intercomuna": {
        "min": 15000,
        "max": int(REFERENCE_TRANSPORT * 2),
        "default": int(REFERENCE_TRANSPORT),
    },
    "interregional": {
        "min": 20000,
        "max": int(REFERENCE_TRANSPORT * 3),
        "default": int(REFERENCE_TRANSPORT * 1.5),
    },
}


def _cron_verify(secret: Optional[str]) -> None:
    expected = os.environ.get("MAQGO_CRON_SECRET", "").strip()
    got = (secret or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="cron_secret_not_configured")
    if got != expected:
        raise HTTPException(status_code=403, detail="forbidden")


def _parse_bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}


@router.api_route("/cron/komatsu-sync", methods=["GET", "POST"])
async def cron_komatsu_sync(
    secret: Optional[str] = Query(None),
    dry_run: bool = Query(False),
    limit: int = Query(500, ge=1, le=5000),
):
    _cron_verify(secret)
    return await sync_komatsu_machine_locations(db, limit=limit, dry_run=dry_run)


@router.get("/payment-hardening-metrics")
async def payment_hardening_metrics(_: dict = Depends(get_current_admin_strict)):
    """
    Métricas de endurecimiento de pagos / idempotencia + agregados del ledger append-only
    (total_events_logged, event_counts_by_type, reconciliation_mismatches).
    Incluye consistencia: inconsistency_count, saga_repair_count, auto_heal_success_rate,
    dead_letter_payment_count.
    """
    return await get_payment_hardening_metrics_snapshot(db)


@router.post("/payment-consistency-run")
async def payment_consistency_run(
    _: dict = Depends(get_current_admin_strict),
    limit: int = Query(500, ge=1, le=5000),
):
    """Ejecuta detección + reparación segura (`run_consistency_check`)."""
    return await run_consistency_check(db, limit=limit)


@router.post("/payment-auto-heal-run")
async def payment_auto_heal_run(
    _: dict = Depends(get_current_admin_strict),
    limit: int = Query(500, ge=1, le=5000),
):
    """Auto-healing: reparaciones seguras + dead letter en casos no seguros."""
    return await run_auto_heal(db, limit=limit)


@router.post("/payment-saga-recover/{intent_id}")
async def payment_saga_recover(
    intent_id: str,
    _: dict = Depends(get_current_admin_strict),
):
    """Recuperación de saga para un payment_intent concreto."""
    return await recover_saga(db, intent_id)


@router.post("/payment-reconciliation-run")
async def payment_reconciliation_run(
    _: dict = Depends(get_current_admin_strict),
    limit: int = Query(500, ge=1, le=5000),
):
    """
    Job batch idempotente: compara payment_intents vs fila `payments` y registra
    eventos `reconciliation_mismatch` en el ledger si hay drift.
    """
    return await reconcile_payment_intents(db, limit=limit)


@router.get("/stats")
async def get_admin_pending_stats(_: dict = Depends(get_current_admin_strict)):
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
        "by_capacity": _build_capacity_reference_defaults(),
        "transport": copy.deepcopy(TRANSPORT_REFERENCE_DEFAULT),
    }


def _round_reference_price(value: float) -> int:
    value = float(value or 0)
    if value >= 100000:
        step = 5000
    elif value >= 50000:
        step = 2500
    else:
        step = 1000
    return int(round(value / step) * step)


def _build_capacity_reference_defaults() -> dict:
    result = {}
    for machine_id, config in CAPACITY_REFERENCE_CONFIG.items():
        base = REFERENCE_PRICES_PER_HOUR.get(machine_id) or REFERENCE_PRICES_PER_SERVICE.get(machine_id)
        if not base:
            continue
        anchor = float(config.get("anchor") or 1)
        variants = {}
        for option in config.get("options", []):
            ratio = float(option) / anchor if anchor else 1.0
            variants[str(option)] = {
                "min": _round_reference_price(base["min"] * ratio),
                "max": _round_reference_price(base["max"] * ratio),
                "default": _round_reference_price(base["default"] * ratio),
            }
        result[machine_id] = variants
    return result


async def _get_stored():
    """Obtiene precios guardados en MongoDB (si existen)"""
    try:
        doc = await db.config.find_one({"_id": CONFIG_KEY})
        if doc:
            return {
                "per_hour": doc.get("per_hour", {}),
                "per_service": doc.get("per_service", {}),
                "by_capacity": doc.get("by_capacity", {}),
                "transport": doc.get("transport", {}),
            }
    except Exception:
        pass
    return None


def _merge(defaults: dict, stored: dict) -> dict:
    """Fusiona defaults con stored (stored tiene prioridad)"""
    result = {"per_hour": {}, "per_service": {}, "by_capacity": {}, "transport": {}}
    for key in ["per_hour", "per_service"]:
        for machine_id, vals in defaults[key].items():
            merged = dict(vals)
            if key in stored and machine_id in stored[key]:
                merged.update(stored[key][machine_id])
            result[key][machine_id] = merged
    default_capacity = defaults.get("by_capacity", {})
    stored_capacity = (stored or {}).get("by_capacity", {})
    for machine_id, variants in default_capacity.items():
        merged_variants = {}
        machine_stored = stored_capacity.get(machine_id, {})
        for variant_key, vals in variants.items():
            merged = dict(vals)
            if isinstance(machine_stored.get(variant_key), dict):
                merged.update(machine_stored[variant_key])
            merged_variants[variant_key] = merged
        for variant_key, vals in machine_stored.items():
            if variant_key not in merged_variants and isinstance(vals, dict):
                merged_variants[variant_key] = dict(vals)
        result["by_capacity"][machine_id] = merged_variants
    for machine_id, variants in stored_capacity.items():
        if machine_id not in result["by_capacity"] and isinstance(variants, dict):
            result["by_capacity"][machine_id] = {
                variant_key: dict(vals) for variant_key, vals in variants.items() if isinstance(vals, dict)
            }
    merged_transport = dict(defaults.get("transport", {}))
    merged_transport.update((stored or {}).get("transport", {}) or {})
    result["transport"] = merged_transport
    return result


@router.get("/reference-prices")
async def get_reference_prices(_: dict = Depends(get_current_admin_strict)):
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
    by_capacity: Optional[Dict[str, Dict[str, Dict[str, int]]]] = None
    transport: Optional[Dict[str, Any]] = None


@router.get("/users")
async def get_admin_users(_: dict = Depends(get_current_admin_strict)):
    """
    Lista todos los usuarios (clientes y proveedores) para el admin.
    Excluye password y datos sensibles.
    """
    try:
        clients = await db.users.find(
            {"$or": [{"role": "client"}, {"roles": "client"}]},
            {"_id": 0, "password": 0},
        ).to_list(1000)
        providers = await db.users.find(
            {"$or": [{"role": "provider"}, {"roles": "provider"}]},
            {"_id": 0, "password": 0},
        ).to_list(1000)
        total_clients = sum(1 for u in clients if u.get("status") != "deleted" and u.get("deleted") is not True)
        total_providers = sum(1 for u in providers if u.get("status") != "deleted" and u.get("deleted") is not True)
        return {
            "clients": clients,
            "providers": providers,
            "total_clients": total_clients,
            "total_providers": total_providers,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines")
async def get_admin_machines(_: dict = Depends(get_current_admin_strict)):
    try:
        machines = await list_admin_machines(db)
        return {"machines": machines, "total": len(machines)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AdminUserUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    roles: Optional[list] = None
    status: Optional[Literal["active", "inactive", "suspended", "test", "deleted"]] = None
    deleted: Optional[bool] = None
    deletedAt: Optional[str] = None
    deletedBy: Optional[str] = None
    deleteReason: Optional[str] = None
    provider_role: Optional[str] = None
    isAvailable: Optional[bool] = None
    onboarding_completed: Optional[bool] = None
    machineryType: Optional[str] = None
    providerData: Optional[Dict[str, Any]] = None
    machineData: Optional[Dict[str, Any]] = None


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    request: AdminUserUpdateRequest,
    current_admin: dict = Depends(get_current_admin_strict),
):
    try:
        existing = await db.users.find_one({"id": user_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        if existing.get("role") == "admin" or ("admin" in (existing.get("roles") or [])):
            raise HTTPException(status_code=403, detail="No se puede editar un administrador desde este endpoint")

        payload = request.model_dump(exclude_unset=True)
        update_doc: Dict[str, Any] = {}

        if "providerData" in payload:
            current = existing.get("providerData") if isinstance(existing.get("providerData"), dict) else {}
            incoming = payload.get("providerData") if isinstance(payload.get("providerData"), dict) else {}
            merged = {**current, **incoming}
            update_doc["providerData"] = merged

        if "machineData" in payload:
            current = existing.get("machineData") if isinstance(existing.get("machineData"), dict) else {}
            incoming = payload.get("machineData") if isinstance(payload.get("machineData"), dict) else {}
            merged = {**current, **incoming}
            update_doc["machineData"] = merged

        for k, v in payload.items():
            if k in ("providerData", "machineData"):
                continue
            update_doc[k] = v

        if "machineryType" in update_doc:
            md = update_doc.get("machineData")
            if md is None:
                md = existing.get("machineData") if isinstance(existing.get("machineData"), dict) else {}
            if isinstance(md, dict):
                update_doc["machineData"] = {**md, "machineryType": update_doc["machineryType"]}

        if not update_doc:
            fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
            return {"ok": True, "user": fresh}

        now = datetime.now(timezone.utc).isoformat()
        was_deleted = existing.get("status") == "deleted" or existing.get("deleted") is True
        is_provider_user = existing.get("role") == "provider" or ("provider" in (existing.get("roles") or []))
        if update_doc.get("deleted") is True:
            update_doc["status"] = "deleted"
        if update_doc.get("status") == "deleted":
            update_doc["deleted"] = True
            update_doc["deletedAt"] = now
            update_doc["deletedBy"] = current_admin.get("id")
            if not update_doc.get("deleteReason"):
                update_doc["deleteReason"] = "admin"
            update_doc["isAvailable"] = False
            if is_provider_user and not was_deleted:
                await delete_provider_machines(db, user_id)
        if update_doc.get("deleted") is False:
            if existing.get("deleted") is True or existing.get("status") == "deleted":
                if "status" not in update_doc or update_doc.get("status") == "deleted":
                    update_doc["status"] = "active"
                update_doc["deletedAt"] = None
                update_doc["deletedBy"] = None
                update_doc["deleteReason"] = None

        await db.users.update_one({"id": user_id}, {"$set": update_doc})
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        return {"ok": True, "user": fresh}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    reason: Optional[str] = Query(None),
    current_admin: dict = Depends(get_current_admin_strict),
):
    try:
        existing = await db.users.find_one({"id": user_id}, {"id": 1, "role": 1, "roles": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        if existing.get("role") == "admin" or ("admin" in (existing.get("roles") or [])):
            raise HTTPException(status_code=403, detail="No se puede eliminar un administrador")

        now = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "status": "deleted",
                    "deleted": True,
                    "deletedAt": now,
                    "deletedBy": current_admin.get("id"),
                    "deleteReason": (reason or "admin"),
                    "isAvailable": False,
                }
            },
        )
        machines_deleted = 0
        is_provider_user = existing.get("role") == "provider" or ("provider" in (existing.get("roles") or []))
        if is_provider_user:
            machines_deleted = await delete_provider_machines(db, user_id)
        return {"ok": True, "soft_deleted": True, "machines_deleted": machines_deleted}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}/purge")
async def admin_purge_user_testdata(
    user_id: str,
    dry_run: bool = Query(True),
    confirm: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    if not _parse_bool_env("MAQGO_ALLOW_TESTDATA_PURGE", False):
        raise HTTPException(status_code=403, detail="testdata_purge_disabled")
    try:
        existing = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1, "roles": 1, "status": 1, "deleted": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        if existing.get("role") == "admin" or ("admin" in (existing.get("roles") or [])):
            raise HTTPException(status_code=403, detail="No se puede eliminar un administrador")

        st = str(existing.get("status") or "").strip().lower()
        is_deleted = bool(existing.get("deleted")) or st == "deleted"
        is_test = st == "test"
        if not is_deleted and not is_test:
            raise HTTPException(status_code=409, detail="Solo se puede purgar usuarios test o ya eliminados (soft)")

        if not dry_run and not confirm:
            raise HTTPException(status_code=400, detail="Confirmación requerida (confirm=true)")

        return await purge_user_testdata(db, user_id, dry_run=dry_run)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}/machine")
async def admin_delete_user_machine(
    user_id: str,
    _: dict = Depends(get_current_admin_strict),
):
    try:
        existing = await db.users.find_one({"id": user_id}, {"id": 1, "role": 1, "roles": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        if existing.get("role") == "admin" or ("admin" in (existing.get("roles") or [])):
            raise HTTPException(status_code=403, detail="No se puede editar un administrador desde este endpoint")

        await db.users.update_one(
            {"id": user_id},
            {
                "$unset": {"machineData": "", "machineryType": ""},
                "$set": {"isAvailable": False, "onboarding_completed": False},
            },
        )
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        return {"ok": True, "user": fresh}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/machines/{machine_id}")
async def admin_update_machine(
    machine_id: str,
    request: Dict[str, Any],
    _: dict = Depends(get_current_admin_strict),
):
    try:
        machine = await update_machine(db, machine_id, request)
        if not machine:
            raise HTTPException(status_code=404, detail="Maquinaria no encontrada")
        return {"ok": True, "machine": serialize_machine(machine)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/machines/{machine_id}")
async def admin_delete_machine(
    machine_id: str,
    _: dict = Depends(get_current_admin_strict),
):
    try:
        machine = await delete_machine(db, machine_id)
        if not machine:
            raise HTTPException(status_code=404, detail="Maquinaria no encontrada")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/reference-prices")
async def update_reference_prices(request: UpdateReferencePricesRequest, _: dict = Depends(get_current_admin_strict)):
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

        if request.by_capacity:
            for machine_id, variants in request.by_capacity.items():
                current["by_capacity"].setdefault(machine_id, {})
                for variant_key, vals in variants.items():
                    current["by_capacity"].setdefault(machine_id, {}).setdefault(variant_key, {})
                    current["by_capacity"][machine_id][variant_key].update(vals)

        if request.transport:
            current["transport"].update(request.transport)

        await db.config.update_one(
            {"_id": CONFIG_KEY},
            {
                "$set": {
                    "per_hour": current["per_hour"],
                    "per_service": current["per_service"],
                    "by_capacity": current["by_capacity"],
                    "transport": current["transport"],
                }
            },
            upsert=True,
        )
        return {"ok": True, "message": "Precios actualizados"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
