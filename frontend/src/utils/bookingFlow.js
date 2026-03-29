/**
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 *
 * MAQGO - Rutas y flujos centralizados
 * Fuente única de verdad para step→route y back routes.
 * Evita duplicación y parches en ProviderHomeScreen, WelcomeScreen, ClientHome.
 */

export const MIN_HOURS_IMMEDIATE = 4;
export const MAX_HOURS_IMMEDIATE = 8;

/**
 * Snapshot único de contexto de reserva cliente (localStorage).
 * Modos excluyentes: SCHEDULED vs IMMEDIATE vs IMMEDIATE_HYBRID — no mezclar días/horas entre ellos.
 * Llamar de nuevo al navegar (p. ej. deps con `location.pathname`) para coherencia post-navegación.
 */
export function readClientBookingSnapshot() {
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const priceType = localStorage.getItem('priceType') || 'hour';
  const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';

  let selectedDates = [];
  try {
    selectedDates = JSON.parse(localStorage.getItem('selectedDates') || '[]');
  } catch {
    selectedDates = [];
  }
  if (!Array.isArray(selectedDates)) selectedDates = [];

  const selectedDate = localStorage.getItem('selectedDate') || '';
  const additionalDaysRaw = parseInt(localStorage.getItem('additionalDays') || '0', 10) || 0;
  const savedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);

  if (reservationType === 'scheduled') {
    const totalDays = selectedDates.length > 0 ? selectedDates.length : 1;
    return {
      mode: 'SCHEDULED',
      reservationType: 'scheduled',
      priceType,
      machinery,
      totalDays,
      selectedDates,
      selectedDate,
      hoursToday: 8,
      additionalDays: 0,
      isHybrid: false,
    };
  }

  const hoursToday = Math.max(
    MIN_HOURS_IMMEDIATE,
    Math.min(MAX_HOURS_IMMEDIATE, savedHours)
  );
  const additionalDays = additionalDaysRaw;
  const isHybrid = additionalDays > 0;

  return {
    mode: isHybrid ? 'IMMEDIATE_HYBRID' : 'IMMEDIATE',
    reservationType: 'immediate',
    priceType,
    machinery,
    totalDays: isHybrid ? 1 + additionalDays : 1,
    selectedDates,
    selectedDate,
    hoursToday,
    additionalDays,
    isHybrid,
  };
}

// ===========================================
// CLIENT BOOKING - Step → Route (reanudar reserva)
// ===========================================
export const CLIENT_BOOKING_STEP_ROUTES = {
  machinery: '/client/machinery',
  hours: '/client/service-location',
  urgency: '/client/urgency',
  calendar: '/client/calendar',
  location: '/client/service-location',
  providers: '/client/providers',
  confirm: '/client/confirm',
};

/**
 * Obtiene la ruta para reanudar el flujo de reserva cliente.
 * @param {string} step - clientBookingStep (machinery, hours, urgency, etc.)
 * @returns {string} Ruta o /client/home si no hay match
 */
export function getClientBookingRoute(step) {
  return CLIENT_BOOKING_STEP_ROUTES[step] || '/client/home';
}

// ===========================================
// PROVIDER ONBOARDING - Step (1-6) → Route
// Re-export desde providerOnboarding (módulo independiente para evitar errores en chunks lazy)
// ===========================================
export {
  PROVIDER_ONBOARDING_STEP_ROUTES,
  getProviderOnboardingRoute,
} from './providerOnboarding';

// ===========================================
// CLIENT BOOKING - Keys para limpiar al cancelar/nueva reserva
// ===========================================
export const CLIENT_BOOKING_STORAGE_KEYS = [
  'clientBookingStep', 'bookingProgress', 'selectedMachinery', 'selectedMachineryList', 'selectedHours',
  'reservationType', 'priceType', 'serviceLocation', 'selectedAddress', 'serviceLat', 'serviceLng',
  'serviceComuna', 'serviceComunaSource', 'serviceReference', 'serviceLocationManualFallback',
  'selectedProviderIds', 'matchedProviders', 'selectedProvider', 'billingData',
  'selectedDates', 'selectedDate', 'serviceBasePrice', 'serviceTransportFee',
  'totalAmount', 'maxTotalAmount', 'needsInvoice', 'currentServiceId', 'matchingResult',
  'clientRequiredM3List', 'clientRequiredM3', 'providerSelectionMachinery', 'acceptedProvider',
  'servicePricing', 'urgencyType', 'additionalDays', 'urgencyBonus', 'oneclickDemoMode',
];

