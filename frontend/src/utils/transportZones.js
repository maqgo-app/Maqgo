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

export function getRegionForComuna(comuna) {
  return COMUNA_TO_REGION[normalizeText(comuna)] || '';
}

export function getTransportTierLabel(tier) {
  if (tier === TRANSPORT_TIER.SAME_COMUNA) return 'Misma comuna';
  if (tier === TRANSPORT_TIER.SAME_REGION) return 'Comuna distinta, misma región';
  if (tier === TRANSPORT_TIER.OTHER_REGION) return 'Otra región';
  return 'Traslado';
}

function toIntegerOrZero(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
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

  const amount =
    tier === TRANSPORT_TIER.SAME_COMUNA
      ? sameComuna
      : tier === TRANSPORT_TIER.SAME_REGION
        ? sameRegion
        : tier === TRANSPORT_TIER.OTHER_REGION
          ? otherRegion
          : sameComuna;

  return {
    amount,
    tier,
    label: getTransportTierLabel(tier),
    origin,
  };
}
