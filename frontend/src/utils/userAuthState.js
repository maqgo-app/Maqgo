/**
 * Estado de autenticación centralizado (solo lectura localStorage / device id).
 * Onboarding proveedor y Welcome usan esto para no mezclar “rol” con “identidad verificada por SMS”.
 */
import { readPersistedDeviceId } from './deviceId';
import { hasPersistedSessionCredentials } from './api';

function safeLs() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Últimos 9 dígitos nacionales o null si no hay número útil guardado. */
function readStoredPhoneLast9() {
  const ls = safeLs();
  if (!ls) return null;
  try {
    const raw = ls.getItem('userPhone');
    if (raw == null || raw === '') return null;
    const d = String(raw).replace(/\D/g, '');
    const last9 = d.length >= 9 ? d.slice(-9) : '';
    return /^9\d{8}$/.test(last9) ? last9 : null;
  } catch {
    return null;
  }
}

/** Celular del borrador de registro proveedor (OTP previo o cuenta ya verificada). */
function readPhoneLast9FromRegisterData() {
  const ls = safeLs();
  if (!ls) return null;
  try {
    const raw = ls.getItem('registerData');
    if (!raw) return null;
    const j = JSON.parse(raw);
    const c = j?.celular;
    if (c == null || c === '') return null;
    const d = String(c).replace(/\D/g, '');
    const last9 = d.length >= 9 ? d.slice(-9) : '';
    return /^9\d{8}$/.test(last9) ? last9 : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{
 *   hasSession: boolean,
 *   userId: string | null,
 *   phone: string | null,
 *   deviceTrusted: boolean
 * }}
 */
export function getUserAuthState() {
  const ls = safeLs();
  let userId = null;
  try {
    userId = ls?.getItem('userId')?.trim() || null;
  } catch {
    userId = null;
  }

  const hasSession = hasPersistedSessionCredentials();
  const phone = readStoredPhoneLast9() || readPhoneLast9FromRegisterData();
  const devId = readPersistedDeviceId();
  const deviceTrusted = Boolean(devId && String(devId).length >= 8);

  return {
    hasSession,
    userId: userId || null,
    phone,
    deviceTrusted,
  };
}

/**
 * Log temporal (FASE 7): decisión de flujo proveedor sin SMS innecesario.
 * @param {'sms' | 'no-sms' | 'details' | 'redirect-onboarding' | 'redirect-home' | 'mount'} decision
 */
export function logProviderFlowState(state, decision) {
  if (typeof console === 'undefined' || !console.log) return;
  console.log('PROVIDER FLOW STATE', {
    hasSession: state.hasSession,
    phone: state.phone,
    deviceTrusted: state.deviceTrusted,
    decision,
  });
}

/**
 * Decisión explícita onboarding proveedor (mismo celular + dispositivo vs SMS).
 * @param {{ hasSession: boolean, samePhone: boolean, deviceTrusted: boolean, decision: string }} payload
 */
export function logProviderFlowDecision(payload) {
  if (typeof console === 'undefined' || !console.log) return;
  console.log('PROVIDER FLOW DECISION', payload);
}

function parseStoredRoles(ls) {
  if (!ls) return [];
  try {
    const raw = ls.getItem('userRoles');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Cuenta con rol proveedor/titular en storage (no usa esto para decidir SMS). */
export function isProviderAccountInStorage() {
  const ls = safeLs();
  if (!ls) return false;
  const roles = parseStoredRoles(ls);
  const ur = ls.getItem('userRole');
  return (
    roles.includes('provider') ||
    ur === 'provider' ||
    ur === 'owner' ||
    ur === 'manager'
  );
}

export function isOperatorAccountInStorage() {
  return safeLs()?.getItem('providerRole') === 'operator';
}
