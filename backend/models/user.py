from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid

class ProviderMachinery(BaseModel):
    """Maquinaria del proveedor"""
    type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    licensePlate: Optional[str] = None
    hourlyRate: float = 0.0

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # 'client' | 'provider' (rol principal; si hay roles[], es el primero)
    roles: Optional[List[str]] = None  # Si está definido: usuario puede ser cliente y/o proveedor
    name: str
    email: str
    phone: Optional[str] = None
    
    # Rating y reputación
    rating: float = 5.0
    totalRatings: int = 0
    
    # Solo para proveedores
    isAvailable: bool = False
    machineryType: Optional[str] = None
    machinery: Optional[ProviderMachinery] = None
    hourlyRate: float = 20000.0  # Tarifa por hora en CLP
    
    # Ubicación del proveedor (para matching)
    location: Optional[dict] = None  # {lat, lng}
    
    # === RBAC: Sistema de Roles Jerárquicos ===
    # provider_role: 
    #   'super_master' - Dueño de la empresa (primer usuario, puede invitar masters)
    #   'master' - Gerente con visibilidad total pero NO puede invitar masters
    #   'operator' - Solo ejecuta servicios
    provider_role: Optional[Literal['super_master', 'master', 'operator']] = 'super_master'
    # Si es master u operador, referencia al ID del super_master
    owner_id: Optional[str] = None
    # Permisos específicos (definidos por el super_master)
    operator_permissions: Optional[dict] = None
    # RUT del usuario (obligatorio para operadores)
    rut: Optional[str] = None
    
    # Estadísticas
    totalServices: int = 0
    acceptedServices: int = 0
    rejectedServices: int = 0
    responseTimeAvg: float = 0.0  # Tiempo promedio de respuesta en segundos
    
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    role: str
    name: str
    email: str
    phone: Optional[str] = None
    machineryType: Optional[str] = None
    hourlyRate: Optional[float] = None
    location: Optional[dict] = None
    # RBAC fields
    provider_role: Optional[Literal['super_master', 'master', 'operator']] = 'super_master'
    owner_id: Optional[str] = None
    rut: Optional[str] = None

class ProviderAvailabilityUpdate(BaseModel):
    isAvailable: bool
    machineryType: Optional[str] = None
    location: Optional[dict] = None

class OperatorCreate(BaseModel):
    """Modelo para crear un nuevo operador bajo un dueño"""
    name: str
    phone: str
    email: Optional[str] = None
    rut: Optional[str] = None
    
class OperatorResponse(BaseModel):
    """Datos del operador visibles para el dueño"""
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    rut: Optional[str] = None
    isAvailable: bool = False
    totalServices: int = 0
    rating: float = 5.0
