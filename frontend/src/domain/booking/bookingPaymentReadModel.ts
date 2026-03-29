/**
 * Read model de pago/booking: 100% derivado de CheckoutState.
 * Sin routing, sin reducer propio, sin eventos — solo proyección para UI/debug.
 */

import type { CheckoutState } from '../checkout/checkoutStateMachine';

/** Fases de alto nivel para etiquetas/telemetría (no sustituyen a CheckoutState). */
export type DerivedBookingPaymentPhase =
  | 'NOT_STARTED'
  | 'PRE_CHARGE'
  | 'AUTHORIZATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'AMBIGUOUS';

export type DerivedBookingPaymentReadModel = {
  phase: DerivedBookingPaymentPhase;
  /** Etiqueta estable para logs; la lógica de negocio sigue siendo CheckoutState. */
  label: string;
};

/**
 * Deriva una vista compacta del checkout para capas que no deben importar routing.
 */
export function deriveBookingPaymentReadModel(checkoutState: CheckoutState): DerivedBookingPaymentReadModel {
  switch (checkoutState) {
    case 'IDLE':
      return { phase: 'NOT_STARTED', label: 'idle' };
    case 'SERVICE_CONFIRMED':
    case 'CARD_CAPTURED':
    case 'PENDING_PROVIDER_ACCEPTANCE':
      return { phase: 'PRE_CHARGE', label: 'pre_charge' };
    case 'PAYMENT_AUTHORIZED':
      return { phase: 'AUTHORIZATION', label: 'authorization' };
    case 'PAYMENT_CHARGED':
      return { phase: 'COMPLETED', label: 'completed' };
    case 'PAYMENT_FAILED':
      return { phase: 'FAILED', label: 'failed' };
    case 'UNKNOWN':
      return { phase: 'AMBIGUOUS', label: 'ambiguous' };
    default: {
      const _n: never = checkoutState;
      void _n;
      return { phase: 'AMBIGUOUS', label: 'ambiguous' };
    }
  }
}

/** Read model de pago solo desde CheckoutState (sin routing). */
export const getBookingPaymentReadModelFromCheckout = deriveBookingPaymentReadModel;

export function touchDerivedBookingPaymentPhaseForExhaustiveUi(phase: DerivedBookingPaymentPhase): void {
  switch (phase) {
    case 'NOT_STARTED':
    case 'PRE_CHARGE':
    case 'AUTHORIZATION':
    case 'COMPLETED':
    case 'FAILED':
    case 'AMBIGUOUS':
      return;
    default: {
      const _e: never = phase;
      void _e;
    }
  }
}
