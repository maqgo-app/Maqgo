/**
 * Sesión cliente + email para flujo reserva → OneClick → POST /api/service-requests.
 * Con token: POST /api/auth/me/profile (fetchWithAuth, mismo patrón que GET /me); sin token: POST /api/users.
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

/**
 * Opciones de perfil para sync con el API desde datos ya persistidos (p. ej. retorno Transbank).
 * Debe alinearse con lo guardado en la pantalla de tarjeta (factura, nombre comprobante).
 */
export function getStoredProfileOptionsForBookingSync() {
  const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
  const billing = getObject('billingData', {});
  const registerData = getObject('registerData', {});
  const merged = billing?.billingType ? { ...billing } : { ...registerData, ...billing };
  return {
    displayName: getClientDisplayNameForApi(),
    rut: needsInvoice ? String(merged.rut || '').trim() : '',
    razonSocial: needsInvoice ? String(merged.razonSocial || '').trim() : '',
  };
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
 * Asegura usuario backend con email (y datos de facturación opcionales).
 * Con token: POST /api/auth/me/profile (evita PATCH bloqueado en edge; mismos headers que GET /me).
 */
export async function ensureBackendSessionForClientBooking(email, options = {}) {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    throw new Error('Se requiere un correo válido para continuar.');
  }
  const displayName = (options.displayName || '').trim();
  const rut = (options.rut || '').trim();
  const razonSocial = (options.razonSocial || '').trim();
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');

  if (token) {
    const body = { email: trimmed };
    if (displayName) body.name = displayName;
    if (rut) body.rut = rut;
    if (razonSocial) body.razon_social = razonSocial;
    const { data } = await axios.post(`${BACKEND_URL}/api/auth/me/profile`, body, {
      timeout: 12000,
      headers: { 'Content-Type': 'application/json' },
    });
    persistClientEmailToStorage(trimmed);
    if (data?.id) localStorage.setItem('userId', String(data.id));
    return;
  }

  const name = displayName || getClientDisplayNameForApi();
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
      ...(rut && { rut }),
      ...(razonSocial && { razon_social: razonSocial }),
    },
    { timeout: 12000 }
  );
  const sessionToken = data?.token;
  if (!sessionToken) {
    throw new Error(
      'No se pudo crear la sesión para el pago. Cierra sesión e inicia de nuevo, o intenta en unos segundos.'
    );
  }
  localStorage.setItem('token', sessionToken);
  localStorage.setItem('authToken', sessionToken);
  if (data.id) localStorage.setItem('userId', data.id);
}
