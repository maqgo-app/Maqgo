FREE_CANCELLATION_WINDOW_MINUTES = 60
MID_CANCELLATION_WINDOW_MINUTES = 120

CANCELLATION_FEE_PERCENT_60_120 = 0.20
CANCELLATION_FEE_PERCENT_120_PLUS = 0.40

INCIDENT_PROTECTED_WINDOW_MINUTES = 30
INCIDENT_MAX_AUTO_COUNT = 2
INCIDENT_MAX_PROTECTED_MINUTES_TOTAL = 60

NO_ARRIVAL_ALERT_MINUTES_1 = 120
NO_ARRIVAL_ALERT_MINUTES_2 = 180
NO_ARRIVAL_ALERT_MINUTES_3 = 240

LATE_CANCELLATION_FEE_PERCENT = CANCELLATION_FEE_PERCENT_60_120

CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES = NO_ARRIVAL_ALERT_MINUTES_1


def calculate_client_cancellation_fee(total_amount_clp: int, effective_minutes_since_accepted: float) -> dict:
    try:
        minutes = float(effective_minutes_since_accepted)
    except Exception:
        minutes = 0.0
    if minutes <= FREE_CANCELLATION_WINDOW_MINUTES:
        percent = 0.0
    elif minutes <= MID_CANCELLATION_WINDOW_MINUTES:
        percent = CANCELLATION_FEE_PERCENT_60_120
    else:
        percent = CANCELLATION_FEE_PERCENT_120_PLUS
    fee = int(round(float(total_amount_clp or 0) * percent))
    return {"fee_amount": fee, "fee_percent": percent}


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
CLAIM_DEADLINE_HOURS = 24  # Reclamos en paralelo, no bloquean pago

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
