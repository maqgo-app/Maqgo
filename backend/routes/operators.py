"""
MAQGO - Invitación y enrolamiento de usuarios de empresa.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, AliasChoices
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import os
import random
import string
import uuid

from pymongo.errors import DuplicateKeyError, PyMongoError

from motor.motor_asyncio import AsyncIOMotorClient
from db_config import get_db_name, get_mongo_url
from auth_dependency import get_current_user
from security.policy import AccessPolicy
from services.otp_service import send_sms
from services.machines_service import (
    attach_operator_to_machines,
    sync_operator_snapshot_across_machines,
    validate_provider_machine_ids,
)

router = APIRouter(prefix="/operators", tags=["operators"])

ACTIVATION_INDETERMINATE_MESSAGE = (
    "No fue posible determinar la causa del error. Inténtalo nuevamente o contacta a soporte."
)

MONGO_URL = get_mongo_url()
DB_NAME = get_db_name()
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

class InvitationCreate(BaseModel):
    owner_id: str
    operator_name: Optional[str] = None
    operator_first_name: Optional[str] = None
    operator_last_name: Optional[str] = None
    operator_phone: Optional[str] = None
    operator_rut: Optional[str] = None
    machine_ids: List[str] = []
    operator_email: Optional[str] = None
    operator_id: Optional[str] = None

class OperatorInviteItem(BaseModel):
    operator_name: str
    operator_rut: str
    operator_phone: Optional[str] = None
    machine_ids: List[str] = []
    operator_email: Optional[str] = None
    operator_id: Optional[str] = None

class InvitationBatchCreate(BaseModel):
    owner_id: str
    operators: List[OperatorInviteItem]

class InvitationUse(BaseModel):
    model_config = {"populate_by_name": True}

    enrollment_token: str = Field(
        ...,
        validation_alias=AliasChoices("enrollment_token", "token", "code"),
    )
    operator_name: Optional[str] = None
    operator_phone: Optional[str] = None
    operator_rut: Optional[str] = None

class OperatorStats(BaseModel):
    operator_id: str



def generate_invite_token():
    """Genera token corto de invitación."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def _normalize_rut(rut: str) -> str:
    s = str(rut or "")
    s = "".join(ch for ch in s if ch.isdigit() or ch in ("k", "K"))
    return s.upper()


def _calculate_rut_verifier(body: str) -> str:
    total = 0
    multiplier = 2
    for ch in reversed(body):
        total += int(ch) * multiplier
        multiplier = 2 if multiplier == 7 else multiplier + 1
    remainder = 11 - (total % 11)
    if remainder == 11:
        return "0"
    if remainder == 10:
        return "K"
    return str(remainder)


def _is_valid_rut(rut: str) -> bool:
    clean = _normalize_rut(rut)
    if len(clean) < 8 or len(clean) > 9:
        return False
    body = clean[:-1]
    verifier = clean[-1]
    if not body.isdigit():
        return False
    if not (verifier.isdigit() or verifier == "K"):
        return False
    return _calculate_rut_verifier(body) == verifier


def _is_company_rut(rut: str) -> bool:
    clean = _normalize_rut(rut)
    if len(clean) < 2:
        return False
    body = clean[:-1]
    if not body.isdigit():
        return False
    return int(body) >= 50000000


def _ensure_person_rut(rut: str, *, label: str) -> str:
    clean = str(rut or "").strip()
    if not _is_valid_rut(clean):
        raise HTTPException(status_code=400, detail=f"Ingresa un {label} válido.")
    if _is_company_rut(clean):
        raise HTTPException(status_code=400, detail=f"El {label} debe ser de persona natural, no de empresa.")
    return clean

def _invitation_lookup(token: str) -> dict:
    normalized = str(token or "").strip().upper()
    return {"$or": [{"token": normalized}, {"code": normalized}]}


def _invitation_token(invitation: Optional[dict]) -> str:
    return str((invitation or {}).get("token") or (invitation or {}).get("code") or "").strip().upper()


async def _generate_unique_token() -> str:
    token = generate_invite_token()
    while await db.invitations.find_one(_invitation_lookup(token)):
        token = generate_invite_token()
    return token

