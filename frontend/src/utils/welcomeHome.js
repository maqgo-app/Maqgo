import { ROUTES } from '../constants';

function safeLocalStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* modo privado / SSR sin storage */
  }
  return null;
}

/**
 * Home coherente con BottomNavigation / login según `userRole` y `providerRole`.
 * Usado en Welcome (footer “Mi cuenta”). El CTA naranja “Arrendar” sigue yendo a cliente.
 */
export function getWelcomeAppHomePath() {
  const ls = safeLocalStorage();
  if (!ls || !ls.getItem('userId')) return ROUTES.CLIENT_HOME;

  const userRole = ls.getItem('userRole');
  if (userRole === 'admin') return '/admin';
  if (userRole === 'client') return ROUTES.CLIENT_HOME;
  if (userRole === 'provider') {
    const providerRole = ls.getItem('providerRole');
    if (providerRole === 'operator') return ROUTES.OPERATOR_HOME;
    return ROUTES.PROVIDER_HOME;
  }

  return ROUTES.CLIENT_HOME;
}

export function isAdminRoleStored() {
  const ls = safeLocalStorage();
  if (!ls) return false;
  return ls.getItem('userRole') === 'admin';
}
