import { COMUNAS_NOMBRES } from '../data/comunas';

export const SELECTED_ADDRESS_KEY = 'selectedAddress';

/**
 * Extrae la comuna desde address_components de Google Places (misma lógica que el flujo cliente).
 */
export function extractComunaFromPlace(place) {
  if (!place?.address_components) return null;
  const comps = place.address_components;

  const normalize = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normalizedToCanonical = new Map(
    (COMUNAS_NOMBRES || []).map((n) => [normalize(n), n])
  );
  const isValidComuna = (name) => normalizedToCanonical.has(normalize(name));

  const typePriority = [
    'administrative_area_level_3',
    'locality',
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_2'
  ];

  const typeRank = (types) => {
    const t = Array.isArray(types) ? types : [];
    const ranks = t
      .map((x) => typePriority.indexOf(x))
      .filter((r) => r >= 0);
    return ranks.length ? Math.min(...ranks) : 999;
  };

  const candidates = [];
  for (const comp of comps) {
    const longName = comp?.long_name;
    if (!isValidComuna(longName)) continue;

    candidates.push({
      comuna: normalizedToCanonical.get(normalize(longName)),
      rank: typeRank(comp?.types),
      len: String(longName || '').length
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => a.rank - b.rank || b.len - a.len);
    return candidates[0].comuna;
  }

  const rawCandidate =
    comps.find((c) => c?.types?.includes('administrative_area_level_3'))?.long_name ||
    comps.find((c) => c?.types?.includes('locality'))?.long_name ||
    comps.find((c) => c?.types?.includes('administrative_area_level_2'))?.long_name;

  return isValidComuna(rawCandidate) ? normalizedToCanonical.get(normalize(rawCandidate)) : null;
}

function getComponent(place, type) {
  const comps = place?.address_components || [];
  const c = comps.find((x) => Array.isArray(x.types) && x.types.includes(type));
  return c?.long_name || '';
}

/** Comuna persistida o legada (`commune` | `comuna`). */
export function storedCommune(o) {
  if (!o || typeof o !== 'object') return '';
  return String(o.comuna || o.commune || '').trim();
}

/** Incluye dígitos ASCII y Unicode (p. ej. pegado desde Word/PDF con “１２３”). */
function lineHasStreetNumberDigit(s) {
  if (!s) return false;
  if (/\d/.test(s)) return true;
  try {
    return /\p{Nd}/u.test(s);
  } catch {
    return false;
  }
}

/**
 * Dirección escrita a mano: exige al menos un dígito (número de calle).
 * Intenta separar calle y número si el número va al final.
 *
 * @returns {{ street: string, number: string, hasStreetNumber: boolean }}
 */
export function splitManualAddressLine(line) {
  const s = String(line || '').trim();
  if (!s) return { street: '', number: '', hasStreetNumber: false };
  const hasDigit = lineHasStreetNumberDigit(s);
  const endNum = s.match(/^(.*?)[\s,]+(\d+[A-Za-z-]*)$/);
  if (endNum) {
    return {
      street: endNum[1].trim(),
      number: endNum[2],
      hasStreetNumber: true
    };
  }
  return { street: s, number: '', hasStreetNumber: hasDigit };
}

/**
 * Normaliza un Place de Google Maps a estructura única del flujo.
 * Requiere `address_components` (selección real de Autocomplete, no texto libre).
 * No usa `formatted_address`: solo `address_components` + geometría.
 *
 * Regla estricta: `route` + `street_number` + comuna homologada (locality / extractComunaFromPlace).
 * Sin número de calle o sin comuna reconocida → rechazo explícito (no fallback a POI).
 *
 * @param {google.maps.places.PlaceResult} place
 * @returns
 *   | { ok: false, code: 'NO_STREET_NUMBER' | 'MISSING_STREET_NUMBER' | 'NO_COMUNA_FROM_PLACE' }
 *   | { address_short: string, street: string, number: string, commune: string, comuna: string, address_full: string, lat: number, lng: number, source: 'google' }
 *   | null
 */
export function mapPlaceToAddress(place) {
  if (!place?.geometry?.location) return null;
  const comps = place.address_components;
  if (!Array.isArray(comps) || comps.length === 0) return null;

  const loc = place.geometry.location;
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const route = String(getComponent(place, 'route') || '').trim();
  const streetNumber = String(getComponent(place, 'street_number') || '').trim();

  if (!route || !streetNumber) {
    if (route && !streetNumber) {
      return { ok: false, code: 'MISSING_STREET_NUMBER' };
    }
    return { ok: false, code: 'NO_STREET_NUMBER' };
  }

  const address_short = `${route} ${streetNumber}`.trim();
  const commune = extractComunaFromPlace(place) || '';

  if (!commune) {
    return { ok: false, code: 'NO_COMUNA_FROM_PLACE' };
  }

  const address_full = `${address_short}, ${commune}, Chile`;

  return {
    address_short,
    street: route,
    number: streetNumber,
    commune,
    comuna: commune,
    address_full,
    lat,
    lng,
    source: 'google'
  };
}

const normKey = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Una sola línea "calle, comuna" sin duplicar la comuna al final (ej. "Lo Barnechea, Lo Barnechea").
 */
export function buildLocationDisplayLine(addressShort, commune) {
  const street = String(addressShort || '').trim();
  const com = String(commune || '').trim();
  if (!street && !com) return '';
  if (!com) return street;
  if (!street) return com;
  const ns = normKey(street);
  const nc = normKey(com);
  if (ns === nc) return street;
  const segments = street.split(',').map((x) => x.trim()).filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && normKey(last) === nc) {
    return segments.join(', ');
  }
  return `${street}, ${com}`;
}

