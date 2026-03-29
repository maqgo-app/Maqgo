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

/**
 * Normaliza un Place de Google Maps a estructura única del flujo.
 * Requiere `address_components` (selección real de Autocomplete, no texto libre).
 * No usa `formatted_address`: solo `address_components` + geometría.
 *
 * `commune` es siempre el nombre canónico homologado a COMUNAS_NOMBRES (o cadena vacía).
 *
 * @param {google.maps.places.PlaceResult} place
 * @returns {{ address_short: string, commune: string, address_full: string, lat: number, lng: number } | null}
 */
export function mapPlaceToAddress(place) {
  if (!place?.geometry?.location) return null;
  const comps = place.address_components;
  if (!Array.isArray(comps) || comps.length === 0) return null;

  const loc = place.geometry.location;
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const route = getComponent(place, 'route');
  const streetNumber = getComponent(place, 'street_number');
  let address_short = [route, streetNumber].filter(Boolean).join(' ').trim();

  if (!address_short) {
    address_short =
      getComponent(place, 'premise') ||
      getComponent(place, 'establishment') ||
      getComponent(place, 'point_of_interest') ||
      getComponent(place, 'neighborhood') ||
      '';
  }

  if (!address_short) return null;

  const commune = extractComunaFromPlace(place) || '';

  const address_full = commune
    ? `${address_short}, ${commune}, Chile`
    : `${address_short}, Chile`;

  return {
    address_short,
    commune,
    address_full,
    lat,
    lng
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
  const com = String(o.commune || '').trim();
  if (!short || !com) return false;
  const lat = o.lat != null ? Number(o.lat) : NaN;
  const lng = o.lng != null ? Number(o.lng) : NaN;
  return !Number.isNaN(lat) && !Number.isNaN(lng);
}

/**
 * Línea única de dirección para el flujo (P5/P6/proveedor), sin fallback de UI.
 * Lecturas centralizadas aquí; las pantallas no deben armar la línea desde localStorage suelto.
 */
export function getBookingLocationLineOrEmpty() {
  const sa = parseStoredSelectedAddress();
  const short = String(sa?.address_short || '').trim();
  const com = String(sa?.commune || '').trim();
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
 */
export function buildSelectedAddressFromForm({ location, comuna, lat, lng }) {
  const address_short = String(location || '').trim();
  const commune = String(comuna || '').trim();
  const address_full = commune
    ? `${address_short}, ${commune}, Chile`
    : `${address_short}, Chile`;
  return {
    address_short,
    commune,
    address_full,
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null
  };
}
