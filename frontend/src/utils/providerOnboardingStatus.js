/**
 * Onboarding proveedor.
 *
 * Regla de negocio actual:
 * - El primer onboarding deja al titular listo en una sola pasada:
 *   empresa -> maquina -> operador -> banco.
 * - El reingreso normal del proveedor siempre aterriza en /provider/home.
 * - Si el primer onboarding quedo interrumpido, la reanudacion manual retoma
 *   el siguiente paso pendiente del wizard.
 *
 * Solo lectura de localStorage; sin llamadas API.
 */
import { getArray, getObject } from './safeStorage';
import { getMachines } from './providerMachines';

function isBankDataComplete(bankData) {
  return (
    !!bankData?.bank &&
    !!bankData?.accountType &&
    !!bankData?.accountNumber &&
    !!bankData?.holderName &&
    !!bankData?.holderRut
  );
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

function hasDispatchLocationFromStorage() {
  const providerData = getObject('providerData', {});
  const loc = getObject('location', {});
  const pLat = providerData?.addressLat;
  const pLng = providerData?.addressLng;
  const lLat = loc?.lat;
  const lLng = loc?.lng;
  const hasProviderCoords = pLat !== null && pLat !== undefined && pLng !== null && pLng !== undefined;
  const hasLocationCoords = lLat !== null && lLat !== undefined && lLng !== null && lLng !== undefined;
  return Boolean(hasProviderCoords || hasLocationCoords);
}

function hasAssignedMachineOperatorFromStorage() {
  const machines = getMachines();
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
  const locationComplete = hasDispatchLocationFromStorage();
  return companyComplete && machineComplete && operatorComplete && bankComplete && locationComplete;
}

/**
 * Onboarding listo para mostrar /provider/home como destino por defecto.
 * Incluye flag persistido al terminar el wizard (Review) aunque el LS esté parcial.
 */
export function isProviderOnboardingCompleteFromStorage() {
  try {
    if (globalThis.localStorage?.getItem('providerOnboardingCompleted') === 'true') {
      return isProviderActivationCompleteFromStorage();
    }
  } catch {
    /* ignore */
  }
  return isProviderActivationCompleteFromStorage();
}

/**
 * Primer onboarding / reanudacion manual del wizard:
 * empresa -> maquina -> operador -> banco -> home.
 */
export function getProviderOnboardingNextPath() {
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
  const locationComplete = hasDispatchLocationFromStorage();

  if (!companyComplete) return '/provider/data';
  if (!locationComplete) return '/provider/data';
  if (!machineComplete) return '/provider/machine-data';
  if (!operatorComplete) return '/provider/machines';
  if (!bankComplete) return '/provider/profile/banco';
  return '/provider/home';
}

/**
 * Reingreso normal del proveedor:
 * - Si el onboarding ya termino, entra al dashboard.
 * - Si el onboarding sigue inconcluso, igual entra al dashboard y desde ahi
 *   puede continuar manualmente el siguiente paso pendiente.
 */
export function getProviderLandingPath() {
  return '/provider/home';
}
