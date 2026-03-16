import React, { useRef, useEffect, useState } from 'react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

/**
 * Extrae la comuna desde address_components de Google Places
 */
function extractComunaFromPlace(place) {
  if (!place?.address_components) return null;
  for (const comp of place.address_components) {
    if (comp.types.includes('administrative_area_level_2') || comp.types.includes('locality')) {
      return comp.long_name;
    }
  }
  return null;
}

/**
 * Carga el script de Google Maps Places
 */
function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Error cargando Google Maps'));
    document.head.appendChild(script);
  });
}

/**
 * AddressAutocomplete - Autocompletado de direcciones con Google Places
 * 
 * Si VITE_GOOGLE_MAPS_API_KEY está configurado: usa Google Places para direcciones exactas.
 * Si no: fallback a input manual + ComunaAutocomplete.
 * 
 * onSelect: (result) => void
 *   result = { address, comuna, lat, lng }
 */
export function AddressAutocomplete({
  value = '',
  onChange,
  onComunaChange,
  onSelect,
  placeholder = 'Ej: Av. Providencia 1234',
  className = 'maqgo-input',
  style = {},
  disabled = false
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [useGooglePlaces, setUseGooglePlaces] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => setScriptLoaded(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_MAPS_API_KEY || !inputRef.current || !window.google?.maps?.places) return;

    const Autocomplete = window.google.maps.places.Autocomplete;
    const autocomplete = new Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'cl' },
      fields: ['formatted_address', 'geometry', 'address_components'],
      language: 'es'
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.formatted_address) return;

      const address = place.formatted_address;
      const lat = place.geometry?.location?.lat?.();
      const lng = place.geometry?.location?.lng?.();
      const comuna = extractComunaFromPlace(place);

      onChange?.(address);
      if (comuna) onComunaChange?.(comuna);
      onSelect?.({ address, comuna: comuna || '', lat, lng });
    });

    autocompleteRef.current = autocomplete;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync after Places init
    setUseGooglePlaces(true);

    return () => {
      if (window.google?.maps?.event && autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [scriptLoaded, GOOGLE_MAPS_API_KEY]);

  // Siempre el mismo input para que el ref sea estable; Autocomplete se adjunta cuando el script carga
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={useGooglePlaces && scriptLoaded ? 'Escribe la dirección para buscar...' : placeholder}
        className={className}
        style={style}
        autoComplete="off"
        disabled={disabled}
        data-testid={useGooglePlaces && scriptLoaded ? 'address-autocomplete-input' : 'address-manual-input'}
      />
      {useGooglePlaces && scriptLoaded && (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          Selecciona una dirección de la lista para mayor precisión
        </p>
      )}
    </div>
  );
}

export default AddressAutocomplete;
