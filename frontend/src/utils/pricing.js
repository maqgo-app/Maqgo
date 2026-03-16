/**
 * MAQGO - Utilidad de precios compartida
 * 
 * Fuente única de verdad para cálculos de precio en el frontend.
 * Debe coincidir exactamente con backend/pricing/calculator.py y constants.py
 * 
 * Uso: ProviderOptionsScreen y ConfirmServiceScreen usan estas funciones
 * para garantizar consistencia entre alternativas de arriendo y preview final.
 */

// ===========================================
// CONSTANTES (alineadas con backend)
// ===========================================

export const IMMEDIATE_MULTIPLIERS = {
  4: 1.20,   // +20%
  5: 1.175,  // +17.5%
  6: 1.15,   // +15%
  7: 1.125,  // +12.5%
  8: 1.10,   // +10%
};

export const MACHINERY_PER_HOUR = [
  'retroexcavadora', 'excavadora', 'bulldozer', 'motoniveladora',
  'compactadora', 'minicargador', 'grua'
];

export const MACHINERY_PER_SERVICE = ['camion_pluma', 'camion_aljibe', 'camion_tolva'];

export const MACHINERY_NEEDS_TRANSPORT = [
  'retroexcavadora', 'excavadora', 'bulldozer', 'motoniveladora',
  'compactadora', 'minicargador', 'grua'
];

export const MACHINERY_NO_TRANSPORT = ['camion_pluma', 'camion_aljibe', 'camion_tolva'];

export const MAQGO_CLIENT_COMMISSION_RATE = 0.10;
export const IVA_RATE = 0.19;

/** Factor para pasar de total sin factura a total con factura (IVA sobre base + comisión). 1.3685/1.1785 */
export const CON_FACTURA_FACTOR = (1 + MAQGO_CLIENT_COMMISSION_RATE) * (1 + IVA_RATE) / (1 + MAQGO_CLIENT_COMMISSION_RATE * (1 + IVA_RATE));

/**
 * Dado el total sin factura (subtotal + comisión con IVA solo en comisión), devuelve el total con factura (IVA sobre todo).
 */
export function totalConFactura(sinFacturaTotal) {
  return Math.round(sinFacturaTotal * CON_FACTURA_FACTOR);
}

// Límites vs promedio de mercado (estilo Uber: cap razonable, transparencia)
export const MAX_PRICE_ABOVE_MARKET_PCT = 2.0;  // Máx 2x referencia (buena práctica marketplace)
export const REFERENCE_TRANSPORT = 30000;        // Promedio mercado traslado lowboy (CLP)

// Texto visible para el proveedor (regla + incentivo tracción)
export const PRICE_CAP_RULE_LABEL = 'Máx. 2x referencia de mercado';
export const PRICING_TRACTION_MSG = 'Precios competitivos = más reservas';

// Precios referencia mercado (alineados con backend/pricing/constants.py)
export const REFERENCE_PRICES = {
  retroexcavadora: 80000, excavadora: 110000, bulldozer: 140000,
  motoniveladora: 155000, compactadora: 75000, minicargador: 62500,
  grua: 120000, camion_pluma: 285000, camion_aljibe: 260000, camion_tolva: 240000,
};

// Alias para compatibilidad
export const MACHINERY_PER_TRIP = MACHINERY_PER_SERVICE;

/** true si la maquinaria se cobra por viaje (pluma, aljibe, tolva) */
export function isPerTripMachinery(machinery) {
  const key = (machinery || '').toLowerCase().replace(/\s+/g, '_');
  return key && MACHINERY_PER_SERVICE.includes(key);
}

/** true si la maquinaria lleva costo de traslado (no es camión pluma/aljibe/tolva) */
export function needsTransportMachinery(machinery) {
  const key = (machinery || '').toLowerCase().replace(/\s+/g, '_');
  return key ? MACHINERY_NEEDS_TRANSPORT.includes(key) : false;
}

// ===========================================
// DEMOS: traslado y precios por maquinaria (una sola fuente de verdad)
// ===========================================
/** Traslado para demos: 0 si la maquinaria no lleva traslado (pluma, aljibe, tolva). */
export function getDemoTransportFee(machinery) {
  return needsTransportMachinery(machinery) ? REFERENCE_TRANSPORT : 0;
}

