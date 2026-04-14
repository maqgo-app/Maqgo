import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTruckService,
  isTruckUrgencyBooking,
  getTruckTimeRangeFromUrgency,
  getTruckPricingHoursFromUrgency,
  getTruckUrgencySummaryLine,
  validateBookingModelBeforeOneClick,
} from './clientBookingTruck.js';

function mockLocalStorage() {
  const store = Object.create(null);
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => {
        delete store[k];
      });
    },
  };
}

function mockSessionStorage() {
  const store = Object.create(null);
  globalThis.sessionStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => {
        delete store[k];
      });
    },
  };
}

describe('clientBookingTruck', () => {
  beforeEach(() => {
    mockLocalStorage();
    mockSessionStorage();
  });

  it('isTruckService reconoce ids canónicos', () => {
    expect(isTruckService('camion_tolva')).toBe(true);
    expect(isTruckService('grua')).toBe(true);
    expect(isTruckService('retroexcavadora')).toBe(false);
  });

  it('isTruckUrgencyBooking solo con trip + tipo camión', () => {
    localStorage.setItem('priceType', 'trip');
    localStorage.setItem('selectedMachinery', 'camion_tolva');
    expect(isTruckUrgencyBooking('camion_tolva')).toBe(true);

    localStorage.setItem('priceType', 'hour');
    localStorage.setItem('selectedMachinery', 'grua');
    expect(isTruckUrgencyBooking('grua')).toBe(false);
  });

  it('getTruckTimeRangeFromUrgency express → 2-4h', () => {
    expect(getTruckTimeRangeFromUrgency('express')).toBe('2-4h');
  });

  it('getTruckPricingHoursFromUrgency express usa multiplicador interno (no UI)', () => {
    expect(getTruckPricingHoursFromUrgency('express')).toBe(5);
  });

  it('getTruckUrgencySummaryLine express no usa número suelto de horas', () => {
    expect(getTruckUrgencySummaryLine('express')).toMatch(/2/);
    expect(getTruckUrgencySummaryLine('express')).not.toMatch(/5\s*h/);
  });

  it('validateBookingModelBeforeOneClick falla si truck tiene selectedHours', () => {
    localStorage.setItem('token', 'x'.repeat(12));
    localStorage.setItem('priceType', 'trip');
    localStorage.setItem('selectedMachinery', 'camion_tolva');
    localStorage.setItem('serviceModel', 'truck');
    localStorage.setItem('selectedHours', '5');
    const r = validateBookingModelBeforeOneClick();
    expect(r.ok).toBe(false);
    expect(r.code).toBe('truck_duration_contamination');
  });

  it('validateBookingModelBeforeOneClick ok truck sin selectedHours', () => {
    localStorage.setItem('token', 'x'.repeat(12));
    localStorage.setItem('priceType', 'trip');
    localStorage.setItem('selectedMachinery', 'camion_tolva');
    localStorage.setItem('serviceModel', 'truck');
    localStorage.removeItem('selectedHours');
    expect(validateBookingModelBeforeOneClick().ok).toBe(true);
  });
});
