import { validateRut } from './chileanValidation';

/**
 * Factura empresa: datos mínimos para emitir (Chile): razón social, RUT, giro y dirección tributaria.
 * @param {object} b - Objeto típico de `billingData` en localStorage
 * @returns {boolean}
 */
export function isEmpresaBillingComplete(b) {
  if (!b || b.billingType !== 'empresa') return false;
  if (!String(b.razonSocial || '').trim()) return false;
  if (!validateRut(b.rut)) return false;
  if (!String(b.giro || '').trim()) return false;
  if (!String(b.direccion || '').trim()) return false;
  return true;
}
