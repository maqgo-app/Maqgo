/**
 * P2 ubicación: cuándo montar AddressAutocomplete (carga script Maps y emite placesPhase hasta `ready`).
 * No debe exigirse `placesPhase === 'ready'` antes de montar — si no, deadlock (UI en "Cargando…").
 */
export function shouldMountGoogleAddressAutocomplete(hasApiKey, manualAddressNotFound) {
  return Boolean(hasApiKey && !manualAddressNotFound);
}
