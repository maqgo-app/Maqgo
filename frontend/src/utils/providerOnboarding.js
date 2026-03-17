/**
 * Rutas de onboarding proveedor (step 1-6 → ruta).
 * Valores sincronizados con bookingFlow.js para mantener consistencia.
 * Módulo independiente para evitar errores de import en chunks lazy.
 */
export const PROVIDER_ONBOARDING_STEP_ROUTES = {
  '1': '/provider/data',
  '2': '/provider/machine-data',
  '3': '/provider/machine-photos',
  '4': '/provider/pricing',
  '5': '/provider/operator-data',
  '6': '/provider/review',
};

export function getProviderOnboardingRoute(step) {
  const key = String(step);
  return PROVIDER_ONBOARDING_STEP_ROUTES[key] || null;
}
