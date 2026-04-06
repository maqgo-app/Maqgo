import { resetBookingState } from './bookingFlow';
import { saveBookingProgress } from './abandonmentTracker';
import { isPerTripMachineryType } from './machineryNames';
import { SELECTED_ADDRESS_KEY, buildSelectedAddressFromForm } from './mapPlaceToAddress';

/**
 * Reconstruye localStorage para "Repetir servicio" desde un ítem de historial.
 * Acepta forma mínima (demo) o extendida (API futura): ubicación, fechas, tipo, capacidad, etc.
 *
 * @param {Record<string, unknown>} service
 */
export function applyRepeatBookingFromHistory(service) {
  if (!service || typeof service !== 'object') return;

  resetBookingState();

  const machinery = String(service.machinery || 'retroexcavadora').trim();
  const hoursRaw = Number(service.hours);
  const safeHours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.round(hoursRaw) : 4;

  const reservationType =
    service.reservationType === 'scheduled' ? 'scheduled' : 'immediate';

  let priceType = service.priceType;
  if (priceType !== 'hour' && priceType !== 'trip') {
    priceType = isPerTripMachineryType(machinery) ? 'trip' : 'hour';
  }
  if (reservationType === 'scheduled' && isPerTripMachineryType(machinery)) {
    priceType = 'trip';
  }

  localStorage.setItem('selectedMachinery', machinery);
  localStorage.setItem(
    'selectedHours',
    String(reservationType === 'scheduled' ? 8 : safeHours)
  );
  localStorage.setItem('reservationType', reservationType);
  localStorage.setItem('priceType', priceType);

  if (Array.isArray(service.selectedDates) && service.selectedDates.length > 0) {
    localStorage.setItem('selectedDates', JSON.stringify(service.selectedDates));
    const first = service.selectedDates[0];
    const iso = typeof first === 'string' ? first : '';
    const dateOnly = iso.includes('T') ? iso.split('T')[0] : String(iso).slice(0, 10);
    if (dateOnly) localStorage.setItem('selectedDate', dateOnly);
  } else if (service.date) {
    const raw = String(service.date);
    const dateOnly = raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10);
    localStorage.setItem('selectedDate', dateOnly);
    const iso = raw.includes('T') ? raw : `${dateOnly}T12:00:00.000Z`;
    localStorage.setItem('selectedDates', JSON.stringify([iso]));
  }

  const addrObj =
    service.selectedAddress && typeof service.selectedAddress === 'object'
      ? service.selectedAddress
      : null;
  const line = addrObj?.address_short
    ? String(addrObj.address_short)
    : String(service.serviceLocation || service.location || '').trim();
  const comuna = String(
    service.serviceComuna ||
      service.comuna ||
      addrObj?.commune ||
      addrObj?.comuna ||
      ''
  ).trim();

  const latRaw = service.serviceLat ?? service.lat ?? addrObj?.lat;
  const lngRaw = service.serviceLng ?? service.lng ?? addrObj?.lng;
  const lat = latRaw != null ? Number(latRaw) : NaN;
  const lng = lngRaw != null ? Number(lngRaw) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const addrComuna = addrObj?.commune || addrObj?.comuna;
  if (addrObj && addrObj.address_short && addrComuna && hasCoords) {
    localStorage.setItem(SELECTED_ADDRESS_KEY, JSON.stringify(addrObj));
    localStorage.setItem('serviceLat', String(lat));
    localStorage.setItem('serviceLng', String(lng));
    const display =
      line && comuna ? `${line}, ${comuna}` : line || comuna;
    if (display) localStorage.setItem('serviceLocation', display);
  } else if (line && comuna && hasCoords) {
    const payload = buildSelectedAddressFromForm({
      location: line,
      comuna,
      lat,
      lng,
    });
    localStorage.setItem(SELECTED_ADDRESS_KEY, JSON.stringify(payload));
    localStorage.setItem('serviceLat', String(lat));
    localStorage.setItem('serviceLng', String(lng));
    localStorage.setItem('serviceLocation', `${line}, ${comuna}`);
  } else {
    if (line) {
      localStorage.setItem('serviceLocation', line);
    }
    if (comuna) localStorage.setItem('serviceComuna', comuna);
    if (hasCoords) {
      localStorage.setItem('serviceLat', String(lat));
      localStorage.setItem('serviceLng', String(lng));
    }
  }

  if (service.serviceReference) {
    localStorage.setItem('serviceReference', String(service.serviceReference));
  }
  if (service.serviceComunaSource) {
    localStorage.setItem('serviceComunaSource', String(service.serviceComunaSource));
  }

  if (service.selectedMachinerySpec) {
    localStorage.setItem('selectedMachinerySpec', String(service.selectedMachinerySpec));
  }

  if (service.urgencyType) {
    localStorage.setItem('urgencyType', String(service.urgencyType));
  }
  if (service.urgencyBonus != null && service.urgencyBonus !== '') {
    localStorage.setItem('urgencyBonus', String(service.urgencyBonus));
  }
  if (service.additionalDays != null && service.additionalDays !== '') {
    localStorage.setItem('additionalDays', String(service.additionalDays));
  }

  if (service.needsInvoice != null) {
    localStorage.setItem('needsInvoice', String(Boolean(service.needsInvoice)));
  }

  const total = service.total ?? service.maxTotalAmount ?? service.totalAmount;
  if (total != null && total !== '') {
    const t = String(total);
    localStorage.setItem('totalAmount', t);
    localStorage.setItem('maxTotalAmount', t);
  }

  const capPairs = [
    ['clientRequiredM3List', 'clientRequiredM3'],
    ['clientRequiredLitersList', 'clientRequiredLiters'],
    ['clientRequiredTonMList', 'clientRequiredTonM'],
  ];
  for (const [listKey, singleKey] of capPairs) {
    const arr = service[listKey];
    if (Array.isArray(arr) && arr.length > 0) {
      localStorage.setItem(listKey, JSON.stringify(arr));
      if (arr[0] != null) localStorage.setItem(singleKey, String(arr[0]));
    } else if (service[singleKey] != null && service[singleKey] !== '') {
      localStorage.setItem(singleKey, String(service[singleKey]));
    }
  }

  /** Capacidad por hora (misma fuente que MACHINERY_CAPACITY_OPTIONS en machineryNames). */
  const hourCapListKeys = [
    'clientRequiredBucketM3List',
    'clientRequiredWeightTonList',
    'clientRequiredPowerHpList',
    'clientRequiredBladeMList',
    'clientRequiredCraneTonList',
    'clientRequiredRollerTonList',
    'clientRequiredMiniloaderBucketList',
  ];
  for (const listKey of hourCapListKeys) {
    const arr = service[listKey];
    if (Array.isArray(arr) && arr.length > 0) {
      localStorage.setItem(listKey, JSON.stringify(arr));
    }
  }

  saveBookingProgress('providers', { machinery });
}
