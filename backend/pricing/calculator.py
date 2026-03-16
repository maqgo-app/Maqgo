"""
MAQGO - Pricing Calculator
Core pricing logic for immediate reservations

Source of Truth: PricingPolicy_v1.md
All calculations happen server-side.
Frontend only receives final_price.
"""

from typing import Dict, Optional
from .constants import (
    IMMEDIATE_MULTIPLIERS,
    MIN_MULTIPLIER,
    MAX_MULTIPLIER,
    PROVIDER_ADJUSTMENT_RANGE,
    MACHINERY_PER_HOUR,
    MACHINERY_PER_SERVICE,
    MACHINERY_NEEDS_TRANSPORT,
    MAQGO_CLIENT_COMMISSION_RATE,
    MAQGO_PROVIDER_COMMISSION_RATE,
    IVA_RATE,
)
from .validators import (
    validate_immediate_hours,
    validate_multiplier,
    validate_provider_adjustment,
    validate_machinery_type,
    validate_price_positive,
    PricingValidationError,
)


def get_system_multiplier(hours: int) -> float:
    """
    Get the system-defined multiplier for immediate reservation.
    
    Args:
        hours: Number of hours requested (4-8)
        
    Returns:
        Multiplier (1.10 to 1.30)
        
    Raises:
        PricingValidationError if hours invalid
    """
    validate_immediate_hours(hours)
    return IMMEDIATE_MULTIPLIERS[hours]


def get_provider_adjustment_range(hours: int) -> Dict[str, float]:
    """
    Get the allowed adjustment range for provider.
    
    Args:
        hours: Number of hours requested
        
    Returns:
        Dict with 'min', 'max', 'suggested' multipliers
    """
    base = get_system_multiplier(hours)
    
    min_mult = max(base - PROVIDER_ADJUSTMENT_RANGE, MIN_MULTIPLIER)
    max_mult = min(base + PROVIDER_ADJUSTMENT_RANGE, MAX_MULTIPLIER)
    
    return {
        'suggested': base,
        'min': round(min_mult, 2),
        'max': round(max_mult, 2),
    }


def calculate_immediate_price(
    machinery_type: str,
    base_price: float,
    hours: int,
    provider_multiplier: Optional[float] = None,
    transport_cost: float = 0,
) -> Dict:
    """
    Calculate final price for immediate reservation.
    
    Args:
        machinery_type: Type of machinery
        base_price: Provider's base price (per hour or per service)
        hours: Number of hours requested (4-8)
        provider_multiplier: Provider's chosen multiplier (optional, uses system default)
        transport_cost: Transport cost if applicable
        
    Returns:
        Dict with all pricing details
        
    Raises:
        PricingValidationError if any validation fails
    """
    # Validate inputs
    validate_machinery_type(machinery_type)
    validate_immediate_hours(hours)
    validate_price_positive(base_price, "Base price")
    
    # Get system multiplier
    system_multiplier = get_system_multiplier(hours)
    
    # Use provider multiplier if provided, otherwise use system default
    if provider_multiplier is not None:
        validate_provider_adjustment(system_multiplier, provider_multiplier)
        final_multiplier = provider_multiplier
    else:
        final_multiplier = system_multiplier
    
    # Validate final multiplier is within absolute limits
    validate_multiplier(final_multiplier)
    
    # Calculate base service cost
    is_per_hour = machinery_type in MACHINERY_PER_HOUR
    
    if is_per_hour:
        # Machinery charged per hour
        service_cost = base_price * hours * final_multiplier
        price_display = base_price * final_multiplier  # Per hour price for display
    else:
        # Machinery charged per service (flat rate)
        service_cost = base_price * final_multiplier
        price_display = service_cost
    
    # Check if transport is needed
    needs_transport = machinery_type in MACHINERY_NEEDS_TRANSPORT
    if needs_transport and transport_cost > 0:
        validate_price_positive(transport_cost, "Transport cost")
    else:
        transport_cost = 0
    
    # Calculate subtotal (service + transport)
    subtotal = service_cost + transport_cost
    
    # =============================================
    # CLIENT SIDE: Commission 10% + IVA (added to total)
    # =============================================
    client_commission = subtotal * MAQGO_CLIENT_COMMISSION_RATE
    client_commission_iva = client_commission * IVA_RATE
    
    # Final price for client = subtotal + 10% commission + IVA on commission
    final_price = subtotal + client_commission + client_commission_iva
    
    # =============================================
    # PROVIDER SIDE: Commission 10% + IVA (deducted from total)
    # =============================================
    provider_commission = subtotal * MAQGO_PROVIDER_COMMISSION_RATE
    provider_commission_iva = provider_commission * IVA_RATE
    
    # Provider earnings = subtotal - 10% commission - IVA on commission
    provider_earnings = subtotal - provider_commission - provider_commission_iva
    
    # Bonus from immediate (what provider earns extra vs base rate)
    base_service_cost = base_price * hours if is_per_hour else base_price
    immediate_bonus = service_cost - base_service_cost
    
    return {
        # For CLIENT (only these shown to client)
        'final_price': round(final_price),
        'reservation_type': 'immediate',
        
        # For PROVIDER (internal/provider view)
        'provider_view': {
            'base_price': round(base_price),
            'multiplier_suggested': system_multiplier,
            'multiplier_applied': final_multiplier,
            'multiplier_range': get_provider_adjustment_range(hours),
            'immediate_bonus': round(immediate_bonus),  # "Bonificación por disponibilidad"
            'service_earnings': round(service_cost),
            'transport_earnings': round(transport_cost),
            'gross_earnings': round(subtotal),  # Before MAQGO commission
            'maqgo_fee': round(provider_commission + provider_commission_iva),  # 10% + IVA
            'net_earnings': round(provider_earnings),  # What provider actually receives
        },
        
        # Breakdown (internal use)
        'breakdown': {
            'machinery_type': machinery_type,
            'is_per_hour': is_per_hour,
            'hours': hours,
            'base_price': round(base_price),
            'multiplier': final_multiplier,
            'service_cost': round(service_cost),
            'transport_cost': round(transport_cost),
            'subtotal': round(subtotal),
            'client_commission': round(client_commission),
            'client_commission_iva': round(client_commission_iva),
            'provider_commission': round(provider_commission),
            'provider_commission_iva': round(provider_commission_iva),
            'final_price': round(final_price),
            'provider_net': round(provider_earnings),
        },
        
        # Price is frozen
        'price_frozen': True,
    }


