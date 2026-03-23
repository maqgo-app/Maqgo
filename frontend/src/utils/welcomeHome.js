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

function parseUserRoles(ls) {
  if (!ls) return [];
  try {
    const raw = ls.getItem('userRoles');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Home coherente con BottomNavigation / login según `userRole` y `providerRole`.
 * Usado en Welcome (footer “Mi cuenta”) y CTA “Arrendar” cuando ya hay sesión.
 */
export function getWelcomeAppHomePath() {
  const ls = safeLocalStorage();
  if (!ls || !ls.getItem('userId')) return ROUTES.CLIENT_HOME;

  if (isAdminRoleStored()) return '/admin';

  const userRole = ls.getItem('userRole');
  if (userRole === 'client') return ROUTES.CLIENT_HOME;
  if (userRole === 'provider') {
    const providerRole = ls.getItem('providerRole');
    if (providerRole === 'operator') return ROUTES.OPERATOR_HOME;
    return ROUTES.PROVIDER_HOME;
  }

  return ROUTES.CLIENT_HOME;
}

/**
 * CTA “Ofrecer mi maquinaria” con sesión iniciada.
 * @returns {string|null} ruta interna, o `null` si debe usarse registro unificado (/register + desiredRole).
 */
export function getWelcomeOfferMachineryDestination() {
  const ls = safeLocalStorage();
  if (!ls || !ls.getItem('userId')) return null;

  const userRole = ls.getItem('userRole');
  if (isAdminRoleStored()) return '/admin';
  if (userRole === 'provider') {
    return ls.getItem('providerRole') === 'operator' ? ROUTES.OPERATOR_HOME : ROUTES.PROVIDER_HOME;
  }
  if (userRole === 'client') return '/provider/register';
  return getWelcomeAppHomePath();
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
  if (ls.getItem('userRole') === 'admin') return true;
  return parseUserRoles(ls).includes('admin');
}
