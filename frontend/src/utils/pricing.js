/**
 * MAQGO - Utilidad de precios compartida
 * 
 * Fuente única de verdad para cálculos de precio en el frontend.
 * Debe coincidir exactamente con backend/pricing/calculator.py y constants.py
 * 
 * Uso: ProviderOptionsScreen y ConfirmServiceScreen usan estas funciones
 * para garantizar consistencia entre alternativas de arriendo y preview final.
 */

import {
  MACHINERY_PER_HOUR,
  MACHINERY_PER_SERVICE,
  MACHINERY_NEEDS_TRANSPORT,
  MACHINERY_NO_TRANSPORT,
} from './machineryConstants.js';
import { getMachineryId } from './machineryNames.js';

export {
  MACHINERY_PER_HOUR,
  MACHINERY_PER_SERVICE,
  MACHINERY_NEEDS_TRANSPORT,
  MACHINERY_NO_TRANSPORT,
};

export const IMMEDIATE_MULTIPLIERS = {
  4: 1.20,   // +20%
  5: 1.175,  // +17.5%
  6: 1.15,   // +15%
  7: 1.125,  // +12.5%
  8: 1.10,   // +10%
};

export const MAQGO_CLIENT_COMMISSION_RATE = 0.10;
export const IVA_RATE = 0.19;

export const CON_FACTURA_FACTOR = (1 + MAQGO_CLIENT_COMMISSION_RATE) * (1 + IVA_RATE) / (1 + MAQGO_CLIENT_COMMISSION_RATE * (1 + IVA_RATE));
export function totalConFactura(sinFacturaTotal) {
  return Math.round(sinFacturaTotal * CON_FACTURA_FACTOR);
}

export const MAX_PRICE_ABOVE_MARKET_PCT = 2.0;
export const REFERENCE_TRANSPORT = 30000;

export const PRICE_CAP_RULE_LABEL = 'Máx. 2x referencia de mercado';
export const PRICING_TRACTION_MSG = 'Precios competitivos = más reservas';

// ========== SINGLE SOURCE OF TRUTH (ADMIN → DB → PROVEEDOR) ==========
//
// Los precios de referencia NO están hardcodeados aquí.
// Se obtienen desde:  GET /api/pricing/reference-prices
// (endpoint público, mismo valor que Admin escribe en DB).
//
// - Cache en memoria con TTL 30s para evitar requests redundantes.
// - Si el GET falla (offline/error), se usa FALLBACK_TECHNICAL como valor
//   transitorio SIN AFIRMAR QUE ES EL VIGENTE. El usuario de esta lib debe
//   indicar loading/error si prefiere antes de mostrar un valor.
// - REFERENCE_PRICES exportado SE LLENA con el fetch (no hardcode).
//   Si el fetch no se ejecutó aún y alguien accede síncronamente, está vacío.

const REFERENCE_PRICES_CACHE_TTL_MS = 30 * 1000;

const FALLBACK_TECHNICAL = {
  retroexcavadora: 80000, excavadora: 110000, bulldozer: 140000,
  motoniveladora: 155000, compactadora: 75000, minicargador: 62500,
  grua: 120000, camion_pluma: 285000, camion_aljibe: 260000, camion_tolva: 240000,
};

let _referenceCache = null;
let _referenceCacheAt = 0;
let _loadPromise = null;

/** Estructura DB pública. */
export const REFERENCE_PRICES_DATA = {
  per_hour: {},
  per_service: {},
  by_capacity: {},
  transport: {
    min: 15000, default: REFERENCE_TRANSPORT, max: REFERENCE_TRANSPORT * 2,
    same_comuna: { min: 15000, default: REFERENCE_TRANSPORT, max: REFERENCE_TRANSPORT * 2 },
    intercomuna: { min: 25000, default: Math.round(REFERENCE_TRANSPORT * 1.5), max: REFERENCE_TRANSPORT * 3 },
    interregional: { min: 50000, default: Math.round(REFERENCE_TRANSPORT * 2.5), max: REFERENCE_TRANSPORT * 5 },
  },
};

/** Map flat (mantener backwards compat). Pre-populado con fallback técnico
 *  para pantallas que acceden síncronamente. Luego _applyPayload() lo
 *  sobreescribe con el valor real desde DB (Admin). */
