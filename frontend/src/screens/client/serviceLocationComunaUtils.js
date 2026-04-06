/**
 * Comuna inferida desde Places (canónica) + fuente places_canonical|google → no se muestra ni valida aparte.
 */
export function shouldHideServiceLocationComunaField(comunaSource, comuna) {
  const src = String(comunaSource || '');
  const fromPlaces = src === 'places_canonical' || src === 'google';
  return fromPlaces && !!String(comuna || '').trim();
}

/** @deprecated Usar shouldHideServiceLocationComunaField (antes: "readonly") */
export function isServiceComunaReadonly(comunaSource, comuna) {
  return shouldHideServiceLocationComunaField(comunaSource, comuna);
}
