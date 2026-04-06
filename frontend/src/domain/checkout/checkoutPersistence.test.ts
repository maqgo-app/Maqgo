/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MAQGO_CHECKOUT_STATE_KEY,
  readPersistedCheckoutState,
  persistCheckoutState,
  clearPersistedCheckoutState,
} from './checkoutPersistence';

describe('checkoutPersistence', () => {
  beforeEach(() => {
    localStorage.removeItem(MAQGO_CHECKOUT_STATE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(MAQGO_CHECKOUT_STATE_KEY);
  });

  it('readPersistedCheckoutState devuelve null si no hay clave', () => {
    expect(readPersistedCheckoutState()).toBeNull();
  });

  it('persist + read roundtrip para SERVICE_CONFIRMED', () => {
    persistCheckoutState('SERVICE_CONFIRMED');
    expect(readPersistedCheckoutState()).toBe('SERVICE_CONFIRMED');
  });

  it('persist IDLE elimina la clave', () => {
    persistCheckoutState('CARD_CAPTURED');
    persistCheckoutState('IDLE');
    expect(localStorage.getItem(MAQGO_CHECKOUT_STATE_KEY)).toBeNull();
    expect(readPersistedCheckoutState()).toBeNull();
  });

  it('clearPersistedCheckoutState elimina la clave', () => {
    persistCheckoutState('PAYMENT_CHARGED');
    clearPersistedCheckoutState();
    expect(readPersistedCheckoutState()).toBeNull();
  });
});
