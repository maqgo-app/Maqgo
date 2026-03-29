import { describe, it, expect } from 'vitest';
import { checkoutReducer, CHECKOUT_INITIAL_STATE } from './checkoutStateMachine';

describe('checkoutReducer', () => {
  it('IDLE + CONFIRM_SERVICE → SERVICE_CONFIRMED', () => {
    expect(checkoutReducer('IDLE', { type: 'CONFIRM_SERVICE' })).toBe('SERVICE_CONFIRMED');
  });

  it('SERVICE_CONFIRMED + CARD_SAVED → CARD_CAPTURED', () => {
    expect(checkoutReducer('SERVICE_CONFIRMED', { type: 'CARD_SAVED' })).toBe('CARD_CAPTURED');
  });

  it('CARD_CAPTURED + PROVIDER_ACCEPTED → PENDING_PROVIDER_ACCEPTANCE', () => {
    expect(checkoutReducer('CARD_CAPTURED', { type: 'PROVIDER_ACCEPTED' })).toBe(
      'PENDING_PROVIDER_ACCEPTANCE'
    );
  });

  it('PENDING + PAYMENT_AUTH_SUCCESS → PAYMENT_AUTHORIZED', () => {
    expect(
      checkoutReducer('PENDING_PROVIDER_ACCEPTANCE', { type: 'PAYMENT_AUTH_SUCCESS' })
    ).toBe('PAYMENT_AUTHORIZED');
  });

  it('PAYMENT_AUTHORIZED + CHARGE_SUCCESS → PAYMENT_CHARGED', () => {
    expect(checkoutReducer('PAYMENT_AUTHORIZED', { type: 'CHARGE_SUCCESS' })).toBe(
      'PAYMENT_CHARGED'
    );
  });

  it('cualquier estado + fallos de pago → PAYMENT_FAILED', () => {
    const states = [
      'IDLE',
      'SERVICE_CONFIRMED',
      'CARD_CAPTURED',
      'PENDING_PROVIDER_ACCEPTANCE',
      'PAYMENT_AUTHORIZED',
      'UNKNOWN',
    ] as const;
    for (const s of states) {
      expect(checkoutReducer(s, { type: 'PAYMENT_AUTH_FAILED' })).toBe('PAYMENT_FAILED');
      expect(checkoutReducer(s, { type: 'CHARGE_FAILED' })).toBe('PAYMENT_FAILED');
      expect(checkoutReducer(s, { type: 'PROVIDER_REJECTED' })).toBe('PAYMENT_FAILED');
    }
  });

  it('transición inválida → UNKNOWN', () => {
    expect(checkoutReducer('IDLE', { type: 'CARD_SAVED' })).toBe('UNKNOWN');
  });

  it('CHECKOUT_INITIAL_STATE es IDLE', () => {
    expect(CHECKOUT_INITIAL_STATE).toBe('IDLE');
  });
});
