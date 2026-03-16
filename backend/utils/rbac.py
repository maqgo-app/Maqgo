"""
MAQGO - Role-Based Access Control (RBAC)
Sistema de permisos para Super Master/Master/Operador

Jerarquía de roles:
- SUPER_MASTER (super_master): Dueño de la empresa. Puede invitar Masters y Operadores.
- MASTER (master): Gerente. Ve TODO (servicios, finanzas, facturas, operadores) pero NO puede invitar Masters.
- OPERADOR (operator): Solo ve datos operacionales del servicio

Reglas de negocio:
- SUPER_MASTER y MASTER: Ven TODO (servicios, finanzas, facturas, comisiones, operadores)
- OPERADOR: Solo ve datos operacionales del servicio
  - Ubicación del servicio
  - Tipo y duración del trabajo
  - Valor TOTAL del servicio (incentivo para aceptar)
  - NO ve: comisiones, facturas, historial de pagos, datos bancarios
"""
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase

# Campos que el operador NO puede ver
OPERATOR_HIDDEN_FIELDS = [
    'commission_client',
    'commission_provider', 
    'commission_maqgo',
    'net_total',
    'invoice_amount',
    'invoice_total',
    'invoice_number',
    'invoice_url',
    'client_billing',
    'payment_status',
    'payment_date',
    'bank_data',
    'maqgo_earnings'
]

# Campos que el operador SÍ puede ver del servicio
OPERATOR_VISIBLE_FIELDS = [
    '_id',
    'id',
    'status',
    'machinery_type',
    'hours',
    'location',
    'location_name',
    'latitude',
    'longitude',
    'client_name',  # Solo nombre, no datos completos
    'client_phone', # Para contacto durante servicio activo
    'created_at',
    'scheduled_date',
    'started_at',
    'finished_at',
    'provider_id',
    'operator_id',
    'total_price',  # Valor total (incentivo) - sin desglose
    'distance',
    'eta_minutes'
]


def is_super_master(user: dict) -> bool:
    """Verifica si el usuario es Super Master (dueño de la empresa)"""
    role = user.get('provider_role', 'super_master')
    # Para compatibilidad con datos antiguos, 'owner' se trata como 'super_master'
    return role in ['super_master', 'owner']


def is_master(user: dict) -> bool:
    """Verifica si el usuario es Master (gerente)"""
    return user.get('provider_role') == 'master'


def is_owner_or_master(user: dict) -> bool:
    """Verifica si el usuario es Super Master o Master (tiene visibilidad completa)"""
    role = user.get('provider_role', 'super_master')
    return role in ['super_master', 'master', 'owner']


def is_operator(user: dict) -> bool:
    """Verifica si el usuario es un operador"""
    return user.get('provider_role') == 'operator'


def get_company_owner_id(user: dict) -> str:
    """
    Obtiene el ID del Super Master (dueño de la empresa).
    - Si es super_master, retorna su propio ID.
    - Si es master u operador, retorna owner_id.
    """
    if is_super_master(user):
        return user.get('id')
    return user.get('owner_id')


def filter_service_for_operator(service: dict) -> dict:
    """
    Filtra un servicio para mostrar solo datos operacionales al operador.
    El operador ve el valor total como incentivo pero no el desglose financiero.
    """
    filtered = {}
    for key in OPERATOR_VISIBLE_FIELDS:
        if key in service:
            filtered[key] = service[key]
    
    # Anonimizar nombre del cliente (solo primer nombre + inicial)
    if 'client_name' in filtered and filtered['client_name']:
        parts = filtered['client_name'].split(' ')
        if len(parts) >= 2:
            filtered['client_name'] = f"{parts[0]} {parts[1][0]}."
        else:
            filtered['client_name'] = parts[0]
    
    return filtered


def filter_services_for_role(services: List[dict], user: dict) -> List[dict]:
    """
    Filtra lista de servicios según el rol del usuario.
    - Super Master / Master: ve todo
    - Operator: solo datos operacionales
    """
    if is_owner_or_master(user):
        return services
    
    return [filter_service_for_operator(s) for s in services]