export const REFERENCE_PRICES = { ...FALLBACK_TECHNICAL };

function _isFresh() {
  return Boolean(_referenceCache && Date.now() - _referenceCacheAt <= REFERENCE_PRICES_CACHE_TTL_MS);
}

function _applyPayload(data) {
  if (!data || typeof data !== 'object') return;
  REFERENCE_PRICES_DATA.per_hour = { ...(data.per_hour || {}) };
  REFERENCE_PRICES_DATA.per_service = { ...(data.per_service || {}) };
  REFERENCE_PRICES_DATA.by_capacity = { ...(data.by_capacity || {}) };
  if (data.transport && typeof data.transport === 'object') {
    REFERENCE_PRICES_DATA.transport = { ...REFERENCE_PRICES_DATA.transport, ...data.transport };
  }
  // Llenar REFERENCE_PRICES (flat backwards compat): default sugerido por máquina.
  Object.keys(REFERENCE_PRICES).forEach(k => delete REFERENCE_PRICES[k]);
  for (const [k, v] of Object.entries(REFERENCE_PRICES_DATA.per_hour || {})) {
    if (v && typeof v === 'object' && typeof v.default === 'number') REFERENCE_PRICES[k] = v.default;
  }
  for (const [k, v] of Object.entries(REFERENCE_PRICES_DATA.per_service || {})) {
    if (v && typeof v === 'object' && typeof v.default === 'number') REFERENCE_PRICES[k] = v.default;
  }
  // Garantizar que las 10 categorías existan aunque falle el merge (fallback técnico sólo si faltan)
  for (const [k, fallbackDefault] of Object.entries(FALLBACK_TECHNICAL)) {
    if (!(k in REFERENCE_PRICES)) {
      REFERENCE_PRICES[k] = fallbackDefault;
    }
  }
}