/** Precios demo por hora (5 valores) para maquinaria por hora. */
const DEMO_HOURLY_PRICES = [45000, 42000, 48000, 44000, 46000];

/** Spread sobre referencia para precios por viaje (5 valores). */
const TRIP_PRICE_SPREAD = [0.85, 0.92, 1, 1.08, 1.15];

/**
 * Array de 5 precios demo según maquinaria: por hora o por viaje (referencia × spread).
 * Usar en ProviderOptionsScreen y SearchingProviderScreen para listas demo.
 */
export function getDemoPriceList(machinery) {
  const key = (machinery || '').toLowerCase().replace(/\s+/g, '_');
  const ref = REFERENCE_PRICES[key];
  const isPerTrip = key && MACHINERY_PER_SERVICE.includes(key);
  if (isPerTrip && ref) {
    return TRIP_PRICE_SPREAD.map(mult => Math.round(ref * mult));
  }
  return [...DEMO_HOURLY_PRICES];
}

/** Transport fees por proveedor demo (5 valores). 0 si maquinaria no lleva traslado. */
const DEMO_TRANSPORT_FEES = [25000, 30000, 22000, 28000, 24000];

/**
 * Proveedores demo compartidos (fuente única de verdad).
 * @param {string} machinery - Tipo de maquinaria
 * @param {number} count - Cantidad (1-5). Default 5.
 * @param {Object} opts - { extended: true } para ProviderOptionsScreen (emits_invoice, distance, closing_time)
 */
export function getDemoProviders(machinery = 'retroexcavadora', count = 5, opts = {}) {
  const prices = getDemoPriceList(machinery);
  const transportFee = getDemoTransportFee(machinery);
  const transportFees = transportFee > 0 ? DEMO_TRANSPORT_FEES : [0, 0, 0, 0, 0];
  const base = [
    { id: 'demo-1', name: 'Transportes Silva', price_per_hour: prices[0], transport_fee: transportFees[0], eta_minutes: 45, rating: 4.8, license_plate: 'BGKL-45', operator_name: 'Carlos Silva' },
    { id: 'demo-2', name: 'Maquinarias del Sur', price_per_hour: prices[1], transport_fee: transportFees[1], eta_minutes: 54, rating: 4.6, license_plate: 'HJKL-78', operator_name: 'Pedro González' },
    { id: 'demo-3', name: 'Constructora Norte', price_per_hour: prices[2], transport_fee: transportFees[2], eta_minutes: 50, rating: 4.9, license_plate: 'MNOP-12', operator_name: 'Juan Martínez' },
    { id: 'demo-4', name: 'Arriendos Maipo', price_per_hour: prices[3], transport_fee: transportFees[3], eta_minutes: 58, rating: 4.7, license_plate: 'PQRS-33', operator_name: 'Luis Fernández' },
    { id: 'demo-5', name: 'Maquinarias Andes', price_per_hour: prices[4], transport_fee: transportFees[4], eta_minutes: 52, rating: 4.5, license_plate: 'TUVW-55', operator_name: 'Roberto Díaz' },
  ];
  if (opts.extended) {
    const ext = [
      { distance: 5.2, eta_minutes: 45, closing_time: '20:00', emits_invoice: true },
      { distance: 8.1, eta_minutes: 54, closing_time: '21:00', emits_invoice: true },
      { distance: 12.5, eta_minutes: 66, closing_time: '19:00', emits_invoice: true },
      { distance: 15.3, eta_minutes: 75, closing_time: '20:00', emits_invoice: false, name: 'Excavaciones Rápidas', operator_name: 'Roberto Díaz', license_plate: 'QRST-34' },
      { distance: 6.8, eta_minutes: 50, closing_time: '18:30', emits_invoice: true, name: 'Movitierras SpA', operator_name: 'Miguel Torres', license_plate: 'UVWX-56' },
    ];
    return base.slice(0, count).map((p, i) => ({ ...p, ...ext[i] }));
  }
  return base.slice(0, Math.min(count, 5));
}

