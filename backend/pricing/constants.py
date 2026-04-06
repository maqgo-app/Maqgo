"""
MAQGO - Pricing Constants
Source of Truth for all pricing rules

DO NOT MODIFY without business approval.
All rules come from PricingPolicy_v1.md
"""

# ===========================================
# MULTIPLIERS BY HOURS (IMMEDIATE RESERVATION)
# Para maquinaria por hora (retroexcavadora, excavadora, etc.)
# ===========================================
IMMEDIATE_MULTIPLIERS = {
    4: 1.20,  # +20%
    5: 1.175, # +17.5%
    6: 1.15,  # +15%
    7: 1.125, # +12.5%
    8: 1.10,  # +10%
}

# ===========================================
# LIMITS (ABSOLUTE - NO EXCEPTIONS)
# ===========================================
MIN_MULTIPLIER = 1.05
MAX_MULTIPLIER = 1.35
PROVIDER_ADJUSTMENT_RANGE = 0.05  # ±5%

# Hours limits for immediate reservation
MIN_HOURS_IMMEDIATE = 4
MAX_HOURS_IMMEDIATE = 8

# Hours for scheduled reservation (fixed)
SCHEDULED_HOURS = 8

# ===========================================
# MACHINERY CLASSIFICATION
# ===========================================

# Charged PER HOUR
MACHINERY_PER_HOUR = [
    'retroexcavadora',
    'excavadora',
    'bulldozer',
    'motoniveladora',
    'compactadora',
    'minicargador',
    'grua',  # Grúa móvil se arrienda por hora
]

# Charged PER SERVICE (flat rate)
MACHINERY_PER_SERVICE = [
    'camion_pluma',
    'camion_aljibe',
    'camion_tolva',
]

# ===========================================
# TRANSPORT LOGIC (TRASLADO)
# ===========================================

# 🚚 Requires transport (lowboy/cama baja)
# Equipos autopropulsados de obra que NO pueden circular por vía pública
MACHINERY_NEEDS_TRANSPORT = [
    'retroexcavadora',   # ✅ Cobra traslado
    'excavadora',        # ✅ Cobra traslado
    'bulldozer',         # ✅ Cobra traslado
    'motoniveladora',    # ✅ Cobra traslado
    'compactadora',      # ✅ Cobra traslado
    'minicargador',      # ✅ Cobra traslado
    'grua',              # ✅ Grúa móvil cobra traslado (lowboy)
]

# 🚛 No transport needed (camiones con patente - se cobran por viaje)
# El desplazamiento forma parte natural del servicio
# Nota: Grúa móvil SÍ cobra traslado (lowboy) - va en MACHINERY_NEEDS_TRANSPORT
MACHINERY_NO_TRANSPORT = [
    'camion_pluma',      # ❌ Sin traslado (camión)
    'camion_aljibe',     # ❌ Sin traslado (camión)
    'camion_tolva',      # ❌ Sin traslado (camión)
]

# ===========================================
# REFERENCE PRICES (CHILE - FOR SEEDING ONLY)
# ===========================================
REFERENCE_PRICES_PER_HOUR = {
    'retroexcavadora': {'min': 70000, 'max': 90000, 'default': 80000},
    'excavadora': {'min': 90000, 'max': 130000, 'default': 110000},
    'bulldozer': {'min': 120000, 'max': 160000, 'default': 140000},
    'motoniveladora': {'min': 130000, 'max': 180000, 'default': 155000},
    'compactadora': {'min': 60000, 'max': 90000, 'default': 75000},
    'minicargador': {'min': 50000, 'max': 75000, 'default': 62500},
    'grua': {'min': 90000, 'max': 150000, 'default': 120000},  # Grúa móvil por hora
}

REFERENCE_PRICES_PER_SERVICE = {
    'camion_pluma': {'min': 220000, 'max': 350000, 'default': 285000},
    'camion_aljibe': {'min': 200000, 'max': 320000, 'default': 260000},
    'camion_tolva': {'min': 180000, 'max': 300000, 'default': 240000},
}

# ===========================================
# MAQGO COMMISSION
# ===========================================
MAQGO_CLIENT_COMMISSION_RATE = 0.10  # 10% + IVA se suma al cliente
MAQGO_PROVIDER_COMMISSION_RATE = 0.10  # 10% + IVA se descuenta al proveedor
IVA_RATE = 0.19  # 19% Chile

# Legacy alias for backward compatibility
MAQGO_COMMISSION_RATE = MAQGO_CLIENT_COMMISSION_RATE

# ===========================================
# LÍMITES VS PROMEDIO DE MERCADO
# Precio y traslado máx = X% del promedio (evitar precios desproporcionados)
# ===========================================
MAX_PRICE_ABOVE_MARKET_PCT = 2.0  # Máx 200% del promedio (2x mercado, 100% sobre)
REFERENCE_TRANSPORT = 30000        # Promedio mercado traslado lowboy (CLP)