def _to_utc(dt):
    if not dt:
        return None
    if hasattr(dt, "tzinfo") and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_phone_e164(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        digits = digits[-11:]
        return f"+{digits}"
    if len(digits) == 9 and digits.startswith("9"):
        return f"+56{digits}"
    return ""


def _frontend_origin() -> str:
    raw = str(os.environ.get("FRONTEND_URL", "https://www.maqgo.cl")).strip()
    return raw.rstrip("/") or "https://www.maqgo.cl"


def _join_person_name(first_name: str = "", last_name: str = "", fallback: str = "") -> str:
    parts = [str(first_name or "").strip(), str(last_name or "").strip()]
    joined = " ".join(part for part in parts if part).strip()
    return joined or str(fallback or "").strip()


def _build_join_link(token: str, invite_type: str) -> str:
    path = "/master/join" if str(invite_type or "").strip().lower() == "master" else "/operator/join"
    return f"{_frontend_origin()}{path}?token={token}"


def _build_invitation_sms(*, token: str, invite_type: str, owner_name: str) -> str:
    company = str(owner_name or "tu empresa").strip() or "tu empresa"
    join_link = _build_join_link(token, invite_type)
    role_label = "Gerente" if str(invite_type or "").strip().lower() == "master" else "Operador"
    return (
        f"MAQGO: {company} te invita a unirte como {role_label}. "
        f"Completa tu incorporacion solo en maqgo.cl: {join_link} "
        f"Verifica que el dominio sea maqgo.cl. Nunca te pediremos pagos ni claves por este medio."
    )


def _send_invitation_sms(*, phone: str, token: str, invite_type: str, owner_name: str) -> dict:
    normalized_phone = _normalize_phone_e164(phone)
    if not normalized_phone:
        return {
            "sms_attempted": False,
            "sms_sent": False,
            "sms_error": "Celular inválido para SMS",
        }
    message = _build_invitation_sms(token=token, invite_type=invite_type, owner_name=owner_name)
    ok, err = send_sms(normalized_phone, message)
    return {
        "sms_attempted": True,
        "sms_sent": bool(ok),
        "sms_error": None if ok else (str(err or "No se pudo enviar SMS")[:180]),
        "phone": normalized_phone,
        "join_link": _build_join_link(token, invite_type),
    }


BUSINESS_STATUS_PENDING = "pending_activation"
BUSINESS_STATUS_ACTIVE = "active"
BUSINESS_STATUS_INACTIVE = "inactive"


def _normalized_business_status(user: dict | None) -> str:
    raw = str((user or {}).get("status") or "").strip().lower()
    if raw in {BUSINESS_STATUS_PENDING, BUSINESS_STATUS_ACTIVE, BUSINESS_STATUS_INACTIVE}:
        return raw
    if raw == "deleted":
        return BUSINESS_STATUS_INACTIVE
    return BUSINESS_STATUS_ACTIVE


def _team_visible_status(user: dict | None) -> str:
    status = _normalized_business_status(user)
    if status == BUSINESS_STATUS_PENDING:
        return "pending"
    return status


def _operator_identity_query(*, owner_id: str, provider_role: str, rut_norm: str, phone: str) -> dict:
    clauses = []
    if rut_norm:
        clauses.append({"rut_norm": rut_norm})
    if phone:
        clauses.append({"phone": phone})
    if not clauses:
        return {}
    return {
        "owner_id": owner_id,
        "provider_role": provider_role,
        "$or": clauses,
    }


async def _find_company_team_user(*, owner_id: str, provider_role: str, rut_norm: str, phone: str) -> Optional[dict]:
    query = _operator_identity_query(owner_id=owner_id, provider_role=provider_role, rut_norm=rut_norm, phone=phone)
    if not query:
        return None
    rows = await db.users.find(query, {"_id": 0}).to_list(10)
    if not rows:
        return None

    def score(user: dict) -> tuple[int, int]:
        points = 0
        if rut_norm and str(user.get("rut_norm") or "").strip().upper() == rut_norm:
            points += 100
        if phone and str(user.get("phone") or "").strip() == phone:
            points += 20
        status = _normalized_business_status(user)
        if status == BUSINESS_STATUS_PENDING:
            points += 15
        elif status == BUSINESS_STATUS_INACTIVE:
            points += 10
        elif status == BUSINESS_STATUS_ACTIVE:
            points += 5
        return (points, 1 if str(user.get("id") or "").strip() else 0)

    rows.sort(key=score, reverse=True)
    return rows[0]


async def _ensure_pending_team_user(
    *,
    owner_id: str,
    provider_role: str,
    name: str,
    phone: str,
    rut: str,
    invitation_code: str,
    permissions: Optional[Dict[str, bool]] = None,
    email: Optional[str] = None,
    operator_id: Optional[str] = None,
) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    normalized_phone = _normalize_phone_e164(phone) or str(phone or "").strip()
    rut_norm = _normalize_rut(rut)
    role_label = "Gerente" if provider_role == "master" else "Operador"
    existing = await _find_company_team_user(
        owner_id=owner_id,
        provider_role=provider_role,
        rut_norm=rut_norm,
        phone=normalized_phone,
    )
    if existing and _normalized_business_status(existing) == BUSINESS_STATUS_ACTIVE:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un {role_label.lower()} activo con esa identidad en tu empresa.",
        )

    base_update = {
        "role": "provider",
        "provider_role": provider_role,
        "owner_id": owner_id,
        "name": name,
        "phone": normalized_phone,
        "rut": rut,
        "rut_norm": rut_norm,
        "email": str(email or (existing or {}).get("email") or "").strip(),
        "status": BUSINESS_STATUS_PENDING,
        "activationStage": "invitation_sent",
        "activationCode": invitation_code,
        "joinedVia": "invitation",
        "updatedAt": now_iso,
        "deleted": False,
        "isAvailable": False,
        "phoneVerified": False,
    }
    if provider_role == "master":
        base_update["master_permissions"] = permissions if isinstance(permissions, dict) else {}

    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {
                "$set": base_update,
                "$unset": {
                    "deletedAt": "",
                    "deletedBy": "",
                    "deleteReason": "",
                },
            },
        )
        fresh = await db.users.find_one({"id": existing["id"]}, {"_id": 0})
        return fresh or {**existing, **base_update}

    user_id = str(operator_id).strip() if operator_id and str(operator_id).strip() else str(uuid.uuid4())
    user_data = {
        "id": user_id,
        **base_update,
        "rating": 5.0,
        "totalRatings": 0,
        "totalServices": 0,
        "hoursWorked": 0,
        "createdAt": now_iso,
    }
    await db.users.insert_one(user_data)
    return user_data


