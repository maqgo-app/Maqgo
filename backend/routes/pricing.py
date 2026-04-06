"""
MAQGO - Pricing API Routes

All pricing logic is server-side.
Frontend only receives final_price.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import copy

from pricing import (
    calculate_immediate_price,
    calculate_scheduled_price,
    calculate_hybrid_price,
    get_system_multiplier,
    get_provider_adjustment_range,
    PricingValidationError,
    MIN_HOURS_IMMEDIATE,
    MAX_HOURS_IMMEDIATE,
)
from pricing.constants import REFERENCE_PRICES_PER_HOUR, REFERENCE_PRICES_PER_SERVICE

router = APIRouter(prefix="/pricing", tags=["pricing"])


# ===========================================
# REQUEST/RESPONSE MODELS
# ===========================================

class ImmediatePriceRequest(BaseModel):
    machinery_type: str = "retroexcavadora"  # Default for backwards compatibility
    base_price: Optional[float] = None
    base_price_hr: Optional[float] = None  # Alternative field from frontend
    hours: int = Field(..., ge=MIN_HOURS_IMMEDIATE, le=MAX_HOURS_IMMEDIATE)
    provider_multiplier: Optional[float] = None
    transport_cost: float = Field(default=0, ge=0)
    is_immediate: bool = True  # Flag from frontend
    needs_invoice: bool = False  # CON factura: IVA sobre todo; SIN: IVA solo sobre comisión


class ScheduledPriceRequest(BaseModel):
    machinery_type: str
    base_price: float = Field(..., gt=0)
    days: int = Field(default=1, ge=1)
    transport_cost: float = Field(default=0, ge=0)
    needs_invoice: bool = False


class HybridPriceRequest(BaseModel):
    """Request for hybrid pricing: today with surcharge + additional days at normal rate"""
    machinery_type: str = "retroexcavadora"
    base_price: Optional[float] = None
    base_price_hr: Optional[float] = None
    hours_today: int = Field(..., ge=MIN_HOURS_IMMEDIATE, le=MAX_HOURS_IMMEDIATE)
    additional_days: int = Field(default=0, ge=0, le=30)
    provider_multiplier: Optional[float] = None
    transport_cost: float = Field(default=0, ge=0)
    needs_invoice: bool = False


class MultiplierRangeRequest(BaseModel):
    hours: int = Field(..., ge=MIN_HOURS_IMMEDIATE, le=MAX_HOURS_IMMEDIATE)


# ===========================================
# ENDPOINTS
# ===========================================

@router.post("/immediate")
async def calculate_immediate(request: ImmediatePriceRequest):
    """
    Calculate price for immediate reservation.
    
    Client receives only final_price.
    Provider view includes bonus details.
    
    Response includes fields for "Opción C - Híbrido" display:
    - service_amount: Base service cost
    - transport_cost: Transport cost
    - immediate_bonus: Extra for immediate availability
    - iva: Tax amount
    - final_price: Total to pay
    """
    try:
        # Support both field names from frontend
        base_price = request.base_price or request.base_price_hr
        if not base_price or base_price <= 0:
            raise HTTPException(status_code=400, detail="Base price must be positive")
        
        result = calculate_immediate_price(
            machinery_type=request.machinery_type,
            base_price=base_price,
            hours=request.hours,
            provider_multiplier=request.provider_multiplier,
            transport_cost=request.transport_cost,
        )
        
        # Add flattened fields for frontend "Opción C - Híbrido" display
        breakdown = result.get('breakdown', {})
        provider_view = result.get('provider_view', {})
        
        # Calculate base service (without multiplier) for comparison
        is_per_hour = breakdown.get('is_per_hour', True)
        base_service_no_mult = base_price * request.hours if is_per_hour else base_price
        
        # Mismo bruto en factura y boleta: IVA 19% siempre sobre (subtotal + comisión)
        subtotal = breakdown.get('subtotal', 0)
        client_commission = breakdown.get('client_commission', 0)
        client_commission_iva = breakdown.get('client_commission_iva', 0)
        base_para_iva = subtotal + client_commission
        iva_total = round(base_para_iva * 0.19)
        final_price = round(subtotal + client_commission + iva_total)
        
        return {
            **result,
            'final_price': final_price,
            # Flattened fields for frontend desglose (client-friendly)
            'service_amount': base_service_no_mult,  # Servicio BASE (sin multiplicador)
            'urgency_amount': breakdown.get('service_cost', 0) - base_service_no_mult,  # Alta demanda (diferencia)
            'transport_cost': breakdown.get('transport_cost', 0),
            'immediate_bonus': provider_view.get('immediate_bonus', 0),  # Bonificación inmediata
            'client_commission': client_commission,
            'client_commission_iva': client_commission_iva,
            'subtotal': subtotal,
            'needs_invoice': request.needs_invoice,
        }
    except PricingValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/scheduled")
async def calculate_scheduled(request: ScheduledPriceRequest):
    """
    Calculate price for scheduled reservation (8-hour fixed workday).
    No multiplier applied.
    """
    try:
        result = calculate_scheduled_price(
            machinery_type=request.machinery_type,
            base_price=request.base_price,
            days=request.days,
            transport_cost=request.transport_cost,
        )
        # Mismo bruto en factura y boleta
        breakdown = result.get('breakdown', {})
        subtotal = breakdown.get('subtotal', 0)
        client_commission = breakdown.get('client_commission', 0)
        base_para_iva = subtotal + client_commission
        iva_total = round(base_para_iva * 0.19)
        result['final_price'] = round(subtotal + client_commission + iva_total)
        result['needs_invoice'] = request.needs_invoice
        return result
    except PricingValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/hybrid")
async def calculate_hybrid(request: HybridPriceRequest):
    """
    Calculate price for HYBRID reservation:
    - Today: hours with immediate multiplier (surcharge 10%-20%)
    - Additional days: 8-hour workdays at normal rate (no surcharge)
    
    This allows clients to book immediate service for today AND
    extend for additional days at normal pricing.
    """
    try:
        # Support both field names from frontend
        base_price = request.base_price or request.base_price_hr
        if not base_price or base_price <= 0:
            raise HTTPException(status_code=400, detail="Base price must be positive")
        
        result = calculate_hybrid_price(
            machinery_type=request.machinery_type,
            base_price=base_price,
            hours_today=request.hours_today,
            additional_days=request.additional_days,
            provider_multiplier=request.provider_multiplier,
            transport_cost=request.transport_cost,
        )
        
        # Add flattened fields for frontend display
        today = result.get('today', {})
        additional = result.get('additional_days', {})
        breakdown = result.get('breakdown', {})
        
        # Mismo bruto en factura y boleta
        subtotal = breakdown.get('subtotal', 0)
        client_commission = breakdown.get('client_commission', 0)
        base_para_iva = subtotal + client_commission
        iva_total = round(base_para_iva * 0.19)
        result['final_price'] = round(subtotal + client_commission + iva_total)
        
        return {
            **result,
            # Flattened for easy frontend consumption
            'today_cost': today.get('total_cost', 0),
            'today_surcharge': today.get('surcharge_amount', 0),
            'today_surcharge_percent': today.get('surcharge_percent', 0),
            'additional_cost': additional.get('total_cost', 0),
            'transport_cost': breakdown.get('transport_cost', 0),
            'client_commission': breakdown.get('client_commission', 0),
            'client_commission_iva': breakdown.get('client_commission_iva', 0),
            'needs_invoice': request.needs_invoice,
        }
    except PricingValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/multiplier/{hours}")
async def get_multiplier(hours: int):
    """
    Get system multiplier and allowed range for given hours.
    Used by provider to see their options.
    """
    if hours < MIN_HOURS_IMMEDIATE or hours > MAX_HOURS_IMMEDIATE:
        raise HTTPException(
            status_code=400,
            detail=f"Hours must be between {MIN_HOURS_IMMEDIATE} and {MAX_HOURS_IMMEDIATE}"
        )
    
    return {
        "hours": hours,
        "system_multiplier": get_system_multiplier(hours),
        "adjustment_range": get_provider_adjustment_range(hours),
    }


@router.get("/multipliers")
async def get_all_multipliers():
    """
    Get all multipliers for reference.
    """
    return {
        "multipliers": {
            hours: {
                "multiplier": get_system_multiplier(hours),
                "range": get_provider_adjustment_range(hours),
            }
            for hours in range(MIN_HOURS_IMMEDIATE, MAX_HOURS_IMMEDIATE + 1)
        },
        "limits": {
            "min_hours": MIN_HOURS_IMMEDIATE,
            "max_hours": MAX_HOURS_IMMEDIATE,
        }
    }


# ===========================================
# CLIENT-ONLY ENDPOINT (simplified response)
# ===========================================

@router.get("/reference-prices")
async def get_reference_prices():
    """
    Precios de referencia sugeridos por maquinaria.
    Usado por proveedores al configurar tarifas.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    import os

    defaults = {
        "per_hour": copy.deepcopy(REFERENCE_PRICES_PER_HOUR),
        "per_service": copy.deepcopy(REFERENCE_PRICES_PER_SERVICE),
    }
    try:
        from db_config import get_db_name, get_mongo_url

        mongo_url = get_mongo_url()
        client = AsyncIOMotorClient(mongo_url)
        db = client[get_db_name()]
        doc = await db.config.find_one({"_id": "reference_prices"})
        if doc:
            for key in ["per_hour", "per_service"]:
                for machine_id, vals in defaults[key].items():
                    if key in doc and machine_id in doc[key]:
                        defaults[key][machine_id] = {**vals, **doc[key][machine_id]}
    except Exception:
        pass
    return defaults


@router.post("/quote/client")
async def get_client_quote(request: ImmediatePriceRequest):
    """
    Get price quote for client.
    Returns ONLY final_price - no breakdown, no percentages.
    """
    try:
        base_price = request.base_price or request.base_price_hr
        if not base_price or base_price <= 0:
            raise HTTPException(status_code=400, detail="Base price must be positive")
        result = calculate_immediate_price(
            machinery_type=request.machinery_type,
            base_price=base_price,
            hours=request.hours,
            provider_multiplier=request.provider_multiplier,
            transport_cost=request.transport_cost,
        )
        
        # Client only sees final price
        return {
            "final_price": result["final_price"],
            "message": "Precio total del servicio para disponibilidad inmediata.",
            "price_frozen": True,
        }
    except PricingValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
