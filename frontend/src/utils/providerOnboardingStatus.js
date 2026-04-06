/**
 * Completitud onboarding proveedor (misma regla que ProviderHomeScreen — checklist activación).
 * Solo lectura de localStorage; sin llamadas API (login/OTP/sesión intactos).
 */
import { getObject } from './safeStorage';

const MACHINE_FIRST_ENTRY = '/provider/add-machine';

function isBankDataComplete(bankData) {
  return (
    !!bankData?.bank &&
    !!bankData?.accountType &&
    !!bankData?.accountNumber &&
    !!bankData?.holderName &&
    !!bankData?.holderRut
  );
}

function isProviderCameFromWelcomeFlag() {
  try {
    return globalThis.localStorage?.getItem('providerCameFromWelcome') === 'true';
  } catch {
    return false;
  }
}

/**
 * Empresa + máquina + operador + banco (cuatro pilares).
 */
export function isProviderActivationCompleteFromStorage() {
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const operatorsData = getObject('operatorsData', []);
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = !!(machineData?.machineryType && machineData?.licensePlate);
  const operatorComplete = Array.isArray(operatorsData) && operatorsData.length > 0;
  const bankComplete = isBankDataComplete(bankData);
  return companyComplete && machineComplete && operatorComplete && bankComplete;
}

/**
 * Onboarding listo para mostrar /provider/home como destino por defecto.
 * Incluye flag persistido al terminar el wizard (Review) aunque el LS esté parcial.
 */
export function isProviderOnboardingCompleteFromStorage() {
  try {
    if (globalThis.localStorage?.getItem('providerOnboardingCompleted') === 'true') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return isProviderActivationCompleteFromStorage();
}

/**
 * Post-login / home / "Completar registro":
 * - CTA "Ofrecer mi maquinaria" (Welcome): `providerCameFromWelcome` → siempre publicación en `/provider/add-machine`;
 *   el flag se elimina al completar publicación/onboarding para no bloquear `/provider/home` después.
 * - Sin Welcome: orden clásico (empresa → máquina → …) o `/provider/home` si onboarding completo.
 */
export function getProviderLandingPath() {
  if (isProviderCameFromWelcomeFlag()) {
    return MACHINE_FIRST_ENTRY;
  }
  if (isProviderOnboardingCompleteFromStorage()) {
    return '/provider/home';
  }
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const operatorsData = getObject('operatorsData', []);
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = !!(machineData?.machineryType && machineData?.licensePlate);
  const operatorComplete = Array.isArray(operatorsData) && operatorsData.length > 0;
  const bankComplete = isBankDataComplete(bankData);

  if (!companyComplete) return '/provider/data';
  if (!machineComplete) return '/provider/machine-data';
  if (!operatorComplete) return '/provider/team';
  if (!bankComplete) return '/provider/profile/banco';
  return '/provider/home';
}
