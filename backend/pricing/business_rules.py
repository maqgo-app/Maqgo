from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


SCHEDULED_CANCEL_MORE_THAN_48H_PERCENT = 0.0
SCHEDULED_CANCEL_48H_TO_24H_PERCENT = 0.10
SCHEDULED_CANCEL_LESS_THAN_24H_PERCENT = 0.20

TODAY_CANCEL_AFTER_ACCEPT_PERCENT = 0.20

CANCEL_ARRIVAL_VERIFIED_PERCENT = 1.00
CANCEL_SERVICE_STARTED_PERCENT = 1.00

TODAY_MAX_ABSOLUTE_DELAY_HOURS = 4

INCIDENT_PROTECTED_WINDOW_MINUTES = 30
INCIDENT_MAX_AUTO_COUNT = 2
INCIDENT_MAX_PROTECTED_MINUTES_TOTAL = 60

def cancellation_fee_from_percent(total_amount_clp: int, percent: float) -> dict:
    try:
        pct = float(percent or 0)
    except Exception:
        pct = 0.0
    if pct < 0:
        pct = 0.0
    fee = int(round(float(total_amount_clp or 0) * pct))
    if fee < 0:
        fee = 0
    return {"fee_amount": fee, "fee_percent": pct}


def scheduled_cancellation_percent(*, hours_until_start: Optional[float]) -> float:
    try:
        h = float(hours_until_start) if hours_until_start is not None else None
    except Exception:
        h = None
    if h is None:
        return SCHEDULED_CANCEL_LESS_THAN_24H_PERCENT
    if h > 48:
        return SCHEDULED_CANCEL_MORE_THAN_48H_PERCENT
    if h > 24:
        return SCHEDULED_CANCEL_48H_TO_24H_PERCENT
    return SCHEDULED_CANCEL_LESS_THAN_24H_PERCENT


def _parse_iso_datetime_utc(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        s = str(value).strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def today_committed_time_utc(
    *,
    eta_confirmed_at: Optional[str],
    eta_commit_minutes: Optional[int],
    confirmed_at: Optional[str],
    accepted_at: Optional[str],
    created_at: Optional[str],
) -> Optional[datetime]:
    base = (
        _parse_iso_datetime_utc(eta_confirmed_at)
        or _parse_iso_datetime_utc(confirmed_at)
        or _parse_iso_datetime_utc(accepted_at)
        or _parse_iso_datetime_utc(created_at)
    )
    if not base:
        return None
    try:
        mins = int(eta_commit_minutes) if eta_commit_minutes is not None else 0
    except Exception:
        mins = 0
    if mins <= 0:
        return base
    from datetime import timedelta

    return base + timedelta(minutes=mins)


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

# Plazo máximo para presentar reclamo (en horas) - vía soporte
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