export function parseStoredSelectedAddress() {
  try {
    const raw = localStorage.getItem(SELECTED_ADDRESS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Sesión “Places canónica” persistida: calle + coords + comuna homologada.
 * Usar en hidratación (refresh) como fuente de verdad; no depender solo de serviceComunaSource.
 */
export function isSelectedAddressPlacesCanonical(o) {
  if (!o || typeof o !== 'object') return false;
  const short = String(o.address_short || '').trim();
  const com = storedCommune(o);
  if (!short || !com) return false;
  const lat = o.lat != null ? Number(o.lat) : NaN;
  const lng = o.lng != null ? Number(o.lng) : NaN;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  const src = o.source;
  if (src === 'google') {
    return !!String(o.number || '').trim();
  }
  return true;
}

/**
 * Línea única de dirección para el flujo (P5/P6/proveedor), sin fallback de UI.
 * Lecturas centralizadas aquí; las pantallas no deben armar la línea desde localStorage suelto.
 */
export function getBookingLocationLineOrEmpty() {
  const sa = parseStoredSelectedAddress();
  const short = String(sa?.address_short || '').trim();
  const com = storedCommune(sa);
  if (short && com) return buildLocationDisplayLine(short, com);

  const loc = (localStorage.getItem('serviceLocation') || '').trim();
  const legacyCom = (localStorage.getItem('serviceComuna') || '').trim();
  if (loc && legacyCom) {
    return buildLocationDisplayLine(loc, legacyCom);
  }
  return loc;
}

/** P5: "{address_short}, {commune}" */
export function getBookingLocationP5() {
  return getBookingLocationLineOrEmpty() || 'Sin ubicación';
}

export function hasBookingLocation() {
  return !!getBookingLocationLineOrEmpty().trim();
}

/** P6: solo calle/número (sin comuna) */
export function getBookingAddressShortP6() {
  const sa = parseStoredSelectedAddress();
  const short = String(sa?.address_short || '').trim();
  if (short) return short;
  const loc = getBookingLocationLineOrEmpty();
  if (!loc) return '';
  const first = loc.split(',')[0]?.trim();
  return first || loc;
}

/**
 * Construye estructura persistida desde el formulario de ubicación (manual o ya normalizado en state).
 *
 * @param {object} p
 * @param {string} [p.street] — si se omite en manual, se deduce con splitManualAddressLine
 * @param {string} [p.number]
 * @param {'google'|'manual'} [p.source='manual']
 */
export function buildSelectedAddressFromForm({
  location,
  comuna,
  lat,
  lng,
  street: streetIn,
  number: numberIn,
  source = 'manual'
}) {
  const locTrim = String(location || '').trim();
  const comunaTrimmed = String(comuna || '').trim();

  let street = streetIn != null ? String(streetIn).trim() : '';
  let number = numberIn != null ? String(numberIn).trim() : '';

  if (source === 'manual' && locTrim) {
    const split = splitManualAddressLine(locTrim);
    if (!street) street = split.street || locTrim;
    if (!number && split.number) number = split.number;
    if (!number && split.hasStreetNumber && /\d/.test(locTrim)) {
      const m = locTrim.match(/(\d+[A-Za-z-]*)(?!.*\d)/);
      if (m) number = m[1];
    }
  }

  /** UI puede mostrar "calle, comuna"; persistencia sigue usando solo calle+número desde Places. */
  let address_short = locTrim;
  if (source === 'google' && street && number) {
    address_short = `${street} ${number}`.trim();
  }

  const address_full = comunaTrimmed
    ? `${address_short}, ${comunaTrimmed}, Chile`
    : `${address_short}, Chile`;

  return {
    address_short,
    address_full,
    street: street || address_short,
    number,
    comuna: comunaTrimmed,
    commune: comunaTrimmed,
    source,
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null
  };
}

/**
 * Mantiene `selectedAddress` alineado si el usuario corrige solo la comuna (sin re-disparar Places).
 * Evita arrastre: JSON viejo con comuna A + UI con comuna B.
 */
export function patchStoredSelectedAddressCommune(commune) {
  try {
    const raw = localStorage.getItem(SELECTED_ADDRESS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return;
    const short = String(o.address_short || '').trim();
    if (!short) return;
    const c = String(commune || '').trim();
    o.commune = c;
    o.comuna = c;
    o.address_full = c ? `${short}, ${c}, Chile` : `${short}, Chile`;
    localStorage.setItem(SELECTED_ADDRESS_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}
