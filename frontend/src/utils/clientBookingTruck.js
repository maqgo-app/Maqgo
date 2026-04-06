/**
 * Camiones (cobro por viaje / servicio) vs maquinaria por hora: modelo de urgencia distinto.
 * Urgencia = ventanas (express 2–4h); no confundir con duración en horas del servicio.
 */

export const TRUCK_SERVICE_MACHINERY_IDS = [
  'camion_tolva',
  'camion_aljibe',
  'camion_pluma',
  'grua',
];

export function isTruckService(machinery) {
  const id = String(machinery || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return TRUCK_SERVICE_MACHINERY_IDS.includes(id);
}

/**
 * Camiones por urgencia (trip): modelo distinto a maquinaria por hora.
 * Grúa en flujo por hora (priceType hour) no entra aquí.
 */
export function isTruckUrgencyBooking(machinery) {
  if (typeof localStorage === 'undefined') return false;
  if (!isTruckService(machinery)) return false;
  const priceType = localStorage.getItem('priceType') || 'hour';
  return priceType === 'trip';
}

/**
 * Persistido en localStorage como `truckUrgencyTimeRange` (sin usar selectedHours como proxy).
 */
export function getTruckTimeRangeFromUrgency(urgencyType) {
  const u = String(urgencyType || '').toLowerCase();
  if (u === 'urgent') return '<2h';
  if (u === 'express') return '2-4h';
  if (u === 'today') return '>4h';
  if (u === 'scheduled') return null;
  return null;
}

/**
 * Solo para IMMEDIATE_MULTIPLIERS / pricing (4–8); no es duración del servicio en camiones.
 */
export function getTruckPricingHoursFromUrgency(urgencyType) {
  const u = String(urgencyType || '').toLowerCase();
  if (u === 'urgent') return 4;
  if (u === 'express') return 5;
  if (u === 'today') return 6;
  if (u === 'scheduled') return 8;
  return 5;
}

/**
 * Resumen corto para confirmación (misma línea que urgencia elegida).
 */
export function getTruckUrgencySummaryLine(urgencyType) {
  const u = String(urgencyType || '').toLowerCase();
  if (u === 'urgent') return 'Urgente (<2h)';
  if (u === 'express') return 'Express (2–4 horas)';
  if (u === 'today') return 'Hoy (>4 horas)';
  if (u === 'scheduled') return 'Programado';
  return '';
}

/**
 * Payload conceptual para truck (sin durationHours como duración real).
 */
export function getTruckBookingModelFields(urgencyType) {
  const u = String(urgencyType || '').toLowerCase();
  return {
    serviceModel: 'truck',
    urgencyType: u || undefined,
    timeRange: getTruckTimeRangeFromUrgency(u) || undefined,
  };
}

/** Traza única antes de OneClick (sin PII). */
export function logBookingModelCheck() {
  if (typeof console === 'undefined' || !console.log) return;
  const machinery = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedMachinery') || '' : '';
  const isTruck = isTruckUrgencyBooking(machinery);
  const urgencyType = typeof localStorage !== 'undefined' ? localStorage.getItem('urgencyType') || '' : '';
  const storedSm = typeof localStorage !== 'undefined' ? localStorage.getItem('serviceModel') || '' : '';
  const serviceModel = storedSm || (isTruck ? 'truck' : 'hourly');
  const durationHoursRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('durationHours') : null;
  const selectedHoursRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedHours') : null;
  const durationHours =
    durationHoursRaw != null && durationHoursRaw !== ''
      ? durationHoursRaw
      : !isTruck && selectedHoursRaw != null && selectedHoursRaw !== ''
        ? selectedHoursRaw
        : undefined;
  console.log('BOOKING MODEL CHECK', {
    isTruckService: isTruck,
    durationHours,
    urgencyType,
    serviceModel,
  });
}

/**
 * Antes de POST /api/payments/oneclick/start: sesión mínima + invariantes truck.
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function validateBookingModelBeforeOneClick() {
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('token') || localStorage.getItem('authToken')
      : null;
  if (!token || String(token).length < 8) {
    console.error('BOOKING MODEL CHECK: missing auth token before OneClick start');
    return { ok: false, code: 'missing_token' };
  }

  const machinery = localStorage.getItem('selectedMachinery') || '';
  const isTruck = isTruckUrgencyBooking(machinery);
  const sm = localStorage.getItem('serviceModel') || '';
  const durationHoursStored = localStorage.getItem('durationHours');
  const selectedHours = localStorage.getItem('selectedHours');

  if (isTruck && selectedHours != null && selectedHours !== '') {
    console.error('BOOKING MODEL INVARIANT: truck booking must not persist selectedHours', {
      machinery,
      selectedHours,
    });
    return { ok: false, code: 'truck_duration_contamination' };
  }
  if ((isTruck || sm === 'truck') && durationHoursStored != null && durationHoursStored !== '') {
    console.error('BOOKING MODEL INVARIANT: durationHours incompatible with truck service model', {
      durationHours: durationHoursStored,
      serviceModel: sm || 'truck',
    });
    return { ok: false, code: 'truck_duration_hours_conflict' };
  }
  return { ok: true };
}
