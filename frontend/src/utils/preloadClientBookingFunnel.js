/**
 * Precarga en idle los chunks del embudo de reserva cliente (mismos módulos que lazy() en App).
 * Mejora la sensación de navegación sin aumentar el JS del primer paint.
 */
export function preloadClientBookingFunnel() {
  const run = () => {
    void import('../screens/client/MachinerySelection');
    void import('../screens/client/CalendarMultiDayScreen');
    void import('../screens/client/HoursSelectionScreen');
    void import('../screens/client/UrgencySelectionScreen');
    void import('../screens/client/ServiceLocationScreen');
    void import('../screens/client/ProviderOptionsScreen');
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}