// ===========================================
// ALERTAS DE PRECIO (fuera de rango mercado)
// Lógica tracción: nudges según % sobre referencia
// ===========================================

/**
 * Retorna alerta cuando el precio está fuera de rango de mercado (porcentaje significativo).
 * @param {number} price - Precio ingresado
 * @param {number} refPrice - Referencia de mercado
 * @returns {{ type: string, color: string, msg: string } | null}
 */
export function getPriceAlert(price, refPrice) {
  if (!price || price < 1000 || !refPrice) return null;
  const pct = price / refPrice;
  if (pct >= 0.8 && pct <= 1.0) return { type: 'competitive', color: '#4CAF50', msg: '✓ Precio competitivo — atractivo para clientes' };
  if (pct > 1.0 && pct <= 1.3) return { type: 'slightly_high', color: '#FFA726', msg: 'Precio un poco alto — considera bajar para más reservas' };
  if (pct > 1.3 && pct <= 1.7) return { type: 'high', color: '#FF9800', msg: 'Precio alto — menos reservas esperadas' };
  if (pct > 1.7) return { type: 'very_high', color: '#F44336', msg: 'Precio muy alto — pocas reservas' };
  if (pct < 0.7) return { type: 'low', color: '#FFA726', msg: 'Precio bajo — ¡atractivo! Verifica que sea correcto' };
  return null; // 70-80%: ok, sin alerta
}

const TRANSPORT_ALERT_MSGS = {
  competitive: '✓ Traslado competitivo — atractivo para clientes',
  slightly_high: 'Traslado un poco alto — considera bajar para más reservas',
  high: 'Traslado alto — menos reservas esperadas',
  very_high: 'Traslado muy alto — pocas reservas',
  low: 'Traslado bajo — ¡atractivo! Verifica que sea correcto',
};

/**
 * Alerta para costo de traslado (misma lógica, mensajes específicos).
 */
export function getTransportAlert(transport, refTransport = REFERENCE_TRANSPORT) {
  const alert = getPriceAlert(transport, refTransport);
  if (!alert) return null;
  return { ...alert, msg: TRANSPORT_ALERT_MSGS[alert.type] || alert.msg };
}

/** Referencia de precio final al cliente (subtotal ref + 10% + IVA comisión) para comparar con mercado. */
function getReferenceClientTotal(machineryType, hours, transportFee, reservationType) {
  const key = (machineryType || '').toLowerCase().replace(/\s+/g, '_');
  const refPrice = REFERENCE_PRICES[key];
  if (!refPrice) return null;
  const isPerHour = MACHINERY_PER_HOUR.includes(machineryType);
  const needsTransport = MACHINERY_NEEDS_TRANSPORT.includes(machineryType);
  const transport = needsTransport ? (transportFee ?? REFERENCE_TRANSPORT) : 0;
  let refSubtotal;
  if (reservationType === 'immediate') {
    const mult = IMMEDIATE_MULTIPLIERS[hours] || 1.20;
    refSubtotal = isPerHour ? refPrice * hours * mult : refPrice * mult;
  } else {
    refSubtotal = isPerHour ? refPrice * 8 : refPrice;
  }
  refSubtotal += transport;
  return Math.round(refSubtotal * (1 + MAQGO_CLIENT_COMMISSION_RATE * (1 + IVA_RATE)));
}

/**
 * Indica si el precio final al cliente (con recargos y tarifa MAQGO) es competitivo o fuera de mercado.
 * @returns {{ type: string, color: string, msg: string, pctVsRef: number } | null}
 */
