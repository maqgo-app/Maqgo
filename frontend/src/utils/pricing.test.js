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
  CON_FACTURA_FACTOR
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
