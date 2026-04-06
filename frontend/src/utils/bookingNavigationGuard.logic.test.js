import { describe, expect, it } from 'vitest';
import {
  getBookingNavigationRedirect,
  canAccessCardRoute,
  canAccessBillingRoute,
  canAccessOneClickCompleteRoute,
  hashBookingNavSnapshot,
  shouldBypassGuardForSuccess,
  computeContextHash,
} from './bookingNavigationGuard.logic';

const emptySnap = {
  needsInvoice: false,
  clientBookingStep: '',
  bookingProgressStep: '',
  tbkUser: '',
  oneclickDemoMode: false,
};

describe('getBookingNavigationRedirect', () => {
  it('/client/confirm siempre válido', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/confirm',
        checkoutState: 'IDLE',
        snapshot: emptySnap,
      })
    ).toBeNull();
  });

  it('/client/card sin servicio confirmado ni paso payment → /client/confirm', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/card',
        checkoutState: 'IDLE',
        snapshot: emptySnap,
      })
    ).toBe('/client/confirm');
  });

  it('/client/card con SERVICE_CONFIRMED → ok', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/card',
        checkoutState: 'SERVICE_CONFIRMED',
        snapshot: emptySnap,
      })
    ).toBeNull();
  });

  it('/client/card con paso payment en snapshot (refresh) → ok', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/card',
        checkoutState: 'IDLE',
        snapshot: { ...emptySnap, clientBookingStep: 'payment' },
      })
    ).toBeNull();
  });

  it('/client/billing sin needsInvoice → redirect a card o confirm', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/billing',
        checkoutState: 'SERVICE_CONFIRMED',
        snapshot: { ...emptySnap, needsInvoice: false },
      })
    ).toBe('/client/card');
  });

  it('/client/billing con needsInvoice y checkout avanzado → ok', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/billing',
        checkoutState: 'SERVICE_CONFIRMED',
        snapshot: { ...emptySnap, needsInvoice: true },
      })
    ).toBeNull();
  });

  it('/oneclick/complete sin señal de pago → /client/card', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/oneclick/complete',
        search: '',
        checkoutState: 'IDLE',
        snapshot: emptySnap,
      })
    ).toBe('/client/card');
  });

  it('/oneclick/complete con tbk_user en query → ok', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/oneclick/complete',
        search: '?tbk_user=abc',
        checkoutState: 'IDLE',
        snapshot: emptySnap,
      })
    ).toBeNull();
  });

  it('rutas fuera del guard no redirigen', () => {
    expect(
      getBookingNavigationRedirect({
        pathname: '/client/providers',
        checkoutState: 'IDLE',
        snapshot: emptySnap,
      })
    ).toBeNull();
  });
});

describe('canAccess helpers', () => {
  it('canAccessCardRoute refleja checkout y snapshot', () => {
    expect(canAccessCardRoute('IDLE', emptySnap)).toBe(false);
    expect(canAccessCardRoute('SERVICE_CONFIRMED', emptySnap)).toBe(true);
    expect(canAccessCardRoute('IDLE', { ...emptySnap, clientBookingStep: 'payment' })).toBe(true);
  });

  it('canAccessBillingRoute exige needsInvoice', () => {
    expect(canAccessBillingRoute('SERVICE_CONFIRMED', { ...emptySnap, needsInvoice: false })).toBe(
      false
    );
    expect(canAccessBillingRoute('SERVICE_CONFIRMED', { ...emptySnap, needsInvoice: true })).toBe(
      true
    );
  });

  it('canAccessOneClickCompleteRoute', () => {
    expect(canAccessOneClickCompleteRoute('IDLE', emptySnap, '')).toBe(false);
    expect(canAccessOneClickCompleteRoute('IDLE', emptySnap, 'tok')).toBe(true);
    expect(canAccessOneClickCompleteRoute('CARD_CAPTURED', emptySnap, '')).toBe(true);
  });
});

describe('hashBookingNavSnapshot', () => {
  it('es estable para el mismo contenido', () => {
    const a = hashBookingNavSnapshot(emptySnap);
    const b = hashBookingNavSnapshot({ ...emptySnap });
    expect(a).toBe(b);
  });
});

describe('shouldBypassGuardForSuccess', () => {
  it('PAYMENT_CHARGED o derived phase COMPLETED', () => {
    expect(shouldBypassGuardForSuccess('PAYMENT_CHARGED', 'COMPLETED')).toBe(true);
    expect(shouldBypassGuardForSuccess('IDLE', 'COMPLETED')).toBe(true);
    expect(shouldBypassGuardForSuccess('IDLE', 'NOT_STARTED')).toBe(false);
  });
});

describe('computeContextHash', () => {
  it('cambia si cambia cualquier input', () => {
    const a = computeContextHash('/client/card', '', 'k1', 'IDLE', false);
    const b = computeContextHash('/client/card', '', 'k1', 'SERVICE_CONFIRMED', false);
    expect(a).not.toBe(b);
  });
});
