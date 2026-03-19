from fastapi import APIRouter, HTTPException, Body, Depends
from typing import List, Optional
from auth_dependency import verify_user_access
from models.user import User, UserCreate, ProviderAvailabilityUpdate
from motor.motor_asyncio import AsyncIOMotorClient
import os
import bcrypt
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


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

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo_db')]

def _user_roles_list(doc: dict) -> list:
    """Lista de roles (compatibilidad: si no hay 'roles', usar 'role')."""
    roles = doc.get("roles")
    if roles:
        return list(roles)
    r = doc.get("role")
    return [r] if r else []


@router.post("", response_model=dict)
async def create_user(user: UserCreate):
    """Crear nuevo usuario (cliente o proveedor). Si el email ya existe, se agrega el rol a la misma cuenta."""
    user_data = user.model_dump()
    plain_password = user_data.pop("password", None)
    existing = await db.users.find_one({"email": user_data["email"]})

    if existing:
        roles = _user_roles_list(existing)
        new_role = user_data.get("role")
        if new_role in roles:
            # Mismo rol: devolver el usuario existente (evitar duplicados)
            if plain_password:
                await db.users.update_one(
                    {"email": user_data["email"]},
                    {"$set": {"password": _hash_password(plain_password)}},
                )
            fresh = await db.users.find_one({"email": user_data["email"]}, {"_id": 0, "password": 0})
            result = dict(fresh or existing)
            result.pop("_id", None)
            result.pop("password", None)
            await _add_session_token(result)
            return result
        new_roles = list(dict.fromkeys(roles + [new_role]))
        update = {"roles": new_roles}
        if user_data.get("name"):
            update["name"] = user_data["name"]
        if plain_password:
            update["password"] = _hash_password(plain_password)
        if new_role == "provider":
            if user_data.get('hourlyRate') is not None:
                update["hourlyRate"] = user_data["hourlyRate"]
            else:
                update["hourlyRate"] = 20000.0
            update["isAvailable"] = False
        await db.users.update_one(
            {"email": user_data["email"]},
            {"$set": update}
        )
        result = await db.users.find_one({"email": user_data["email"]}, {"_id": 0, "password": 0})
        await _add_session_token(result)
        return result

    if user_data.get('hourlyRate') is None:
        user_data['hourlyRate'] = 20000.0 if user_data.get('role') == 'provider' else 0.0
    user_data["roles"] = [user_data["role"]]
    user_obj = User(**user_data)
    doc = user_obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    if plain_password:
        doc["password"] = _hash_password(plain_password)
    await db.users.insert_one(doc)
    result = doc.copy()
    result.pop('_id', None)
    await _add_session_token(result)
    return result

@router.get("", response_model=List[dict])
async def get_users(role: Optional[str] = None, isAvailable: Optional[bool] = None):
    """Obtener usuarios con filtros opcionales"""
    query = {}
    if role:
        query['role'] = role
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


@router.patch("/{user_id}", response_model=dict)
async def patch_user(
    user_id: str,
    body: dict = Body(...),
    _: dict = Depends(verify_user_access),
):
    """
    Actualizar campos específicos del usuario (uso flexible para onboarding proveedor).
    Solo permite algunos campos conocidos para evitar sobreescrituras accidentales.
    """
    allowed_fields = {
        'providerData',
        'machineData',
        'operators',
        'onboarding_completed',
        'available',
        'isAvailable',
        'location',
        'machineryType',
    }
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

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

    return {'message': 'Usuario actualizado', **update_data}

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
async def create_operator(owner_id: str, body: dict = Body(...)):
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
async def get_operators(owner_id: str):
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
async def delete_operator(owner_id: str, operator_id: str):
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
async def get_user_role(user_id: str):
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
