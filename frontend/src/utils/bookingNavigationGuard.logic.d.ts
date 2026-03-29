import type { CheckoutState } from '../domain/checkout/checkoutStateMachine';

export type BookingNavSnapshot = {
  needsInvoice: boolean;
  clientBookingStep: string;
  bookingProgressStep: string;
  tbkUser: string;
  oneclickDemoMode: boolean;
};

export function isCheckoutPastIdle(cs: CheckoutState | string): boolean;
export function snapshotIndicatesPostConfirmPaymentStep(s: BookingNavSnapshot): boolean;
export function canAccessCardRoute(checkoutState: CheckoutState | string, s: BookingNavSnapshot): boolean;
export function canAccessBillingRoute(checkoutState: CheckoutState | string, s: BookingNavSnapshot): boolean;
export function canAccessOneClickCompleteRoute(
  checkoutState: CheckoutState | string,
  s: BookingNavSnapshot,
  tbkUserFromQuery: string
): boolean;
export function normalizeGuardPath(pathname: string): string;
export function getBookingNavigationRedirect(input: {
  pathname: string;
  search?: string;
  checkoutState: CheckoutState | string;
  snapshot: BookingNavSnapshot;
}): string | null;
export function readBookingNavSnapshot(): BookingNavSnapshot;
export function hashBookingNavSnapshot(s: BookingNavSnapshot): string;
export function shouldBypassGuardForSuccess(
  checkoutState: CheckoutState | string,
  derivedPhase: string
): boolean;
export function computeContextHash(
  pathname: string,
  search: string,
  snapKey: string,
  checkoutState: CheckoutState | string,
  successBypass: boolean
): string;
