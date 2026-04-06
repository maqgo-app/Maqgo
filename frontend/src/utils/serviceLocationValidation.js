/**
 * Reglas de validación para continuar desde ServiceLocationScreen (sin Google en tests).
 */

import { splitManualAddressLine } from './mapPlaceToAddress';

export const REF_MIN_NO_KEY = 15;
export const REF_MIN_MAP_FAILED = 25;
export const REF_MIN_MANUAL_NOT_IN_LIST = 20;

/**
 * @param {object} p
 * @param {string} p.locationTrimmed
 * @param {string} p.comunaTrimmed
 * @param {number} p.refLen — reference.trim().length
 * @param {boolean} p.hasApiKey
 * @param {'loading'|'script_loaded'|'ready'|'failed'|'no_key'} p.placesPhase
 * @param {boolean} p.waitingForPlaces
 * @param {number|null|undefined} p.serviceLat
 * @param {number|null|undefined} p.serviceLng
 * @param {boolean} p.manualAddressNotFound
 * @param {boolean} p.isValidComuna
 * @param {boolean} [p.comunaFromGoogle] — si true, no se exige coincidencia con lista (viene de Places)
 * @param {boolean} [p.requiresManualStreetNumber] — dirección escrita (sin sugerencia Google) debe incluir número
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function validateServiceLocationContinue(p) {
  const {
    locationTrimmed,
    comunaTrimmed,
    refLen,
    hasApiKey,
    placesPhase,
    waitingForPlaces,
    serviceLat,
    serviceLng,
    manualAddressNotFound,
    isValidComuna,
    comunaFromGoogle = false,
    requiresManualStreetNumber = false
  } = p;

  if (!locationTrimmed) return { ok: false, code: 'NO_LOCATION' };
  if (waitingForPlaces) return { ok: false, code: 'WAITING_PLACES' };

  // Antes de exigir comuna/número: con Places listo, si aún no hay punto elegido (coords), pedir sugerencia o "no encuentro".
  // Evita NO_COMUNA mientras el usuario solo escribe sin elegir fila del autocompletado.
  if (
    hasApiKey &&
    placesPhase === 'ready' &&
    !manualAddressNotFound &&
    (serviceLat == null || serviceLng == null)
  ) {
    return { ok: false, code: 'NEED_PLACE_OR_MANUAL' };
  }

  if (!comunaTrimmed) return { ok: false, code: 'NO_COMUNA' };
  if (!comunaFromGoogle && !isValidComuna) return { ok: false, code: 'INVALID_COMUNA' };
  if (requiresManualStreetNumber && !splitManualAddressLine(locationTrimmed).hasStreetNumber) {
    return { ok: false, code: 'MANUAL_NO_STREET_NUMBER' };
  }

  if (!hasApiKey) {
    if (refLen < REF_MIN_NO_KEY) return { ok: false, code: 'REF_NO_KEY' };
  }

  if (hasApiKey && placesPhase === 'failed') {
    if (refLen < REF_MIN_MAP_FAILED) return { ok: false, code: 'REF_MAP_FAILED' };
  }

  if (hasApiKey && placesPhase === 'ready') {
    if (manualAddressNotFound && refLen < REF_MIN_MANUAL_NOT_IN_LIST) {
      return { ok: false, code: 'REF_MANUAL_SHORT' };
    }
  }

  return { ok: true };
}
