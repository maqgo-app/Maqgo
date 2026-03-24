/**
 * Sesión cliente + email para flujo reserva → OneClick → POST /api/service-requests.
 * El backend exige Bearer; sin token, creamos/recuperamos usuario por email (mismo criterio que registro).
 */
import axios from 'axios';
import BACKEND_URL from './api';
import { getObject } from './safeStorage';

export function getClientDisplayNameForApi() {
  const billingData = getObject('billingData', {});
  const registerData = getObject('registerData', {});
  if (billingData.nombre || billingData.apellido) {
    return `${billingData.nombre || ''} ${billingData.apellido || ''}`.trim();
  }
  if (billingData.razonSocial) {
    return String(billingData.razonSocial).trim();
  }
  if (registerData.nombre || registerData.apellido) {
    return `${registerData.nombre || ''} ${registerData.apellido || ''}`.trim();
  }
  return 'Cliente MAQGO';
}

/** Persiste correo para OneClick, cobros y coherencia con registerData. */
export function persistClientEmailToStorage(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return;
  localStorage.setItem('clientEmail', trimmed);
  const registerData = getObject('registerData', {});
  if (registerData && typeof registerData === 'object') {
    localStorage.setItem('registerData', JSON.stringify({ ...registerData, email: trimmed }));
  }
}

/**
 * Crea o reutiliza cuenta cliente por email y alinea token + userId con Mongo.
 * Siempre llama al API cuando hay email (corrige userId demo vs sesión real y refresca JWT).
 */
export async function ensureBackendSessionForClientBooking(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    throw new Error('Se requiere un correo válido para continuar.');
  }
  const name = getClientDisplayNameForApi();
  const registerData = getObject('registerData', {});
  const celDigits = registerData.celular ? String(registerData.celular).replace(/\D/g, '').slice(-9) : '';
  const phone = celDigits.length >= 9 ? `+56${celDigits}` : undefined;
  const { data } = await axios.post(
    `${BACKEND_URL}/api/users`,
    {
      role: 'client',
      name: (name || 'Cliente MAQGO').trim() || 'Cliente MAQGO',
      email: trimmed,
      ...(phone && { phone }),
    },
    { timeout: 12000 }
  );
  if (data.token) localStorage.setItem('token', data.token);
  if (data.id) localStorage.setItem('userId', data.id);
}
