import { ROUTES } from '../constants';
import { hasPersistedSessionCredentials } from './api';
import { getProviderLandingPath } from './providerOnboardingStatus';
import { getUserAuthState } from './userAuthState';

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
 * Usado en Welcome (footer “Mi cuenta”) y CTA “Arrendar” cuando ya hay sesión.
 *
 * `desiredRole === 'client'` gana sobre rol proveedor en storage: la portada es mercado/arrendar;
 * sin esto, una cuenta con userRole provider caía siempre en onboarding proveedor aunque el usuario
 * entrara desde Welcome como cliente.
 */
export function getWelcomeAppHomePath() {
  const ls = safeLocalStorage();
  if (!ls || !ls.getItem('userId')) return ROUTES.CLIENT_HOME;

  if (isAdminRoleStored()) return '/admin';

  const desiredRole = String(ls.getItem('desiredRole') || '').trim().toLowerCase();
  if (desiredRole === 'client') return ROUTES.CLIENT_HOME;

  const token = ls.getItem('authToken') || ls.getItem('token');
  const rawRoles = ls.getItem('userRoles');
  const roles = (() => {
    try {
      const parsed = rawRoles ? JSON.parse(rawRoles) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const userRole = ls.getItem('userRole');
  const providerRole = ls.getItem('providerRole');
  if (providerRole === 'operator') return ROUTES.OPERATOR_HOME;
  if (token && roles.includes('client') && roles.includes('provider')) return '/select-role';
  if (userRole === 'client') return ROUTES.CLIENT_HOME;
  if (userRole === 'provider' || userRole === 'owner' || userRole === 'manager') {
    return getProviderLandingPath();
  }

  return ROUTES.CLIENT_HOME;
}

/**
 * CTA “Ofrecer mi maquinaria”: siempre `/provider/add-machine` (machine-first; única entrada).
 * @returns {string|null} ruta si hay sesión válida; `null` si no (Welcome navega igual a add-machine, ruta pública).
 */
export function getWelcomeOfferMachineryDestination() {
  const auth = getUserAuthState();
  if (!auth.userId || !auth.hasSession) return null;
  if (!hasPersistedSessionCredentials()) return null;

  const ls = safeLocalStorage();
  if (!ls) return null;

  if (isAdminRoleStored()) return '/admin';

  if (ls.getItem('providerRole') === 'operator') {
    return ROUTES.OPERATOR_HOME;
  }

  return '/provider/add-machine';
}

/**
 * CTA “Soy operador”: unirse con código o ir al home si ya es operador.
 */
export function getWelcomeOperatorDestination() {
  const ls = safeLocalStorage();
  if (!ls || !ls.getItem('userId')) return '/operator/join';
  if (isAdminRoleStored()) return '/admin';
  if (ls.getItem('userRole') === 'provider' && ls.getItem('providerRole') === 'operator') {
    return ROUTES.OPERATOR_HOME;
  }
  return '/operator/join';
}

export function isAdminRoleStored() {
  const ls = safeLocalStorage();
  if (!ls) return false;
  const ur = ls.getItem('userRole');
  if (ur === 'admin') return true;
  try {
    const raw = ls.getItem('userRoles');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.includes('admin');
  } catch {
    return false;
  }
}
