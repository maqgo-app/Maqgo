# MAQGO - Constantes de Reglas de Negocio
# Estas constantes definen la lógica de cancelación y reclamos

# =============================================================================
# CONSTANTES GLOBALES - Cancelación cliente (ventana de llegada)
# =============================================================================

ARRIVAL_GRACE_PERIOD_MINUTES = 90
LATE_CANCELLATION_FEE_PERCENT = 0.20

# Timeout: confirmed sin llegada → cancelar automático (evitar servicios muertos).
CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES = 120  # 2 horas después de confirmed/scheduled

# Regla de negocio (no-show): Si han pasado 60 min desde la hora indicada (ETA) y el operador
# no ha informado nada en ruta, el cliente puede cancelar sin cargo; si sí informó en ruta, a los ETA+90 min.
# Backend además cancela/reembolsa automático a las 2 h sin llegada.

# Estados permitidos del servicio (service_request)
VALID_STATES = [
    "pending_provider",      # matching, offer_sent
    "accepted",             # confirmed
    "en_route",             # confirmed, proveedor en camino
    "in_progress",
    "last_30",
    "finished",
    "cancelled_client",
    "cancelled_provider",
    "cancelled_late_window",
    "cancelled_no_arrival",  # timeout: proveedor no marcó llegada
    "expired",
    "payment_failed",
]

# =============================================================================
# CANCELACIÓN POR CLIENTE - Política Escalonada
# =============================================================================

# Ventana de cancelación gratuita (en minutos)
FREE_CANCELLATION_WINDOW_MINUTES = 60  # 1 hora después de aceptar

# Porcentajes de penalización según estado del servicio
# Basado en el valor NETO del servicio
CANCELLATION_PERCENTAGES = {
    "pending": 0,           # Sin asignación = sin cargo
    "accepted": 0,          # Dentro de 1 hora = gratis
    "accepted_expired": 20, # > 1 hora, antes de salir = 20%
    "en_route": 40,         # Operador en camino = 40%
    "arrived": 60,          # Operador en obra = 60%
    "in_progress": 100,     # Servicio iniciado = no cancelable
}

# Distribución de la penalización
CANCELLATION_DISTRIBUTION = {
    "provider_percent": 85,   # 85% va al proveedor (después de comisión MAQGO)
    "maqgo_percent": 10,      # 10% comisión MAQGO cliente (+IVA)
}

def calculate_cancellation_fee(service_status: str, net_service_value: int, minutes_since_accepted: int = 0) -> dict:
    """
    Calcula el cargo por cancelación basado en el estado del servicio.
    
    POLÍTICA MAQGO:
    - < 1 hora después de aceptar: GRATIS
    - > 1 hora, antes de salir: 20% del valor neto
    - Operador en camino: 40% del valor neto
    - Operador en obra: 60% del valor neto
    - Servicio iniciado: 100% (no cancelable)
    
    Args:
        service_status: Estado actual del servicio
        net_service_value: Valor neto del servicio en CLP
        minutes_since_accepted: Minutos desde que el proveedor aceptó
    
    Returns:
        dict con total_fee, provider_amount, maqgo_amount
    """
    # Verificar ventana gratuita
    if service_status == "accepted" and minutes_since_accepted <= FREE_CANCELLATION_WINDOW_MINUTES:
        return {"total_fee": 0, "provider_amount": 0, "maqgo_amount": 0, "maqgo_iva": 0}
    
    # Ajustar estado si expiró la ventana gratuita
    if service_status == "accepted" and minutes_since_accepted > FREE_CANCELLATION_WINDOW_MINUTES:
        service_status = "accepted_expired"
    
    # Obtener porcentaje de penalización
    penalty_percent = CANCELLATION_PERCENTAGES.get(service_status, 0)
    
    if penalty_percent == 0:
        return {"total_fee": 0, "provider_amount": 0, "maqgo_amount": 0, "maqgo_iva": 0}
    
    # Calcular montos
    total_fee = int(net_service_value * penalty_percent / 100)
    maqgo_net = int(total_fee * CANCELLATION_DISTRIBUTION["maqgo_percent"] / 100)
    maqgo_iva = int(maqgo_net * 0.19)
    provider_amount = total_fee - maqgo_net - maqgo_iva
    
    return {
        "total_fee": total_fee,
        "provider_amount": provider_amount,
        "maqgo_amount": maqgo_net,
        "maqgo_iva": maqgo_iva,
        "penalty_percent": penalty_percent
    }