async def _find_reusable_pending_invitation(
    *,
    owner_id: str,
    invite_type: str,
    target_user_id: str,
    rut_norm: str,
) -> Optional[dict]:
    query = {
        "owner_id": owner_id,
        "invite_type": invite_type,
        "status": "pending",
        "$or": [],
    }
    if target_user_id:
        query["$or"].append({"target_user_id": target_user_id})
    if rut_norm:
        field = "master_rut_norm" if invite_type == "master" else "operator_rut_norm"
        query["$or"].append({field: rut_norm})
    if not query["$or"]:
        query.pop("$or")
    inv = await db.invitations.find_one(query, {"_id": 0}) if query else None
    if not inv:
        return None
    expires_at = _to_utc(inv.get("expires_at"))
    if expires_at and datetime.now(timezone.utc) > expires_at:
        await db.invitations.update_one(
            _invitation_lookup(_invitation_token(inv)),
            {"$set": {"status": "expired"}},
        )
        return None
    return inv


async def _prepare_pending_user_for_otp(
    *,
    target_user_id: str,
    owner_id: str,
    provider_role: str,
    name: str,
    phone: str,
    rut: str,
    invitation_code: str,
    permissions: Optional[Dict[str, bool]] = None,
) -> dict:
    normalized_phone = _normalize_phone_e164(phone) or str(phone or "").strip()
    rut_norm = _normalize_rut(rut)
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "owner_id": owner_id,
        "provider_role": provider_role,
        "name": name,
        "phone": normalized_phone,
        "rut": rut,
        "rut_norm": rut_norm,
        "status": BUSINESS_STATUS_PENDING,
        "activationStage": "otp_pending",
        "activationCode": invitation_code,
        "joinedVia": "invitation",
        "updatedAt": now_iso,
        "deleted": False,
        "isAvailable": False,
    }
    if provider_role == "master":
        update["master_permissions"] = permissions if isinstance(permissions, dict) else {}
    await db.users.update_one(
        {"id": target_user_id},
        {
            "$set": update,
            "$unset": {
                "deletedAt": "",
                "deletedBy": "",
                "deleteReason": "",
            },
        },
    )
    return await db.users.find_one({"id": target_user_id}, {"_id": 0}) or {"id": target_user_id, **update}


