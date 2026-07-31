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
from services.machines_service import (
    create_machine,
    delete_machine,
    delete_provider_machines,
    list_admin_machines,
    serialize_machine,
    update_machine,
)
from services.payment_rollout import get_payment_hardening_metrics_snapshot
from services.payment_saga_recovery import recover_saga
from services.reconciliation_service import reconcile_payment_intents
from services.komatsu_sync import sync_komatsu_machine_locations
from services.testdata_purge_service import purge_user_testdata
from pricing import calculate_immediate_price, get_system_multiplier, MIN_HOURS_IMMEDIATE, MAX_HOURS_IMMEDIATE
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


def _is_admin_user(user: Optional[dict]) -> bool:
    if not isinstance(user, dict):
        return False
    if user.get("role") == "admin":
        return True
    roles = user.get("roles")
    if isinstance(roles, list) and any(str(r or "").lower() == "admin" for r in roles):
        return True
    if roles == "admin":
        return True
    return False


def _email_is_maqgo(email: Any) -> bool:
    value = str(email or "").strip().lower()
    return value.endswith("@maqgo.cl")


async def _testdata_audit_snapshot() -> dict:
    non_admin_users = await db.users.find({"$nor": [{"role": "admin"}, {"roles": "admin"}]}, {"_id": 0, "password": 0}).to_list(5000)
    suspicious_users = []
    non_maqgo_emails = 0
    for u in non_admin_users or []:
        if _is_admin_user(u):
            continue
        st = str(u.get("status") or "").strip().lower()
        deleted = bool(u.get("deleted")) or st == "deleted"
        if u.get("email") and not _email_is_maqgo(u.get("email")):
            non_maqgo_emails += 1
        if len(suspicious_users) < 25:
            if (u.get("email") and not _email_is_maqgo(u.get("email"))) or (not deleted):
                suspicious_users.append(
                    {
                        "id": u.get("id"),
                        "email": u.get("email"),
                        "status": u.get("status"),
                        "deleted": u.get("deleted"),
                        "role": u.get("role"),
                        "roles": u.get("roles"),
                    }
                )

    charged_like = ["charged", "authorized_pending_finalize"]
    payments_charged = await db.payments.count_documents({"status": {"$in": charged_like}})
    services_paid = await db.services.count_documents({"status": "paid"})
    oneclick_inscriptions = await db.oneclick_inscriptions.count_documents({})
    oneclick_inscriptions_non_maqgo = await db.oneclick_inscriptions.count_documents({"email": {"$not": {"$regex": r"@maqgo\\.cl$", "$options": "i"}}})
    machines_active = await db.machines.count_documents({"status": {"$ne": "deleted"}})
    service_requests = await db.service_requests.count_documents({})
    services_total = await db.services.count_documents({})
    payments_total = await db.payments.count_documents({})

    blockers = []
    if payments_charged > 0:
        blockers.append("payments_charged")
    if services_paid > 0:
        blockers.append("services_paid")
    if non_maqgo_emails > 0:
        blockers.append("non_maqgo_emails")
    if oneclick_inscriptions_non_maqgo > 0:
        blockers.append("oneclick_inscriptions_non_maqgo")

    return {
        "ok": len(blockers) == 0,
        "blockers": blockers,
        "counts": {
            "non_admin_users": len(non_admin_users or []),
            "non_maqgo_emails": non_maqgo_emails,
            "machines_active": machines_active,
            "oneclick_inscriptions": oneclick_inscriptions,
            "oneclick_inscriptions_non_maqgo": oneclick_inscriptions_non_maqgo,
            "service_requests": service_requests,
            "services": services_total,
            "payments": payments_total,
            "payments_charged_or_pending_finalize": payments_charged,
            "services_paid": services_paid,
        },
        "suspicious_users_sample": suspicious_users,
    }


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


@router.get("/testdata/audit")
async def admin_testdata_audit(_: dict = Depends(get_current_admin_strict)):
    try:
        return await _testdata_audit_snapshot()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _immediate_final_price_for_base(
    *,
    machinery_type: str,
    base_price: int,
    hours: int,
    transport_cost: int,
) -> int:
    result = calculate_immediate_price(
        machinery_type=machinery_type,
        base_price=float(base_price),
        hours=int(hours),
        provider_multiplier=None,
        transport_cost=float(transport_cost),
    )
    breakdown = result.get("breakdown", {}) if isinstance(result, dict) else {}
    subtotal = int(breakdown.get("subtotal") or 0)
    client_commission = int(breakdown.get("client_commission") or 0)
    base_para_iva = subtotal + client_commission
    iva_total = round(base_para_iva * 0.19)
    return round(subtotal + client_commission + iva_total)


