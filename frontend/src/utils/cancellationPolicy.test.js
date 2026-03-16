/**
 * Tests para utils/cancellationPolicy.js
 * Política de cancelación y no-show (60/90 min).
 */
import { describe, it, expect } from 'vitest';
import {
  CANCELLATION_PERCENTAGES,
  NON_CANCELLABLE_STATUSES,
  getCancellationWindowText,
  getMinutesAfterEtaToAllowCancel
} from './cancellationPolicy.js';

describe('cancellationPolicy constants', () => {
  it('CANCELLATION_PERCENTAGES has expected values', () => {
    expect(CANCELLATION_PERCENTAGES.pending).toBe(0);
    expect(CANCELLATION_PERCENTAGES.assigned).toBe(0.2);
    expect(CANCELLATION_PERCENTAGES.en_route).toBe(0.4);
    expect(CANCELLATION_PERCENTAGES.arrived).toBe(0.6);
  });

  it('NON_CANCELLABLE_STATUSES includes started and in_progress', () => {
    expect(NON_CANCELLABLE_STATUSES).toContain('started');
    expect(NON_CANCELLABLE_STATUSES).toContain('in_progress');
  });
});

describe('getMinutesAfterEtaToAllowCancel', () => {
  it('returns 90 when operator reported en route', () => {
    expect(getMinutesAfterEtaToAllowCancel(true)).toBe(90);
  });
  it('returns 60 when operator did not report en route', () => {
    expect(getMinutesAfterEtaToAllowCancel(false)).toBe(60);
  });
});

describe('getCancellationWindowText', () => {
  it('scheduled returns 1 hour message', () => {
    const text = getCancellationWindowText({ reservationType: 'scheduled' });
    expect(text).toMatch(/1 hora|Programado/);
  });
  it('urgent returns cargo message', () => {
    const text = getCancellationWindowText({ urgencyType: 'urgent' });
    expect(text).toMatch(/Urgente|hay cargo/);
  });
  it('express returns 15 min message', () => {
    const text = getCancellationWindowText({ urgencyType: 'express' });
    expect(text).toMatch(/15 min|Express/);
  });
  it('today returns 30 min message', () => {
    const text = getCancellationWindowText({ urgencyType: 'today' });
    expect(text).toMatch(/30 min|Hoy/);
  });
});
