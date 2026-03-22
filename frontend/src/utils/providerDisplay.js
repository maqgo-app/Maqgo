/**
 * Patente de la máquina asignada (API / matching usa snake_case o camelCase).
 * @param {Record<string, unknown>|null|undefined} provider
 * @returns {string} texto normalizado o cadena vacía si no hay dato
 */
export function getProviderLicensePlate(provider) {
  if (!provider || typeof provider !== 'object') return '';
  const raw = provider.license_plate ?? provider.licensePlate ?? provider.patente;
  if (raw == null) return '';
  const s = String(raw).trim();
  return s ? s.toUpperCase() : '';
}
