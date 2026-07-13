"""
MAQGO - Sistema de Invitación de Operadores

Flujo:
1. Dueño genera código de invitación desde su dashboard
2. Operador descarga app e ingresa código
3. Operador queda vinculado automáticamente al dueño
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import random
import string

from pymongo.errors import DuplicateKeyError, PyMongoError

from motor.motor_asyncio import AsyncIOMotorClient
from db_config import get_db_name, get_mongo_url
from auth_dependency import get_current_user
from security.policy import AccessPolicy
from security.provider_permissions_builder import build_provider_permissions

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
    operator_phone: Optional[str] = None
    operator_rut: Optional[str] = None

class OperatorInviteItem(BaseModel):
    operator_name: str
    operator_rut: str
    operator_phone: Optional[str] = None

class InvitationBatchCreate(BaseModel):
    owner_id: str
    operators: List[OperatorInviteItem]

class InvitationUse(BaseModel):
    code: str
    operator_name: Optional[str] = None
    operator_phone: Optional[str] = None
    operator_rut: Optional[str] = None

class OperatorStats(BaseModel):
    operator_id: str



def generate_invite_code():
    """Genera código de 6 caracteres alfanumérico"""
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

async def _generate_unique_code() -> str:
    code = generate_invite_code()
    while await db.invitations.find_one({"code": code}):
        code = generate_invite_code()
    return code

def _to_utc(dt):
    if not dt:
        return None
    if hasattr(dt, "tzinfo") and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _owner_display_name(owner: dict | None) -> str:
    if not owner:
        return "Tu empresa"
    razon = str(owner.get("razon_social") or "").strip()
    if razon:
        return razon
    name = str(owner.get("name") or "").strip()
    return name or "Tu empresa"


@router.post("/invite")
async def create_invitation(
    data: InvitationCreate,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, data.owner_id)
    """
    Dueño genera código de invitación para un operador.
    El código expira en 7 días.
    """
    # Verificar que el dueño existe
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Dueño no encontrado")
    
    if owner.get("role") != "provider":
        raise HTTPException(status_code=400, detail="Solo proveedores pueden invitar operadores")

    actor_provider_role = current_user.get("provider_role")
    if actor_provider_role in (None, "owner"):
        actor_provider_role = "super_master"
    actor_perms = build_provider_permissions(current_user, str(actor_provider_role or ""))
    if not actor_perms.get("can_manage_operators"):
        raise HTTPException(status_code=403, detail="No tienes permisos para invitar operadores")

    # Regla de negocio: para operadores, la empresa debe definir al menos nombre y RUT
    if not data.operator_name or not data.operator_rut:
        raise HTTPException(
            status_code=400,
            detail="Debes ingresar nombre y RUT del operador para generar el código."
        )
    operator_rut = _ensure_person_rut(data.operator_rut, label="RUT del operador")
    
    code = await _generate_unique_code()
    
    # Crear invitación
    rut_norm = _normalize_rut(operator_rut)
    invitation = {
        "code": code,
        "owner_id": data.owner_id,
        "owner_name": _owner_display_name(owner),
        "operator_name": data.operator_name,
        "operator_phone": data.operator_phone,
        "operator_rut": operator_rut,
        "operator_rut_norm": rut_norm,
        "status": "pending",  # pending, used, expired
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used_at": None,
        "used_by": None
    }
    
    await db.invitations.insert_one(invitation)
    
    return {
        "success": True,
        "code": code,
        "expires_in_days": 7,
        "message": f"Código generado: {code}. Compártelo con tu operador."
    }


@router.post("/invite/batch")
async def create_invitations_batch(
    data: InvitationBatchCreate,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, data.owner_id)
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Dueño no encontrado")
    if owner.get("role") != "provider":
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
        existing = await db.invitations.find_one(
            {
                "owner_id": data.owner_id,
                "status": "pending",
                "$and": [
                    {"$or": [{"invite_type": {"$exists": False}}, {"invite_type": {"$ne": "master"}}]},
                    {"$or": [{"operator_rut_norm": rut_norm}, {"operator_rut": rut}]},
                ],
            },
            {"_id": 0},
        )
        if existing:
            expires_at = _to_utc(existing.get("expires_at"))
            if expires_at and now > expires_at:
                await db.invitations.update_one(
                    {"code": existing.get("code")},
                    {"$set": {"status": "expired"}},
                )
            else:
                out.append(
                    {
                        "code": existing.get("code"),
                        "operator_name": existing.get("operator_name") or name,
                        "operator_rut": existing.get("operator_rut") or rut,
                        "operator_phone": existing.get("operator_phone") or phone,
                        "reused": True,
                        "expires_at": expires_at.isoformat() if expires_at else None,
                    }
                )
                continue

        code = await _generate_unique_code()
        expires_at = now + timedelta(days=7)
        invitation = {
            "code": code,
            "owner_id": data.owner_id,
            "owner_name": _owner_display_name(owner),
            "operator_name": name,
            "operator_phone": phone,
            "operator_rut": rut,
            "operator_rut_norm": rut_norm,
            "status": "pending",
            "created_at": now,
            "expires_at": expires_at,
            "used_at": None,
            "used_by": None,
        }
        await db.invitations.insert_one(invitation)
        out.append(
            {
                "code": code,
                "operator_name": name,
                "operator_rut": rut,
                "operator_phone": phone,
                "reused": False,
                "expires_at": expires_at.isoformat(),
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
    Operador usa código de invitación para vincularse al dueño.
    Solo acepta códigos de tipo 'operator' (no 'master').
    """
    try:
        code_upper = data.code.upper()

        invitation = await db.invitations.find_one(
            {
                "code": code_upper,
                "status": "pending",
                "invite_type": {"$ne": "master"},
            }
        )

        if not invitation:
            any_invitation = await db.invitations.find_one(
                {"code": code_upper},
                {"_id": 0, "code": 1, "status": 1, "invite_type": 1, "expires_at": 1},
            )
            if not any_invitation:
                raise HTTPException(status_code=404, detail="Código inexistente")
            if any_invitation.get("invite_type") == "master":
                raise HTTPException(status_code=404, detail="Este código es para Gerentes")
            st = str(any_invitation.get("status") or "").strip().lower()
            if st == "used":
                raise HTTPException(status_code=404, detail="Código ya utilizado")
            if st == "expired":
                raise HTTPException(status_code=400, detail="Código expirado")
            expires_at_any = _to_utc(any_invitation.get("expires_at"))
            if expires_at_any and datetime.now(timezone.utc) > expires_at_any:
                await db.invitations.update_one(
                    {"code": code_upper},
                    {"$set": {"status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Código expirado")
            raise HTTPException(status_code=404, detail="Código no disponible")

        expires_at = _to_utc(invitation.get("expires_at"))
        now = datetime.now(timezone.utc)
        if not expires_at:
            raise HTTPException(
                status_code=500,
                detail="Error interno: invitación con expiración inválida",
            )
        if now > expires_at:
            await db.invitations.update_one(
                {"code": code_upper},
                {"$set": {"status": "expired"}},
            )
            raise HTTPException(status_code=400, detail="Código expirado")

        if not invitation.get("operator_name") or not invitation.get("operator_rut"):
            raise HTTPException(
                status_code=400,
                detail="Esta invitación no tiene nombre o RUT del operador. Pide a tu empresa un código nuevo.",
            )

        operator_rut = _ensure_person_rut(
            data.operator_rut or invitation.get("operator_rut"),
            label="RUT del operador",
        )

        import uuid

        operator_id = str(uuid.uuid4())

        operator_data = {
            "id": operator_id,
            "role": "provider",
            "provider_role": "operator",
            "owner_id": invitation["owner_id"],
            "name": data.operator_name or invitation.get("operator_name") or "Operador",
            "phone": data.operator_phone or invitation.get("operator_phone") or "",
            "rut": operator_rut,
            "email": "",
            "isAvailable": False,
            "rating": 5.0,
            "totalRatings": 0,
            "totalServices": 0,
            "hoursWorked": 0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "joinedVia": "invitation",
            "invitationCode": data.code.upper(),
        }

        try:
            await db.users.insert_one(operator_data)
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No se pudo completar la activación porque ya existe un registro duplicado "
                    "(por ejemplo, teléfono o RUT)."
                ),
            )

        await db.invitations.update_one(
            {"code": code_upper},
            {
                "$set": {
                    "status": "used",
                    "used_at": datetime.now(timezone.utc),
                    "used_by": operator_id,
                }
            },
        )

        owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1, "razon_social": 1})

        response = {
            "success": True,
            "operator_id": operator_id,
            "owner_id": invitation["owner_id"],
            "owner_name": _owner_display_name(owner),
            "message": f"¡Bienvenido! Ya estás vinculado a {_owner_display_name(owner)}",
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


@router.delete("/invitation/{code}")
async def cancel_invitation(
    code: str,
    owner_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Cancelar una invitación pendiente.
    """
    result = await db.invitations.delete_one({
        "code": code.upper(),
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
    code: str
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

    actor_provider_role = current_user.get("provider_role")
    if actor_provider_role in (None, "owner"):
        actor_provider_role = "super_master"
    actor_perms = build_provider_permissions(current_user, str(actor_provider_role or ""))
    if not actor_perms.get("can_manage_masters"):
        raise HTTPException(
            status_code=403,
            detail="Solo el dueño de la empresa o un Master con permiso delegado puede invitar Masters",
        )
    # Verificar que el dueño existe y es Super Master
    owner = await db.users.find_one({"id": data.owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    if owner.get("role") != "provider":
        raise HTTPException(status_code=400, detail="Solo proveedores pueden invitar")
    
    # Verificar que es Super Master (o owner para compatibilidad)
    provider_role = owner.get("provider_role", "owner")
    if provider_role not in ["super_master", "owner"]:
        raise HTTPException(status_code=403, detail="Solo el dueño de la empresa puede invitar Masters")
    if not data.master_name or not data.master_last_name or not data.master_rut or not data.master_phone:
        raise HTTPException(
            status_code=400,
            detail="Completa nombre, apellido, RUT y celular del usuario master para generar el código.",
        )
    master_rut = _ensure_person_rut(data.master_rut, label="RUT del usuario master")

    raw_perms = data.permissions if isinstance(data.permissions, dict) else {}
    allowed_keys = {
        "can_manage_masters",
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
    code = generate_invite_code()
    while await db.invitations.find_one({"code": code}):
        code = generate_invite_code()
    
    # Crear invitación para Master
    invitation = {
        "code": code,
        "owner_id": data.owner_id,
        "owner_name": _owner_display_name(owner),
        "invite_type": "master",  # Tipo de invitación
        "master_name": data.master_name,
        "master_last_name": data.master_last_name,
        "master_rut": master_rut,
        "master_phone": data.master_phone,
        "permissions": invitation_permissions,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used_at": None,
        "used_by": None
    }
    
    await db.invitations.insert_one(invitation)
    
    return {
        "success": True,
        "code": code,
        "invite_type": "master",
        "expires_in_days": 7,
        "message": f"Código generado: {code}. Compártelo con tu nuevo Master/Gerente."
    }


@router.post("/masters/join")
async def use_master_invitation(data: MasterInvitationUse):
    """
    Master usa código de invitación para vincularse a la empresa.
    """
    try:
        invitation = await db.invitations.find_one(
            {
                "code": data.code.upper(),
                "status": "pending",
                "invite_type": "master",
            }
        )

        if not invitation:
            any_invitation = await db.invitations.find_one(
                {"code": data.code.upper()},
                {"_id": 0, "code": 1, "status": 1, "invite_type": 1, "expires_at": 1},
            )
            if not any_invitation:
                raise HTTPException(status_code=404, detail="Código inexistente")
            if any_invitation.get("invite_type") and any_invitation.get("invite_type") != "master":
                raise HTTPException(status_code=404, detail="Este código no es para Masters")
            st = str(any_invitation.get("status") or "").strip().lower()
            if st == "used":
                raise HTTPException(status_code=404, detail="Código ya utilizado")
            if st == "expired":
                raise HTTPException(status_code=400, detail="Código expirado")
            expires_at_any = _to_utc(any_invitation.get("expires_at"))
            if expires_at_any and datetime.now(timezone.utc) > expires_at_any:
                await db.invitations.update_one(
                    {"code": data.code.upper()},
                    {"$set": {"status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Código expirado")
            raise HTTPException(status_code=404, detail="Código no disponible")

        expires_at = _to_utc(invitation.get("expires_at"))
        now = datetime.now(timezone.utc)
        if not expires_at:
            raise HTTPException(
                status_code=500,
                detail="Error interno: invitación con expiración inválida",
            )

        if now > expires_at:
            await db.invitations.update_one(
                {"code": data.code.upper()},
                {"$set": {"status": "expired"}},
            )
            raise HTTPException(status_code=400, detail="Código expirado")

        first_name = str(data.master_name or invitation.get("master_name") or "").strip()
        last_name = str(data.master_last_name or invitation.get("master_last_name") or "").strip()
        full_name = " ".join(part for part in [first_name, last_name] if part).strip() or first_name
        phone = str(data.master_phone or invitation.get("master_phone") or "").strip()
        rut = str(data.master_rut or invitation.get("master_rut") or "").strip()
        if not rut:
            raise HTTPException(status_code=400, detail="Falta el RUT del usuario master")
        rut = _ensure_person_rut(rut, label="RUT del usuario master")

        if not full_name:
            raise HTTPException(status_code=400, detail="Falta el nombre del usuario master")
        if not phone:
            raise HTTPException(status_code=400, detail="Falta el celular del usuario master")

        import uuid

        master_id = str(uuid.uuid4())

        master_data = {
            "id": master_id,
            "role": "provider",
            "provider_role": "master",
            "owner_id": invitation["owner_id"],
            "name": full_name,
            "rut": rut,
            "phone": phone,
            "email": data.master_email or "",
            "isAvailable": False,
            "rating": 5.0,
            "totalRatings": 0,
            "totalServices": 0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "joinedVia": "invitation",
            "invitationCode": data.code.upper(),
            "master_permissions": invitation.get("permissions")
            if isinstance(invitation.get("permissions"), dict)
            else {},
        }

        try:
            await db.users.insert_one(master_data)
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No se pudo completar la activación porque ya existe un registro duplicado "
                    "(por ejemplo, teléfono o RUT)."
                ),
            )

        await db.invitations.update_one(
            {"code": data.code.upper()},
            {
                "$set": {
                    "status": "used",
                    "used_at": datetime.now(timezone.utc),
                    "used_by": master_id,
                }
            },
        )

        owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1, "razon_social": 1})

        return {
            "success": True,
            "master_id": master_id,
            "owner_id": invitation["owner_id"],
            "owner_name": _owner_display_name(owner),
            "message": f"¡Bienvenido Master! Ya estás vinculado a {_owner_display_name(owner)}",
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
            "$and": [
                {"$or": [{"status": {"$exists": False}}, {"status": "active"}]},
                {"$or": [{"deleted": {"$exists": False}}, {"deleted": False}]},
            ],
        },
        {"_id": 0}
    ).to_list(100)
    
    # Obtener Operadores
    operators = await db.users.find(
        {
            "owner_id": owner_id,
            "provider_role": "operator",
            "$and": [
                {"$or": [{"status": {"$exists": False}}, {"status": "active"}]},
                {"$or": [{"deleted": {"$exists": False}}, {"deleted": False}]},
            ],
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
