/**
 * Navegación tras POST /api/auth/login — una sola fuente de verdad.
 *
 * Invariante MAQGO: /admin solo si `isAdmin` viene del backend (role o roles[]).
 * `location.state.redirect === '/admin'` nunca fuerza el panel sin isAdmin.
 */

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
  const target =
    redirectTo && redirectTo.startsWith('/provider') ? redirectTo : '/provider/home';
  return { kind: 'navigate', path: target };
}
