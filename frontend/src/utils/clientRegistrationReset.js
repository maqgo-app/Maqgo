/**
 * Limpia solo el estado local del registro cliente (no sesión JWT ni reserva en curso).
 * Usar cuando los datos precargados no corresponden u otra persona se registrará en este dispositivo.
 */
export function clearClientRegistrationLocalState() {
  try {
    localStorage.removeItem('clientRegisterDraft');
    localStorage.removeItem('registerData');
    localStorage.removeItem('phoneVerified');
    localStorage.removeItem('verificationChannel');
  } catch {
    /* modo privado / cuota */
  }
}
