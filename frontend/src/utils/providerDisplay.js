import { getObject } from './safeStorage';

/**
 * Nombre completo del operador para el cliente (ingreso a obra).
 * Une `selectedProvider` / `acceptedProvider` con `assignedOperator` del flujo proveedor.
 * @param {Record<string, unknown>|null|undefined} provider
 */
export function getOperatorDisplayNameForSite(provider) {
  const p = provider && typeof provider === 'object' ? provider : {};
  const assigned = getObject('assignedOperator', {});
  const n = String(assigned.nombre || p.operator_first_name || p.nombre || '').trim();
  const a = String(assigned.apellido || p.operator_last_name || p.operator_apellido || p.apellido || '').trim();
  if (n || a) return `${n} ${a}`.trim();
  const single = String(
    p.operator_name || p.providerOperatorName || assigned.name || ''
  ).trim();
  if (single) return single;
  return 'Operador asignado';
}

/**
 * RUT del operador (mismas fuentes que el nombre). Vacío si aún no está en sistema.
 * @param {Record<string, unknown>|null|undefined} provider
 */
export function getOperatorRutForSite(provider) {
  const p = provider && typeof provider === 'object' ? provider : {};
  const assigned = getObject('assignedOperator', {});
  const raw = p.operator_rut ?? p.operatorRut ?? assigned.rut ?? '';
  return String(raw || '').trim();
}

/**
 * Nombre del operador desde un registro guardado (historial, lista). No usa `assignedOperator` global.
 */
export function getOperatorDisplayNameFromRecord(record) {
  const r = record && typeof record === 'object' ? record : {};
  const n = String(r.operator_first_name || r.operatorFirstName || r.nombre || '').trim();
  const a = String(r.operator_last_name || r.operatorLastName || r.operator_apellido || r.apellido || '').trim();
  if (n || a) return `${n} ${a}`.trim();
  const single = String(
    r.operatorName || r.operator_name || r.providerOperatorName || ''
  ).trim();
  if (single) return single;
  return 'Operador asignado';
}

/**
 * RUT desde un registro guardado (historial). Sin lectura de storage global.
 */
export function getOperatorRutFromRecord(record) {
  const r = record && typeof record === 'object' ? record : {};
  return String(r.operatorRut ?? r.operator_rut ?? '').trim();
}

/**
 * Patente de la máquina asignada (API / matching usa snake_case o camelCase).
 * @param {Record<string, unknown>|null|undefined} provider
 * @returns {string} texto normalizado o cadena vacía si no hay dato
 */
export function getProviderLicensePlate(provider) {
  if (!provider || typeof provider !== 'object') return '';
  const raw = provider.license_plate ?? provider.licensePlate ?? provider.patente;
  if (raw == null) return '';
  const s = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  const letters = s.replace(/[^A-Z]/g, '').slice(0, 4);
  const digits = s.replace(/[^0-9]/g, '').slice(0, 2);
  if (letters.length === 4 && digits.length === 2) return `${letters}-${digits}`;
  return String(raw).trim().toUpperCase();
}
