/**
 * Navegación tras POST /api/auth/login — una sola fuente de verdad.
 *
 * Invariante MAQGO: /admin solo si `isAdmin` viene del backend (role o roles[]).
 * `location.state.redirect === '/admin'` nunca fuerza el panel sin isAdmin.
 *
 * Proveedor titular/gerente: destino por defecto según onboarding (no solo rol).
 */

import { getProviderLandingPath } from './providerOnboardingStatus';

/**
 * Rutas “genéricas” de entrada proveedor: se resuelven al primer paso pendiente o /provider/home.
 * Deep links (/provider/history, /provider/machines, …) se respetan.
 * @param {string|null|undefined} redirectTo
 * @returns {string}
 */
export function normalizeProviderPostLoginRedirect(redirectTo) {
  if (redirectTo == null || typeof redirectTo !== 'string') {
    return getProviderLandingPath();
  }
  const legacyWizard =
    redirectTo === '/provider/data' ||
    redirectTo.startsWith('/provider/data/') ||
    redirectTo === '/provider/machine-data' ||
    redirectTo.startsWith('/provider/machine-data/') ||
    redirectTo === '/provider/review' ||
    redirectTo.startsWith('/provider/review/');
  const generic =
    redirectTo === '/provider/home' || legacyWizard;
  if (generic) {
    return getProviderLandingPath();
  }
  if (redirectTo.startsWith('/provider')) {
    return redirectTo;
  }
  return redirectTo;
}

/**
 * @param {object} p
 * @param {boolean} p.isAdmin
 * @param {string} [p.effectiveRole]
 * @param {string|null} [p.redirectTo]
 * @returns {{ kind: 'navigate', path: string } | { kind: 'error_not_admin' }}
 */
export function getPostLoginNavigation({ isAdmin, effectiveRole, redirectTo }) {
  if (isAdmin) {
    return { kind: 'navigate', path: '/admin' };
  }
  if (redirectTo === '/admin') {
    return { kind: 'error_not_admin' };
  }
  if (effectiveRole === 'client') {
    const target =
      redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/client/home';
    return { kind: 'navigate', path: target };
  }
  const raw =
    redirectTo && redirectTo.startsWith('/provider')
      ? redirectTo
      : getProviderLandingPath();
  const target = normalizeProviderPostLoginRedirect(raw);
  return { kind: 'navigate', path: target };
}
