/**
 * Tests para utils/pricing.js
 */
import { describe, it, expect } from 'vitest';
import {
  IVA_RATE,
  MAQGO_CLIENT_COMMISSION_RATE,
  getClientBreakdown,
  calculateClientPrice,
  calculateWithInvoice,
  totalConFactura,
  CON_FACTURA_FACTOR,
  buildPricingFallback,
  isPerTripMachinery,
  needsTransportMachinery,
  getProviderPriceReferenceRange,
  PRICE_REFERENCE,
} from './pricing.js';

describe('pricing constants', () => {
  it('IVA_RATE is 0.19', () => {
    expect(IVA_RATE).toBe(0.19);
  });
  it('MAQGO_CLIENT_COMMISSION_RATE is 0.10', () => {
    expect(MAQGO_CLIENT_COMMISSION_RATE).toBe(0.10);
  });
});

describe('getClientBreakdown', () => {
  it('returns zeros when pricing is null', () => {
    const b = getClientBreakdown(null);
    expect(b.service).toBe(0);
    expect(b.ivaTotal).toBe(0);
    expect(b.needsInvoice).toBe(false);
  });

  it('accepts API shape and computes ivaTotal with factura', () => {
    const pricing = {
      service_amount: 100000,
      transport_cost: 20000,
      immediate_bonus: 5000,
      client_commission: 12500,
      client_commission_iva: 2375,
      needsInvoice: true,
      final_price: 163625
    };
    const b = getClientBreakdown(pricing);
    expect(b.service).toBe(100000);
    expect(b.transport).toBe(20000);
    expect(b.bonus).toBe(5000);
    expect(b.tarifaNeta).toBe(12500);
    const ivaServicio = Math.round(125000 * IVA_RATE);
    const ivaTarifa = Math.round(12500 * IVA_RATE);
    expect(b.ivaTotal).toBe(ivaServicio + ivaTarifa);
    expect(b.total).toBe(163625);
    expect(b.needsInvoice).toBe(true);
  });

  it('accepts ServiceFinishedScreen shape', () => {
    const pricing = {
      service: 100000,
      transport: 20000,
      bonus: 0,
      maqgoFee: 18000,
      maqgoFeeIva: 3420,
      ivaProveedor: 22800,
      total: 164220,
      needsInvoice: true
    };
    const b = getClientBreakdown(pricing);
    expect(b.service).toBe(100000);
    expect(b.ivaTotal).toBe(22800 + 3420);
    expect(b.total).toBe(164220);
  });
});

describe('calculateClientPrice', () => {
  it('returns positive integer for immediate 4h', () => {
    const price = calculateClientPrice({
      machineryType: 'retroexcavadora',
      basePrice: 50000,
      transportFee: 25000,
      hours: 4,
      reservationType: 'immediate'
    });
    expect(price).toBeGreaterThan(0);
    expect(Number.isInteger(price)).toBe(true);
  });

  it('same result for canonical id and nombre visible (Retroexcavadora)', () => {
    const a = calculateClientPrice({
      machineryType: 'retroexcavadora',
      basePrice: 50000,
      transportFee: 25000,
      hours: 4,
      reservationType: 'immediate',
    });
    const b = calculateClientPrice({
      machineryType: 'Retroexcavadora',
      basePrice: 50000,
      transportFee: 25000,
      hours: 4,
      reservationType: 'immediate',
    });
    expect(a).toBe(b);
  });
});

describe('isPerTripMachinery / needsTransportMachinery', () => {
  it('detecta por viaje por id o nombre visible', () => {
    expect(isPerTripMachinery('camion_pluma')).toBe(true);
    expect(isPerTripMachinery('Camión Pluma (Hiab)')).toBe(true);
    expect(isPerTripMachinery('retroexcavadora')).toBe(false);
  });

  it('traslado: nombre visible de grúa cuenta como necesita transporte', () => {
    expect(needsTransportMachinery('grua')).toBe(true);
    expect(needsTransportMachinery('Grúa Móvil')).toBe(true);
    expect(needsTransportMachinery('camion_aljibe')).toBe(false);
  });
});

describe('calculateWithInvoice', () => {
  it('adds IVA to base + commission net', () => {
    const total = calculateWithInvoice(100000, 15000);
    const iva = Math.round(115000 * IVA_RATE);
    expect(total).toBe(100000 + 15000 + iva);
  });
});

describe('totalConFactura', () => {
  it('applies CON_FACTURA_FACTOR', () => {
    const sinFactura = 100000;
    const conFactura = totalConFactura(sinFactura);
    expect(conFactura).toBe(Math.round(sinFactura * CON_FACTURA_FACTOR));
  });
});

describe('volver atrás (pricing null)', () => {
  it('getClientBreakdown no lanza con pricing null o undefined', () => {
    expect(() => getClientBreakdown(null)).not.toThrow();
    expect(() => getClientBreakdown(undefined)).not.toThrow();
    const b = getClientBreakdown(null);
    expect(b.service).toBe(0);
    expect(b.total).toBe(0);
  });

  it('displayPricing (fallback) permite acceso seguro a breakdown cuando pricing es null', () => {
    const pricing = null;
    const fallbackPricing = buildPricingFallback({
      machineryType: 'retroexcavadora',
      basePrice: 50000,
      transportFee: 25000,
      hours: 4,
      days: 1,
      reservationType: 'immediate',
      isHybrid: false,
      additionalDays: 0
    });
    const displayPricing = pricing ?? fallbackPricing;
    expect(displayPricing).toBe(fallbackPricing);
    expect(() => displayPricing.breakdown?.service_cost).not.toThrow();
    expect(displayPricing.breakdown?.service_cost).toBeGreaterThan(0);
    expect(displayPricing.breakdown?.transport_cost).toBe(25000);
    expect(displayPricing.service_amount).toBeGreaterThan(0);
    expect(displayPricing.final_price).toBeGreaterThan(0);
  });

  it('camion tolva: fallback con REFERENCE_PRICES cuando price_per_hour es 0', () => {
    const fallbackPricing = buildPricingFallback({
      machineryType: 'camion_tolva',
      basePrice: 240000,
      transportFee: 0,
      hours: 4,
      days: 1,
      reservationType: 'immediate',
      isHybrid: false,
      additionalDays: 0
    });
    expect(fallbackPricing).not.toBeNull();
    expect(fallbackPricing.final_price).toBeGreaterThan(0);
    expect(fallbackPricing.breakdown?.service_cost).toBeGreaterThan(0);
    expect(fallbackPricing.breakdown?.transport_cost).toBe(0);
  });
});

describe('getProviderPriceReferenceRange / PRICE_REFERENCE', () => {
  it('retroexcavadora: rango hora con min fijo y max 2x ref', () => {
    const r = getProviderPriceReferenceRange('retroexcavadora');
    expect(r.isPerHour).toBe(true);
    expect(r.isTruckTrip).toBe(false);
    expect(r.min).toBe(20000);
    expect(r.max).toBe(160000);
    expect(r.suggested).toBe(90000);
  });

  it('camion_tolva: servicio/viaje con mínimo servicio', () => {
    const r = getProviderPriceReferenceRange('camion_tolva');
    expect(r.isPerHour).toBe(false);
    expect(r.isTruckTrip).toBe(true);
    expect(r.min).toBe(100000);
    expect(r.max).toBe(480000);
  });

  it('PRICE_REFERENCE alinea con helper por id', () => {
    const r = getProviderPriceReferenceRange('minicargador');
    expect(PRICE_REFERENCE.minicargador.min).toBe(r.min);
    expect(PRICE_REFERENCE.minicargador.max).toBe(r.max);
  });
});
