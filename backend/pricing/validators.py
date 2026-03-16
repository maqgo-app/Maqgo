"""
MAQGO - Pricing Validators
Server-side validation for all pricing rules

Any violation is a BUG.
"""

from .constants import (
    MIN_MULTIPLIER,
    MAX_MULTIPLIER,
    PROVIDER_ADJUSTMENT_RANGE,
    MIN_HOURS_IMMEDIATE,
    MAX_HOURS_IMMEDIATE,
    IMMEDIATE_MULTIPLIERS,
    MACHINERY_PER_HOUR,
    MACHINERY_PER_SERVICE,
    MACHINERY_NEEDS_TRANSPORT,
)


class PricingValidationError(Exception):
    """Raised when pricing rules are violated"""
    pass


def validate_immediate_hours(hours: int) -> None:
    """
    Validate hours for immediate reservation.
    Raises PricingValidationError if invalid.
    """
    if not isinstance(hours, int):
        raise PricingValidationError(f"Hours must be integer, got {type(hours)}")
    
    if hours < MIN_HOURS_IMMEDIATE:
        raise PricingValidationError(
            f"Minimum hours for immediate reservation is {MIN_HOURS_IMMEDIATE}, got {hours}"
        )
    
    if hours > MAX_HOURS_IMMEDIATE:
        raise PricingValidationError(
            f"Maximum hours for immediate reservation is {MAX_HOURS_IMMEDIATE}, got {hours}"
        )


def validate_multiplier(multiplier: float) -> None:
    """
    Validate that multiplier is within allowed range.
    Raises PricingValidationError if invalid.
    """
    if multiplier < MIN_MULTIPLIER:
        raise PricingValidationError(
            f"Multiplier {multiplier} is below minimum {MIN_MULTIPLIER}"
        )
    
    if multiplier > MAX_MULTIPLIER:
        raise PricingValidationError(
            f"Multiplier {multiplier} exceeds maximum {MAX_MULTIPLIER}"
        )


def validate_provider_adjustment(base_multiplier: float, adjusted_multiplier: float) -> None:
    """
    Validate that provider's adjustment is within ±5% of system multiplier.
    Raises PricingValidationError if invalid.
    """
    min_allowed = base_multiplier - PROVIDER_ADJUSTMENT_RANGE
    max_allowed = base_multiplier + PROVIDER_ADJUSTMENT_RANGE
    
    # Clamp to absolute limits
    min_allowed = max(min_allowed, MIN_MULTIPLIER)
    max_allowed = min(max_allowed, MAX_MULTIPLIER)
    
    if adjusted_multiplier < min_allowed or adjusted_multiplier > max_allowed:
        raise PricingValidationError(
            f"Provider adjustment {adjusted_multiplier} outside allowed range "
            f"[{min_allowed:.2f}, {max_allowed:.2f}]"
        )


def validate_machinery_type(machinery_type: str) -> None:
    """
    Validate that machinery type is known.
    """
    all_types = MACHINERY_PER_HOUR + MACHINERY_PER_SERVICE
    if machinery_type not in all_types:
        raise PricingValidationError(
            f"Unknown machinery type: {machinery_type}"
        )


def validate_price_positive(price: float, field_name: str = "Price") -> None:
    """
    Validate that price is positive.
    """
    if price <= 0:
        raise PricingValidationError(
            f"{field_name} must be positive, got {price}"
        )
