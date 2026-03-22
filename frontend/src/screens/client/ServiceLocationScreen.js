import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { ComunaAutocomplete } from '../../components/ComunaAutocomplete';
import { AddressAutocomplete, getGoogleMapsApiKey } from '../../components/AddressAutocomplete';
import BookingProgress from '../../components/BookingProgress';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { getArray } from '../../utils/safeStorage';
import { COMUNAS_NOMBRES } from '../../data/comunas';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getPerTripDateLabel } from '../../utils/bookingDates';
import { validateServiceLocationContinue } from '../../utils/serviceLocationValidation';

/**
 * Pantalla: Ubicación del Servicio
 * Se muestra ANTES de ver los proveedores disponibles
 * El cliente debe ingresar dónde necesita el servicio
 */
function ServiceLocationScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const backRoute = getBookingBackRoute(pathname);
  const [location, setLocation] = useState('');
  const [comuna, setComuna] = useState('');
  const [serviceLat, setServiceLat] = useState(null);
  const [serviceLng, setServiceLng] = useState(null);
  /** 'loading' | 'script_loaded' | 'ready' | 'failed' | 'no_key' */
  const [placesPhase, setPlacesPhase] = useState(() =>
    getGoogleMapsApiKey() ? 'loading' : 'no_key'
  );
  const [placesReason, setPlacesReason] = useState('');
  const [scriptRetryKey, setScriptRetryKey] = useState(0);
  /** Usuario no encuentra su calle en Places pero el mapa sí carga */
  const [manualAddressNotFound, setManualAddressNotFound] = useState(false);
  const [comunaError, setComunaError] = useState('');
  const [reference, setReference] = useState('');
  const [machinery, setMachinery] = useState('');
  const [hours, setHours] = useState(4);
  const [reservationType, setReservationType] = useState('immediate');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);

  useEffect(() => {
    // Autosave defensivo para no perder avance al navegar entre pantallas.
    localStorage.setItem('serviceLocation', location || '');
  }, [location]);

  useEffect(() => {
    localStorage.setItem('serviceComuna', comuna || '');
  }, [comuna]);

  useEffect(() => {
    localStorage.setItem('serviceReference', reference || '');
  }, [reference]);

  useEffect(() => {
    if (serviceLat != null) localStorage.setItem('serviceLat', String(serviceLat));
    else localStorage.removeItem('serviceLat');
  }, [serviceLat]);

  useEffect(() => {
    if (serviceLng != null) localStorage.setItem('serviceLng', String(serviceLng));
    else localStorage.removeItem('serviceLng');
  }, [serviceLng]);

  /* Hydratación desde localStorage al montar (patrón SPA). */
  /* eslint-disable react-hooks/set-state-in-effect -- valores iniciales desde storage */
  useEffect(() => {
    const savedMachinery = localStorage.getItem('selectedMachinery') || '';
    const savedHours = parseInt(localStorage.getItem('selectedHours') || '4');
    const savedType = localStorage.getItem('reservationType') || 'immediate';
    const savedLocation = localStorage.getItem('serviceLocation') || '';
    const savedComuna = localStorage.getItem('serviceComuna') || '';
    const savedDate = localStorage.getItem('selectedDate') || '';
    const savedDates = getArray('selectedDates', []);
    
    setMachinery(savedMachinery);
    setHours(savedType === 'scheduled' ? 8 : savedHours);
    setReservationType(savedType);
    setSelectedDate(savedDate);
    setSelectedDates(Array.isArray(savedDates) ? savedDates : []);
    if (savedLocation) {
      const parts = savedLocation.split(', ');
      if (parts.length >= 2) {
        setLocation(parts.slice(0, -1).join(', '));
        setComuna(savedComuna || parts[parts.length - 1]);
      } else {
        setLocation(savedLocation);
        if (savedComuna) setComuna(savedComuna);
      }
    }
    const savedLat = localStorage.getItem('serviceLat');
    const savedLng = localStorage.getItem('serviceLng');
    if (savedLat) setServiceLat(parseFloat(savedLat));
    if (savedLng) setServiceLng(parseFloat(savedLng));
    
    saveBookingProgress('location', { machinery: savedMachinery });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasApiKey = useMemo(() => !!getGoogleMapsApiKey(), []);

  const onPlacesStatusChange = useCallback((status) => {
    const phase = status?.phase;
    setPlacesReason(String(status?.reason || ''));
    if (phase === 'no_key') setPlacesPhase('no_key');
    else if (phase === 'loading') setPlacesPhase('loading');
    else if (phase === 'script_loaded') setPlacesPhase('script_loaded');
    else if (phase === 'failed') setPlacesPhase('failed');
    else if (phase === 'ready' && status?.ready) setPlacesPhase('ready');
  }, []);

  /** Texto para equipo / soporte (producción: sin códigos crudos al usuario). */
  const diagnosticReason = useMemo(() => {
    if (!placesReason) return '';
    const known = {
      RefererNotAllowedMapError: 'La configuración de Google no permite este sitio web. Revisa restricciones de dominio en la consola de Google Cloud.',
      BillingNotEnabledMapError: 'En Google Cloud falta activar facturación para Maps.',
      ApiNotActivatedMapError: 'En Google Cloud deben estar habilitadas “Maps JavaScript API” y “Places API”.',
      InvalidKeyMapError: 'La clave de Maps no es válida o fue revocada.',
      ExpiredKeyMapError: 'La clave de Maps expiró.',
      RequestDeniedMapError: 'Google rechazó la solicitud (revisa restricciones de la clave).',
      GoogleMapsScriptLoadError: 'No se pudo descargar Maps (red, bloqueador o política del sitio).',
      AutocompleteConstructorUnavailable:
        'El buscador de calles no se activó; puedes seguir con dirección escrita a mano y referencia.',
      AutocompleteInitFailed: 'El buscador de calles no pudo iniciarse; puedes seguir a mano.'
    };
    return known[placesReason] || 'Algo impidió activar el buscador de direcciones.';
  }, [placesReason]);

  /** Título y párrafo principal del aviso rojo (lenguaje usuario; no decimos “mapa” si solo falló el autocompletado). */
  const placesFailureUi = useMemo(() => {
    const r = placesReason;
    const manualHint =
      'Escribe la dirección y la comuna, y una referencia detallada (mín. 25 caracteres). Puedes continuar: el operador podrá ubicarte.';
    if (r === 'AutocompleteConstructorUnavailable' || r === 'AutocompleteInitFailed') {
      return {
        title: 'Buscador de calles no disponible',
        body: manualHint,
        retryLabel: 'Reintentar buscador',
      };
    }
    if (r === 'GoogleMapsScriptLoadError') {
      return {
        title: 'No pudimos cargar el buscador de direcciones',
        body: `${manualHint} También puedes pulsar reintentar.`,
        retryLabel: 'Reintentar',
      };
    }
    return {
      title: 'No pudimos activar el buscador de direcciones',
      body: `${manualHint} Si el problema continúa, revisa la configuración de Google Maps en el proyecto.`,
      retryLabel: 'Reintentar',
    };
  }, [placesReason]);

  const waitingForPlaces =
    hasApiKey && (placesPhase === 'loading' || placesPhase === 'script_loaded');

  const formatDateShort = (dateStr) => {
    if (!dateStr) return 'Programado';
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    if (isNaN(date.getTime())) return 'Programado';
    return date.toLocaleDateString('es-CL', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  /** true si el flujo es programado (por tipo o por tener fechas del calendario) */
  const isScheduled = reservationType === 'scheduled' || selectedDates.length > 0;

  /** Resumen de fechas: una sola fecha o rango de días cuando hay varias seleccionadas. No devolver "Inicio HOY" si hay fechas. */
  const getDateSummary = () => {
    const dates = (selectedDates || [])
      .map(d => typeof d === 'string' ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')) : d)
      .filter(d => d && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length > 0) {
      if (dates.length === 1) return formatDateShort(dates[0].toISOString().split('T')[0]);
      const first = dates[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
      const last = dates[dates.length - 1].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
      return `${dates.length} días · ${first} – ${last}`;
    }
    if (selectedDate) return formatDateShort(selectedDate);
    if (!isScheduled) return null; // inmediato: no mostrar texto de fecha aquí (se usa "Inicio HOY" en la línea de abajo)
    return 'Programado';
  };

  const perTripDateSummary = getPerTripDateLabel(selectedDates, selectedDate, { prefix: 'Valor viaje ·' });

  const handleContinue = () => {
    setComunaError('');
    const normalizedComuna = comuna.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isValidComuna = COMUNAS_NOMBRES.some(
      nombre => nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedComuna
    );

    const refLen = reference.trim().length;
    const validation = validateServiceLocationContinue({
      locationTrimmed: location.trim(),
      comunaTrimmed: comuna.trim(),
      refLen,
      hasApiKey,
      placesPhase,
      waitingForPlaces,
      serviceLat,
      serviceLng,
      manualAddressNotFound,
      isValidComuna
    });

    if (!validation.ok) {
      const { code } = validation;
      if (code === 'INVALID_COMUNA') {
        setComunaError('Selecciona una comuna de la lista para continuar');
        return;
      }
      const messages = {
        NO_LOCATION: 'Por favor ingresa la dirección de la reserva',
        NO_COMUNA: 'Por favor ingresa la comuna',
        WAITING_PLACES: 'Espera a que cargue el buscador de direcciones o pulsa Reintentar.',
        REF_NO_KEY: 'Sin mapa, indica una referencia detallada (mín. 15 caracteres) para que el operador te encuentre.',
        REF_MAP_FAILED:
          'No se pudo cargar el mapa. Escribe una referencia muy detallada (mín. 25 caracteres): accesos, color de portón, empresa cercana, etc.',
        NEED_PLACE_OR_MANUAL:
          'Selecciona una dirección de la lista o marca “No encuentro mi dirección” y completa la referencia.',
        REF_MANUAL_SHORT: 'Describe cómo llegar con al menos 20 caracteres (calle, esquina, referencias).'
      };
      toast.warning(messages[code] || 'Revisa los datos de ubicación');
      return;
    }

    // Guardar ubicación exacta: si eligió de Google Places (hay lat/lng), usar la dirección completa tal cual; si no, calle + comuna
    const fullLocation = (serviceLat != null && serviceLng != null)
      ? location.trim()
      : `${location.trim()}, ${comuna}`;
    localStorage.setItem('serviceLocation', fullLocation);
    localStorage.setItem('serviceComuna', comuna);
    localStorage.setItem('serviceReference', reference);
    const manualFb =
      serviceLat == null ||
      serviceLng == null ||
      manualAddressNotFound ||
      placesPhase === 'failed' ||
      !hasApiKey;
    localStorage.setItem('serviceLocationManualFallback', manualFb ? 'true' : 'false');
    if (serviceLat != null) localStorage.setItem('serviceLat', serviceLat.toString());
    else localStorage.removeItem('serviceLat');
    if (serviceLng != null) localStorage.setItem('serviceLng', serviceLng.toString());
    else localStorage.removeItem('serviceLng');
    
    // Ir a ver proveedores
    navigate('/client/providers');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20,
          gap: 12
        }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        <BookingProgress />

        {/* Título */}
        <h1 style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 8
        }}>
          ¿Dónde necesitas la maquinaria?
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 16
        }}>
          Dirección exacta para que el operador llegue sin problemas.
        </p>

        {/* Estado del buscador (sin jerga de “API key”: es detalle de implementación) */}
        {hasApiKey && (placesPhase === 'loading' || placesPhase === 'script_loaded') && (
          <div
            style={{
              background: 'rgba(236, 104, 25, 0.15)',
              border: '1px solid rgba(236, 104, 25, 0.45)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 20,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
              lineHeight: 1.45
            }}
          >
            <strong style={{ color: '#EC6819' }}>Cargando sugerencias de dirección…</strong>
            <div style={{ marginTop: 6 }}>
              Preparando el buscador para sugerirte calles y lugares en Chile. Espera un momento.
            </div>
          </div>
        )}
        {hasApiKey && placesPhase === 'ready' && (
          <div
            style={{
              background: 'rgba(46, 204, 113, 0.12)',
              border: '1px solid rgba(46, 204, 113, 0.35)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 20,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
              lineHeight: 1.45
            }}
          >
            <strong style={{ color: '#2ecc71' }}>Buscador listo</strong>
            <div style={{ marginTop: 6 }}>
              Escribe en el campo de abajo y elige una sugerencia para fijar el punto en el mapa. Si no aparece tu calle,
              prueba sin número o un lugar cercano; si aún no, marca la opción de abajo y completa la referencia.
            </div>
          </div>
        )}
        {hasApiKey && placesPhase === 'failed' && (
          <div
            style={{
              background: 'rgba(231, 76, 60, 0.12)',
              border: '1px solid rgba(231, 76, 60, 0.4)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 20,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
              lineHeight: 1.45
            }}
          >
            <strong style={{ color: '#e74c3c' }}>{placesFailureUi.title}</strong>
            <div style={{ marginTop: 6 }}>{placesFailureUi.body}</div>
            <button
              type="button"
              onClick={() => setScriptRetryKey((k) => k + 1)}
              className="maqgo-btn-secondary"
              style={{ marginTop: 10, width: '100%', padding: '10px 12px', fontSize: 14 }}
            >
              {placesFailureUi.retryLabel}
            </button>
            {import.meta.env.DEV && (!!placesReason || !!diagnosticReason) && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                {!!placesReason && (
                  <div style={{ fontFamily: 'monospace', marginBottom: 4 }}>Código: {placesReason}</div>
                )}
                {!!diagnosticReason && <div>{diagnosticReason}</div>}
              </div>
            )}
          </div>
        )}
        {!hasApiKey && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 20,
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              lineHeight: 1.45
            }}
          >
            <strong>Modo sin mapa</strong>
            <div style={{ marginTop: 6 }}>
              Escribe la dirección completa, elige la comuna y una referencia clara (mín. 15 caracteres) para que el operador
              pueda ubicarte.
            </div>
          </div>
        )}

        {/* Resumen de selección - Colores World-Class */}
        <div style={{
          background: '#363636',
          borderRadius: 12,
          padding: 14,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 45,
            height: 45,
            borderRadius: 10,
            background: '#444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="28" height="24" viewBox="0 0 40 32" fill="none">
              <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
              <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
              <circle cx="10" cy="28" r="3" fill="#fff"/>
              <circle cx="22" cy="28" r="3" fill="#fff"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
              {MACHINERY_NAMES[machinery] || machinery}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
              {isPerTripMachineryType(machinery) 
                ? (isScheduled 
                    ? (selectedDates?.length > 0 ? perTripDateSummary : `Valor viaje · ${getDateSummary()}`)
                    : 'Valor viaje · Inicio HOY')
                : (isScheduled 
                    ? `Jornada (8h + 1h colación) · ${getDateSummary()}` 
                    : `Servicio prioritario · ${hours}h`)}
            </div>
          </div>
        </div>

        {/* Input dirección: autocompletado cuando hay clave de Maps configurada en la app */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontWeight: 500
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1C6.24 1 4 3.24 4 6C4 10 9 17 9 17S14 10 14 6C14 3.24 11.76 1 9 1Z" stroke="#EC6819" strokeWidth="1.5" fill="none"/>
              <circle cx="9" cy="6" r="2" fill="#EC6819"/>
            </svg>
            Dirección *
          </label>
          <AddressAutocomplete
            value={location}
            onChange={setLocation}
            onPlacesStatusChange={onPlacesStatusChange}
            scriptRetryKey={scriptRetryKey}
            onSelect={({ address, comuna: c, lat, lng }) => {
              setLocation(address);
              if (c) setComuna(c);
              if (lat != null) setServiceLat(lat);
              if (lng != null) setServiceLng(lng);
              setManualAddressNotFound(false);
            }}
            placeholder="Ej: Av. Providencia 1234"
            style={{ fontSize: 16 }}
          />
        </div>

        {hasApiKey && placesPhase === 'ready' && (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
                lineHeight: 1.4
              }}
            >
              <input
                type="checkbox"
                checked={manualAddressNotFound}
                onChange={(e) => {
                  const on = e.target.checked;
                  setManualAddressNotFound(on);
                  if (on) {
                    setServiceLat(null);
                    setServiceLng(null);
                  }
                }}
                style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
                aria-label="No encuentro mi dirección en las sugerencias"
              />
              <span>
                <strong>No encuentro mi dirección</strong> entre las sugerencias (te pediremos una referencia detallada para
                ubicarte).
              </span>
            </label>
            {manualAddressNotFound && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '8px 0 0 28px', lineHeight: 1.45 }}>
                Consejos: prueba buscar solo la calle sin número, un barrio cercano, o un punto de referencia (mall, plaza,
                empresa). Luego completa la referencia abajo con accesos y señas.
              </p>
            )}
          </div>
        )}

        {/* Input Comuna con Autocomplete (solo si no se obtuvo de Google Places) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14,
            display: 'block',
            marginBottom: 8,
            fontWeight: 500
          }}>
            Comuna <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <ComunaAutocomplete
            value={comuna}
            onChange={(v) => { setComuna(v); setComunaError(''); }}
            placeholder="Escribe para buscar..."
            style={{ fontSize: 16 }}
          />
          {comunaError && (
            <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 6 }}>{comunaError}</p>
          )}
        </div>

        {/* Input Referencia */}
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="service-reference-input" style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14,
            display: 'block',
            marginBottom: 8,
            fontWeight: 500
          }}>
            Referencia{' '}
            {(!hasApiKey ||
              placesPhase === 'failed' ||
              (placesPhase === 'ready' && manualAddressNotFound)) && (
              <span style={{ color: '#EC6819' }}>*</span>
            )}
            {(hasApiKey && placesPhase === 'ready' && !manualAddressNotFound) && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>(opcional si elegiste dirección en el mapa)</span>
            )}
          </label>
          <input
            id="service-reference-input"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={
              !hasApiKey || placesPhase === 'failed'
                ? 'Obligatoria: accesos, color de portón, empresa cercana, etc.'
                : manualAddressNotFound
                  ? 'Obligatoria: cómo llegar, esquinas, color de reja, referencias'
                  : 'Ej: Frente al edificio azul, portón verde'
            }
            className="maqgo-input"
            style={{ 
              fontSize: 16
            }}
            data-testid="service-reference-input"
            aria-label={
              !hasApiKey || placesPhase === 'failed' || manualAddressNotFound
                ? 'Referencia de ubicación obligatoria'
                : 'Referencia de ubicación opcional'
            }
          />
        </div>

        {/* Info - Simplificado, colores consistentes */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 10,
          padding: 14,
          marginBottom: 24
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10 
          }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" fill="none"/>
              <path d="M10 6V11" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="10" cy="14" r="1" fill="rgba(255,255,255,0.95)"/>
            </svg>
            <div style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 13,
              lineHeight: 1.5
            }}>
              Verás hasta 5 proveedores ordenados por mejor precio y cercanía.
            </div>
          </div>
        </div>

      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!location.trim() || !comuna.trim() || waitingForPlaces}
          style={{
            opacity: location.trim() && comuna.trim() && !waitingForPlaces ? 1 : 0.5,
            cursor: location.trim() && comuna.trim() && !waitingForPlaces ? 'pointer' : 'not-allowed'
          }}
          data-testid="continue-to-providers-btn"
        >
          Ver proveedores
        </button>
      </div>
    </div>
  );
}

export default ServiceLocationScreen;
