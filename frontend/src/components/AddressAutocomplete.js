import React, { useRef, useEffect, useState } from 'react';
import { COMUNAS_NOMBRES } from '../data/comunas';

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
 * Extrae la comuna desde address_components de Google Places
 */
function extractComunaFromPlace(place) {
  if (!place?.address_components) return null;
  const comps = place.address_components;

  const normalize = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  // Mapa normalized -> nombre canónico (con tildes si existe)
  const normalizedToCanonical = new Map(
    (COMUNAS_NOMBRES || []).map((n) => [normalize(n), n])
  );
  const isValidComuna = (name) => normalizedToCanonical.has(normalize(name));

  // Priorizamos tipos donde típicamente aparece la comuna en Chile.
  // Problema observado: a veces `administrative_area_level_2` viene como "Santiago"
  // (provincia/ciudad), pero la comuna real (ej. Lo Barnechea) viene en `locality`
  // o `sublocality`. Por eso `locality` va antes que level_2.
  const typePriority = [
    'administrative_area_level_3',
    'locality',
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_2'
  ];

  const typeRank = (types) => {
    const t = Array.isArray(types) ? types : [];
    const ranks = t
      .map((x) => typePriority.indexOf(x))
      .filter((r) => r >= 0);
    // Si no hay tipos del listado, dejamos prioridad muy baja
    return ranks.length ? Math.min(...ranks) : 999;
  };

  // En vez de devolver "el primero", juntamos todos los candidatos que
  // coinciden con una comuna válida y elegimos la más específica.
  const candidates = [];
  for (const comp of comps) {
    const longName = comp?.long_name;
    if (!isValidComuna(longName)) continue;

    candidates.push({
      comuna: normalizedToCanonical.get(normalize(longName)),
      rank: typeRank(comp?.types),
      // desempate: preferir el nombre más largo (ej. "Lo Barnechea")
      len: String(longName || '').length
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => a.rank - b.rank || b.len - a.len);
    return candidates[0].comuna;
  }

  // Fallback: si no encontramos una comuna valida, intentar el primer match anterior
  // (para no devolver null cuando hay algun componente "casi" correcto).
  const rawCandidate =
    comps.find((c) => c?.types?.includes('administrative_area_level_3'))?.long_name ||
    comps.find((c) => c?.types?.includes('locality'))?.long_name ||
    comps.find((c) => c?.types?.includes('administrative_area_level_2'))?.long_name;

  return isValidComuna(rawCandidate) ? normalizedToCanonical.get(normalize(rawCandidate)) : null;
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
 * AddressAutocomplete - Autocompletado de direcciones con Google Places
 * 
 * Si VITE_GOOGLE_MAPS_API_KEY está configurado: usa Google Places para direcciones exactas.
 * Si no: fallback a input manual + ComunaAutocomplete.
 * 
 * onSelect: (result) => void
 *   result = { address, comuna, lat, lng }
 * onPlacesStatusChange: ({ ready, phase, hasApiKey }) — ready=true cuando Autocomplete está activo
 */
export function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  onPlacesReadyChange,
  onPlacesStatusChange,
  scriptRetryKey = 0,
  placeholder = 'Ej: Av. Providencia 1234',
  className = 'maqgo-input',
  style = {},
  disabled = false
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de bandera antes de re-adjuntar Autocomplete
    setUseGooglePlaces(false);
  }, [scriptRetryKey]);

  useEffect(() => {
    if (!scriptLoaded || !apiKey || !inputRef.current || !window.google?.maps?.places) return;

    const AutocompleteCtor = window.google?.maps?.places?.Autocomplete;
    if (typeof AutocompleteCtor !== 'function') {
      // Google puede no exponer Autocomplete (ej. migraciones / plan restringido).
      // Si eso pasa, dejamos el input como manual (no bloqueamos escritura).
      onPlacesReadyChange?.(false);
      onPlacesStatusChange?.({
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
        fields: ['formatted_address', 'geometry', 'address_components'],
        language: 'es'
      });
    } catch {
      // Si Google falla al instanciar, no rompemos la pantalla.
      onPlacesReadyChange?.(false);
      onPlacesStatusChange?.({
        ready: false,
        phase: 'failed',
        hasApiKey: true,
        reason: lastMapsErrorRef.current || 'AutocompleteInitFailed'
      });
      return;
    }

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place?.formatted_address) return;

      const address = place.formatted_address;
      const lat = place.geometry?.location?.lat?.();
      const lng = place.geometry?.location?.lng?.();
      const comuna = extractComunaFromPlace(place);

      // Orden importante:
      // 1) onSelect primero para que el consumidor pueda fijar lat/lng (y cualquier estado asociado).
      // 2) onChange después para actualizar el texto del input.
      onSelect?.({ address, comuna: comuna || '', lat, lng });
      onChange?.(address);

      // Best practice (MAQGO): la comuna se ingresa manualmente.
      // Evitamos pisar el estado del usuario con `onComunaChange` desde Google.
    });

    autocompleteRef.current = autocomplete;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync after Places init
    setUseGooglePlaces(true);
    onPlacesReadyChange?.(true);
    onPlacesStatusChange?.({ ready: true, phase: 'ready', hasApiKey: true });

    return () => {
      if (window.google?.maps?.event && autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, [scriptLoaded, apiKey, onChange, onSelect, onPlacesReadyChange, onPlacesStatusChange]);

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
      {!apiKey && (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          Autocompletado no disponible por configuración. Puedes escribir la dirección manualmente.
        </p>
      )}
      {useGooglePlaces && scriptLoaded && (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          Elige una opción de la lista para fijar el punto en el mapa. Si no aparece, usa &quot;No encuentro mi dirección&quot; debajo.
        </p>
      )}
    </div>
  );
}

export default AddressAutocomplete;
