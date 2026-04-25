/**
 * Completitud onboarding proveedor (misma regla que ProviderHomeScreen — checklist activación).
 * Solo lectura de localStorage; sin llamadas API (login/OTP/sesión intactos).
 */
import { getArray, getObject } from './safeStorage';

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

function normalizeMachineOperators(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((op) => {
      if (!op || typeof op !== 'object') return null;
      const fullName = String(op.name || `${op.nombre || ''} ${op.apellido || ''}`.trim()).trim();
      if (!fullName) return null;
      return op;
    })
    .filter(Boolean);
}

function hasAssignedMachineOperatorFromStorage() {
  const machines = getArray('providerMachines', []);
  const onboardingOperators = normalizeMachineOperators(getArray('operatorsData', []));
  const hasMachineData = (() => {
    const machineData = getObject('machineData', {});
    return Boolean(machineData?.machineryType && machineData?.licensePlate);
  })();

  if (Array.isArray(machines) && machines.length > 0) {
    return machines.some((m, idx) => {
      if (!m || typeof m !== 'object') return false;
      const hasRegisteredMachine = Boolean(m.machineryType && String(m.licensePlate || '').trim());
      if (!hasRegisteredMachine) return false;
      const ops = Array.isArray(m.operators) ? m.operators : [];
      if (ops.length > 0) return true;
      return (idx === 0 || machines.length === 1) && onboardingOperators.length > 0;
    });
  }

  return hasMachineData && onboardingOperators.length > 0;
}

/**
 * Empresa + máquina + operador + banco (cuatro pilares).
 */
export function isProviderActivationCompleteFromStorage() {
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = !!(machineData?.machineryType && machineData?.licensePlate);
  const operatorComplete = hasAssignedMachineOperatorFromStorage();
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
    const machines = getArray('providerMachines', []);
    const hasRegisteredMachine = Array.isArray(machines)
      ? machines.some((m) => Boolean(m?.machineryType && String(m.licensePlate || '').trim()))
      : false;
    if (hasRegisteredMachine) return MACHINE_FIRST_ENTRY;
  }
  if (isProviderOnboardingCompleteFromStorage()) {
    return '/provider/home';
  }
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = !!(machineData?.machineryType && machineData?.licensePlate);
  const operatorComplete = hasAssignedMachineOperatorFromStorage();
  const bankComplete = isBankDataComplete(bankData);

  if (!companyComplete) return '/provider/data';
  if (!machineComplete) return '/provider/machine-data';
  if (!operatorComplete) return '/provider/machines';
  if (!bankComplete) return '/provider/profile/banco';
  return '/provider/home';
}
