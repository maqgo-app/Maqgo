/**
 * Decisiones locales sobre cuándo pedir SMS/OTP. La API (`requires_otp`) sigue siendo autoridad si se llama `login-sms/start`.
 * Principio: OTP = identidad; una vez por sesión salvo otro número, dispositivo no confiable o riesgo — ver regla otp-single-source-of-truth-maqgo.
 */
import { hasPersistedSessionCredentials } from './api';

/**
 * Contexto de alta proveedor: no usar el intent como único motivo de OTP (identidad ≠ rol).
 * @see `.cursor/rules/otp-single-source-of-truth-maqgo.mdc`
 */
export const OTP_INTENT_PROVIDER_SIGNUP = 'provider_signup';

/**
 * JWT persistido (misma regla que axios: authToken o token). Sin esto no se omite SMS por decisión local.
 */
export function hasPersistedAuthToken() {
  try {
    const t = (localStorage.getItem('authToken') || localStorage.getItem('token') || '').trim();
    return Boolean(t);
  } catch {
    return false;
  }
}

/** Últimos 9 dígitos chilenos desde +56 / string guardado. */
export function parsePhoneLast9(raw) {
  if (raw == null || raw === '') return '';
  const d = String(raw).replace(/\D/g, '');
  const last9 = d.length >= 9 ? d.slice(-9) : '';
  return /^9\d{8}$/.test(last9) ? last9 : '';
}

/**
 * Snapshot mínimo para decisión OTP (localStorage; no expone secretos).
 */
export function buildOtpDecisionUser() {
  let sessionPhoneLast9 = '';
  try {
    sessionPhoneLast9 = parsePhoneLast9(
      typeof localStorage !== 'undefined' ? localStorage.getItem('userPhone') : ''
    );
  } catch {
    /* ignore */
  }
  return {
    hasValidSession: hasPersistedSessionCredentials(),
    sessionPhoneLast9,
  };
}

/**
 * ¿Debe pedirse SMS/OTP en este paso?
 *
 * true SOLO por: sin sesión, otro número que el de la sesión, dispositivo explícitamente no confiable,
 * señales de riesgo, sesión expirada.
 *
 * NO usa: cambio de rol, “ser proveedor”, ni el intent de flujo como motivo aislado.
 *
 * La respuesta final de `/auth/login-sms/start` (`requires_otp`) sigue siendo autoridad si se llama.
 */
export function shouldRequestOTP(user, device, context = {}) {
  if (!user?.hasValidSession) {
    return true;
  }

  const entered = context.enteredPhoneLast9;
  if (
    entered &&
    user.sessionPhoneLast9 &&
    user.sessionPhoneLast9 !== String(entered).replace(/\D/g, '').slice(-9)
  ) {
    return true;
  }

  if (context.sessionExpired) {
    return true;
  }

  if (device?.trusted === false) {
    return true;
  }

  const rs = context.riskSignals || {};
  if (rs.countryMismatch || rs.tooManyFailures) {
    return true;
  }

  return false;
}

/**
 * ¿Se puede saltar la llamada a login-sms/start (sin pedir SMS) en alta proveedor?
 * Requiere shouldRequestOTP === false Y JWT en storage; si no hay token, siempre false (forzar login-sms/start).
 * Nunca confiar solo en userId u otros campos sin JWT.
 */
export function canSkipSmsForProviderSignup(user, device, context) {
  if (shouldRequestOTP(user, device, context)) {
    return false;
  }
  if (!hasPersistedAuthToken()) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[otpDecision] política sin OTP pero sin authToken en storage; se debe llamar login-sms/start'
      );
    }
    return false;
  }
  return true;
}
