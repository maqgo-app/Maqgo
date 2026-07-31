import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from pricing import calculate_immediate_price, MACHINERY_PER_SERVICE
from services.machines_service import create_machine


def _parse_bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _immediate_breakdown(*, machinery_type: str, base_price: int, hours: int, transport_cost: int) -> dict:
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


def _find_base_price_for_target_total(*, machinery_type: str, hours: int, transport_cost: int, target_total: int) -> int:
    target_total = int(target_total)
    if target_total <= 0:
        raise ValueError("target_total debe ser positivo")

    for base in range(1, 200000):
        b = _immediate_breakdown(
            machinery_type=machinery_type,
            base_price=base,
            hours=hours,
            transport_cost=transport_cost,
        )
        if int(b.get("finalPrice") or 0) == target_total:
            return base

    raise ValueError("No se encontró base_price que produzca target_total")


async def ensure_transbank_certification_inventory(db: Any) -> Dict[str, Any]:
    enabled = _parse_bool_env("MAQGO_TBK_CERTIFICATION_AUTO_SEED", False)
    if not enabled:
        return {"ok": True, "enabled": False, "skipped": "flag_disabled"}

    target_total = int(os.environ.get("MAQGO_TBK_CERTIFICATION_TARGET_TOTAL", "500") or "500")
    hours = int(os.environ.get("MAQGO_TBK_CERTIFICATION_HOURS", "5") or "5")
    transport_cost = int(os.environ.get("MAQGO_TBK_CERTIFICATION_TRANSPORT", "0") or "0")
    per_category = int(os.environ.get("MAQGO_TBK_CERTIFICATION_PER_CATEGORY", "3") or "3")

    categories = [
        "retroexcavadora",
        "excavadora",
        "minicargador",
        "camion_tolva",
    ]
    now = _utc_iso()

    provider_1_id = "tbk_provider_1"
    provider_2_id = "tbk_provider_2"
    providers_seed = [provider_1_id, provider_2_id]

    provider_1 = {
        "id": provider_1_id,
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
        "updatedAt": now,
    }
    provider_2 = {
        "id": provider_2_id,
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
        "updatedAt": now,
    }

    await db.users.update_one(
        {"id": provider_1["id"]},
        {"$set": provider_1, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )
    await db.users.update_one(
        {"id": provider_2["id"]},
        {"$set": provider_2, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )

    coords = [
        (-33.4489, -70.6693),
        (-33.45, -70.67),
        (-33.452, -70.662),
    ]
    base_prices: Dict[str, int] = {}

    created: List[dict] = []
    skipped_categories: List[str] = []

    for machinery_type in categories:
        real_count = await db.machines.count_documents(
            {
                "machineryType": machinery_type,
                "available": True,
                "published": True,
                "status": {"$ne": "deleted"},
                "id": {"$not": {"$regex": r"^tbk_"}},
                "provider_id": {"$nin": providers_seed},
            }
        )
        if real_count >= per_category:
            skipped_categories.append(machinery_type)
            continue

        base_price = _find_base_price_for_target_total(
            machinery_type=machinery_type,
            hours=hours,
            transport_cost=transport_cost,
            target_total=target_total,
        )
        base_prices[machinery_type] = int(base_price)

        for idx in range(1, per_category + 1):
            lat, lng = coords[(idx - 1) % len(coords)]
            provider_id = provider_1_id if idx in (1, 2) else provider_2_id

            machine_id = f"tbk_{machinery_type}_{idx}"
            plate = f"TBK-{machinery_type[:2].upper()}{idx}"
            operator_n = len(created) + 1
            common = {
                "id": machine_id,
                "machineryType": machinery_type,
                "licensePlate": plate,
                "transportSameComuna": transport_cost,
                "transportSameRegion": transport_cost,
                "transportOtherRegion": transport_cost,
                "available": True,
                "published": True,
                "status": "active",
                "location": {"lat": lat, "lng": lng},
                "operators": [
                    {
                        "name": f"Operador TBK {operator_n}",
                        "rut": f"12.345.67{operator_n % 10}-{operator_n % 9}",
                        "phone": f"+56990000{operator_n:03d}"[-12:],
                        "isPrimary": True,
                    }
                ],
                "photos": ["/maqgo_logo_clean.png"],
                "primaryPhoto": "/maqgo_logo_clean.png",
            }
            if machinery_type in MACHINERY_PER_SERVICE:
                payload = {**common, "pricePerService": int(base_price)}
            else:
                payload = {**common, "pricePerHour": int(base_price)}

            row = await create_machine(db, provider_id, payload)
            breakdown = _immediate_breakdown(
                machinery_type=machinery_type,
                base_price=int(row.get("pricePerService") or row.get("pricePerHour") or base_price),
                hours=hours,
                transport_cost=transport_cost,
            )
            created.append(
                {
                    "id": row.get("id"),
                    "provider_id": provider_id,
                    "machineryType": machinery_type,
                    "licensePlate": row.get("licensePlate"),
                    "pricePerHour": row.get("pricePerHour"),
                    "pricePerService": row.get("pricePerService"),
                    "breakdown": breakdown,
                }
            )

    return {
        "ok": True,
        "enabled": True,
        "hours": hours,
        "target_total": target_total,
        "transport_cost": transport_cost,
        "per_category": per_category,
        "categories": categories,
        "base_prices": base_prices,
        "skipped_categories": skipped_categories,
        "created_or_updated": created,
    }

