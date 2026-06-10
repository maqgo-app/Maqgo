import { COMUNAS_CHILE } from '../data/comunas';

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const COMUNA_TO_REGION = Object.fromEntries(
  COMUNAS_CHILE.map((item) => [normalizeText(item.nombre), item.region])
);

export const MACHINE_LOCATION_MODE = {
  COMPANY_BASE: 'company_base',
  CUSTOM_BASE: 'custom_base',
};

export const LIVE_LOCATION_MODE = {
  BASE_ONLY: 'base_only',
  TELEMATICS_API: 'telematics_api',
};

export const TRANSPORT_TIER = {
  SAME_COMUNA: 'same_comuna',
  SAME_REGION: 'same_region',
  OTHER_REGION: 'other_region',
};

export const TRANSPORT_MAX_OTHER_REGION_KM = 150;

const REGION_NEIGHBORS = {
  'arica y parinacota': ['tarapaca'],
  tarapaca: ['arica y parinacota', 'antofagasta'],
  antofagasta: ['tarapaca', 'atacama'],
  atacama: ['antofagasta', 'coquimbo'],
  coquimbo: ['atacama', 'valparaiso'],
  valparaiso: ['coquimbo', 'region metropolitana de santiago', "libertador general bernardo o'higgins"],
  'region metropolitana de santiago': ['valparaiso', "libertador general bernardo o'higgins"],
  "libertador general bernardo o'higgins": ['valparaiso', 'region metropolitana de santiago', 'maule'],
  maule: ["libertador general bernardo o'higgins", 'nuble'],
  nuble: ['maule', 'biobio'],
  biobio: ['nuble', 'araucania'],
  araucania: ['biobio', 'los rios'],
  'los rios': ['araucania', 'los lagos'],
  'los lagos': ['los rios', 'aysen del general carlos ibanez del campo'],
  'aysen del general carlos ibanez del campo': ['los lagos', 'magallanes y de la antartica chilena'],
  'magallanes y de la antartica chilena': ['aysen del general carlos ibanez del campo'],
};

export function getRegionForComuna(comuna) {
  return COMUNA_TO_REGION[normalizeText(comuna)] || '';
}

export function getTransportTierLabel(tier) {
  if (tier === TRANSPORT_TIER.SAME_COMUNA) return 'Misma comuna';
  if (tier === TRANSPORT_TIER.SAME_REGION) return 'Comuna distinta, misma región';
  if (tier === TRANSPORT_TIER.OTHER_REGION) return `Región colindante (máx. ${TRANSPORT_MAX_OTHER_REGION_KM} km)`;
  return 'Traslado';
}

function toIntegerOrZero(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function toFiniteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function areRegionsAdjacent(originRegion, targetRegion) {
  const source = normalizeText(originRegion);
  const target = normalizeText(targetRegion);
  if (!source || !target || source === target) return false;
  return Boolean(REGION_NEIGHBORS[source]?.includes(target));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getMachineOriginData(machineData = {}, providerData = {}) {
  const mode = machineData.originMode || MACHINE_LOCATION_MODE.COMPANY_BASE;
  const useCompanyBase = mode !== MACHINE_LOCATION_MODE.CUSTOM_BASE;
  const baseAddress = useCompanyBase
    ? providerData.address || machineData.originAddress || ''
    : machineData.originAddress || '';
  const baseComuna = useCompanyBase
    ? providerData.comuna || machineData.originComuna || ''
    : machineData.originComuna || '';
  const baseRegion =
    machineData.originRegion ||
    getRegionForComuna(baseComuna) ||
    providerData.region ||
    getRegionForComuna(providerData.comuna) ||
    '';

  return {
    mode,
    address: String(baseAddress || '').trim(),
    comuna: String(baseComuna || '').trim(),
    region: String(baseRegion || '').trim(),
    lat: useCompanyBase
      ? providerData.addressLat ?? machineData.originLat ?? null
      : machineData.originLat ?? null,
    lng: useCompanyBase
      ? providerData.addressLng ?? machineData.originLng ?? null
      : machineData.originLng ?? null,
    liveLocationMode: machineData.liveLocationMode || LIVE_LOCATION_MODE.BASE_ONLY,
    telematicsProvider: machineData.telematicsProvider || '',
  };
}

export function getTransportTier({ originComuna, originRegion, serviceComuna, serviceRegion }) {
  const sourceComuna = normalizeText(originComuna);
  const sourceRegion = normalizeText(originRegion);
  const targetComuna = normalizeText(serviceComuna);
  const targetRegion = normalizeText(serviceRegion || getRegionForComuna(serviceComuna));

  if (!sourceComuna || !sourceRegion || !targetComuna || !targetRegion) return null;
  if (sourceComuna === targetComuna) return TRANSPORT_TIER.SAME_COMUNA;
  if (sourceRegion === targetRegion) return TRANSPORT_TIER.SAME_REGION;
  return TRANSPORT_TIER.OTHER_REGION;
}

export function getMachineTransportQuote({
  machineData = {},
  providerData = {},
  serviceComuna = '',
  serviceRegion = '',
  serviceLat = null,
  serviceLng = null,
}) {
  const origin = getMachineOriginData(machineData, providerData);
  const tier = getTransportTier({
    originComuna: origin.comuna,
    originRegion: origin.region,
    serviceComuna,
    serviceRegion,
  });

  const sameComuna = toIntegerOrZero(machineData.transportSameComuna ?? machineData.transportCost);
  const sameRegion = toIntegerOrZero(
    machineData.transportSameRegion ?? machineData.transportCost ?? machineData.transportSameComuna
  );
  const otherRegion = toIntegerOrZero(
    machineData.transportOtherRegion ??
      machineData.transportSameRegion ??
      machineData.transportCost ??
      machineData.transportSameComuna
  );

  const originLat = toFiniteNumberOrNull(origin.lat);
  const originLng = toFiniteNumberOrNull(origin.lng);
  const targetLat = toFiniteNumberOrNull(serviceLat);
  const targetLng = toFiniteNumberOrNull(serviceLng);
  const distanceKm =
    originLat != null && originLng != null && targetLat != null && targetLng != null
      ? haversineKm(originLat, originLng, targetLat, targetLng)
      : null;
  const otherRegionEligible =
    tier !== TRANSPORT_TIER.OTHER_REGION ||
    (areRegionsAdjacent(origin.region, serviceRegion || getRegionForComuna(serviceComuna)) &&
      (distanceKm == null || distanceKm <= TRANSPORT_MAX_OTHER_REGION_KM));

  const amount =
    tier === TRANSPORT_TIER.SAME_COMUNA
      ? sameComuna
      : tier === TRANSPORT_TIER.SAME_REGION
        ? sameRegion
        : tier === TRANSPORT_TIER.OTHER_REGION
          ? (otherRegionEligible ? otherRegion : 0)
          : sameComuna;

  return {
    amount,
    tier,
    label:
      tier === TRANSPORT_TIER.OTHER_REGION && !otherRegionEligible
        ? 'Fuera de cobertura automática'
        : getTransportTierLabel(tier),
    origin,
    eligible: otherRegionEligible,
    distanceKm,
  };
}
