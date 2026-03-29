/**
 * Guard central de navegación del embudo pago (confirm → card → billing opcional → oneclick).
 * La URL no define negocio: solo se compara con checkoutState + snapshot LS para redirect protectivo.
 * Sin mapeo ruta → estado de negocio; CheckoutContext sigue siendo la única máquina de checkout.
 */

/** @typedef {'IDLE'|'SERVICE_CONFIRMED'|'CARD_CAPTURED'|'PENDING_PROVIDER_ACCEPTANCE'|'PAYMENT_AUTHORIZED'|'PAYMENT_CHARGED'|'PAYMENT_FAILED'|'UNKNOWN'} CheckoutStateLike */

/**
 * @param {CheckoutStateLike} cs
 * @returns {boolean}
 */
export function isCheckoutPastIdle(cs) {
  return cs != null && cs !== 'IDLE' && cs !== 'UNKNOWN';
}

/**
 * Snapshot de solo lectura (tests inyectan objeto; runtime usa readBookingNavSnapshot).
 * @typedef {{
 *   needsInvoice: boolean,
 *   clientBookingStep: string,
 *   bookingProgressStep: string,
 *   tbkUser: string,
 *   oneclickDemoMode: boolean,
 * }} BookingNavSnapshot
 */

/**
 * @param {BookingNavSnapshot} s
 * @returns {boolean}
 */
export function snapshotIndicatesPostConfirmPaymentStep(s) {
  return s.clientBookingStep === 'payment' || s.bookingProgressStep === 'payment';
}

/**
 * @param {BookingNavSnapshot} s
 * @returns {boolean}
 */
export function canAccessCardRoute(checkoutState, s) {
  if (isCheckoutPastIdle(checkoutState)) return true;
  if (snapshotIndicatesPostConfirmPaymentStep(s)) return true;
  return false;
}

/**
 * @param {CheckoutStateLike} checkoutState
 * @param {BookingNavSnapshot} s
 * @returns {boolean}
 */
export function canAccessBillingRoute(checkoutState, s) {
  if (!s.needsInvoice) return false;
  if (isCheckoutPastIdle(checkoutState)) return true;
  if (s.clientBookingStep === 'confirm' || s.clientBookingStep === 'payment') return true;
  if (s.bookingProgressStep === 'confirm' || s.bookingProgressStep === 'payment') return true;
  return false;
}

/**
 * @param {CheckoutStateLike} checkoutState
 * @param {BookingNavSnapshot} s
 * @param {string} tbkUserFromQuery
 * @returns {boolean}
 */
export function canAccessOneClickCompleteRoute(checkoutState, s, tbkUserFromQuery) {
  const q = (tbkUserFromQuery || '').trim();
  if (q) return true;
  if ((s.tbkUser || '').trim()) return true;
  if (s.oneclickDemoMode) return true;
  if (
    checkoutState === 'CARD_CAPTURED' ||
    checkoutState === 'PENDING_PROVIDER_ACCEPTANCE' ||
    checkoutState === 'PAYMENT_AUTHORIZED' ||
    checkoutState === 'PAYMENT_CHARGED' ||
    checkoutState === 'PAYMENT_FAILED'
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} pathname
 * @returns {string}
 */
export function normalizeGuardPath(pathname) {
  const t = (pathname || '').trim();
  if (!t) return '/';
  const noTrail = t.replace(/\/+$/, '');
  return (noTrail || '/').toLowerCase();
}

const FALLBACK = '/client/confirm';

/**
 * @param {object} input
 * @param {string} input.pathname
 * @param {string} [input.search]
 * @param {CheckoutStateLike} input.checkoutState
 * @param {BookingNavSnapshot} input.snapshot
 * @returns {string | null} ruta de redirect o null si la actual es válida
 */
export function getBookingNavigationRedirect({
  pathname,
  search = '',
  checkoutState,
  snapshot,
}) {
  const path = normalizeGuardPath(pathname);

  if (path === '/client/confirm') {
    return null;
  }

  if (path === '/client/card') {
    if (canAccessCardRoute(checkoutState, snapshot)) return null;
    return FALLBACK;
  }

  if (path === '/client/billing') {
    if (canAccessBillingRoute(checkoutState, snapshot)) return null;
    if (canAccessCardRoute(checkoutState, snapshot)) return '/client/card';
    return FALLBACK;
  }

  if (path === '/oneclick/complete') {
    let tbkQ = '';
    try {
      const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
      tbkQ = sp.get('tbk_user') || '';
    } catch {
      tbkQ = '';
    }
    if (canAccessOneClickCompleteRoute(checkoutState, snapshot, tbkQ)) return null;
    return '/client/card';
  }

  return null;
}

/**
 * Lee localStorage en runtime (sin nuevas claves; solo lectura de existentes).
 * @returns {BookingNavSnapshot}
 */
export function readBookingNavSnapshot() {
  let bookingProgress = null;
  try {
    bookingProgress = JSON.parse(localStorage.getItem('bookingProgress') || 'null');
  } catch {
    bookingProgress = null;
  }
  return {
    needsInvoice: localStorage.getItem('needsInvoice') === 'true',
    clientBookingStep: localStorage.getItem('clientBookingStep') || '',
    bookingProgressStep: (bookingProgress && bookingProgress.step) || '',
    tbkUser: localStorage.getItem('tbk_user') || '',
    oneclickDemoMode: localStorage.getItem('oneclickDemoMode') === 'true',
  };
}

/**
 * Hash estable del snapshot para cachear decisiones del guard sin comparar objetos.
 */
export function hashBookingNavSnapshot(s) {
  return [
    s.needsInvoice ? '1' : '0',
    s.clientBookingStep,
    s.bookingProgressStep,
    s.tbkUser ? '1' : '0',
    s.oneclickDemoMode ? '1' : '0',
  ].join('|');
}

/**
 * Checkout completado con éxito: sin redirect ni corrección de ruta (inmutabilidad).
 * @param {string} derivedPhase fase de deriveBookingPaymentReadModel
 */
export function shouldBypassGuardForSuccess(checkoutState, derivedPhase) {
  return checkoutState === 'PAYMENT_CHARGED' || derivedPhase === 'COMPLETED';
}

/**
 * Identidad de contexto para una sola decisión por cambio real (guard).
 */
export function computeContextHash(pathname, search, snapKey, checkoutState, successBypass) {
  return `${normalizeGuardPath(pathname)}|${search || ''}|${snapKey}|${checkoutState}|${successBypass ? '1' : '0'}`;
}
