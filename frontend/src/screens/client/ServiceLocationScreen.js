import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { ComunaAutocomplete } from '../../components/ComunaAutocomplete';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import BookingProgress from '../../components/BookingProgress';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { getArray } from '../../utils/safeStorage';
import { COMUNAS_NOMBRES } from '../../data/comunas';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getPerTripDateLabel } from '../../utils/bookingDates';

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
  const HAS_GOOGLE_PLACES = !!(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.REACT_APP_GOOGLE_MAPS_API_KEY);
  const [location, setLocation] = useState('');
  const [comuna, setComuna] = useState('');
  const [serviceLat, setServiceLat] = useState(null);
  const [serviceLng, setServiceLng] = useState(null);
  const [comunaError, setComunaError] = useState('');
  const [reference, setReference] = useState('');
  const [machinery, setMachinery] = useState('');
  const [hours, setHours] = useState(4);
  const [reservationType, setReservationType] = useState('immediate');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);

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
    if (!location.trim()) {
      toast.warning('Por favor ingresa la dirección de la reserva');
      return;
    }
    if (!comuna.trim()) {
      toast.warning('Por favor ingresa la comuna');
      return;
    }
    // Validar que la comuna esté en la lista oficial
    const normalizedComuna = comuna.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isValidComuna = COMUNAS_NOMBRES.some(
      nombre => nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedComuna
    );
    if (!isValidComuna) {
      setComunaError('Selecciona una comuna de la lista para continuar');
      return;
    }

    // Si hay Google Places activo, exigir que el cliente seleccione una dirección exacta (con coordenadas)
    if (HAS_GOOGLE_PLACES && (serviceLat == null || serviceLng == null)) {
      toast.warning('Selecciona una dirección de la lista para continuar');
      return;
    }

    // Guardar ubicación exacta: si eligió de Google Places (hay lat/lng), usar la dirección completa tal cual; si no, calle + comuna
    const fullLocation = (serviceLat != null && serviceLng != null)
      ? location.trim()
      : `${location.trim()}, ${comuna}`;
    localStorage.setItem('serviceLocation', fullLocation);
    localStorage.setItem('serviceComuna', comuna);
    localStorage.setItem('serviceReference', reference);
    if (serviceLat != null) localStorage.setItem('serviceLat', serviceLat.toString());
    if (serviceLng != null) localStorage.setItem('serviceLng', serviceLng.toString());
    
    // Ir a ver proveedores
    navigate('/client/providers');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: '30px 24px', paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 16
        }}>
          <button 
            onClick={() => navigate(backRoute || -1)}
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
          marginBottom: 24
        }}>
          Dirección exacta para que el operador llegue sin problemas.
        </p>

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
              {MACHINERY_PER_TRIP.includes(machinery) 
                ? (isScheduled 
                    ? (selectedDates?.length > 0 ? perTripDateSummary : `Valor viaje · ${getDateSummary()}`)
                    : 'Valor viaje · Inicio HOY')
                : (isScheduled 
                    ? `Jornada (8h + 1h colación) · ${getDateSummary()}` 
                    : `Servicio prioritario · ${hours}h`)}
            </div>
          </div>
        </div>

        {/* Input Dirección con autocompletado (Google Places si hay API key) */}
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
            comunaValue={comuna}
            onChange={setLocation}
            onComunaChange={(v) => { setComuna(v); setComunaError(''); }}
            onSelect={({ address, comuna: c, lat, lng }) => {
              setLocation(address);
              if (c) setComuna(c);
              if (lat != null) setServiceLat(lat);
              if (lng != null) setServiceLng(lng);
            }}
            placeholder="Ej: Av. Providencia 1234"
            style={{ fontSize: 16 }}
          />
        </div>

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
          <label style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14,
            display: 'block',
            marginBottom: 8,
            fontWeight: 500
          }}>
            Referencia (opcional)
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ej: Frente al edificio azul, portón verde"
            className="maqgo-input"
            style={{ 
              fontSize: 16
            }}
            data-testid="service-reference-input"
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
          disabled={!location.trim() || !comuna.trim()}
          style={{
            opacity: (location.trim() && comuna.trim()) ? 1 : 0.5,
            cursor: (location.trim() && comuna.trim()) ? 'pointer' : 'not-allowed'
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
