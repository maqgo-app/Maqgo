"""
STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
"""
import re

from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from auth_dependency import verify_user_access, get_current_user
from security.policy import AccessPolicy
from models.user import User, UserCreate, ProviderAvailabilityUpdate
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

from db_config import get_db_name, get_mongo_url
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])

def _hash_password(password: str) -> str:
    """Hash bcrypt compatible con auth.py (evita NameError en producción)."""
    if password is None:
        return ""
    pw = str(password).encode("utf-8")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


async def _add_session_token(result: dict) -> None:
    """Añade token de sesión al resultado (para flujos de registro/creación)."""
    try:
        from auth_dependency import create_session_for_user
        user_id = result.get("id")
        if user_id:
            token = await create_session_for_user(user_id)
            result["token"] = token
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("No se pudo crear sesión para usuario: %s", e)

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

def _user_roles_list(doc: dict) -> list:
    """Lista de roles (compatibilidad: si no hay 'roles', usar 'role')."""
    roles = doc.get("roles")
    if roles:
        return list(roles)
    r = doc.get("role")
    return [r] if r else []


class BecomeProviderBody(BaseModel):
    """Upgrade cliente → proveedor sobre el mismo user_id (sesión OTP/JWT)."""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=12)
    provider_data: Optional[Dict[str, Any]] = None
    celular: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("La contraseña debe incluir letras y números")
        return v


def _phone9_digits(cel: str) -> str:
    digits = "".join(c for c in str(cel or "") if c.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        digits = digits[2:]
    return digits[-9:] if len(digits) >= 9 else digits


@router.post("", response_model=dict)
async def create_user(user: UserCreate):
    """Crear usuario o fusionar rol. Deduplica por email o por teléfono (OTP)."""
    user_data = user.model_dump()
    plain_password = user_data.pop("password", None)
    email_raw = (user_data.get("email") or "").strip().lower()
    user_data["email"] = email_raw if email_raw else None
    if user_data.get("rut"):
        import re as _re
        raw = str(user_data["rut"]).strip()
        cleaned = _re.sub(r"[^0-9kK]", "", raw)
        if len(cleaned) >= 2:
            user_data["rut"] = f"{cleaned[:-1]}-{cleaned[-1].upper()}"
    phone9 = _phone9_digits(user_data.get("phone") or "")

    existing = None
    match_query = None
    if user_data["email"]:
        existing = await db.users.find_one({"email": user_data["email"]})
        if existing:
            match_query = {"email": user_data["email"]}
    if not existing and len(phone9) == 9:
        existing = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}})
        if existing:
            match_query = {"id": existing["id"]}

    if existing and match_query:
        roles = _user_roles_list(existing)
        new_role = user_data.get("role")
        if new_role in roles:
            if plain_password:
                await db.users.update_one(
                    match_query,
                    {"$set": {"password": _hash_password(plain_password)}},
                )
            fresh = await db.users.find_one({"id": existing["id"]}, {"_id": 0, "password": 0})
            result = dict(fresh or existing)
            result.pop("_id", None)
            result.pop("password", None)
            await _add_session_token(result)
            return result
        new_roles = list(dict.fromkeys(roles + [new_role]))
        update = {"roles": new_roles}
        if user_data.get("name"):
            update["name"] = user_data["name"]
        if user_data.get("email") and not existing.get("email"):
            update["email"] = user_data["email"]
        if plain_password:
            update["password"] = _hash_password(plain_password)
        if new_role == "provider":
            if user_data.get("hourlyRate") is not None:
                update["hourlyRate"] = user_data["hourlyRate"]
            else:
                update["hourlyRate"] = 20000.0
            update["isAvailable"] = False
        await db.users.update_one(match_query, {"$set": update})
        result = await db.users.find_one({"id": existing["id"]}, {"_id": 0, "password": 0})
        await _add_session_token(result)
        return result

    if user_data.get("hourlyRate") is None:
        user_data["hourlyRate"] = 20000.0 if user_data.get("role") == "provider" else 0.0
    user_data["roles"] = [user_data["role"]]
    user_obj = User(**user_data)
    doc = user_obj.model_dump()
    doc["createdAt"] = doc["createdAt"].isoformat()
    if plain_password:
        doc["password"] = _hash_password(plain_password)
    await db.users.insert_one(doc)
    result = doc.copy()
    result.pop("_id", None)
    await _add_session_token(result)
    return result