def _immediate_breakdown_for_base(
    *,
    machinery_type: str,
    base_price: int,
    hours: int,
    transport_cost: int,
) -> dict:
    result = calculate_immediate_price(
        machinery_type=machinery_type,
        base_price=float(base_price),
        hours=int(hours),
        provider_multiplier=None,
        transport_cost=float(transport_cost),
    )
    breakdown = result.get("breakdown", {}) if isinstance(result, dict) else {}
    service_cost = int(breakdown.get("service_cost") or 0)
    transport_cost_out = int(breakdown.get("transport_cost") or 0)
    subtotal = int(breakdown.get("subtotal") or 0)
    client_commission = int(breakdown.get("client_commission") or 0)
    base_para_iva = subtotal + client_commission
    iva_total = int(round(base_para_iva * 0.19))
    final_price = int(round(subtotal + client_commission + iva_total))
    return {
        "hours": int(hours),
        "serviceCost": service_cost,
        "serviceSubtotal": subtotal,
        "transport": transport_cost_out,
        "clientCommission": client_commission,
        "iva": iva_total,
        "finalPrice": final_price,
    }


def _find_base_price_for_target_total(
    *,
    machinery_type: str,
    hours: int,
    transport_cost: int,
    target_total: int,
) -> int:
    target_total = int(target_total)
    if target_total <= 0:
        raise ValueError("target_total debe ser positivo")

    try:
        multiplier = float(get_system_multiplier(int(hours)))
    except Exception:
        multiplier = 1.2

    est = int(round(target_total / max(0.01, (1.309 * int(hours) * multiplier))))
    start = max(1, est - 2000)
    end = max(start + 1, est + 2000)
    for base in range(start, end + 1):
        if _immediate_final_price_for_base(
            machinery_type=machinery_type,
            base_price=base,
            hours=hours,
            transport_cost=transport_cost,
        ) == target_total:
            return base

    for base in range(1, 200000):
        if _immediate_final_price_for_base(
            machinery_type=machinery_type,
            base_price=base,
            hours=hours,
            transport_cost=transport_cost,
        ) == target_total:
            return base

    raise ValueError("No se encontró base_price que produzca target_total")


