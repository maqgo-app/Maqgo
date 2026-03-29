/// <reference types="vite/client" />

import type { DerivedBookingPaymentReadModel } from './domain/booking/bookingPaymentReadModel';
import type { CheckoutState } from './domain/checkout/checkoutStateMachine';

/** Snapshot LS solo UX/recuperación (ver readBookingNavSnapshot). */
type BookingNavSnapshotDebug = {
  needsInvoice: boolean;
  clientBookingStep: string;
  bookingProgressStep: string;
  tbkUser: string;
  oneclickDemoMode: boolean;
};

declare global {
  interface Window {
    /** DEV: checkout + read model + snapshot recuperación (sin pathname como estado). */
    __MAQGO_BOOKING_DEBUG__?: {
      checkoutState: CheckoutState;
      derivedPaymentState: DerivedBookingPaymentReadModel;
      snapshot: BookingNavSnapshotDebug;
      /** Última decisión del BookingNavigationGuard (DEV). */
      lastGuardDecision?: string;
      /** Último destino de redirect o null (DEV). */
      lastRedirect?: string | null;
      snapshotHash?: string | null;
      successFlag?: boolean;
      contextHash?: string;
      timestamp: number;
    };
  }
}

export {};
