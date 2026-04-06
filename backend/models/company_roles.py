"""
MAQGO - Sistema de Roles Empresariales
======================================

JERARQUÍA:
1. SUPER_MASTER (Dueño original)
   - Primer celular registrado de la empresa
   - Visibilidad total (operaciones + finanzas)
   - Único que puede invitar otros Masters
   - Gestiona operadores
   
2. MASTER (Gerentes)
   - Invitado por el Super Master
   - Visibilidad total (operaciones + finanzas)  
   - Puede gestionar operadores
   - NO puede invitar otros Masters
   
3. OPERATOR (Operadores)
   - Invitado por cualquier Master
   - Solo ve datos operacionales
   - NO ve finanzas

REGLAS:
- Solo el SUPER_MASTER puede crear otros MASTER
- Cualquier MASTER puede crear OPERATOR
- El SUPER_MASTER no puede ser eliminado
- Debe haber siempre al menos un SUPER_MASTER por empresa
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel

class CompanyRole(str, Enum):
    SUPER_MASTER = "super_master"  # Dueño original
    MASTER = "master"              # Gerentes
    OPERATOR = "operator"          # Operadores

# Permisos por rol
ROLE_PERMISSIONS = {
    CompanyRole.SUPER_MASTER: {
        "view_operations": True,
        "view_finances": True,
        "view_all_services": True,
        "manage_operators": True,
        "invite_masters": True,      # ÚNICO que puede
        "invite_operators": True,
        "delete_masters": True,
        "edit_company_data": True,
        "upload_invoices": True,
    },
    CompanyRole.MASTER: {
        "view_operations": True,
        "view_finances": True,
        "view_all_services": True,
        "manage_operators": True,
        "invite_masters": False,     # NO puede
        "invite_operators": True,
        "delete_masters": False,
        "edit_company_data": False,
        "upload_invoices": True,
    },
    CompanyRole.OPERATOR: {
        "view_operations": True,
        "view_finances": False,      # NO ve
        "view_all_services": False,  # Solo los suyos
        "manage_operators": False,
        "invite_masters": False,
        "invite_operators": False,
        "delete_masters": False,
        "edit_company_data": False,
        "upload_invoices": False,
    }
}


class CompanyMember(BaseModel):
    """Modelo de miembro de empresa"""
    id: str
    company_id: str
    name: str
    phone: str
    rut: str
    role: CompanyRole
    email: Optional[str] = None
    invited_by: Optional[str] = None  # ID del que lo invitó
    is_active: bool = True
    created_at: datetime = None
    
    class Config:
        use_enum_values = True


def get_permissions(role: CompanyRole) -> dict:
    """Obtener permisos de un rol"""
    return ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS[CompanyRole.OPERATOR])


def can_invite_master(user_role: CompanyRole) -> bool:
    """Verificar si puede invitar masters"""
    return user_role == CompanyRole.SUPER_MASTER


def can_invite_operator(user_role: CompanyRole) -> bool:
    """Verificar si puede invitar operadores"""
    return user_role in [CompanyRole.SUPER_MASTER, CompanyRole.MASTER]


def can_view_finances(user_role: CompanyRole) -> bool:
    """Verificar si puede ver finanzas"""
    return user_role in [CompanyRole.SUPER_MASTER, CompanyRole.MASTER]


def can_manage_operators(user_role: CompanyRole) -> bool:
    """Verificar si puede gestionar operadores"""
    return user_role in [CompanyRole.SUPER_MASTER, CompanyRole.MASTER]


def get_role_display_name(role: CompanyRole) -> str:
    """Nombre amigable del rol"""
    names = {
        CompanyRole.SUPER_MASTER: "Dueño",
        CompanyRole.MASTER: "Gerente",
        CompanyRole.OPERATOR: "Operador"
    }
    return names.get(role, "Usuario")


def get_role_badge_color(role: CompanyRole) -> str:
    """Color del badge según rol"""
    colors = {
        CompanyRole.SUPER_MASTER: "#EC6819",  # Naranja MAQGO
        CompanyRole.MASTER: "#00BCD4",         # Cyan
        CompanyRole.OPERATOR: "#4CAF50"        # Verde
    }
    return colors.get(role, "#888")
