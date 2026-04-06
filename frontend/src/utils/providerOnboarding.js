/**
 * Rutas de onboarding proveedor (paso en localStorage → ruta).
 * '4' legacy: entre fotos y tarifas (antes pantallas separadas) → misma URL que paso 3 combinado.
 * Valores sincronizados con bookingFlow.js.
 */
export const PROVIDER_ONBOARDING_STEP_ROUTES = {
  '1': '/provider/data',
  '2': '/provider/machine-data',
  '3': '/provider/machine-photos-pricing',
  '4': '/provider/machine-photos-pricing',
  '5': '/provider/operator-data',
  '6': '/provider/review',
};

export function getProviderOnboardingRoute(step) {
  const key = String(step);
  return PROVIDER_ONBOARDING_STEP_ROUTES[key] || null;
}