/**
 * Limpia todo el estado de reserva cliente en localStorage.
 */
export function clearClientBookingStorage() {
  CLIENT_BOOKING_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
}

/**
 * Reset completo al entrar al embudo de reserva o al iniciar una nueva reserva.
 * Limpia dirección normalizada, ubicación legada y caché de progreso (sin llamadas al backend).
 */
export function resetBookingState() {
  clearClientBookingStorage();
  localStorage.removeItem('bookingProgress');
  localStorage.removeItem('clientBookingStep');
}

// ===========================================
// RUTAS DE RETROCESO (back button)
// ===========================================
export const BOOKING_BACK_ROUTES = {
  '/client/machinery': '/client/home',
  '/client/calendar': '/client/home',
  '/client/calendar-multi': '/client/home',
  '/client/hours': '/client/machinery',
  '/client/hours-selection': '/client/service-location',
  '/client/urgency': '/client/machinery',
  '/client/providers': '/client/service-location',
  '/client/confirm': '/client/providers',
  '/client/workday-confirmation': '/client/confirm',
  '/client/billing': '/client/confirm',
  '/client/card': '/client/billing',
  '/client/card-input': '/client/card',
  '/client/searching': '/client/card',
  '/client/payment-result': '/client/home',
  '/client/assigned': '/client/searching',
  '/oneclick/complete': '/client/card',
};

/**
 * Ruta de retroceso para reservation-data según flujo (scheduled vs immediate).
 */
function getReservationDataBackRoute() {
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const priceType = localStorage.getItem('priceType') || 'hour';
  if (reservationType === 'scheduled') return '/client/calendar';
  if (priceType === 'trip') return '/client/urgency';
  // Inmediato por hora: horas viven en service-location; no forzar pantalla legacy de horas.
  return '/client/machinery';
}

/**
 * Ruta de retroceso para service-location según flujo.
 * Inmediata por hora: viene de maquinaria (horas en service-location). Por viaje: urgency. Programada: machinery tras calendario.
 */
function getServiceLocationBackRoute() {
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const priceType = localStorage.getItem('priceType') || 'hour';
  if (reservationType === 'scheduled') return '/client/machinery';
  if (priceType === 'trip') return '/client/urgency';
  return '/client/machinery';
}

/**
 * Rutas de retroceso para onboarding proveedor.
 */
export const PROVIDER_ONBOARDING_BACK_ROUTES = {
  '/provider/data': '/select-role',
  '/provider/machine-data': '/provider/data',
  '/provider/machine-photos': '/provider/machine-data',
  '/provider/pricing': '/provider/machine-photos',
  '/provider/operator-data': '/provider/pricing',
  '/provider/review': '/provider/operator-data',
};

/**
 * Obtiene la ruta de "volver" para el flujo de reserva cliente.
 * reservation-data usa back dinámico según flujo (scheduled/calendar, immediate/hour→machinery, immediate/trip/urgency).
 * Nunca devuelve null para rutas /client/*: usa /client/home como fallback para evitar navigate(-1) que falla sin historial.
 */
export function getBookingBackRoute(pathname) {
  const path = (pathname || '').replace(/\/$/, '') || '/';
  if (path === '/client/reservation-data') return getReservationDataBackRoute();
  if (path === '/client/service-location') return getServiceLocationBackRoute();
  // Programada: machinery → calendar (no home)
  if (path === '/client/machinery' && localStorage.getItem('reservationType') === 'scheduled') {
    return '/client/calendar';
  }
  // Si llegó a /client/card sin factura, volver a confirm (no pasó por billing)
  if (path === '/client/card' && localStorage.getItem('needsInvoice') !== 'true') {
    return '/client/confirm';
  }
  const route = BOOKING_BACK_ROUTES[path];
  if (route) return route;
  // Fallback seguro: evita navigate(-1) que falla si el usuario llegó por URL directa o refrescó
  if (path.startsWith('/client/')) return '/client/home';
  return null;
}

/**
 * Obtiene la ruta de "volver" para el onboarding proveedor.
 * Si el proveedor vino desde Welcome (provider/register), /provider/data vuelve a /.
 */
export function getProviderBackRoute(pathname) {
  if (pathname === '/provider/data' && typeof localStorage !== 'undefined' && localStorage.getItem('providerCameFromWelcome')) {
    return '/';
  }
  return PROVIDER_ONBOARDING_BACK_ROUTES[pathname] || null;
}
