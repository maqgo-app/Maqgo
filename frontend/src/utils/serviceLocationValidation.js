/**
 * Reglas de validación para continuar desde ServiceLocationScreen (sin Google en tests).
 */

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
    comunaFromGoogle = false
  } = p;

  if (!locationTrimmed) return { ok: false, code: 'NO_LOCATION' };
  if (!comunaTrimmed) return { ok: false, code: 'NO_COMUNA' };
  if (!comunaFromGoogle && !isValidComuna) return { ok: false, code: 'INVALID_COMUNA' };
  if (waitingForPlaces) return { ok: false, code: 'WAITING_PLACES' };

  if (!hasApiKey) {
    if (refLen < REF_MIN_NO_KEY) return { ok: false, code: 'REF_NO_KEY' };
  }

  if (hasApiKey && placesPhase === 'failed') {
    if (refLen < REF_MIN_MAP_FAILED) return { ok: false, code: 'REF_MAP_FAILED' };
  }

  if (hasApiKey && placesPhase === 'ready') {
    if (!manualAddressNotFound && (serviceLat == null || serviceLng == null)) {
      return { ok: false, code: 'NEED_PLACE_OR_MANUAL' };
    }
    if (manualAddressNotFound && refLen < REF_MIN_MANUAL_NOT_IN_LIST) {
      return { ok: false, code: 'REF_MANUAL_SHORT' };
    }
  }

  return { ok: true };
}