@router.post("/invite")
async def create_invitation(
    data: InvitationCreate,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, data.owner_id)
    """
    Invita a un operador y deja sus máquinas asociadas listas antes del enrolamiento.
    """
    # Verificar que el dueño existe
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Titular no encontrado")
    
    owner_role = owner.get("role")
    owner_roles = owner.get("roles") or []
    is_provider_owner = (owner_role == "provider") or ("provider" in owner_roles)
    if not is_provider_owner:
        raise HTTPException(status_code=400, detail="Solo proveedores pueden invitar operadores")

    operator_name = _join_person_name(
        data.operator_first_name,
        data.operator_last_name,
        data.operator_name,
    )
    if not operator_name or not data.operator_rut:
        raise HTTPException(
            status_code=400,
            detail="Debes ingresar nombre, apellidos y RUT del operador antes de invitarlo."
        )
    try:
        validated_machines = await validate_provider_machine_ids(db, data.owner_id, data.machine_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    operator_rut = _ensure_person_rut(data.operator_rut, label="RUT del operador")
    
    invite_token = await _generate_unique_token()
    rut_norm = _normalize_rut(operator_rut)
    try:
        pending_user = await _ensure_pending_team_user(
            owner_id=data.owner_id,
            provider_role="operator",
            name=operator_name,
            phone=str(data.operator_phone or "").strip(),
            rut=operator_rut,
            invitation_code=invite_token,
            email=data.operator_email,
            operator_id=data.operator_id,
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail=(
                "El celular o RUT del operador ya está asociado a otra cuenta MAQGO. "
                "Cada usuario operador requiere un teléfono único."
            ),
        )
    machine_ids = [str(machine.get("id") or "").strip() for machine in validated_machines if str(machine.get("id") or "").strip()]
    await attach_operator_to_machines(
        db,
        provider_id=data.owner_id,
        operator_user=pending_user,
        machine_ids=machine_ids,
    )
    reusable = await _find_reusable_pending_invitation(
        owner_id=data.owner_id,
        invite_type="operator",
        target_user_id=str(pending_user.get("id") or "").strip(),
        rut_norm=rut_norm,
    )
    if reusable:
        delivery = _send_invitation_sms(
            phone=data.operator_phone or pending_user.get("phone") or "",
            token=_invitation_token(reusable) or invite_token,
            invite_type="operator",
            owner_name=owner.get("name", ""),
        )
        await db.invitations.update_one(
            _invitation_lookup(_invitation_token(reusable)),
            {
                "$set": {
                    "operator_phone": pending_user.get("phone") or data.operator_phone,
                    "operator_name": pending_user.get("name") or operator_name,
                    "operator_rut": operator_rut,
                    "operator_rut_norm": rut_norm,
                    "target_user_id": pending_user.get("id"),
                    "machine_ids": machine_ids,
                    "delivery_status": "sms_sent" if delivery.get("sms_sent") else "sms_failed",
                    "last_sms_sent_at": datetime.now(timezone.utc) if delivery.get("sms_sent") else None,
                    "last_sms_error": delivery.get("sms_error"),
                    "updated_at": datetime.now(timezone.utc),
                },
                "$inc": {"resend_count": 1},
            },
        )
        return {
            "success": True,
            "expires_in_days": 7,
            "message": "La invitación ya fue enviada automáticamente por MAQGO.",
            "delivery": delivery,
            "user_status": _team_visible_status(pending_user),
            "target_user_id": pending_user.get("id"),
            "machine_ids": machine_ids,
        }

    invitation = {
        "token": invite_token,
        "code": invite_token,
        "owner_id": data.owner_id,
        "owner_name": owner.get("name", ""),
        "operator_name": pending_user.get("name") or operator_name,
        "operator_phone": pending_user.get("phone") or data.operator_phone,
        "operator_rut": operator_rut,
        "operator_rut_norm": rut_norm,
        "target_user_id": pending_user.get("id"),
        "machine_ids": machine_ids,
        "invite_type": "operator",
        "status": "pending",  # pending, used, expired
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used_at": None,
        "used_by": None,
        "resend_count": 0,
        "delivery_status": "pending",
        "reminder_waves_sent": ["initial"],
    }
    
    await db.invitations.insert_one(invitation)
    delivery = _send_invitation_sms(
        phone=data.operator_phone or "",
        token=invite_token,
        invite_type="operator",
        owner_name=owner.get("name", ""),
    )
    await db.invitations.update_one(
        _invitation_lookup(invite_token),
        {
            "$set": {
                "delivery_status": "sms_sent" if delivery.get("sms_sent") else "sms_failed",
                "last_sms_sent_at": datetime.now(timezone.utc) if delivery.get("sms_sent") else None,
                "last_sms_error": delivery.get("sms_error"),
            }
        },
    )
    
    return {
        "success": True,
        "expires_in_days": 7,
        "message": "La invitación fue enviada automáticamente por MAQGO.",
        "delivery": delivery,
        "user_status": _team_visible_status(pending_user),
        "target_user_id": pending_user.get("id"),
        "machine_ids": machine_ids,
    }


@router.post("/invite/batch")
async def create_invitations_batch(
    data: InvitationBatchCreate,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, data.owner_id)
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Titular no encontrado")
    owner_role = owner.get("role")
    owner_roles = owner.get("roles") or []
    is_provider_owner = (owner_role == "provider") or ("provider" in owner_roles)
    if not is_provider_owner:
        raise HTTPException(status_code=400, detail="Solo proveedores pueden invitar operadores")
    if not isinstance(data.operators, list) or len(data.operators) == 0:
        raise HTTPException(status_code=400, detail="Selecciona al menos 1 operador.")

    now = datetime.now(timezone.utc)
    out = []
    for item in data.operators:
        name = str(item.operator_name or "").strip()
        rut = str(item.operator_rut or "").strip()
        phone = str(item.operator_phone or "").strip() or None
        if not name or not rut:
            raise HTTPException(status_code=400, detail="Cada operador debe tener nombre y RUT.")
        rut = _ensure_person_rut(rut, label="RUT del operador")
        rut_norm = _normalize_rut(rut)
        try:
            validated_machines = await validate_provider_machine_ids(db, data.owner_id, item.machine_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        machine_ids = [
            str(machine.get("id") or "").strip()
            for machine in validated_machines
            if str(machine.get("id") or "").strip()
        ]
        invite_token = await _generate_unique_token()
        try:
            pending_user = await _ensure_pending_team_user(
                owner_id=data.owner_id,
                provider_role="operator",
                name=name,
                phone=phone or "",
                rut=rut,
                invitation_code=invite_token,
                email=getattr(item, "operator_email", None),
                operator_id=getattr(item, "operator_id", None),
            )
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"El operador {name} ya tiene una cuenta MAQGO asociada al mismo "
                    "celular o RUT. Cada operador requiere un teléfono único."
                ),
            )
        await attach_operator_to_machines(
            db,
            provider_id=data.owner_id,
            operator_user=pending_user,
            machine_ids=machine_ids,
        )
        existing = await _find_reusable_pending_invitation(
            owner_id=data.owner_id,
            invite_type="operator",
            target_user_id=str(pending_user.get("id") or "").strip(),
            rut_norm=rut_norm,
        )
        if existing:
            expires_at = _to_utc(existing.get("expires_at"))
            active_token = _invitation_token(existing) or invite_token
            delivery = _send_invitation_sms(
                phone=phone or pending_user.get("phone") or "",
                token=active_token,
                invite_type="operator",
                owner_name=owner.get("name", ""),
            )
            await db.invitations.update_one(
                _invitation_lookup(active_token),
                {
                    "$set": {
                        "operator_name": pending_user.get("name") or name,
                        "operator_phone": pending_user.get("phone") or phone,
                        "operator_rut": rut,
                        "operator_rut_norm": rut_norm,
                        "target_user_id": pending_user.get("id"),
                        "machine_ids": machine_ids,
                        "delivery_status": "sms_sent" if delivery.get("sms_sent") else "sms_failed",
                        "last_sms_sent_at": datetime.now(timezone.utc) if delivery.get("sms_sent") else None,
                        "last_sms_error": delivery.get("sms_error"),
                        "updated_at": now,
                    },
                    "$inc": {"resend_count": 1},
                },
            )
            out.append(
                {
                    "operator_name": pending_user.get("name") or name,
                    "operator_rut": rut,
                    "operator_phone": pending_user.get("phone") or phone,
                    "reused": True,
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "target_user_id": pending_user.get("id"),
                    "user_status": _team_visible_status(pending_user),
                    "delivery": delivery,
                    "machine_ids": machine_ids,
                }
            )
            continue

        expires_at = now + timedelta(days=7)
        invitation = {
            "token": invite_token,
            "code": invite_token,
            "owner_id": data.owner_id,
            "owner_name": owner.get("name", ""),
            "operator_name": pending_user.get("name") or name,
            "operator_phone": pending_user.get("phone") or phone,
            "operator_rut": rut,
            "operator_rut_norm": rut_norm,
            "target_user_id": pending_user.get("id"),
            "machine_ids": machine_ids,
            "invite_type": "operator",
            "status": "pending",
            "created_at": now,
            "expires_at": expires_at,
            "used_at": None,
            "used_by": None,
            "resend_count": 0,
            "delivery_status": "pending",
            "reminder_waves_sent": ["initial"],
        }
        await db.invitations.insert_one(invitation)
        delivery = _send_invitation_sms(
            phone=phone or "",
            token=invite_token,
            invite_type="operator",
            owner_name=owner.get("name", ""),
        )
        await db.invitations.update_one(
            _invitation_lookup(invite_token),
            {
                "$set": {
                    "delivery_status": "sms_sent" if delivery.get("sms_sent") else "sms_failed",
                    "last_sms_sent_at": datetime.now(timezone.utc) if delivery.get("sms_sent") else None,
                    "last_sms_error": delivery.get("sms_error"),
                }
            },
        )
        out.append(
            {
                "operator_name": name,
                "operator_rut": rut,
                "operator_phone": pending_user.get("phone") or phone,
                "reused": False,
                "expires_at": expires_at.isoformat(),
                "target_user_id": pending_user.get("id"),
                "user_status": _team_visible_status(pending_user),
                "delivery": delivery,
                "machine_ids": machine_ids,
            }
        )

    return {
        "success": True,
        "count": len(out),
        "expires_in_days": 7,
        "invitations": out,
    }