# Resumen de cargos por cancelación (ejemplo servicio $100.000 neto)
CANCELLATION_FEES_EXAMPLE = {
    "free_window": "$0 (primera hora)",
    "after_1h": "$20.000 → Proveedor: $17.000 | MAQGO: $3.000",
    "en_route": "$40.000 → Proveedor: $34.000 | MAQGO: $6.000", 
    "arrived": "$60.000 → Proveedor: $51.000 | MAQGO: $9.000",
}


# =============================================================================
# CANCELACIÓN POR PROVEEDOR
# =============================================================================

# Penalizaciones al rating por cancelar
PROVIDER_CANCELLATION_RATING_PENALTY = -0.5  # Estrellas

# Máximo de cancelaciones permitidas en 30 días antes de suspensión
MAX_PROVIDER_CANCELLATIONS_PER_MONTH = 3

# Días de suspensión por exceder límite
SUSPENSION_DAYS = 7


# =============================================================================
# POLÍTICA DE RECLAMOS
# =============================================================================

# Plazo máximo para presentar reclamo (en horas) - vía WhatsApp soporte
CLAIM_DEADLINE_HOURS = 48  # Reclamos en paralelo, no bloquean pago

# Plazo para resolución de MAQGO (en horas hábiles)
CLAIM_RESOLUTION_HOURS = 72

# Razones válidas de reclamo
VALID_CLAIM_REASONS = [
    "service_not_performed",      # Servicio no realizado
    "hours_mismatch",             # Horas trabajadas no coinciden
    "wrong_machinery",            # Maquinaria diferente
    "property_damage",            # Daños a la propiedad
    "inappropriate_behavior",     # Comportamiento inapropiado
]

# Razones inválidas de reclamo
INVALID_CLAIM_REASONS = [
    "late_claim",                 # Fuera de plazo (>24h)
    "subjective_quality",         # Calidad subjetiva
    "off_platform_service",       # Servicio fuera de MAQGO
    "no_evidence",                # Sin evidencia
]


# =============================================================================
# PAGOS - Pago Ágil
# =============================================================================

# Ventana de aprobación automática (en horas)
AUTO_APPROVAL_HOURS = 24

# Plazo de pago al proveedor después de facturar (en días hábiles)
PROVIDER_PAYMENT_BUSINESS_DAYS = 2

# Comisión de MAQGO al cliente (porcentaje neto + IVA)
MAQGO_CLIENT_COMMISSION_PERCENT = 10

# Comisión de MAQGO al proveedor (porcentaje neto + IVA)
MAQGO_PROVIDER_COMMISSION_PERCENT = 10


# =============================================================================
# RETENCIÓN DE DATOS
# =============================================================================

# Días de retención de datos operativos
DATA_RETENTION_OPERATIONAL_DAYS = 90

# Años de retención de datos financieros (requisito legal Chile)
DATA_RETENTION_FINANCIAL_YEARS = 5


# =============================================================================
# VALIDACIONES
# =============================================================================

def is_claim_within_deadline(service_end_time, claim_time) -> bool:
    """
    Verifica si el reclamo está dentro del plazo de 24 horas.
    """
    from datetime import timedelta
    deadline = service_end_time + timedelta(hours=CLAIM_DEADLINE_HOURS)
    return claim_time <= deadline


def can_provider_accept_requests(cancellations_this_month: int, is_suspended: bool) -> bool:
    """
    Verifica si el proveedor puede aceptar solicitudes.
    """
    if is_suspended:
        return False
    if cancellations_this_month >= MAX_PROVIDER_CANCELLATIONS_PER_MONTH:
        return False
    return True
