from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4


MACHINERY_TYPE_NAMES = {
    "retroexcavadora": "Retroexcavadora",
    "camion_tolva": "Camión Tolva",
    "excavadora": "Excavadora Hidráulica",
    "excavadora_hidraulica": "Excavadora Hidráulica",
    "bulldozer": "Bulldozer",
    "motoniveladora": "Motoniveladora",
    "grua": "Grúa Móvil",
    "camion_pluma": "Camión Pluma (Hiab)",
    "compactadora": "Compactadora / Rodillo",
    "rodillo": "Compactadora / Rodillo",
    "camion_aljibe": "Camión Aljibe",
    "minicargador": "Minicargador",
}

CAPACITY_FIELDS = {
    "capacityM3",
    "capacity_m3",
    "capacityLiters",
    "capacity_liters",
    "capacityTonM",
    "capacity_ton_m",
    "bucketM3",
    "bucket_m3",
    "weightTon",
    "weight_ton",
    "powerHp",
    "power_hp",
    "bladeWidthM",
    "blade_width_m",
    "craneTon",
    "crane_ton",
    "rollerTon",
    "roller_ton",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _machine_type_name(machinery_type: str, fallback: str = "") -> str:
    return MACHINERY_TYPE_NAMES.get(machinery_type, fallback or machinery_type or "Maquinaria")


def _to_number_or_none(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_machine(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    out = {k: _serialize_value(v) for k, v in doc.items() if k != "_id"}
    out["id"] = out.get("id") or out.get("machine_id")
    return out


def serialize_machines(docs: Iterable[dict]) -> List[dict]:
    return [m for m in (serialize_machine(doc) for doc in docs) if m]


def normalize_machine_payload(payload: Dict[str, Any], provider_id: str, *, existing: Optional[dict] = None) -> Dict[str, Any]:
    existing = existing or {}
    machinery_type = _clean_str(
        payload.get("machineryType")
        or payload.get("machinery_type")
        or payload.get("typeId")
        or existing.get("machineryType")
        or existing.get("machinery_type")
    )
    type_name = _clean_str(payload.get("type") or existing.get("type") or _machine_type_name(machinery_type))
    brand = _clean_str(payload.get("brand") or existing.get("brand"))
    model = _clean_str(payload.get("model") or existing.get("model"))
    year = _clean_str(payload.get("year") or existing.get("year"))
    license_plate = _clean_str(
        payload.get("licensePlate")
        or payload.get("license_plate")
        or payload.get("patente")
        or existing.get("licensePlate")
    ).upper()

    doc: Dict[str, Any] = {
        "provider_id": provider_id,
        "machineryType": machinery_type,
        "machinery_type": machinery_type,
        "type": type_name,
        "brand": brand,
        "model": model,
        "year": year,
        "licensePlate": license_plate,
        "license_plate": license_plate,
        "available": bool(payload.get("available", existing.get("available", True))),
        "published": bool(payload.get("published", existing.get("published", True))),
        "status": _clean_str(payload.get("status") or existing.get("status") or "active"),
    }

    loc = payload.get("location") or existing.get("location")
    if loc and isinstance(loc, dict) and (loc.get("lat") is not None or loc.get("lng") is not None):
        doc["location"] = {"lat": loc.get("lat"), "lng": loc.get("lng")}

    for key in ("pricePerHour", "pricePerService", "transportCost"):
        raw = payload[key] if key in payload else existing.get(key)
        n = _to_number_or_none(raw)
        doc[key] = int(n) if n is not None and n.is_integer() else n

    for key in CAPACITY_FIELDS:
        if key in payload:
            n = _to_number_or_none(payload.get(key))
            doc[key] = n if n is not None else payload.get(key)
        elif key in existing:
            doc[key] = existing.get(key)

    operators = payload.get("operators", existing.get("operators", []))
    doc["operators"] = operators if isinstance(operators, list) else []

    for key in ("photos", "machinePhotos", "images"):
        value = payload.get(key, existing.get(key))
        if isinstance(value, list):
            doc[key] = value

    primary_photo = payload.get("primaryPhoto") or payload.get("photo") or payload.get("image") or existing.get("primaryPhoto")
    if primary_photo:
        doc["primaryPhoto"] = primary_photo

    return doc


def machine_to_legacy_machine_data(machine: dict) -> dict:
    legacy = {
        "machineryType": machine.get("machineryType") or machine.get("machinery_type"),
        "type": machine.get("type"),
        "brand": machine.get("brand"),
        "model": machine.get("model"),
        "year": machine.get("year"),
        "licensePlate": machine.get("licensePlate") or machine.get("license_plate"),
        "pricePerHour": machine.get("pricePerHour"),
        "pricePerService": machine.get("pricePerService"),
        "transportCost": machine.get("transportCost"),
        "operators": machine.get("operators") if isinstance(machine.get("operators"), list) else [],
        "primaryPhoto": machine.get("primaryPhoto"),
    }
    for key in CAPACITY_FIELDS:
        if key in machine:
            legacy[key] = machine.get(key)
    return {k: v for k, v in legacy.items() if v is not None and v != ""}


async def ensure_machine_indexes(db) -> None:
    await db.machines.create_index([("id", 1)], unique=True, name="uniq_machine_id")
    await db.machines.create_index([("provider_id", 1), ("status", 1)], name="idx_provider_status")
    await db.machines.create_index(
        [("machineryType", 1), ("available", 1), ("published", 1), ("status", 1)],
        name="idx_match_inventory",
    )
    await db.machines.create_index(
        [("provider_id", 1), ("licensePlate", 1), ("machineryType", 1)],
        name="idx_provider_plate_type",
    )


async def sync_user_machine_mirror(db, provider_id: str) -> None:
    machine = await db.machines.find_one(
        {
            "provider_id": provider_id,
            "status": {"$ne": "deleted"},
            "published": True,
        },
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )
    if not machine:
        await db.users.update_one(
            {"id": provider_id},
            {"$unset": {"machineData": "", "machineryType": ""}},
        )
        return
    legacy = machine_to_legacy_machine_data(machine)
    await db.users.update_one(
        {"id": provider_id},
        {"$set": {"machineData": legacy, "machineryType": legacy.get("machineryType")}},
    )


async def migrate_legacy_machine_data(db) -> int:
    await ensure_machine_indexes(db)
    migrated = 0
    cursor = db.users.find(
        {
            "$or": [{"role": "provider"}, {"roles": "provider"}],
            "machineData.machineryType": {"$exists": True, "$ne": ""},
            "machineData.licensePlate": {"$exists": True, "$ne": ""},
        },
        {"_id": 0, "id": 1, "machineData": 1, "createdAt": 1, "providerData": 1},
    )
    async for user in cursor:
        provider_id = user.get("id")
        mdata = user.get("machineData") if isinstance(user.get("machineData"), dict) else {}
        if not provider_id or not mdata:
            continue
        machinery_type = _clean_str(mdata.get("machineryType"))
        plate = _clean_str(mdata.get("licensePlate")).upper()
        if not machinery_type or not plate:
            continue
        existing = await db.machines.find_one(
            {
                "provider_id": provider_id,
                "licensePlate": plate,
                "machineryType": machinery_type,
                "status": {"$ne": "deleted"},
            },
            {"_id": 1},
        )
        if existing:
            continue
        now = utcnow()
        doc = normalize_machine_payload(mdata, provider_id)
        doc.update(
            {
                "id": f"mach_{uuid4().hex}",
                "createdAt": now,
                "updatedAt": now,
                "migrated_from": "users.machineData",
            }
        )
        await db.machines.insert_one(doc)
        migrated += 1
    return migrated


async def list_provider_machines(db, provider_id: str) -> List[dict]:
    await migrate_legacy_machine_data(db)
    docs = await db.machines.find(
        {"provider_id": provider_id, "status": {"$ne": "deleted"}},
        {"_id": 0},
    ).sort("createdAt", -1).to_list(100)
    return docs


async def create_machine(db, provider_id: str, payload: Dict[str, Any]) -> dict:
    await ensure_machine_indexes(db)
    now = utcnow()
    doc = normalize_machine_payload(payload, provider_id)
    if not doc.get("machineryType") or not doc.get("licensePlate"):
        raise ValueError("machineryType y licensePlate son obligatorios")
    existing = await db.machines.find_one(
        {
            "provider_id": provider_id,
            "licensePlate": doc.get("licensePlate"),
            "machineryType": doc.get("machineryType"),
            "status": {"$ne": "deleted"},
        }
    )
    if existing:
        doc["updatedAt"] = now
        await db.machines.update_one({"id": existing.get("id")}, {"$set": doc})
        fresh = await db.machines.find_one({"id": existing.get("id")}, {"_id": 0})
        await sync_user_machine_mirror(db, provider_id)
        return fresh or {**existing, **doc}
    doc.update(
        {
            "id": _clean_str(payload.get("id")) or f"mach_{uuid4().hex}",
            "createdAt": now,
            "updatedAt": now,
        }
    )
    await db.machines.insert_one(doc)
    await sync_user_machine_mirror(db, provider_id)
    return doc


async def update_machine(db, machine_id: str, payload: Dict[str, Any]) -> Optional[dict]:
    await ensure_machine_indexes(db)
    existing = await db.machines.find_one({"id": machine_id, "status": {"$ne": "deleted"}})
    if not existing:
        return None
    provider_id = existing.get("provider_id")
    doc = normalize_machine_payload(payload, provider_id, existing=existing)
    doc["updatedAt"] = utcnow()
    await db.machines.update_one({"id": machine_id}, {"$set": doc})
    fresh = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    await sync_user_machine_mirror(db, provider_id)
    return fresh


async def delete_machine(db, machine_id: str) -> Optional[dict]:
    existing = await db.machines.find_one({"id": machine_id, "status": {"$ne": "deleted"}})
    if not existing:
        return None
    now = utcnow()
    await db.machines.update_one(
        {"id": machine_id},
        {"$set": {"status": "deleted", "published": False, "available": False, "deletedAt": now, "updatedAt": now}},
    )
    await sync_user_machine_mirror(db, existing.get("provider_id"))
    return existing


async def list_admin_machines(db) -> List[dict]:
    await migrate_legacy_machine_data(db)
    machines = await db.machines.find({"status": {"$ne": "deleted"}}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    provider_ids = list({m.get("provider_id") for m in machines if m.get("provider_id")})
    providers = await db.users.find({"id": {"$in": provider_ids}}, {"_id": 0, "password": 0}).to_list(len(provider_ids) or 1)
    providers_by_id = {p.get("id"): p for p in providers}
    out = []
    for machine in machines:
        provider = providers_by_id.get(machine.get("provider_id"), {})
        pdata = provider.get("providerData") if isinstance(provider.get("providerData"), dict) else {}
        row = serialize_machine(machine) or {}
        row.update(
            {
                "provider": provider,
                "providerName": provider.get("name") or pdata.get("businessName") or "-",
                "providerEmail": provider.get("email") or "-",
                "providerPhone": provider.get("phone") or "-",
                "comuna": pdata.get("comuna") or pdata.get("commune") or "-",
                "onboardingCompleted": bool(provider.get("onboarding_completed")),
                "isProviderAvailable": bool(provider.get("isAvailable")),
            }
        )
        out.append(row)
    return out


def is_recent_machine(machine: dict, *, days: int = 14) -> bool:
    value = machine.get("createdAt")
    if isinstance(value, datetime):
        created = value
    else:
        try:
            created = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except Exception:
            return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return utcnow() - created <= timedelta(days=days)
