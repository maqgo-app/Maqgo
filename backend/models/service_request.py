from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime, timezone
import uuid

class Location(BaseModel):
    lat: float
    lng: float
    address: str = ""

class MatchingAttempt(BaseModel):
    """Registro de cada intento de matching"""
    providerId: str
    sentAt: str
    expiresAt: str
    status: str = 'pending'  # pending | accepted | rejected | expired

class ServiceRequest(BaseModel):
    """
    Estados del ServiceRequest (MVP v1):
    - created: Solicitud creada, pendiente validación de pago
    - matching: Buscando proveedor activamente
    - offer_sent: Oferta enviada a un proveedor específico
    - confirmed: Proveedor aceptó, pago procesado
    - in_progress: Servicio en ejecución
    - last_30: Últimos 30 minutos del servicio
    - finished: Servicio completado (automático)
    - rated: Ambas partes calificaron
    - no_providers_available: No hay proveedores disponibles
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Participantes
    clientId: str
    clientName: Optional[str] = "Cliente MAQGO"
    providerId: Optional[str] = None
    providerName: Optional[str] = None  # Empresa (interno/facturas)
    providerOperatorName: Optional[str] = None  # Operador (lo que ve el cliente)
    
    # Estados del matching
    status: str = 'created'
    currentOfferId: Optional[str] = None
    offeredProviderIds: Optional[List[str]] = None  # Varios a la vez; el primero que acepta gana
    offerSentAt: Optional[str] = None
    offerExpiresAt: Optional[str] = None
    matchingAttempts: List[dict] = []
    attemptCount: int = 0
    maxAttempts: int = 5
    offerTimeoutSeconds: int = 90
    
    # Detalles del servicio
    location: Location
    machineryType: Optional[str] = None
    
    # Jornada (8h trabajo + 1h colación = 9h total)
    workdayAccepted: bool = False  # Cliente debe aceptar explícitamente
    workdayHours: int = 8
    breakHours: int = 1
    totalDurationHours: int = 9
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    last30Time: Optional[str] = None  # Para el scheduler
    
    # Llegada (marcada manualmente por proveedor)
    arrivalDetectedAt: Optional[str] = None
    arrivalLocation: Optional[dict] = None  # { lat, lng, capturedAt }
    autoStartedAt: Optional[str] = None

    # Eventos de auditoría (None por defecto; inicializar [] al crear)
    events: Optional[List[dict]] = None

    # Cierre automático
    finishedAt: Optional[str] = None
    autoFinished: bool = False
    finalLocation: Optional[dict] = None  # GPS final
    
    # Pagos y Comisiones
    basePrice: float = 0.0  # Precio base del servicio
    totalAmount: float = 0.0  # Total que paga el cliente (base + 10%)
    clientCommission: float = 0.0  # 10% del precio base
    providerCommission: float = 0.0  # 10% del precio base
    providerEarnings: float = 0.0  # Lo que recibe el proveedor (base - 10%)
    maqgoEarnings: float = 0.0  # Ganancia MAQGO (10% cliente + 10% proveedor = 20%)
    
    paymentStatus: str = 'none'  # none | validated | charged | failed | refunded
    paymentId: Optional[str] = None
    chargedAt: Optional[str] = None
    chargedAmount: Optional[float] = None
    
    # Tipo de reserva
    reservationType: str = 'immediate'  # immediate | scheduled
    scheduledDate: Optional[str] = None
    
    # Timestamps
    createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    confirmedAt: Optional[str] = None
    last30TriggeredAt: Optional[str] = None

    # Cancelación
    late_fee_amount: float = 0
    cancelationFee: Optional[float] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[str] = None

class ServiceRequestCreate(BaseModel):
    clientId: str
    clientName: Optional[str] = "Cliente MAQGO"
    clientEmail: Optional[str] = None  # Para crear/actualizar usuario si no existe (cobro OneClick)
    selectedProviderId: Optional[str] = None  # Un solo proveedor (compatibilidad)
    selectedProviderIds: Optional[List[str]] = None  # Varios: se notifica a todos, el primero en aceptar gana
    location: Location
    basePrice: float = 150000  # Precio base del servicio (solo servicio, sin transporte)
    transportFee: float = 0  # Costo de transporte
    totalAmount: Optional[float] = None  # Total confirmado por el cliente (con IVA si needsInvoice)
    needsInvoice: Optional[bool] = None  # Si el cliente pidió factura (cobro con IVA)
    machineryType: Optional[str] = None
    workdayAccepted: bool = True  # Cliente debe aceptar la jornada
    reservationType: str = 'immediate'  # immediate | scheduled
    scheduledDate: Optional[str] = None


# Configuración de comisiones MAQGO con IVA
COMMISSION_CONFIG = {
    'IVA_RATE': 0.19,  # 19% IVA Chile
    'CLIENT_COMMISSION': 0.10,  # 10% Comisión MAQGO al cliente
    'PROVIDER_COMMISSION': 0.10,  # 10% Comisión MAQGO al proveedor
}

def calculate_commissions(base_price: float, transport_fee: float = 0) -> dict:
    """
    Calcula el desglose completo de comisiones con IVA
    
    Modelo:
    - Cliente paga: Base + 10% comisión + 19% IVA de la comisión
    - Proveedor recibe: Base - 10% comisión - 19% IVA de la comisión
    - MAQGO gana: Ambas comisiones + IVA
    """
    IVA = COMMISSION_CONFIG['IVA_RATE']
    total_base = base_price + transport_fee
    
    # Cálculos para el CLIENTE
    client_commission = round(total_base * COMMISSION_CONFIG['CLIENT_COMMISSION'])
    client_commission_iva = round(client_commission * IVA)
    total_client = total_base + client_commission + client_commission_iva
    
    # Cálculos para el PROVEEDOR
    provider_commission = round(total_base * COMMISSION_CONFIG['PROVIDER_COMMISSION'])
    provider_commission_iva = round(provider_commission * IVA)
    provider_earnings = total_base - provider_commission - provider_commission_iva
    
    # Cálculos para MAQGO
    maqgo_commissions = client_commission + provider_commission
    maqgo_iva = client_commission_iva + provider_commission_iva
    maqgo_total = maqgo_commissions + maqgo_iva
    
    return {
        'basePrice': base_price,
        'transportFee': transport_fee,
        'totalBase': total_base,
        
        # Lo que paga el cliente
        'clientCommission': client_commission,
        'clientCommissionIVA': client_commission_iva,
        'totalAmount': total_client,  # Total que paga el cliente
        
        # Lo que recibe el proveedor
        'providerCommission': provider_commission,
        'providerCommissionIVA': provider_commission_iva,
        'providerEarnings': provider_earnings,  # Total que recibe el proveedor
        
        # Ganancia MAQGO
        'maqgoCommissions': maqgo_commissions,
        'maqgoIVA': maqgo_iva,
        'maqgoEarnings': maqgo_total,
    }
