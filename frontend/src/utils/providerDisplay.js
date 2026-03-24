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
