"""
MAQGO - Sistema de Invitación de Operadores

Flujo:
1. Dueño genera código de invitación desde su dashboard
2. Operador descarga app e ingresa código
3. Operador queda vinculado automáticamente al dueño
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import os
import random
import string

router = APIRouter(prefix="/operators", tags=["operators"])

# MongoDB connection
from motor.motor_asyncio import AsyncIOMotorClient
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

class InvitationCreate(BaseModel):
    owner_id: str
    operator_name: Optional[str] = None
    operator_phone: Optional[str] = None
    operator_rut: Optional[str] = None

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


@router.post("/invite")
async def create_invitation(data: InvitationCreate):
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

    # Regla de negocio: para operadores, la empresa debe definir al menos nombre y RUT
    if not data.operator_name or not data.operator_rut:
        raise HTTPException(
            status_code=400,
            detail="Debes ingresar nombre y RUT del operador para generar el código."
        )
    
    # Generar código único
    code = generate_invite_code()
    
    # Verificar que no exista
    while await db.invitations.find_one({"code": code}):
        code = generate_invite_code()
    
    # Crear invitación
    invitation = {
        "code": code,
        "owner_id": data.owner_id,
        "owner_name": owner.get("name", ""),
        "operator_name": data.operator_name,
        "operator_phone": data.operator_phone,
        "operator_rut": data.operator_rut,
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


@router.post("/join")
async def use_invitation(data: InvitationUse):
    """
    Operador usa código de invitación para vincularse al dueño.
    Solo acepta códigos de tipo 'operator' (no 'master').
    """
    code_upper = data.code.upper()
    
    # Buscar invitación - solo para operadores (no masters)
    invitation = await db.invitations.find_one({
        "code": code_upper,
        "status": "pending",
        "invite_type": {"$ne": "master"}  # Excluir invitaciones de tipo master
    })
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Código inválido, ya utilizado, o es para Gerentes")
    
    # Verificar expiración (manejando timezone aware/naive)
    expires_at = invitation["expires_at"]
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        await db.invitations.update_one(
            {"code": code_upper},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Código expirado")
    
    # Validar que la invitación tiene datos mínimos del operador
    if not invitation.get("operator_name") or not invitation.get("operator_rut"):
        raise HTTPException(
            status_code=400,
            detail="Esta invitación no tiene nombre o RUT del operador. Pide a tu empresa un código nuevo."
        )

    # Crear cuenta de operador
    import uuid
    operator_id = str(uuid.uuid4())
    
    operator_data = {
        "id": operator_id,
        "role": "provider",
        "provider_role": "operator",
        "owner_id": invitation["owner_id"],
        "name": data.operator_name or invitation.get("operator_name") or "Operador",
        "phone": data.operator_phone or invitation.get("operator_phone") or "",
        "rut": data.operator_rut or invitation.get("operator_rut"),
        "email": "",
        "isAvailable": False,
        "rating": 5.0,
        "totalRatings": 0,
        "totalServices": 0,
        "hoursWorked": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "joinedVia": "invitation",
        "invitationCode": data.code.upper()
    }
    
    await db.users.insert_one(operator_data)
    
    # Marcar invitación como usada
    await db.invitations.update_one(
        {"code": code_upper},
        {
            "$set": {
                "status": "used",
                "used_at": datetime.now(timezone.utc),
                "used_by": operator_id
            }
        }
    )
    
    # Obtener datos del dueño
    owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1})
    
    return {
        "success": True,
        "operator_id": operator_id,
        "owner_id": invitation["owner_id"],
        "owner_name": owner.get("name", "Tu empresa") if owner else "Tu empresa",
        "message": f"¡Bienvenido! Ya estás vinculado a {owner.get('name', 'tu empresa') if owner else 'tu empresa'}"
    }


@router.get("/invitations/{owner_id}")
async def get_owner_invitations(owner_id: str):
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
async def cancel_invitation(code: str, owner_id: str):
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
async def get_operator_stats(operator_id: str):
    """
    Obtener estadísticas del operador (para pantalla post-servicio).
    """
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
    master_phone: Optional[str] = None


class MasterInvitationUse(BaseModel):
    code: str
    master_name: str
    master_phone: str
    master_email: Optional[str] = None


@router.post("/masters/invite")
async def create_master_invitation(data: MasterInvitationCreate):
    """
    Super Master genera código de invitación para un Master.
    Solo Super Masters pueden invitar Masters.
    """
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
    
    # Generar código único
    code = generate_invite_code()
    while await db.invitations.find_one({"code": code}):
        code = generate_invite_code()
    
    # Crear invitación para Master
    invitation = {
        "code": code,
        "owner_id": data.owner_id,
        "owner_name": owner.get("name", ""),
        "invite_type": "master",  # Tipo de invitación
        "master_name": data.master_name,
        "master_phone": data.master_phone,
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
    # Buscar invitación de tipo Master
    invitation = await db.invitations.find_one({
        "code": data.code.upper(),
        "status": "pending",
        "invite_type": "master"
    })
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Código inválido, ya utilizado, o no es para Masters")
    
    # Verificar expiración (manejando timezone aware/naive)
    expires_at = invitation["expires_at"]
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if now > expires_at:
        await db.invitations.update_one(
            {"code": data.code.upper()},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Código expirado")
    
    # Crear cuenta de Master
    import uuid
    master_id = str(uuid.uuid4())
    
    master_data = {
        "id": master_id,
        "role": "provider",
        "provider_role": "master",  # ROL MASTER
        "owner_id": invitation["owner_id"],
        "name": data.master_name,
        "phone": data.master_phone,
        "email": data.master_email or "",
        "isAvailable": False,
        "rating": 5.0,
        "totalRatings": 0,
        "totalServices": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "joinedVia": "invitation",
        "invitationCode": data.code.upper()
    }
    
    await db.users.insert_one(master_data)
    
    # Marcar invitación como usada
    await db.invitations.update_one(
        {"code": data.code.upper()},
        {
            "$set": {
                "status": "used",
                "used_at": datetime.now(timezone.utc),
                "used_by": master_id
            }
        }
    )
    
    # Obtener datos del dueño
    owner = await db.users.find_one({"id": invitation["owner_id"]}, {"_id": 0, "name": 1})
    
    return {
        "success": True,
        "master_id": master_id,
        "owner_id": invitation["owner_id"],
        "owner_name": owner.get("name", "Tu empresa") if owner else "Tu empresa",
        "message": f"¡Bienvenido Master! Ya estás vinculado a {owner.get('name', 'tu empresa') if owner else 'tu empresa'}"
    }


@router.get("/team/{owner_id}")
async def get_team(owner_id: str):
    """
    Obtener todo el equipo de una empresa (Masters + Operadores) con sus estadísticas.
    """
    # Obtener Masters
    masters = await db.users.find(
        {
            "owner_id": owner_id,
            "provider_role": "master"
        },
        {"_id": 0}
    ).to_list(100)
    
    # Obtener Operadores
    operators = await db.users.find(
        {
            "owner_id": owner_id,
            "provider_role": "operator"
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
