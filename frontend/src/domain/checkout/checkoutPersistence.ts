import type { CheckoutState } from './checkoutStateMachine';

export const MAQGO_CHECKOUT_STATE_KEY = 'maqgo_checkout_state';

const VALID: readonly CheckoutState[] = [
  'IDLE',
  'SERVICE_CONFIRMED',
  'CARD_CAPTURED',
  'PENDING_PROVIDER_ACCEPTANCE',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_CHARGED',
  'PAYMENT_FAILED',
  'UNKNOWN',
];

function isCheckoutState(s: string): s is CheckoutState {
  return (VALID as readonly string[]).includes(s);
}

/**
 * Lee estado de checkout persistido (rehidratación tras F5).
 * IDLE / UNKNOWN no se rehidratan: vuelven al default del reducer.
 */
export function readPersistedCheckoutState(): CheckoutState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MAQGO_CHECKOUT_STATE_KEY);
    if (!raw || !isCheckoutState(raw)) return null;
    if (raw === 'IDLE' || raw === 'UNKNOWN') return null;
    return raw;
  } catch {
    return null;
  }
}

export function persistCheckoutState(state: CheckoutState): void {
  if (typeof window === 'undefined') return;
  try {
    if (state === 'IDLE' || state === 'UNKNOWN') {
      localStorage.removeItem(MAQGO_CHECKOUT_STATE_KEY);
      return;
    }
    localStorage.setItem(MAQGO_CHECKOUT_STATE_KEY, state);
  } catch {
    // storage lleno / privado
  }
}

export function clearPersistedCheckoutState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MAQGO_CHECKOUT_STATE_KEY);
  } catch {
    // ignore
  }
}
