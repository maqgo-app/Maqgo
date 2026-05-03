/**
 * Navegación tras POST /api/auth/login — una sola fuente de verdad.
 *
 * Invariante MAQGO: /admin solo si `isAdmin` viene del backend (role o roles[]).
 * `location.state.redirect === '/admin'` nunca fuerza el panel sin isAdmin.
 *
 * Proveedor titular/gerente: destino por defecto según onboarding (no solo rol).
 */

function hasAnyProviderProgressInStorage() {
  try {
    const providerData = JSON.parse(globalThis.localStorage?.getItem('providerData') || '{}');
    const machineData = JSON.parse(globalThis.localStorage?.getItem('machineData') || '{}');
    const providerMachines = JSON.parse(globalThis.localStorage?.getItem('providerMachines') || '[]');
    const operatorsData = JSON.parse(globalThis.localStorage?.getItem('operatorsData') || '[]');
    const bankData = JSON.parse(globalThis.localStorage?.getItem('bankData') || '{}');
    const companyComplete = Boolean(providerData?.businessName && providerData?.rut);
    const machineComplete = Boolean(machineData?.machineryType && machineData?.licensePlate);
    const hasRegisteredMachine = Array.isArray(providerMachines)
      ? providerMachines.some((m) => Boolean(m?.machineryType && String(m?.licensePlate || '').trim()))
      : false;
    const hasOperators = Array.isArray(operatorsData) ? operatorsData.length > 0 : false;
    const hasBank = Boolean(
      bankData?.bank &&
        bankData?.accountType &&
        bankData?.accountNumber &&
        bankData?.holderName &&
        bankData?.holderRut
    );
    const completed = globalThis.localStorage?.getItem('providerOnboardingCompleted') === 'true';
    return Boolean(completed || companyComplete || machineComplete || hasRegisteredMachine || hasOperators || hasBank);
  } catch {
    return false;
  }
}

/**
 * Rutas “genéricas” de entrada proveedor: se resuelven al primer paso pendiente o /provider/home.
 * Deep links (/provider/history, /provider/machines, …) se respetan.
 * @param {string|null|undefined} redirectTo
 * @returns {string}
 */
export function normalizeProviderPostLoginRedirect(redirectTo) {
  if (redirectTo == null || typeof redirectTo !== 'string') {
    return '/provider/home';
  }
  const normalized = redirectTo.replace(/\/$/, '') || '/';
  const legacyWizard =
    normalized === '/provider/add-machine' ||
    normalized === '/provider/data' ||
    normalized.startsWith('/provider/data/') ||
    normalized === '/provider/machine-data' ||
    normalized.startsWith('/provider/machine-data/') ||
    normalized === '/provider/machine-photos' ||
    normalized.startsWith('/provider/machine-photos/') ||
    normalized === '/provider/machine-photos-pricing' ||
    normalized.startsWith('/provider/machine-photos-pricing/') ||
    normalized === '/provider/pricing' ||
    normalized.startsWith('/provider/pricing/') ||
    normalized === '/provider/operator-data' ||
    normalized.startsWith('/provider/operator-data/') ||
    normalized === '/provider/review' ||
    normalized.startsWith('/provider/review/');
  const generic =
    normalized === '/provider/home' || legacyWizard;
  if (generic) {
    if (legacyWizard && !hasAnyProviderProgressInStorage()) {
      return normalized === '/provider/home' ? '/provider/home' : normalized;
    }
    return '/provider/home';
  }
  if (normalized.startsWith('/provider')) {
    return normalized;
  }
  return normalized;
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
      : '/provider/home';
  const target = normalizeProviderPostLoginRedirect(raw);
  return { kind: 'navigate', path: target };
}
