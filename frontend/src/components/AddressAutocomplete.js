import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { mapPlaceToAddress } from '../utils/mapPlaceToAddress';

export function getGoogleMapsApiKey() {
  const sanitize = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw === 'undefined' || raw === 'null') return '';
    // Soporta valores accidentalmente guardados con comillas en runtime-config.
    return raw.replace(/^['"]|['"]$/g, '').trim();
  };

  // 1) Build-time env (Vercel)
  const fromEnvRaw =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    import.meta.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
    '';
  const fromEnv = sanitize(fromEnvRaw);
  if (fromEnv) return fromEnv;

  // 2) Runtime config (si queremos inyectar sin rebuild)
  const fromRuntime = sanitize(window.__MAQGO_RUNTIME_CONFIG__?.googleMapsApiKey || '');
  return String(fromRuntime || '');
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
    // Best practice: loading=async para evitar warning de performance.
    // v=weekly: evita casos donde el núcleo carga antes que el submódulo `places`.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&language=es&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GoogleMapsScriptLoadError'));
    document.head.appendChild(script);
  });
}

/**
 * Tras `onload` del script, a veces `google.maps.places.Autocomplete` aún no está (race / carga diferida).
 * Esperamos unos ms antes de declarar fallo.
 */
function waitForAutocompleteConstructor(maxMs = 2500) {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (typeof window.google?.maps?.places?.Autocomplete === 'function') {
        resolve(true);
        return;
      }
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      if (elapsed >= maxMs) {
        resolve(false);
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

/**
 * scriptRetryKey: solo incrementa en reintento explícito (ServiceLocation); no ligar a navegación
 * para evitar recargar el script de Maps sin necesidad.
 *
 * AddressAutocomplete - Autocompletado de direcciones con Google Places
 * 
 * Si VITE_GOOGLE_MAPS_API_KEY está configurado: usa Google Places para direcciones exactas.
 * Si no: fallback a input manual + ComunaAutocomplete.
 * 
 * onSelect: (result) => void — solo tras elegir sugerencia y `mapPlaceToAddress` válido
 *   (geometry + address_components; sin depender de formatted_address).
 * onPlaceRejected: (code) => void — NO_STREET_NUMBER | MISSING_STREET_NUMBER | NO_COMUNA_FROM_PLACE.
 *   result = { address_short, commune, address_full, lat, lng, street, number, source, address, comuna }
 * onPlacesStatusChange: ({ ready, phase, hasApiKey }) — ready=true cuando Autocomplete está activo
 */
export function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  onPlaceRejected,
  onPlacesReadyChange,
  onPlacesStatusChange,
  scriptRetryKey = 0,
  syncInputOnReject = false,
  placeholder = 'Ej: Av. Providencia 1234',
  className = 'maqgo-input',
  style = {},
  disabled = false,
  testId
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  /** Evitar re-adjuntar Autocomplete en cada render del padre (onSelect inline rompe el dropdown .pac-container). */
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  const onPlaceRejectedRef = useRef(onPlaceRejected);
  const onPlacesReadyChangeRef = useRef(onPlacesReadyChange);
  const onPlacesStatusChangeRef = useRef(onPlacesStatusChange);
  const valueRef = useRef(value);
  const syncInputOnRejectRef = useRef(syncInputOnReject);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onSelectRef.current = onSelect;
    onPlaceRejectedRef.current = onPlaceRejected;
    onPlacesReadyChangeRef.current = onPlacesReadyChange;
    onPlacesStatusChangeRef.current = onPlacesStatusChange;
    valueRef.current = value;
    syncInputOnRejectRef.current = syncInputOnReject;
  });

  const [useGooglePlaces, setUseGooglePlaces] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [apiKey] = useState(() => getGoogleMapsApiKey());
  const [lastMapsError, setLastMapsError] = useState('');
  const lastMapsErrorRef = useRef('');

  useEffect(() => {
    lastMapsErrorRef.current = lastMapsError;
  }, [lastMapsError]);

  useEffect(() => {
    if (!apiKey) {
      onPlacesStatusChange?.({ ready: false, phase: 'no_key', hasApiKey: false, reason: 'NO_API_KEY' });
      onPlacesReadyChange?.(false);
      return;
    }

    const parseGoogleMapsError = (message) => {
      const msg = String(message || '');
      const mapsApiErrorMatch = msg.match(/Google Maps JavaScript API error:\s*([A-Za-z0-9_]+)/i);
      if (mapsApiErrorMatch?.[1]) return mapsApiErrorMatch[1];
      const mapsAuthFailureMatch = msg.match(/Google Maps JavaScript API warning:\s*([A-Za-z0-9_]+)/i);
      if (mapsAuthFailureMatch?.[1]) return mapsAuthFailureMatch[1];
      if (msg.includes('Google Maps')) return 'GoogleMapsUnknownError';
      return '';
    };

    const errorListener = (event) => {
      const extracted = parseGoogleMapsError(event?.message);
      if (!extracted) return;
      setLastMapsError(extracted);
      onPlacesStatusChange?.({
        ready: false,
        phase: 'failed',
        hasApiKey: true,
        reason: extracted
      });
    };

    window.addEventListener('error', errorListener);
    onPlacesStatusChange?.({ ready: false, phase: 'loading', hasApiKey: true });
    loadGoogleMapsScript(apiKey)
      .then(async () => {
        const ctorOk = await waitForAutocompleteConstructor();
        setScriptLoaded(true);
        // Listo de verdad solo cuando el Autocomplete está adjunto (segundo effect).
        onPlacesReadyChange?.(false);
        onPlacesStatusChange?.({
          ready: false,
          phase: ctorOk ? 'script_loaded' : 'failed',
          hasApiKey: true,
          reason: ctorOk ? '' : (lastMapsErrorRef.current || 'AutocompleteConstructorUnavailable')
        });
      })
      .catch((error) => {
        const reason = lastMapsErrorRef.current || error?.message || 'GoogleMapsLoadFailed';
        setScriptLoaded(false);
        onPlacesReadyChange?.(false);
        onPlacesStatusChange?.({ ready: false, phase: 'failed', hasApiKey: true, reason });
      });
    return () => window.removeEventListener('error', errorListener);
  }, [apiKey, scriptRetryKey, onPlacesReadyChange, onPlacesStatusChange]);

  useEffect(() => {
    // Al reintentar, mostrar modo manual hasta que Places se vuelva a adjuntar.
    setUseGooglePlaces(false);
  }, [scriptRetryKey]);

  useEffect(() => {
    if (!scriptLoaded || !apiKey || !inputRef.current || !window.google?.maps?.places) return;

    const AutocompleteCtor = window.google?.maps?.places?.Autocomplete;
    if (typeof AutocompleteCtor !== 'function') {
      // Google puede no exponer Autocomplete (ej. migraciones / plan restringido).
      // Si eso pasa, dejamos el input como manual (no bloqueamos escritura).
      onPlacesReadyChangeRef.current?.(false);
      onPlacesStatusChangeRef.current?.({
        ready: false,
        phase: 'failed',
        hasApiKey: true,
        reason: lastMapsErrorRef.current || 'AutocompleteConstructorUnavailable'
      });
      return;
    }

    let autocomplete;
    try {
      // `geocode` cubre calles, lugares y puntos sin número; `address` a veces excluye direcciones rurales.
      autocomplete = new AutocompleteCtor(inputRef.current, {
        types: ['geocode'],
        componentRestrictions: { country: 'cl' },
        fields: ['geometry', 'address_components'],
        language: 'es'
      });
    } catch {
      // Si Google falla al instanciar, no rompemos la pantalla.
      onPlacesReadyChangeRef.current?.(false);
      onPlacesStatusChangeRef.current?.({
        ready: false,
        phase: 'failed',
        hasApiKey: true,
        reason: lastMapsErrorRef.current || 'AutocompleteInitFailed'
      });
      return;
    }

    // Solo `place_changed` (elección explícita en el desplegable o equivalente) activa modo Google;
    // escribir en el input sin elegir sugerencia no llama a onSelect ni sincroniza coords.
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const mapped = mapPlaceToAddress(place);
      // Sin sugerencia válida: getPlace() suele venir sin address_components → no actualizar.
      if (!mapped) return;
      if (mapped.ok === false) {
        if (syncInputOnRejectRef.current) {
          const rawValue = inputRef.current?.value;
          onChangeRef.current?.(rawValue != null ? rawValue : valueRef.current);
        }
        onPlaceRejectedRef.current?.(mapped.code);
        return;
      }

      onSelectRef.current?.({
        ...mapped,
        address: mapped.address_short,
        comuna: mapped.commune
      });
      // No llamar onChange aquí: el padre ya sincroniza `location` en onSelect. Si además
      // disparamos onChange, handleLocationChange corre con lastGoogleAddress *viejo* (closure)
      // y puede borrar comuna/coords creyendo que el usuario editó el texto.
    });

    autocompleteRef.current = autocomplete;
    setUseGooglePlaces(true);
    onPlacesReadyChangeRef.current?.(true);
    onPlacesStatusChangeRef.current?.({ ready: true, phase: 'ready', hasApiKey: true });

    return () => {
      if (window.google?.maps?.event && autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, [scriptLoaded, apiKey, scriptRetryKey]);

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
        data-testid={
          testId || (useGooglePlaces && scriptLoaded ? 'address-autocomplete-input' : 'address-manual-input')
        }
      />
      {!apiKey && (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Autocompletado no disponible por configuración. Puedes escribir la dirección manualmente.
        </p>
      )}
      {useGooglePlaces && scriptLoaded && (
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 8, marginBottom: 0, lineHeight: 1.4 }}>
          Lo ideal: una sugerencia que traiga <strong style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>calle, número y comuna</strong>. Si no
          aplica, marca «No encuentro mi dirección» y completa dirección + comuna a mano.
        </p>
      )}
    </div>
  );
}

export default AddressAutocomplete;