export function getFinalPriceMarketAlert({ machineryType, basePrice, transportFee = 0, hours = 4, reservationType = 'immediate', needsInvoice = false }) {
  const finalPrice = calculateClientPrice({
    machineryType,
    basePrice,
    transportFee,
    hours: reservationType === 'immediate' ? hours : 8,
    days: 1,
    reservationType,
  });
  const refTotal = getReferenceClientTotal(machineryType, hours, transportFee, reservationType);
  if (!refTotal || refTotal < 1000) return null;
  const pctVsRef = finalPrice / refTotal;
  const alert = getPriceAlert(finalPrice, refTotal);
  if (!alert) return { type: 'in_range', color: '#9E9E9E', msg: 'Precio en rango', pctVsRef };
  const clientMsgs = {
    competitive: 'Precio final competitivo',
    slightly_high: 'Precio final algo por encima del mercado',
    high: 'Precio final alto vs mercado',
    very_high: 'Precio final muy por encima del mercado',
    low: 'Precio final bajo — revisar',
  };
  return {
    ...alert,
    pctVsRef,
    msg: clientMsgs[alert.type] || alert.msg,
  };
}

// ===========================================
// CÁLCULO DE PRECIO (misma fórmula que backend)
// ===========================================

/**
 * Calcula el precio final para el cliente (sin factura).
 * Fórmula: subtotal + 10% comisión + IVA sobre comisión
 * 
 * @param {Object} params
 * @param {string} params.machineryType - Tipo de maquinaria
 * @param {number} params.basePrice - Precio base del proveedor (price_per_hour)
 * @param {number} params.transportFee - Fee de traslado (0 si no aplica)
 * @param {number} params.hours - Horas (4-8 para inmediato)
 * @param {number} params.days - Días (para programado)
 * @param {string} params.reservationType - 'immediate' | 'scheduled'
 * @returns {number} Precio final redondeado
 */
export function calculateClientPrice({ machineryType, basePrice, transportFee = 0, hours = 4, days = 1, reservationType = 'immediate' }) {
  const isPerHour = MACHINERY_PER_HOUR.includes(machineryType);
  const needsTransport = MACHINERY_NEEDS_TRANSPORT.includes(machineryType);
  const transport = needsTransport ? (transportFee || 0) : 0;

  let serviceCost;
  if (reservationType === 'immediate') {
    const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.20;
    if (isPerHour) {
      serviceCost = basePrice * hours * multiplier;
    } else {
      serviceCost = basePrice * multiplier;
    }
  } else {
    const hoursPerDay = 8;
    if (isPerHour) {
      serviceCost = basePrice * hoursPerDay * days;
    } else {
      serviceCost = basePrice * days;
    }
  }

  const subtotal = serviceCost + transport;
  const clientCommission = subtotal * MAQGO_CLIENT_COMMISSION_RATE;
  const clientCommissionIva = clientCommission * IVA_RATE;
  const finalPrice = subtotal + clientCommission + clientCommissionIva;

  return Math.round(finalPrice);
}

/**
 * Calcula el precio con factura (IVA sobre subtotal + comisión).
 * Usado en Confirm cuando el usuario selecciona "Sí" a factura.
 */
export function calculateWithInvoice(baseAmount, commissionNeto) {
  const baseParaIva = baseAmount + commissionNeto;
  const ivaTotal = Math.round(baseParaIva * IVA_RATE);
  return baseAmount + commissionNeto + ivaTotal;
}

/**
 * Desglose único para mostrar al cliente (resultado de pago, servicio finalizado).
 * Acepta forma API (service_amount, client_commission, …) o forma pantalla (service, maqgoFee, ivaProveedor, …).
 * Con factura: un solo IVA (servicio + tarifa MAQGO). Usa IVA_RATE; evita duplicar 0.19 en pantallas.
 *
 * @param {Object} pricing - Objeto con service_amount o service, transport_cost o transport, immediate_bonus o bonus,
 *   client_commission o maqgoFee, client_commission_iva o maqgoFeeIva, ivaProveedor (opcional), needsInvoice, final_price o total
 * @returns {{ service: number, transport: number, bonus: number, tarifaNeta: number, tarifaConIva: number, ivaTotal: number, total: number, needsInvoice: boolean }}
 */
