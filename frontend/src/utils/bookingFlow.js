/**
 * Rutas de retroceso para el flujo de reserva cliente.
 * Evita navigate(-1) que puede fallar si el usuario llega por URL directa o refresca.
 */
export const BOOKING_BACK_ROUTES = {
  '/client/machinery': '/client/home',
  '/client/calendar': '/client/home',
  '/client/calendar-multi': '/client/home',
  '/client/hours': '/client/machinery',
  '/client/hours-selection': '/client/machinery',
  '/client/urgency': '/client/machinery',
  '/client/providers': '/client/service-location',
  '/client/confirm': '/client/providers',
  '/client/billing': '/client/confirm',
  '/client/card': '/client/billing',
  '/client/card-input': '/client/card',
};

/**
 * Ruta de retroceso para reservation-data según flujo (scheduled vs immediate).
 */
function getReservationDataBackRoute() {
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const priceType = localStorage.getItem('priceType') || 'hour';
  if (reservationType === 'scheduled') return '/client/calendar';
  if (priceType === 'trip') return '/client/urgency';
  return '/client/hours-selection';
}

/**
 * Ruta de retroceso para service-location según flujo.
 * Inmediata: viene de hours-selection o urgency. Programada: viene de calendar → machinery (reservation-data ya no es pantalla).
 */
function getServiceLocationBackRoute() {
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const priceType = localStorage.getItem('priceType') || 'hour';
  if (reservationType === 'scheduled') return '/client/machinery';
  if (priceType === 'trip') return '/client/urgency';
  return '/client/hours-selection';
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
 * reservation-data usa back dinámico según flujo (scheduled/calendar, immediate/hour/hours-selection, immediate/trip/urgency).
 */
export function getBookingBackRoute(pathname) {
  if (pathname === '/client/reservation-data') return getReservationDataBackRoute();
  if (pathname === '/client/service-location') return getServiceLocationBackRoute();
  // Si llegó a /client/card sin factura, volver a confirm (no pasó por billing)
  if (pathname === '/client/card' && localStorage.getItem('needsInvoice') !== 'true') {
    return '/client/confirm';
  }
  return BOOKING_BACK_ROUTES[pathname] || null;
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
