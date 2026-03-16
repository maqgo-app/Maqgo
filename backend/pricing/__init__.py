"""
MAQGO - Pricing Module

Exports:
- calculate_immediate_price
- calculate_scheduled_price
- get_system_multiplier
- get_provider_adjustment_range
- PricingValidationError
- All constants
"""

from .calculator import (
    calculate_immediate_price,
    calculate_scheduled_price,
    calculate_hybrid_price,
    get_system_multiplier,
    get_provider_adjustment_range,
)

from .validators import PricingValidationError

from .constants import (
    IMMEDIATE_MULTIPLIERS,
    MIN_MULTIPLIER,
    MAX_MULTIPLIER,
    MIN_HOURS_IMMEDIATE,
    MAX_HOURS_IMMEDIATE,
    SCHEDULED_HOURS,
    MACHINERY_PER_HOUR,
    MACHINERY_PER_SERVICE,
    MACHINERY_NEEDS_TRANSPORT,
    MACHINERY_NO_TRANSPORT,
    MAQGO_COMMISSION_RATE,
    IVA_RATE,
)

__all__ = [
    'calculate_immediate_price',
    'calculate_scheduled_price',
    'calculate_hybrid_price',
    'get_system_multiplier',
    'get_provider_adjustment_range',
    'PricingValidationError',
    'IMMEDIATE_MULTIPLIERS',
    'MIN_MULTIPLIER',
    'MAX_MULTIPLIER',
    'MIN_HOURS_IMMEDIATE',
    'MAX_HOURS_IMMEDIATE',
    'SCHEDULED_HOURS',
    'MACHINERY_PER_HOUR',
    'MACHINERY_PER_SERVICE',
    'MACHINERY_NEEDS_TRANSPORT',
    'MACHINERY_NO_TRANSPORT',
    'MAQGO_COMMISSION_RATE',
    'IVA_RATE',
]