async def get_team_members(db: AsyncIOMotorDatabase, owner_id: str) -> dict:
    """
    Obtiene todos los miembros del equipo de una empresa.
    Retorna masters y operadores separados.
    """
    # Obtener masters
    masters = await db.users.find(
        {
            'role': 'provider',
            'provider_role': 'master',
            'owner_id': owner_id
        },
        {'_id': 0, 'password': 0}
    ).to_list(100)
    
    # Obtener operadores
    operators = await db.users.find(
        {
            'role': 'provider',
            'provider_role': 'operator',
            'owner_id': owner_id
        },
        {'_id': 0, 'password': 0}
    ).to_list(100)
    
    return {
        'masters': masters,
        'operators': operators
    }


async def can_view_service(db: AsyncIOMotorDatabase, user: dict, service: dict) -> bool:
    """
    Verifica si un usuario puede ver un servicio específico.
    - Super Master / Master: puede ver todos los servicios de su empresa
    - Operator: solo servicios asignados a él
    """
    if is_owner_or_master(user):
        # El dueño/master puede ver servicios donde él o sus operadores participaron
        owner_id = get_company_owner_id(user)
        if service.get('provider_id') == owner_id:
            return True
        if service.get('owner_id') == owner_id:
            return True
        # Verificar si el operador del servicio pertenece a esta empresa
        operator_id = service.get('operator_id')
        if operator_id:
            operator = await db.users.find_one({'id': operator_id})
            if operator and operator.get('owner_id') == owner_id:
                return True
        return False
    else:
        # El operador solo ve servicios asignados a él
        return service.get('operator_id') == user.get('id')


def get_dashboard_data_for_role(data: dict, user: dict) -> dict:
    """
    Filtra datos del dashboard según rol.
    - Super Master / Master: ve métricas financieras completas
    - Operator: solo ve servicios completados y pendientes (sin montos)
    """
    if is_owner_or_master(user):
        return data
    
    # Para operador, ocultar datos financieros
    filtered = {
        'services_count': data.get('services_count', 0),
        'pending_services': data.get('pending_services', 0),
        'completed_services': data.get('completed_services', 0),
        'rating': data.get('rating', 5.0),
        'is_available': data.get('is_available', False)
    }
    return filtered


# Permisos por acción
PERMISSIONS = {
    'super_master': [
        'view_all_services',
        'view_financial_data',
        'view_invoices',
        'upload_invoice',
        'manage_operators',
        'manage_masters',  # Solo super_master puede invitar masters
        'view_bank_data',
        'edit_pricing',
        'accept_requests',
        'view_dashboard'
    ],
    'master': [
        'view_all_services',
        'view_financial_data',
        'view_invoices',
        'upload_invoice',
        'manage_operators',  # Master puede gestionar operadores
        # 'manage_masters' - NO tiene este permiso
        'view_bank_data',
        'edit_pricing',
        'accept_requests',
        'view_dashboard'
    ],
    'owner': [  # Compatibilidad con datos antiguos (igual a super_master)
        'view_all_services',
        'view_financial_data',
        'view_invoices',
        'upload_invoice',
        'manage_operators',
        'manage_masters',
        'view_bank_data',
        'edit_pricing',
        'accept_requests',
        'view_dashboard'
    ],
    'operator': [
        'view_assigned_services',
        'accept_requests',  # Si el dueño lo permite
        'update_service_status',
        'view_own_rating'
    ]
}


def has_permission(user: dict, permission: str) -> bool:
    """Verifica si el usuario tiene un permiso específico"""
    role = user.get('provider_role', 'super_master')
    
    # Verificar permisos base del rol
    if permission in PERMISSIONS.get(role, []):
        return True
    
    # Verificar permisos personalizados del operador
    if is_operator(user):
        custom_permissions = user.get('operator_permissions', {})
        return custom_permissions.get(permission, False)
    
    return False


def can_invite_masters(user: dict) -> bool:
    """Verifica si el usuario puede invitar Masters (solo Super Master)"""
    return is_super_master(user)


def can_invite_operators(user: dict) -> bool:
    """Verifica si el usuario puede invitar Operadores (Super Master o Master)"""
    return is_owner_or_master(user)