export function getClientBreakdown(pricing) {
  if (!pricing) {
    return { service: 0, transport: 0, bonus: 0, tarifaNeta: 0, tarifaConIva: 0, ivaTotal: 0, total: 0, needsInvoice: false };
  }
  const service = pricing.service_amount ?? pricing.breakdown?.service_cost ?? pricing.service ?? 0;
  const transport = pricing.transport_cost ?? pricing.breakdown?.transport_cost ?? pricing.transport ?? 0;
  const bonus = pricing.immediate_bonus ?? pricing.breakdown?.immediate_bonus ?? pricing.bonus ?? 0;
  const subtotalServicio = service + transport + bonus;
  const tarifaNeta = pricing.client_commission ?? pricing.breakdown?.client_commission ?? pricing.maqgoFee ?? 0;
  const tarifaIva = pricing.client_commission_iva ?? pricing.breakdown?.client_commission_iva ?? pricing.maqgoFeeIva ?? Math.round(tarifaNeta * IVA_RATE);
  const tarifaConIva = tarifaNeta + tarifaIva;
  const hasStoredIva = pricing.ivaProveedor != null || pricing.maqgoFeeIva != null;
  const ivaTotal = hasStoredIva
    ? ((pricing.ivaProveedor || 0) + (pricing.maqgoFeeIva || 0))
    : (Math.round(subtotalServicio * IVA_RATE) + Math.round(tarifaNeta * IVA_RATE));
  const total = pricing.final_price ?? pricing.total ?? 0;
  return {
    service,
    transport,
    bonus,
    tarifaNeta,
    tarifaConIva,
    ivaTotal,
    total,
    needsInvoice: !!pricing.needsInvoice
  };
}

/**
 * Fallback local para cuando la API de pricing falla.
 * Retorna estructura compatible con la respuesta del backend.
 */
export function buildPricingFallback({ machineryType, basePrice, transportFee, hours, days, reservationType, isHybrid, additionalDays }) {
  const isPerHour = MACHINERY_PER_HOUR.includes(machineryType);
  const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.20;
  const needsTransport = MACHINERY_NEEDS_TRANSPORT.includes(machineryType);
  const transport = needsTransport ? (transportFee || 0) : 0;

  if (isHybrid && additionalDays > 0) {
    const todayCost = isPerHour ? basePrice * hours * multiplier : basePrice * multiplier;
    const additionalCost = isPerHour ? basePrice * 8 * additionalDays : basePrice * additionalDays;
    const totalServiceCost = todayCost + additionalCost;
    const subtotal = totalServiceCost + transport;
    const commission = Math.round(subtotal * MAQGO_CLIENT_COMMISSION_RATE);
    const commissionIva = Math.round(commission * IVA_RATE);
    const finalPrice = Math.round(subtotal + commission + commissionIva);

    return {
      final_price: finalPrice,
      today: { hours, total_cost: Math.round(todayCost) },
      additional_days: { days: additionalDays, total_cost: Math.round(additionalCost) },
      breakdown: { transport_cost: transport, service_cost: totalServiceCost, client_commission: commission, client_commission_iva: commissionIva }
    };
  }

  const finalPrice = calculateClientPrice({
    machineryType,
    basePrice,
    transportFee,
    hours: reservationType === 'immediate' ? hours : 8,
    days: reservationType === 'scheduled' ? days : 1,
    reservationType
  });

  let serviceCost;
  let serviceAmount;
  let immediateBonus = 0;
  if (reservationType === 'immediate') {
    serviceAmount = isPerHour ? basePrice * hours : basePrice;
    serviceCost = isPerHour ? basePrice * hours * multiplier : basePrice * multiplier;
    immediateBonus = serviceCost - serviceAmount;
  } else {
    serviceAmount = isPerHour ? basePrice * 8 * days : basePrice * days;
    serviceCost = serviceAmount;
  }

  const subtotal = serviceCost + transport;
  const commission = Math.round(subtotal * MAQGO_CLIENT_COMMISSION_RATE);
  const commissionIva = Math.round(commission * IVA_RATE);

  return {
    final_price: finalPrice,
    service_amount: Math.round(serviceAmount),
    immediate_bonus: Math.round(immediateBonus),
    transport_cost: transport,
    breakdown: {
      service_cost: serviceCost,
      transport_cost: transport,
      immediate_bonus: Math.round(immediateBonus),
      client_commission: commission,
      client_commission_iva: commissionIva
    }
  };
}