@router.post("/join")
async def use_invitation(data: InvitationUse):
    """
    Operador continúa su incorporación desde el enlace recibido por SMS.
    Solo acepta invitaciones de tipo 'operator' (no 'master').
    """
    try:
        invite_token = str(data.enrollment_token or "").strip().upper()

        invitation = await db.invitations.find_one(
            {
                **_invitation_lookup(invite_token),
                "status": "pending",
                "invite_type": {"$ne": "master"},
            }
        )

        if not invitation:
            any_invitation = await db.invitations.find_one(
                _invitation_lookup(invite_token),
                {"_id": 0, "token": 1, "code": 1, "status": 1, "invite_type": 1, "expires_at": 1},
            )
            if not any_invitation:
                raise HTTPException(status_code=404, detail="Invitación no encontrada")
            if any_invitation.get("invite_type") == "master":
                raise HTTPException(status_code=404, detail="Esta invitación es para Gerentes")
            st = str(any_invitation.get("status") or "").strip().lower()
            if st == "used":
                raise HTTPException(status_code=404, detail="Invitación ya utilizada")
            if st == "expired":
                raise HTTPException(status_code=400, detail="Invitación expirada")
            expires_at_any = _to_utc(any_invitation.get("expires_at"))
            if expires_at_any and datetime.now(timezone.utc) > expires_at_any:
                await db.invitations.update_one(
                    _invitation_lookup(invite_token),
                    {"$set": {"status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Invitación expirada")
            raise HTTPException(status_code=404, detail="Invitación no disponible")

        expires_at = _to_utc(invitation.get("expires_at"))
        now = datetime.now(timezone.utc)
        if not expires_at:
            raise HTTPException(
                status_code=500,
                detail="Error interno: invitación con expiración inválida",
            )
        if now > expires_at:
            await db.invitations.update_one(
                _invitation_lookup(invite_token),
                {"$set": {"status": "expired"}},
            )
            raise HTTPException(status_code=400, detail="Invitación expirada")

        if not invitation.get("operator_name") or not invitation.get("operator_rut"):
            raise HTTPException(
                status_code=400,
                detail="Esta invitación no tiene nombre o RUT del operador. Pide a tu empresa una nueva invitación.",
            )

        operator_rut = _ensure_person_rut(
            data.operator_rut or invitation.get("operator_rut"),
            label="RUT del operador",
        )

        operator_name = data.operator_name or invitation.get("operator_name") or "Operador"
        operator_phone = data.operator_phone or invitation.get("operator_phone") or ""
        target_user_id = str(invitation.get("target_user_id") or "").strip()
        if not target_user_id:
            pending_user = await _ensure_pending_team_user(
                owner_id=invitation["owner_id"],
                provider_role="operator",
                name=operator_name,
                phone=operator_phone,
                rut=operator_rut,
                invitation_code=invite_token,
            )
            target_user_id = str(pending_user.get("id") or "").strip()
        try:
            operator_data = await _prepare_pending_user_for_otp(
                target_user_id=target_user_id,
                owner_id=invitation["owner_id"],
                provider_role="operator",
                name=operator_name,
                phone=operator_phone,
                rut=operator_rut,
                invitation_code=invite_token,
            )
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No se pudo completar la activación porque ya existe un registro duplicado "
                    "(por ejemplo, teléfono o RUT)."
                ),
            )

        operator_id = str(operator_data.get("id") or target_user_id).strip()

        await db.invitations.update_one(
            _invitation_lookup(invite_token),
            {
                "$set": {
                    "status": "used",
                    "used_at": datetime.now(timezone.utc),
                    "used_by": operator_id,
                }
            },
        )

        owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1})

        response = {
            "success": True,
            "operator_id": operator_id,
            "owner_id": invitation["owner_id"],
            "owner_name": owner.get("name", "Tu empresa") if owner else "Tu empresa",
            "message": f"¡Bienvenido! Ya estás vinculado a {owner.get('name', 'tu empresa') if owner else 'tu empresa'}",
        }
        return response
    except HTTPException:
        raise
    except (PyMongoError, Exception):
        raise HTTPException(status_code=500, detail=ACTIVATION_INDETERMINATE_MESSAGE)