@router.get("", response_model=List[dict])
async def get_users(
    role: Optional[str] = None,
    isAvailable: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    """Obtener usuarios con filtros opcionales"""
    AccessPolicy.assert_admin(current_user)
    query = {}
    if role:
        # Compatibilidad multirol: role legacy o roles[]
        query['$or'] = [{'role': role}, {'roles': role}]
    if isAvailable is not None:
        query['isAvailable'] = isAvailable
    
    users = await db.users.find(query, {'_id': 0, 'password': 0}).to_list(1000)
    return users

@router.get("/{user_id}", response_model=dict)
async def get_user(
    user_id: str,
    _: dict = Depends(verify_user_access),
):
    """Obtener un usuario específico (requiere auth y que sea el propio usuario o admin)"""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

@router.put("/{user_id}/availability", response_model=dict)
async def update_availability(
    user_id: str,
    body: dict = Body(...),
    _: dict = Depends(verify_user_access),
):
    """
    Actualizar disponibilidad del proveedor.
    También actualiza tipo de maquinaria y ubicación si se proporcionan.
    """
    update_data = {
        'isAvailable': body.get('isAvailable', False)
    }
    
    if body.get('machineryType'):
        update_data['machineryType'] = body['machineryType']
    
    if body.get('location'):
        update_data['location'] = body['location']
    
    result = await db.users.update_one(
        {'id': user_id},
        {'$set': update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    return {
        'message': 'Disponibilidad actualizada',
        **update_data
    }

@router.put("/{user_id}/profile", response_model=dict)
async def update_profile(
    user_id: str,
    body: dict = Body(...),
    _: dict = Depends(verify_user_access),
):
    """Actualizar perfil del usuario"""
    allowed_fields = ['name', 'phone', 'hourlyRate', 'machinery', 'location']
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")
    
    result = await db.users.update_one(
        {'id': user_id},
        {'$set': update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    return {'message': 'Perfil actualizado', **update_data}


@router.post("/become-provider", response_model=dict)
async def become_provider(
    body: BecomeProviderBody,
    current_user: dict = Depends(get_current_user),
):
    """
    Convierte la cuenta autenticada (mismo teléfono / OTP) en proveedor sin crear otro usuario.
    No usa POST /auth/register: identidad única por teléfono; el proveedor es un rol más.
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Sesión inválida")

    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    roles = _user_roles_list(doc)
    if "provider" in roles:
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        return {
            "id": user_id,
            "message": "Tu cuenta ya tiene rol de proveedor.",
            "roles": roles,
            "phoneVerified": bool(fresh.get("phoneVerified")) if fresh else False,
            "already_provider": True,
            "providerData": fresh.get("providerData") if fresh else None,
        }

    email_low = str(body.email).strip().lower()
    other = await db.users.find_one({"email": email_low})
    if other and other.get("id") != user_id:
        raise HTTPException(
            status_code=409,
            detail="Este correo ya está registrado en otra cuenta. Usa otro correo o inicia sesión.",
        )

    p9_doc = _phone9_digits(doc.get("phone") or "")
    if len(p9_doc) != 9:
        raise HTTPException(
            status_code=400,
            detail="Tu cuenta no tiene celular asociado. Completa el flujo con OTP primero.",
        )
    if body.celular:
        p9_req = _phone9_digits(str(body.celular))
        if len(p9_req) == 9 and p9_req != p9_doc:
            raise HTTPException(
                status_code=400,
                detail="El celular no coincide con el de tu cuenta.",
            )

    new_roles = list(dict.fromkeys(roles + ["provider"]))
    set_fields: dict = {
        "email": email_low,
        "password": _hash_password(body.password),
        "roles": new_roles,
        "role": "provider",
        "isAvailable": True,
        "phoneVerified": True,
    }
    if not doc.get("provider_role"):
        set_fields["provider_role"] = "super_master"

    pd_in = body.provider_data if isinstance(body.provider_data, dict) else {}
    if pd_in:
        prev_pd = doc.get("providerData") if isinstance(doc.get("providerData"), dict) else {}
        set_fields["providerData"] = {**prev_pd, **pd_in}
    nc = (pd_in.get("nombre_completo") or "").strip() if pd_in else ""
    if nc:
        set_fields["name"] = nc
    elif pd_in.get("nombre") or pd_in.get("apellido"):
        set_fields["name"] = (
            f"{str(pd_in.get('nombre') or '').strip()} {str(pd_in.get('apellido') or '').strip()}".strip()
        )

    await db.users.update_one({"id": user_id}, {"$set": set_fields})

    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    roles_out = _user_roles_list(fresh) if fresh else new_roles
    return {
        "id": user_id,
        "message": "Ahora eres proveedor en MAQGO.",
        "roles": roles_out,
        "phoneVerified": bool(fresh.get("phoneVerified")) if fresh else True,
        "already_provider": False,
        "providerData": fresh.get("providerData") if fresh else set_fields.get("providerData"),
    }


@router.patch("/{user_id}", response_model=dict)
async def patch_user(
    user_id: str,
    body: dict = Body(...),
    _: dict = Depends(verify_user_access),
):
    """
    Actualizar campos específicos del usuario (uso flexible para onboarding proveedor).
    Solo permite algunos campos conocidos para evitar sobreescrituras accidentales.
    - `add_provider` + `password`: upgrade cliente→proveedor sobre el mismo user_id (sesión JWT).
    - `celular` (9 dígitos): debe coincidir con el teléfono de la cuenta si se envía con add_provider.
    """
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    allowed_fields = {
        'providerData',
        'machineData',
        'operators',
        'onboarding_completed',
        'available',
        'isAvailable',
        'location',
        'machineryType',
        'name',
        'email',
        'rut',
        'razon_social',
    }
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    plain_password = body.get("password")
    add_provider = bool(body.get("add_provider"))

    if "email" in update_data and update_data["email"] is not None:
        em = str(update_data["email"]).strip().lower()
        update_data["email"] = em if em else None
        if update_data["email"]:
            other = await db.users.find_one({"email": update_data["email"]})
            if other and other.get("id") != user_id:
                raise HTTPException(
                    status_code=409,
                    detail="Este correo ya está registrado. Usa otro correo o inicia sesión.",
                )

    if plain_password is not None and str(plain_password).strip():
        update_data["password"] = _hash_password(str(plain_password))

    if add_provider:
        p9_doc = _phone9_digits(doc.get("phone") or "")
        if len(p9_doc) != 9:
            raise HTTPException(
                status_code=400,
                detail="Tu cuenta no tiene celular asociado. Completa el registro con OTP primero.",
            )
        cel_raw = body.get("celular") or body.get("phone")
        if cel_raw:
            p9_req = _phone9_digits(str(cel_raw))
            if len(p9_req) == 9 and p9_req != p9_doc:
                raise HTTPException(
                    status_code=400,
                    detail="El celular no coincide con tu cuenta.",
                )
        roles = _user_roles_list(doc)
        if "provider" not in roles:
            roles = list(dict.fromkeys(roles + ["provider"]))
        update_data["roles"] = roles
        update_data["role"] = "provider"
        if not doc.get("provider_role"):
            update_data["provider_role"] = "super_master"
        update_data["isAvailable"] = True
        update_data["phoneVerified"] = True

    # Para matching: si viene machineData con machineryType, sincronizar a nivel raíz
    if 'machineData' in update_data and isinstance(update_data['machineData'], dict):
        mt = update_data['machineData'].get('machineryType')
        if mt:
            update_data['machineryType'] = mt

    # Mantener compatibilidad: si viene "available", también actualizar "isAvailable"
    if 'available' in body:
        avail = bool(body['available'])
        update_data['available'] = avail
        update_data['isAvailable'] = avail

    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")

    result = await db.users.update_one(
        {'id': user_id},
        {'$set': update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    roles_out = _user_roles_list(fresh) if fresh else []
    safe = {k: v for k, v in update_data.items() if k != "password"}
    return {
        "id": user_id,
        "message": "Usuario actualizado",
        "roles": roles_out,
        "phoneVerified": bool(fresh.get("phoneVerified")) if fresh else False,
        **safe,
    }

def _provider_query(machinery_type=None, **extra):
    """Query para usuarios que son proveedores (role o roles incluye 'provider')."""
    q = {"$or": [{"role": "provider"}, {"roles": "provider"}], "isAvailable": True, **extra}
    if machinery_type:
        q["machineryType"] = machinery_type
    return q


@router.get("/providers/available", response_model=List[dict])
async def get_available_providers(machineryType: Optional[str] = None):
    """Obtener proveedores disponibles, opcionalmente filtrados por tipo de maquinaria"""
    query = _provider_query(machineryType=machineryType)
    providers = await db.users.find(query, {'_id': 0}).to_list(100)
    return providers


# ========== RBAC: Gestión de Operadores ==========

@router.post("/{owner_id}/operators", response_model=dict)
async def create_operator(
    owner_id: str,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Crear un nuevo operador bajo un dueño.
    Solo el dueño puede crear operadores.
    """
    # Verificar que el owner existe y es dueño
    owner = await db.users.find_one({'id': owner_id}, {'_id': 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Dueño no encontrado")
    
    if owner.get('provider_role') == 'operator':
        raise HTTPException(status_code=403, detail="Los operadores no pueden crear otros operadores")
    
    # Crear operador
    import uuid
    operator_id = str(uuid.uuid4())
    
    operator_data = {
        'id': operator_id,
        'role': 'provider',
        'provider_role': 'operator',
        'owner_id': owner_id,
        'name': body.get('name'),
        'email': body.get('email', ''),
        'phone': body.get('phone'),
        'rut': body.get('rut'),
        'isAvailable': False,
        'rating': 5.0,
        'totalRatings': 0,
        'totalServices': 0,
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(operator_data)
    
    # Retornar sin _id
    result = operator_data.copy()
    result.pop('_id', None)
    
    return {
        'success': True,
        'message': f"Operador {body.get('name')} creado exitosamente",
        'operator': result
    }


@router.get("/{owner_id}/operators", response_model=dict)
async def get_operators(owner_id: str, current_user: dict = Depends(get_current_user)):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Obtener todos los operadores de un dueño.
    """
    operators = await db.users.find(
        {
            'owner_id': owner_id,
            'provider_role': 'operator'
        },
        {'_id': 0, 'password': 0}
    ).to_list(100)
    
    return {
        'operators': operators,
        'count': len(operators)
    }


@router.delete("/{owner_id}/operators/{operator_id}", response_model=dict)
async def delete_operator(
    owner_id: str,
    operator_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    """
    Eliminar un operador.
    Solo el dueño puede eliminar sus operadores.
    """
    # Verificar que el operador pertenece al dueño
    operator = await db.users.find_one({
        'id': operator_id,
        'owner_id': owner_id,
        'provider_role': 'operator'
    })
    
    if not operator:
        raise HTTPException(status_code=404, detail="Operador no encontrado o no te pertenece")
    
    await db.users.delete_one({'id': operator_id})
    
    return {
        'success': True,
        'message': f"Operador eliminado"
    }


@router.get("/{user_id}/role", response_model=dict)
async def get_user_role(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    AccessPolicy.assert_self_or_admin(current_user, user_id)
    """
    Obtener el rol y permisos de un usuario.
    Útil para el frontend para determinar qué mostrar.
    
    Roles:
    - super_master (Titular): Dueño de la empresa, puede invitar Masters y Operadores
    - master (Gerente): Ve todo pero NO puede invitar Masters
    - operator (Operador): Solo ve datos operacionales
    - owner: Compatibilidad con datos antiguos (igual a super_master)
    """
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Obtener el rol del proveedor
    provider_role = user.get('provider_role')
    
    # Normalizar roles: owner -> super_master, None -> super_master (para usuarios antiguos)
    if provider_role in ['owner', None]:
        provider_role = 'super_master'
    
    # Determinar permisos según rol
    is_super_master = provider_role == 'super_master'
    is_master = provider_role == 'master'
    is_operator = provider_role == 'operator'
    has_full_visibility = is_super_master or is_master
    
    response = {
        'user_id': user_id,
        'role': user.get('role'),  # 'client' o 'provider'
        'provider_role': provider_role,
        'owner_id': user.get('owner_id') if not is_super_master else None,
        'permissions': {
            'can_view_finances': has_full_visibility,
            'can_view_invoices': has_full_visibility,
            'can_upload_invoice': has_full_visibility,
            'can_manage_operators': has_full_visibility,
            'can_manage_masters': is_super_master,  # Solo Titular puede invitar Masters
            'can_view_bank_data': has_full_visibility,
            'can_accept_requests': True,  # Todos pueden aceptar
            'can_view_services': True
        }
    }
    
    # Si es operador o master, obtener datos del dueño
    if not is_super_master and user.get('owner_id'):
        owner = await db.users.find_one({'id': user.get('owner_id')}, {'_id': 0, 'name': 1})
        if owner:
            response['owner_name'] = owner.get('name')
    
    return response
