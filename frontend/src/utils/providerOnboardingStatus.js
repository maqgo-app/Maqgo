/**
 * Onboarding proveedor.
 *
 * Regla de negocio actual:
 * - El primer onboarding deja al titular listo en una sola pasada:
 *   empresa -> (primera maquina + operador + precios) -> banco.
 *   El operador nace automáticamente en el paso de máquina (no hay paso aparte).
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

function hasRegisteredMachineFromStorage() {
  const machineData = getObject('machineData', {});
  if (machineData?.machineryType && machineData?.licensePlate) return true;
  const machines = getMachines();
  return Array.isArray(machines)
    ? machines.some((m) => Boolean(m?.machineryType && String(m.licensePlate || '').trim()))
    : false;
}

function firstMachineHasOperatorFromStorage() {
  try {
    const op = getObject('firstMachineOperator', null);
    if (op && typeof op === 'object') {
      const nombre = String(op.firstName || '').trim();
      const apellido = String(op.lastName || '').trim();
      const rut = String(op.rut || '').trim();
      const phone = String(op.phone || '').trim();
      if (nombre && apellido && rut && phone && /^\+?56\d{8,}$/.test(String(phone).replace(/\D/g, ''))) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

function hasAssignedMachineOperatorFromStorage() {
  const machines = getMachines();
  const onboardingOperators = normalizeMachineOperators(getArray('operatorsData', []));
  const hasMachineData = (() => {
    const machineData = getObject('machineData', {});
    return Boolean(machineData?.machineryType && machineData?.licensePlate);
  })();

  if (firstMachineHasOperatorFromStorage()) return true;

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

  return hasMachineData && (onboardingOperators.length > 0 || firstMachineHasOperatorFromStorage());
}

/**
 * Empresa + máquina + operador + banco (cuatro pilares; operador fusionado en primera máquina).
 */
export function isProviderActivationCompleteFromStorage() {
  const providerData = getObject('providerData', {});
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = hasRegisteredMachineFromStorage();
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
      return isProviderActivationCompleteFromStorage();
    }
  } catch {
    /* ignore */
  }
  return isProviderActivationCompleteFromStorage();
}

/**
 * Primer onboarding / reanudacion manual del wizard:
 * empresa -> (primera maquina + operador + fotos/precios) -> banco -> home.
 *
 * Regla inmutable: datos empresa (providerData) debe estar completo ANTES
 * de pasar a cualquier paso de maquinaria. Si banco está completo pero
 * no hay máquinas, no bloquea banco (caso banco completado por fuera).
 */
export function getProviderOnboardingNextPath() {
  if (isProviderOnboardingCompleteFromStorage()) {
    return '/provider/home';
  }
  const providerData = getObject('providerData', {});
  const bankData = getObject('bankData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  if (!companyComplete) return '/provider/data';
  const machineComplete = hasRegisteredMachineFromStorage();
  if (!machineComplete) return '/provider/machine-data';
  const operatorComplete = hasAssignedMachineOperatorFromStorage();
  if (!operatorComplete) return '/provider/machine-data';
  const bankComplete = isBankDataComplete(bankData);
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
