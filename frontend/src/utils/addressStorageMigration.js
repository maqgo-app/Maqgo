import { SELECTED_ADDRESS_KEY } from './mapPlaceToAddress';

/** Subir cuando cambie el contrato de dirección/comuna en localStorage (forzar limpieza una vez por cliente). */
export const MAQGO_ADDRESS_STORAGE_VERSION = '2';

const VERSION_KEY = 'maqgo_address_storage_v';

const KEYS_TO_RESET = [
  SELECTED_ADDRESS_KEY,
  'serviceLocation',
  'serviceLat',
  'serviceLng',
  'serviceComuna',
  'serviceComunaSource',
  'serviceReference',
  'serviceLocationManualFallback'
];

/**
 * Una vez por versión: borra datos de ubicación persistidos para evitar estados incoherentes
 * (p. ej. selectedAddress viejo + texto editado, coords faltantes, NEED_PLACE_OR_MANUAL persistente).
 * Se ejecuta al montar ServiceLocationScreen antes de hidratar.
 */
export function runAddressStorageMigrationOnce() {
  try {
    if (localStorage.getItem(VERSION_KEY) === MAQGO_ADDRESS_STORAGE_VERSION) return;
    KEYS_TO_RESET.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(VERSION_KEY, MAQGO_ADDRESS_STORAGE_VERSION);
  } catch {
    /* ignore quota / private mode */
  }
}