@router.post("/testdata/reset")
async def admin_testdata_reset(
    dry_run: bool = Query(True),
    confirm: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    if not _parse_bool_env("MAQGO_ALLOW_TESTDATA_PURGE", False):
        raise HTTPException(status_code=403, detail="testdata_purge_disabled")
    if not dry_run and not confirm:
        raise HTTPException(status_code=400, detail="Confirmación requerida (confirm=true)")

    audit = await _testdata_audit_snapshot()
    if not audit.get("ok"):
        raise HTTPException(status_code=409, detail={"error": "testdata_audit_blocked", **audit})

    now = datetime.now(timezone.utc)
    deleted: Dict[str, Any] = {"dry_run": bool(dry_run)}

    async def count_or_delete(coll_name: str, filter_doc: Optional[Dict[str, Any]] = None) -> int:
        collection = getattr(db, coll_name)
        fd = filter_doc or {}
        if dry_run:
            return int(await collection.count_documents(fd))
        result = await collection.delete_many(fd)
        return int(getattr(result, "deleted_count", 0) or 0)

    deleted["messages"] = await count_or_delete("messages")
    deleted["invoice_attempts"] = await count_or_delete("invoice_attempts")
    deleted["invoices"] = await count_or_delete("invoices")
    deleted["payments_oneclick"] = await count_or_delete("payments_oneclick")
    deleted["oneclick_inscriptions"] = await count_or_delete("oneclick_inscriptions")
    deleted["payments"] = await count_or_delete("payments")
    deleted["payment_intents"] = await count_or_delete("payment_intents")
    deleted["service_requests"] = await count_or_delete("service_requests")
    deleted["services"] = await count_or_delete("services")

    non_admin_filter = {"$nor": [{"role": "admin"}, {"roles": "admin"}]}
    if dry_run:
        deleted["users_non_admin"] = int(await db.users.count_documents(non_admin_filter))
    else:
        result = await db.users.delete_many(non_admin_filter)
        deleted["users_non_admin"] = int(getattr(result, "deleted_count", 0) or 0)

    if dry_run:
        deleted["machines"] = int(await db.machines.count_documents({}))
    else:
        result = await db.machines.delete_many({})
        deleted["machines"] = int(getattr(result, "deleted_count", 0) or 0)

    return {"ok": True, "audit": audit, "deleted": deleted}


@router.post("/testdata/seed")
async def admin_testdata_seed(
    dry_run: bool = Query(True),
    confirm: bool = Query(False),
    _: dict = Depends(get_current_admin_strict),
):
    if not _parse_bool_env("MAQGO_ALLOW_TESTDATA_PURGE", False):
        raise HTTPException(status_code=403, detail="testdata_purge_disabled")
    if not dry_run and not confirm:
        raise HTTPException(status_code=400, detail="Confirmación requerida (confirm=true)")

    audit = await _testdata_audit_snapshot()
    if not audit.get("ok"):
        raise HTTPException(status_code=409, detail={"error": "testdata_audit_blocked", **audit})

    now = datetime.now(timezone.utc)
    target_total = 500
    hours = 5
    machinery_for_price = "retroexcavadora"
    transport_cost = 0
    base_price = _find_base_price_for_target_total(
        machinery_type=machinery_for_price,
        hours=hours,
        transport_cost=transport_cost,
        target_total=target_total,
    )
    expected_total = _immediate_final_price_for_base(
        machinery_type=machinery_for_price,
        base_price=base_price,
        hours=hours,
        transport_cost=transport_cost,
    )

    provider_1 = {
        "id": "tbk_provider_1",
        "email": "tbk-provider-1@maqgo.cl",
        "phone": "+56980000001",
        "role": "provider",
        "roles": ["provider"],
        "status": "active",
        "deleted": False,
        "name": "Proveedor TBK 1",
        "onboarding_completed": True,
        "isAvailable": True,
        "providerData": {
            "businessName": "Proveedor TBK 1",
            "rut": "76.247.812-4",
            "address": "Santiago, Chile",
            "comuna": "Santiago",
            "region": "Región Metropolitana de Santiago",
            "addressLat": -33.4489,
            "addressLng": -70.6693,
            "bankData": {
                "bank": "BCI",
                "accountType": "Cuenta Corriente",
                "accountNumber": "12345678",
                "holderName": "Proveedor TBK 1",
                "holderRut": "76.247.812-4",
            },
        },
        "updatedAt": now.isoformat(),
    }
    provider_2 = {
        "id": "tbk_provider_2",
        "email": "tbk-provider-2@maqgo.cl",
        "phone": "+56980000002",
        "role": "provider",
        "roles": ["provider"],
        "status": "active",
        "deleted": False,
        "name": "Proveedor TBK 2",
        "onboarding_completed": True,
        "isAvailable": True,
        "providerData": {
            "businessName": "Proveedor TBK 2",
            "rut": "77.123.456-8",
            "address": "Santiago, Chile",
            "comuna": "Santiago",
            "region": "Región Metropolitana de Santiago",
            "addressLat": -33.452,
            "addressLng": -70.662,
            "bankData": {
                "bank": "Banco de Chile",
                "accountType": "Cuenta Corriente",
                "accountNumber": "87654321",
                "holderName": "Proveedor TBK 2",
                "holderRut": "77.123.456-8",
            },
        },
        "updatedAt": now.isoformat(),
    }

    machines_to_create = [
        {
            "provider_id": "tbk_provider_1",
            "id": "tbk_machine_1",
            "machineryType": "retroexcavadora",
            "licensePlate": "TBK-01",
            "pricePerHour": base_price,
            "transportSameComuna": 0,
            "transportSameRegion": 0,
            "transportOtherRegion": 0,
            "available": True,
            "published": True,
            "status": "active",
            "location": {"lat": -33.4489, "lng": -70.6693},
            "operators": [
                {"name": "Operador TBK 1", "rut": "12.345.678-9", "phone": "+56990000001", "isPrimary": True}
            ],
            "photos": ["/maqgo_logo_clean.png"],
            "primaryPhoto": "/maqgo_logo_clean.png",
        },
        {
            "provider_id": "tbk_provider_1",
            "id": "tbk_machine_2",
            "machineryType": "excavadora",
            "licensePlate": "TBK-02",
            "pricePerHour": base_price,
            "transportSameComuna": 0,
            "transportSameRegion": 0,
            "transportOtherRegion": 0,
            "available": True,
            "published": True,
            "status": "active",
            "location": {"lat": -33.45, "lng": -70.67},
            "operators": [
                {"name": "Operador TBK 2", "rut": "98.765.432-1", "phone": "+56990000002", "isPrimary": True}
            ],
            "photos": ["/maqgo_logo_clean.png"],
            "primaryPhoto": "/maqgo_logo_clean.png",
        },
        {
            "provider_id": "tbk_provider_2",
            "id": "tbk_machine_3",
            "machineryType": "retroexcavadora",
            "licensePlate": "TBK-03",
            "pricePerHour": base_price,
            "transportSameComuna": 0,
            "transportSameRegion": 0,
            "transportOtherRegion": 0,
            "available": True,
            "published": True,
            "status": "active",
            "location": {"lat": -33.452, "lng": -70.662},
            "operators": [
                {"name": "Operador TBK 3", "rut": "11.222.333-4", "phone": "+56990000003", "isPrimary": True}
            ],
            "photos": ["/maqgo_logo_clean.png"],
            "primaryPhoto": "/maqgo_logo_clean.png",
        },
    ]

    machine_response_rows = []
    for m in machines_to_create:
        mt = str(m.get("machineryType") or "").strip() or machinery_for_price
        breakdown = _immediate_breakdown_for_base(
            machinery_type=mt,
            base_price=int(base_price),
            hours=int(hours),
            transport_cost=int(transport_cost),
        )
        machine_response_rows.append(
            {
                "id": m.get("id"),
                "provider_id": m.get("provider_id"),
                "machineryType": mt,
                "pricePerHour": int(base_price),
                "transport": int(transport_cost),
                "finalPrice": int(breakdown.get("finalPrice") or 0),
                "licensePlate": m.get("licensePlate"),
                "breakdown": breakdown,
            }
        )

    preview = {
        "pricing": {
            "target_total": target_total,
            "hours": hours,
            "transport_cost": transport_cost,
            "computed_base_price": int(base_price),
            "expected_total": int(expected_total),
            "machinery_type": machinery_for_price,
        },
        "provider1": provider_1.get("id"),
        "provider2": provider_2.get("id"),
        "machines": machine_response_rows,
    }

    if dry_run:
        return {"ok": True, "dry_run": True, "audit": audit, **preview}

    for p in (provider_1, provider_2):
        await db.users.update_one(
            {"id": p["id"]},
            {"$set": p, "$setOnInsert": {"createdAt": now.isoformat()}},
            upsert=True,
        )

    created_rows = []
    for m in machines_to_create:
        provider_id = str(m.pop("provider_id"))
        created = await create_machine(db, provider_id, m)
        mt = str(created.get("machineryType") or "").strip() or machinery_for_price
        created_base_price = int(created.get("pricePerHour") or base_price)
        breakdown = _immediate_breakdown_for_base(
            machinery_type=mt,
            base_price=created_base_price,
            hours=int(hours),
            transport_cost=int(transport_cost),
        )
        created_rows.append(
            {
                "id": created.get("id"),
                "provider_id": provider_id,
                "machineryType": created.get("machineryType"),
                "licensePlate": created.get("licensePlate"),
                "pricePerHour": created_base_price,
                "transport": int(transport_cost),
                "finalPrice": int(breakdown.get("finalPrice") or 0),
                "breakdown": breakdown,
            }
        )

    return {"ok": True, "dry_run": False, "audit": audit, **preview, "machines": created_rows}


@router.get("/testdata/seed-status")
async def admin_testdata_seed_status(
    machinery_type: str = Query("retroexcavadora"),
    client_lat: float = Query(-33.4489),
    client_lng: float = Query(-70.6693),
    _: dict = Depends(get_current_admin_strict),
):
    providers = ["tbk_provider_1", "tbk_provider_2"]
    machines = ["tbk_machine_1", "tbk_machine_2", "tbk_machine_3"]

    existing_providers = await db.users.find({"id": {"$in": providers}}, {"_id": 0, "password": 0}).to_list(10)
    existing_machines = await db.machines.find({"id": {"$in": machines}}, {"_id": 0}).to_list(10)

    provider_ids = {str(u.get("id")) for u in (existing_providers or []) if u.get("id")}
    machine_ids = {str(m.get("id")) for m in (existing_machines or []) if m.get("id")}

    missing = {
        "providers": [pid for pid in providers if pid not in provider_ids],
        "machines": [mid for mid in machines if mid not in machine_ids],
    }

    counts = {
        "providers_found": len(existing_providers or []),
        "machines_found": len(existing_machines or []),
    }

    match_candidates = await db.machines.find(
        {
            "machineryType": machinery_type,
            "available": True,
            "published": True,
            "status": {"$ne": "deleted"},
        },
        {"_id": 0, "id": 1, "provider_id": 1, "location": 1, "machineryType": 1, "licensePlate": 1, "pricePerHour": 1, "pricePerService": 1},
    ).to_list(50)
    match_provider_ids = list({m.get("provider_id") for m in (match_candidates or []) if m.get("provider_id")})
    match_providers = await db.users.find(
        {"id": {"$in": match_provider_ids}},
        {"_id": 0, "id": 1, "isAvailable": 1, "onboarding_completed": 1, "status": 1, "deleted": 1, "provider_role": 1, "owner_id": 1, "providerData": 1},
    ).to_list(len(match_provider_ids) or 1)

    return {
        "ok": True,
        "seed": {
            "providers_expected": providers,
            "machines_expected": machines,
            "missing": missing,
            "counts": counts,
        },
        "match_probe": {
            "machinery_type": machinery_type,
            "client_lat": client_lat,
            "client_lng": client_lng,
            "machines_candidates": match_candidates,
            "providers_for_candidates": match_providers,
        },
    }


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