def calculate_scheduled_price(
    machinery_type: str,
    base_price: float,
    days: int = 1,
    transport_cost: float = 0,
) -> Dict:
    """
    Calculate price for scheduled reservation (8-hour fixed workday).
    No multiplier applied - uses base price.
    
    Commission structure:
    - Client: +10% + IVA (added to total)
    - Provider: -10% + IVA (deducted from earnings)
    
    Args:
        machinery_type: Type of machinery
        base_price: Provider's base price
        days: Number of days
        transport_cost: Transport cost if applicable
        
    Returns:
        Dict with pricing details
    """
    validate_machinery_type(machinery_type)
    validate_price_positive(base_price, "Base price")
    
    is_per_hour = machinery_type in MACHINERY_PER_HOUR
    hours_per_day = 8
    
    if is_per_hour:
        service_cost = base_price * hours_per_day * days
    else:
        service_cost = base_price * days
    
    # Transport
    needs_transport = machinery_type in MACHINERY_NEEDS_TRANSPORT
    if not needs_transport:
        transport_cost = 0
    
    subtotal = service_cost + transport_cost
    
    # Client commission: 10% + IVA (added)
    client_commission = subtotal * MAQGO_CLIENT_COMMISSION_RATE
    client_commission_iva = client_commission * IVA_RATE
    final_price = subtotal + client_commission + client_commission_iva
    
    # Provider commission: 10% + IVA (deducted)
    provider_commission = subtotal * MAQGO_PROVIDER_COMMISSION_RATE
    provider_commission_iva = provider_commission * IVA_RATE
    provider_net = subtotal - provider_commission - provider_commission_iva
    
    return {
        'final_price': round(final_price),
        'reservation_type': 'scheduled',
        'provider_view': {
            'gross_earnings': round(subtotal),
            'maqgo_fee': round(provider_commission + provider_commission_iva),
            'net_earnings': round(provider_net),
        },
        'breakdown': {
            'machinery_type': machinery_type,
            'is_per_hour': is_per_hour,
            'hours_per_day': hours_per_day,
            'days': days,
            'base_price': round(base_price),
            'service_cost': round(service_cost),
            'transport_cost': round(transport_cost),
            'subtotal': round(subtotal),
            'client_commission': round(client_commission),
            'client_commission_iva': round(client_commission_iva),
            'provider_commission': round(provider_commission),
            'provider_commission_iva': round(provider_commission_iva),
            'final_price': round(final_price),
            'provider_net': round(provider_net),
        },
        'price_frozen': True,
    }