async function _load(timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('/api/pricing/reference-prices?_=' + Date.now(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (!res || res.status !== 200) throw new Error('non-200');
    const data = await res.json();
    _applyPayload(data);
    _referenceCache = data;
    _referenceCacheAt = Date.now();
    return true;
  } catch (_err) {
    _applyPayload({});
    _referenceCache = { ok: false, fallback: true };
    _referenceCacheAt = Date.now();
    return false;
  }
}

export async function ensureReferencePricesLoaded({ force = false } = {}) {
  if (force) {
    _loadPromise = null;
  }
  if (_loadPromise && !force && _isFresh()) return _loadPromise;
  if (_isFresh() && _referenceCache) return true;
  if (!_loadPromise) {
    _loadPromise = _load().finally(() => {});
  }
  return _loadPromise;
}

export function isReferencePricesFallback() {
  return Boolean(_referenceCache && !_isFresh() === false && _referenceCache && _referenceCache.fallback);
}

// =====================================================================
// PRECARGA INMEDIATA (background, no bloquea).
// Assim como el módulo se importa, lanzamos fetch ASÍNCRONO sin await
// para que los datos estén listos ~300ms después cuando los screens
// (MachineDataScreen, MyMachinesScreen, ProviderOptionsScreen,
// ConfirmServiceScreen, AdminPricingScreen) los necesiten.
// =====================================================================
(function _preloadImmediate() {
  try {
    _load().catch(() => {});
  } catch (_e) {}
})();

const PROVIDER_PUBLISH_MIN_HOUR = 20000;
const PROVIDER_PUBLISH_MIN_SERVICE = 100000;

function _capacityKeyFor(machineId, capacityValue) {
  if (capacityValue === undefined || capacityValue === null || capacityValue === '') return null;
  const s = String(capacityValue);
  // Intentar exacto ("0.5", "10000"), luego float rounded, luego int str
  const bycap = REFERENCE_PRICES_DATA.by_capacity && REFERENCE_PRICES_DATA.by_capacity[machineId];
  if (!bycap) return null;
  if (s in bycap) return s;
  const tryNum = Number(s);
  if (!Number.isNaN(tryNum)) {
    const intKey = String(Math.round(tryNum));
    if (intKey in bycap) return intKey;
    const floatKey1 = tryNum.toFixed(1);
    if (floatKey1 in bycap) return floatKey1;
    const floatKey2 = tryNum.toFixed(2);
    if (floatKey2 in bycap) return floatKey2;
    for (const k of Object.keys(bycap)) {
      const kn = Number(k);
      if (!Number.isNaN(kn) && Math.abs(kn - tryNum) < 1e-9) return k;
    }
  }
  return null;
}

/**
 * Devuelve el rango sugerido para publicación del proveedor.
 * @param {string} machineryType id o nombre visible
 * @param {string|number|undefined} [capacity] valor de capacidad (ej: "0.5", "10000", 200)
 * @returns {{ min: number, max: number, ref: number, suggested: number, isPerHour: boolean, isTruckTrip: boolean, source: 'capacity'|'generic'|'fallback' }}
 */
export function getProviderPriceReferenceRange(machineryType, capacity) {
  const id = getMachineryId(machineryType) || String(machineryType || '').trim();
  const isPerHour = MACHINERY_PER_HOUR.includes(id);
  const isTruckTrip = MACHINERY_PER_SERVICE.includes(id);
  const baseMin = isPerHour ? PROVIDER_PUBLISH_MIN_HOUR : PROVIDER_PUBLISH_MIN_SERVICE;
  // Intento 1: por capacidad
  let ref = undefined;
  let source = 'generic';
  if (capacity !== undefined && capacity !== null && capacity !== '') {
    const bycap = REFERENCE_PRICES_DATA.by_capacity?.[id];
    const ck = _capacityKeyFor(id, capacity);
    if (ck && bycap && bycap[ck] && typeof bycap[ck].default === 'number') {
      ref = bycap[ck].default;
      source = 'capacity';
    }
  }
  // Intento 2: genérico por máquina
  if (ref === undefined || ref === null || ref === 0) {
    const bucket = isPerHour ? REFERENCE_PRICES_DATA.per_hour : REFERENCE_PRICES_DATA.per_service;
    if (bucket && bucket[id] && typeof bucket[id].default === 'number' && bucket[id].default > 0) {
      ref = bucket[id].default;
      source = 'generic';
    }
  }
  // Intento 3: flat map REFERENCE_PRICES (llenado por fetch)
  if (!ref && REFERENCE_PRICES[id]) {
    ref = REFERENCE_PRICES[id];
    source = 'generic';
  }
  // Intento 4 (fallback técnico, marcado)
  if (!ref) {
    ref = FALLBACK_TECHNICAL[id] ?? FALLBACK_TECHNICAL.retroexcavadora;
    source = 'fallback';
  }
  const min = baseMin;
  const max = Math.round(ref * MAX_PRICE_ABOVE_MARKET_PCT);
  const suggested = Math.round((min + max) / 2);
  return { min, max, ref, suggested, isPerHour, isTruckTrip, source };
}

export const PRICE_REFERENCE = Object.fromEntries(
  Object.keys(FALLBACK_TECHNICAL).map((k) => {
    const r = getProviderPriceReferenceRange(k);
    return [k, { min: r.min, max: r.max }];
  })
);

export const MACHINERY_PER_TRIP = MACHINERY_PER_SERVICE;

export function isPerTripMachinery(machinery) {
  const id = getMachineryId(machinery);
  return Boolean(id && MACHINERY_PER_SERVICE.includes(id));
}

export function needsTransportMachinery(machinery) {
  const id = getMachineryId(machinery);
  return Boolean(id && MACHINERY_NEEDS_TRANSPORT.includes(id));
}

/** Traslado demo: 0 si maquinaria no lleva traslado. */
export function getDemoTransportFee(machinery) {
  const id = getMachineryId(machinery);
  if (!needsTransportMachinery(id)) return 0;
  const tr = REFERENCE_PRICES_DATA?.transport?.default;
  return typeof tr === 'number' && tr > 0 ? tr : REFERENCE_TRANSPORT;
}

const DEMO_HOURLY_PRICES = [45000, 42000, 48000, 44000, 46000];
const TRIP_PRICE_SPREAD = [0.85, 0.92, 1, 1.08, 1.15];

export function getDemoPriceList(machinery, capacity) {
  const id = getMachineryId(machinery);
  const range = getProviderPriceReferenceRange(id ?? machinery, capacity);
  const ref = range.ref;
  const isPerTrip = id && MACHINERY_PER_SERVICE.includes(id);
  if (isPerTrip && ref) {
    return TRIP_PRICE_SPREAD.map(mult => Math.round(ref * mult));
  }
  if (isPerTrip) return [...DEMO_HOURLY_PRICES];
  // por hora: basado en referencia si existe
  if (ref && ref > 0) {
    return DEMO_HOURLY_PRICES.map((_, idx) => Math.round(ref * (0.93 + (idx * 0.035))));
  }
  return [...DEMO_HOURLY_PRICES];
}

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
  competitive: '✓ Costo de traslado competitivo para esta maquinaria',
  slightly_high: 'Costo de traslado un poco alto para esta maquinaria',
  high: 'Costo de traslado alto para esta maquinaria',
  very_high: 'Costo de traslado muy alto para esta maquinaria',
  low: 'Costo de traslado bajo para esta maquinaria; verifica que sea correcto',
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
  const id = getMachineryId(machineryType);
  const refPrice = REFERENCE_PRICES[id];
  if (!refPrice) return null;
  const isPerHour = Boolean(id && MACHINERY_PER_HOUR.includes(id));
  const needsTransport = Boolean(id && MACHINERY_NEEDS_TRANSPORT.includes(id));
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
export function getFinalPriceMarketAlert({ machineryType, basePrice, transportFee = 0, hours = 4, reservationType = 'immediate' }) {
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
  const id = getMachineryId(machineryType);
  const isPerHour = Boolean(id && MACHINERY_PER_HOUR.includes(id));
  const needsTransport = Boolean(id && MACHINERY_NEEDS_TRANSPORT.includes(id));
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
 * Usado en Confirm cuando el usuario elige factura con RUT empresa.
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
  if (!pricing || typeof pricing !== 'object') {
    return { service: 0, transport: 0, bonus: 0, tarifaNeta: 0, tarifaConIva: 0, ivaTotal: 0, total: 0, needsInvoice: false };
  }
  const service = pricing.service_amount ?? pricing?.breakdown?.service_cost ?? pricing.service ?? 0;
  const transport = pricing.transport_cost ?? pricing?.breakdown?.transport_cost ?? pricing.transport ?? 0;
  const bonus = pricing.immediate_bonus ?? pricing?.breakdown?.immediate_bonus ?? pricing.bonus ?? 0;
  const subtotalServicio = service + transport + bonus;
  const tarifaNeta = pricing.client_commission ?? pricing?.breakdown?.client_commission ?? pricing.maqgoFee ?? 0;
  const tarifaIva = pricing.client_commission_iva ?? pricing?.breakdown?.client_commission_iva ?? pricing.maqgoFeeIva ?? Math.round(tarifaNeta * IVA_RATE);
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
  const id = getMachineryId(machineryType);
  const isPerHour = Boolean(id && MACHINERY_PER_HOUR.includes(id));
  const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.20;
  const needsTransport = Boolean(id && MACHINERY_NEEDS_TRANSPORT.includes(id));
  const transport = needsTransport ? (transportFee || 0) : 0;

  if (isHybrid && additionalDays > 0) {
    const todayCost = isPerHour ? basePrice * hours * multiplier : basePrice * multiplier;
    const additionalCost = isPerHour ? basePrice * 8 * additionalDays : basePrice * additionalDays;
    const totalServiceCost = todayCost + additionalCost;
    const subtotal = totalServiceCost + transport;
    const commission = Math.round(subtotal * MAQGO_CLIENT_COMMISSION_RATE);
    const commissionIva = Math.round(commission * IVA_RATE);
    const sinFactura = Math.round(subtotal + commission + commissionIva);
    const finalPrice = totalConFactura(sinFactura);

    return {
      final_price: finalPrice,
      today: { hours, total_cost: Math.round(todayCost) },
      additional_days: { days: additionalDays, total_cost: Math.round(additionalCost) },
      breakdown: { transport_cost: transport, service_cost: totalServiceCost, client_commission: commission, client_commission_iva: commissionIva }
    };
  }

  const sinFactura = calculateClientPrice({
    machineryType,
    basePrice,
    transportFee,
    hours: reservationType === 'immediate' ? hours : 8,
    days: reservationType === 'scheduled' ? days : 1,
    reservationType
  });
  const finalPrice = totalConFactura(sinFactura);

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