@router.get("/invitations/{owner_id}")
async def get_owner_invitations(
    owner_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Obtener todas las invitaciones de un dueño.
    """
    invitations = await db.invitations.find(
        {"owner_id": owner_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Formatear fechas
    for inv in invitations:
        if "created_at" in inv:
            inv["created_at"] = inv["created_at"].isoformat()
        if "expires_at" in inv:
            inv["expires_at"] = inv["expires_at"].isoformat()
        if "used_at" in inv and inv["used_at"]:
            inv["used_at"] = inv["used_at"].isoformat()
    
    return {"invitations": invitations, "count": len(invitations)}


@router.delete("/invitation/{token}")
async def cancel_invitation(
    token: str,
    owner_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Cancelar una invitación pendiente.
    """
    result = await db.invitations.delete_one({
        **_invitation_lookup(token),
        "owner_id": owner_id,
        "status": "pending"
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invitación no encontrada o ya utilizada")
    
    return {"success": True, "message": "Invitación cancelada"}


@router.get("/stats/{operator_id}")
async def get_operator_stats(
    operator_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Obtener estadísticas del operador (para pantalla post-servicio).
    """
    AccessPolicy.assert_self_or_admin(current_user, operator_id)
    # Obtener operador
    operator = await db.users.find_one({"id": operator_id}, {"_id": 0})
    if not operator:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    
    # Contar servicios del operador
    services = await db.services.find({
        "$or": [
            {"operator_id": operator_id},
            {"provider_id": operator_id}
        ]
    }).to_list(1000)
    
    total_services = len(services)
    completed_services = len([s for s in services if s.get("status") in ["completed", "paid"]])
    
    # Calcular horas trabajadas
    total_hours = sum(s.get("hours", 0) for s in services if s.get("status") in ["completed", "paid"])
    
    # Servicios de hoy
    today = datetime.now(timezone.utc).date()
    today_services = len([
        s for s in services 
        if s.get("status") in ["completed", "paid"] and
        s.get("created_at") and 
        (s["created_at"].date() if hasattr(s["created_at"], 'date') else datetime.fromisoformat(str(s["created_at"]).replace('Z', '+00:00')).date()) == today
    ])
    
    # Servicios este mes
    this_month = datetime.now(timezone.utc).month
    this_year = datetime.now(timezone.utc).year
    month_services = len([
        s for s in services 
        if s.get("status") in ["completed", "paid"] and
        s.get("created_at")
    ])  # Simplificado para demo
    
    return {
        "operator_id": operator_id,
        "name": operator.get("name", "Operador"),
        "rating": operator.get("rating", 5.0),
        "total_services": completed_services,
        "total_hours": total_hours,
        "services_today": today_services,
        "services_this_month": month_services,
        "is_available": operator.get("isAvailable", False)
    }


class MasterInvitationCreate(BaseModel):
    owner_id: str
    master_name: Optional[str] = None
    master_last_name: Optional[str] = None
    master_rut: Optional[str] = None
    master_phone: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None


class MasterInvitationUse(BaseModel):
    model_config = {"populate_by_name": True}

    enrollment_token: str = Field(
        ...,
        validation_alias=AliasChoices("enrollment_token", "token", "code"),
    )
    master_name: Optional[str] = None
    master_last_name: Optional[str] = None
    master_rut: Optional[str] = None
    master_phone: Optional[str] = None
    master_email: Optional[str] = None


@router.post("/masters/invite")
async def create_master_invitation(
    data: MasterInvitationCreate,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, data.owner_id)
    """
    Super Master genera código de invitación para un Master.
    Solo Super Masters pueden invitar Masters.
    """
    # Verificar que el dueño existe y es Super Master
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    owner_role = owner.get("role")
    owner_roles = owner.get("roles") or []
    is_provider_owner = (owner_role == "provider") or ("provider" in owner_roles)
    if not is_provider_owner:
        raise HTTPException(status_code=400, detail="Solo proveedores pueden invitar")
    
    # Verificar que es Super Master (o owner para compatibilidad)
    provider_role = owner.get("provider_role", "owner")
    if provider_role not in ["super_master", "owner"]:
        raise HTTPException(status_code=403, detail="Solo el Titular de la empresa puede invitar Gerentes")
    if not data.master_name or not data.master_last_name or not data.master_rut or not data.master_phone:
        raise HTTPException(
            status_code=400,
            detail="Completa nombre, apellido, RUT y celular del Gerente antes de invitarlo.",
        )
    master_rut = _ensure_person_rut(data.master_rut, label="RUT del Gerente")

    raw_perms = data.permissions if isinstance(data.permissions, dict) else {}
    allowed_keys = {
        "can_manage_machines",
        "can_delete_machines",
        "can_assign_operator",
        "can_edit_master_profile",
        "can_view_finance",
        "can_manage_operators",
        "can_delete_master",
        "can_view_work_details",
        "can_create_work",
    }
    invitation_permissions = {k: bool(raw_perms.get(k)) for k in allowed_keys}
    
    # Generar código único
    invite_token = await _generate_unique_token()
    try:
        pending_user = await _ensure_pending_team_user(
            owner_id=data.owner_id,
            provider_role="master",
            name=" ".join(part for part in [str(data.master_name or "").strip(), str(data.master_last_name or "").strip()] if part).strip(),
            phone=str(data.master_phone or "").strip(),
            rut=master_rut,
            invitation_code=invite_token,
            permissions=invitation_permissions,
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail=(
                "El celular o RUT del Gerente ya está asociado a otra cuenta MAQGO. "
                "Cada usuario Gerente requiere un teléfono único."
            ),
        )
    reusable = await _find_reusable_pending_invitation(
        owner_id=data.owner_id,
        invite_type="master",
        target_user_id=str(pending_user.get("id") or "").strip(),
        rut_norm=_normalize_rut(master_rut),
    )
    if reusable:
        delivery = _send_invitation_sms(
            phone=data.master_phone or pending_user.get("phone") or "",
            token=_invitation_token(reusable) or invite_token,
            invite_type="master",
            owner_name=owner.get("name", ""),
        )
        await db.invitations.update_one(
            _invitation_lookup(_invitation_token(reusable)),
            {
                "$set": {
                    "master_name": data.master_name,
                    "master_last_name": data.master_last_name,
                    "master_rut": master_rut,
                    "master_rut_norm": _normalize_rut(master_rut),
                    "master_phone": pending_user.get("phone") or data.master_phone,
                    "permissions": invitation_permissions,
                    "target_user_id": pending_user.get("id"),
                    "updated_at": datetime.now(timezone.utc),
                },
                "$inc": {"resend_count": 1},
            },
        )
        return {
            "success": True,
            "invite_type": "master",
            "expires_in_days": 7,
            "message": "La invitación ya fue enviada automáticamente por MAQGO.",
            "delivery": delivery,
            "user_status": _team_visible_status(pending_user),
            "target_user_id": pending_user.get("id"),
        }
    
    # Crear invitación para Master
    invitation = {
        "token": invite_token,
        "code": invite_token,
        "owner_id": data.owner_id,
        "owner_name": owner.get("name", ""),
        "invite_type": "master",  # Tipo de invitación
        "master_name": data.master_name,
        "master_last_name": data.master_last_name,
        "master_rut": master_rut,
        "master_rut_norm": _normalize_rut(master_rut),
        "master_phone": pending_user.get("phone") or data.master_phone,
        "permissions": invitation_permissions,
        "target_user_id": pending_user.get("id"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used_at": None,
        "used_by": None,
        "resend_count": 0,
        "delivery_status": "pending",
        "reminder_waves_sent": ["initial"],
    }
    
    await db.invitations.insert_one(invitation)
    delivery = _send_invitation_sms(
        phone=data.master_phone or "",
        token=invite_token,
        invite_type="master",
        owner_name=owner.get("name", ""),
    )
    await db.invitations.update_one(
        _invitation_lookup(invite_token),
        {
            "$set": {
                "delivery_status": "sms_sent" if delivery.get("sms_sent") else "sms_failed",
                "last_sms_sent_at": datetime.now(timezone.utc) if delivery.get("sms_sent") else None,
                "last_sms_error": delivery.get("sms_error"),
            }
        },
    )
    
    return {
        "success": True,
        "invite_type": "master",
        "expires_in_days": 7,
        "message": "La invitación fue enviada automáticamente por MAQGO.",
        "delivery": delivery,
        "user_status": _team_visible_status(pending_user),
        "target_user_id": pending_user.get("id"),
    }


@router.post("/masters/join")
async def use_master_invitation(data: MasterInvitationUse):
    """
    Gerente continúa su incorporación desde el enlace recibido por SMS.
    """
    try:
        invite_token = str(data.enrollment_token or "").strip().upper()
        invitation = await db.invitations.find_one(
            {
                **_invitation_lookup(invite_token),
                "status": "pending",
                "invite_type": "master",
            }
        )

        if not invitation:
            any_invitation = await db.invitations.find_one(
                _invitation_lookup(invite_token),
                {"_id": 0, "token": 1, "code": 1, "status": 1, "invite_type": 1, "expires_at": 1},
            )
            if not any_invitation:
                raise HTTPException(status_code=404, detail="Invitación no encontrada")
            if any_invitation.get("invite_type") and any_invitation.get("invite_type") != "master":
                raise HTTPException(status_code=404, detail="Esta invitación no es para Gerentes")
            st = str(any_invitation.get("status") or "").strip().lower()
            if st == "used":
                raise HTTPException(status_code=404, detail="Invitación ya utilizada")
            if st == "expired":
                raise HTTPException(status_code=400, detail="Invitación expirada")
            expires_at_any = _to_utc(any_invitation.get("expires_at"))
            if expires_at_any and datetime.now(timezone.utc) > expires_at_any:
                await db.invitations.update_one(
                    _invitation_lookup(invite_token),
                    {"$set": {"status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Invitación expirada")
            raise HTTPException(status_code=404, detail="Invitación no disponible")

        expires_at = _to_utc(invitation.get("expires_at"))
        now = datetime.now(timezone.utc)
        if not expires_at:
            raise HTTPException(
                status_code=500,
                detail="Error interno: invitación con expiración inválida",
            )

        if now > expires_at:
            await db.invitations.update_one(
                _invitation_lookup(invite_token),
                {"$set": {"status": "expired"}},
            )
            raise HTTPException(status_code=400, detail="Invitación expirada")

        first_name = str(data.master_name or invitation.get("master_name") or "").strip()
        last_name = str(data.master_last_name or invitation.get("master_last_name") or "").strip()
        full_name = " ".join(part for part in [first_name, last_name] if part).strip() or first_name
        phone = str(data.master_phone or invitation.get("master_phone") or "").strip()
        rut = str(data.master_rut or invitation.get("master_rut") or "").strip()
        if not rut:
            raise HTTPException(status_code=400, detail="Falta el RUT del Gerente")
        rut = _ensure_person_rut(rut, label="RUT del Gerente")

        if not full_name:
            raise HTTPException(status_code=400, detail="Falta el nombre del Gerente")
        if not phone:
            raise HTTPException(status_code=400, detail="Falta el celular del Gerente")

        target_user_id = str(invitation.get("target_user_id") or "").strip()
        if not target_user_id:
            pending_user = await _ensure_pending_team_user(
                owner_id=invitation["owner_id"],
                provider_role="master",
                name=full_name,
                phone=phone,
                rut=rut,
                invitation_code=invite_token,
                permissions=invitation.get("permissions") if isinstance(invitation.get("permissions"), dict) else {},
            )
            target_user_id = str(pending_user.get("id") or "").strip()

        try:
            master_data = await _prepare_pending_user_for_otp(
                target_user_id=target_user_id,
                owner_id=invitation["owner_id"],
                provider_role="master",
                name=full_name,
                phone=phone,
                rut=rut,
                invitation_code=invite_token,
                permissions=invitation.get("permissions") if isinstance(invitation.get("permissions"), dict) else {},
            )
            if data.master_email:
                await db.users.update_one({"id": target_user_id}, {"$set": {"email": data.master_email}})
                master_data["email"] = data.master_email
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No se pudo completar la activación porque ya existe un registro duplicado "
                    "(por ejemplo, teléfono o RUT)."
                ),
            )

        master_id = str(master_data.get("id") or target_user_id).strip()

        await db.invitations.update_one(
            _invitation_lookup(invite_token),
            {
                "$set": {
                    "status": "used",
                    "used_at": datetime.now(timezone.utc),
                    "used_by": master_id,
                }
            },
        )

        owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1})

        return {
            "success": True,
            "master_id": master_id,
            "owner_id": invitation["owner_id"],
            "owner_name": owner.get("name", "Tu empresa") if owner else "Tu empresa",
            "message": f"¡Bienvenido! Ya estás vinculado a {owner.get('name', 'tu empresa') if owner else 'tu empresa'}",
        }
    except HTTPException:
        raise
    except (PyMongoError, Exception):
        raise HTTPException(status_code=500, detail=ACTIVATION_INDETERMINATE_MESSAGE)


@router.get("/team/{owner_id}")
async def get_team(
    owner_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Obtener todo el equipo de una empresa (Masters + Operadores) con sus estadísticas.
    """
    # Obtener Masters
    masters = await db.users.find(
        {
            "owner_id": owner_id,
            "provider_role": "master",
            "$or": [{"deleted": {"$exists": False}}, {"deleted": False}],
        },
        {"_id": 0}
    ).to_list(100)
    
    # Obtener Operadores
    operators = await db.users.find(
        {
            "owner_id": owner_id,
            "provider_role": "operator",
            "$or": [{"deleted": {"$exists": False}}, {"deleted": False}],
        },
        {"_id": 0}
    ).to_list(100)
    
    def _to_iso(val):
        """Convierte datetime a string ISO de forma segura."""
        if val is None:
            return None
        if isinstance(val, str):
            return val
        if hasattr(val, "isoformat"):
            return val.isoformat()
        return str(val)

    # Agregar estadísticas a cada miembro
    for member in masters + operators:
        mid = member.get("id")
        if not mid:
            member["services_completed"] = 0
            member["hours_worked"] = 0
        else:
            services = await db.services.find({
                "$or": [
                    {"operator_id": mid},
                    {"provider_id": mid}
                ],
            "status": {"$in": ["completed", "paid"]}
            }).to_list(1000)
            member["services_completed"] = len(services)
            member["hours_worked"] = sum(s.get("hours", 0) for s in services)
        member["status"] = _normalized_business_status(member)
        member["visible_status"] = _team_visible_status(member)
        
        # Formatear fecha
        if "createdAt" in member:
            member["createdAt"] = _to_iso(member["createdAt"])
    
    # Obtener invitaciones pendientes
    pending_invitations = await db.invitations.find(
        {
            "owner_id": owner_id,
            "status": "pending"
        },
        {"_id": 0}
    ).to_list(50)
    
    # Formatear fechas de invitaciones
    for inv in pending_invitations:
        if "created_at" in inv:
            inv["created_at"] = _to_iso(inv.get("created_at"))
        if "expires_at" in inv:
            inv["expires_at"] = _to_iso(inv.get("expires_at"))
    
    return {
        "owner_id": owner_id,
        "masters": masters,
        "masters_count": len(masters),
        "operators": operators,
        "operators_count": len(operators),
        "pending_invitations": pending_invitations,
        "total_team": len(masters) + len(operators)
    }