def calculate_hybrid_price(
    machinery_type: str,
    base_price: float,
    hours_today: int,
    additional_days: int = 0,
    provider_multiplier: float = None,
    transport_cost: float = 0,
) -> Dict:
    """
    Calculate price for HYBRID reservation:
    - Today: hours with immediate multiplier (surcharge)
    - Additional days: 8-hour workdays at normal rate (no surcharge)
    
    Args:
        machinery_type: Type of machinery
        base_price: Provider's base price per hour
        hours_today: Hours requested for today (4-8)
        additional_days: Number of additional full days
        provider_multiplier: Provider's multiplier for today (optional)
        transport_cost: Transport cost if applicable
        
    Returns:
        Dict with pricing details for both periods
    """
    validate_machinery_type(machinery_type)
    validate_immediate_hours(hours_today)
    validate_price_positive(base_price, "Base price")
    
    is_per_hour = machinery_type in MACHINERY_PER_HOUR
    hours_per_day = 8
    
    # Get multiplier for today
    system_multiplier = get_system_multiplier(hours_today)
    if provider_multiplier is not None:
        validate_provider_adjustment(system_multiplier, provider_multiplier)
        final_multiplier = provider_multiplier
    else:
        final_multiplier = system_multiplier
    
    # ========================
    # TODAY: With surcharge
    # ========================
    if is_per_hour:
        today_service_cost = base_price * hours_today * final_multiplier
        today_base_cost = base_price * hours_today  # Without multiplier
    else:
        today_service_cost = base_price * final_multiplier
        today_base_cost = base_price
    
    today_surcharge = today_service_cost - today_base_cost
    
    # ========================
    # ADDITIONAL DAYS: No surcharge
    # ========================
    if additional_days > 0:
        if is_per_hour:
            additional_service_cost = base_price * hours_per_day * additional_days
        else:
            additional_service_cost = base_price * additional_days
    else:
        additional_service_cost = 0
    
    # ========================
    # TOTALS
    # ========================
    total_service_cost = today_service_cost + additional_service_cost
    
    # Transport (applied once)
    needs_transport = machinery_type in MACHINERY_NEEDS_TRANSPORT
    if not needs_transport:
        transport_cost = 0
    
    subtotal = total_service_cost + transport_cost
    
    # Client commission: 10% + IVA
    client_commission = subtotal * MAQGO_CLIENT_COMMISSION_RATE
    client_commission_iva = client_commission * IVA_RATE
    final_price = subtotal + client_commission + client_commission_iva
    
    # Provider commission: 10% + IVA
    provider_commission = subtotal * MAQGO_PROVIDER_COMMISSION_RATE
    provider_commission_iva = provider_commission * IVA_RATE
    provider_net = subtotal - provider_commission - provider_commission_iva
    
    return {
        'final_price': round(final_price),
        'reservation_type': 'hybrid',
        
        # Detailed breakdown for display
        'today': {
            'hours': hours_today,
            'multiplier': final_multiplier,
            'surcharge_percent': round((final_multiplier - 1) * 100),
            'base_cost': round(today_base_cost),
            'surcharge_amount': round(today_surcharge),
            'total_cost': round(today_service_cost),
        },
        
        'additional_days': {
            'days': additional_days,
            'hours_per_day': hours_per_day,
            'total_hours': additional_days * hours_per_day,
            'total_cost': round(additional_service_cost),
        },
        
        'provider_view': {
            'today_earnings': round(today_service_cost),
            'additional_earnings': round(additional_service_cost),
            'transport_earnings': round(transport_cost),
            'gross_earnings': round(subtotal),
            'maqgo_fee': round(provider_commission + provider_commission_iva),
            'net_earnings': round(provider_net),
            'immediate_bonus': round(today_surcharge),
        },
        
        'breakdown': {
            'machinery_type': machinery_type,
            'is_per_hour': is_per_hour,
            'base_price': round(base_price),
            'hours_today': hours_today,
            'additional_days': additional_days,
            'multiplier': final_multiplier,
            'today_service_cost': round(today_service_cost),
            'additional_service_cost': round(additional_service_cost),
            'total_service_cost': round(total_service_cost),
            'transport_cost': round(transport_cost),
            'subtotal': round(subtotal),
            'client_commission': round(client_commission),
            'client_commission_iva': round(client_commission_iva),
            'provider_commission': round(provider_commission),
            'provider_commission_iva': round(provider_commission_iva),
            'final_price': round(final_price),
            'provider_net': round(provider_net),
        },
        
        'price_frozen': True,
    }
