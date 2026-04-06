/**
 * Checkout determinista — única fuente de verdad de fase de pago/checkout en UI.
 * Sin XState; transiciones puras y testeables.
 */

export type CheckoutState =
  | 'IDLE'
  | 'SERVICE_CONFIRMED'
  | 'CARD_CAPTURED'
  | 'PENDING_PROVIDER_ACCEPTANCE'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CHARGED'
  | 'PAYMENT_FAILED'
  | 'UNKNOWN';

export type CheckoutEvent =
  | { type: 'CONFIRM_SERVICE' }
  | { type: 'CARD_SAVED' }
  | { type: 'PROVIDER_ACCEPTED' }
  | { type: 'PROVIDER_REJECTED' }
  | { type: 'PAYMENT_AUTH_SUCCESS' }
  | { type: 'PAYMENT_AUTH_FAILED' }
  | { type: 'CHARGE_SUCCESS' }
  | { type: 'CHARGE_FAILED' }
  /** Volver a IDLE (p. ej. nueva reserva / reset de embudo); alinea memoria con localStorage. */
  | { type: 'RESET' };

/**
 * Reducer puro: nunca retorna null/undefined.
 */
export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case 'RESET':
      return 'IDLE';

    case 'PAYMENT_AUTH_FAILED':
    case 'CHARGE_FAILED':
    case 'PROVIDER_REJECTED':
      return 'PAYMENT_FAILED';

    case 'CONFIRM_SERVICE':
      // Idempotente: al volver a P5 el estado ya puede ser SERVICE_CONFIRMED; si pasáramos a UNKNOWN,
      // BookingNavigationGuard bloquearía /client/card (canAccessCardRoute exige !UNKNOWN).
      if (state === 'IDLE' || state === 'SERVICE_CONFIRMED') return 'SERVICE_CONFIRMED';
      return 'UNKNOWN';

    case 'CARD_SAVED':
      if (state === 'SERVICE_CONFIRMED') return 'CARD_CAPTURED';
      return 'UNKNOWN';

    case 'PROVIDER_ACCEPTED':
      if (state === 'CARD_CAPTURED') return 'PENDING_PROVIDER_ACCEPTANCE';
      return 'UNKNOWN';

    case 'PAYMENT_AUTH_SUCCESS':
      if (state === 'PENDING_PROVIDER_ACCEPTANCE') return 'PAYMENT_AUTHORIZED';
      return 'UNKNOWN';

    case 'CHARGE_SUCCESS':
      if (state === 'PAYMENT_AUTHORIZED') return 'PAYMENT_CHARGED';
      return 'UNKNOWN';
  }
}

/** Obliga a cubrir todos los `CheckoutState` en UI (TypeScript exhaustivo). */
export function touchCheckoutStateForExhaustiveUi(state: CheckoutState): void {
  switch (state) {
    case 'IDLE':
    case 'SERVICE_CONFIRMED':
    case 'CARD_CAPTURED':
    case 'PENDING_PROVIDER_ACCEPTANCE':
    case 'PAYMENT_AUTHORIZED':
    case 'PAYMENT_CHARGED':
    case 'PAYMENT_FAILED':
    case 'UNKNOWN':
      return;
    default: {
      const _n: never = state;
      void _n;
    }
  }
}

export const CHECKOUT_INITIAL_STATE: CheckoutState = 'IDLE';
