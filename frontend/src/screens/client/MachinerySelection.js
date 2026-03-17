import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { MACHINERY_DESCRIPTIONS } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';

/**
 * C11 - Seleccion de Maquinaria
 * Con estimador de precio e iconografía estilo Uber
 */

// Iconos SVG únicos para cada maquinaria (estilo Uber - minimalista)
const MachineryIcons = {
  // Retroexcavadora - brazo articulado con pala trasera
  retroexcavadora: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="6" y="24" width="20" height="10" rx="2" fill="#EC6819"/>
      <rect x="22" y="20" width="8" height="6" rx="1" fill="#EC6819"/>
      <path d="M30 18L38 10" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M38 10L42 14L38 18" stroke="#EC6819" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 26L2 18" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M2 18L6 14H10" stroke="#EC6819" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10" cy="34" r="4" fill="#EC6819"/>
      <circle cx="22" cy="34" r="4" fill="#EC6819"/>
    </svg>
  ),
  
  // Camión Tolva - camión con volcador
  camion_tolva: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M4 30L10 16H32L38 30" fill="#EC6819"/>
      <rect x="32" y="22" width="8" height="10" rx="1" fill="#EC6819"/>
      <rect x="36" y="24" width="4" height="4" rx="1" fill="#1A1A1A"/>
      <circle cx="12" cy="34" r="4" fill="#EC6819"/>
      <circle cx="26" cy="34" r="4" fill="#EC6819"/>
      <circle cx="36" cy="34" r="4" fill="#EC6819"/>
    </svg>
  ),
  
  // Excavadora Hidráulica - excavadora grande con brazo largo
  excavadora: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="4" y="26" width="18" height="8" rx="2" fill="#EC6819"/>
      <rect x="6" y="20" width="10" height="7" rx="1" fill="#EC6819"/>
      <path d="M16 22L26 12" stroke="#EC6819" strokeWidth="4" strokeLinecap="round"/>
      <path d="M26 12L36 8" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M36 8L42 12L40 18L34 14" fill="#EC6819"/>
      <rect x="2" y="34" width="22" height="4" rx="1" fill="#EC6819"/>
    </svg>
  ),
  
  // Bulldozer - tractor con pala frontal
  bulldozer: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="12" y="18" width="20" height="12" rx="2" fill="#EC6819"/>
      <rect x="16" y="12" width="10" height="7" rx="1" fill="#EC6819"/>
      <rect x="2" y="16" width="12" height="16" rx="1" fill="#EC6819"/>
      <path d="M2 18H4V30H2" fill="#1A1A1A"/>
      <rect x="10" y="30" width="24" height="6" rx="2" fill="#EC6819"/>
      <line x1="12" y1="32" x2="12" y2="36" stroke="#1A1A1A" strokeWidth="2"/>
      <line x1="18" y1="32" x2="18" y2="36" stroke="#1A1A1A" strokeWidth="2"/>
      <line x1="24" y1="32" x2="24" y2="36" stroke="#1A1A1A" strokeWidth="2"/>
      <line x1="30" y1="32" x2="30" y2="36" stroke="#1A1A1A" strokeWidth="2"/>
    </svg>
  ),
  
  // Motoniveladora - máquina larga con cuchilla
  motoniveladora: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="24" y="18" width="14" height="10" rx="2" fill="#EC6819"/>
      <rect x="28" y="12" width="8" height="7" rx="1" fill="#EC6819"/>
      <rect x="4" y="24" width="22" height="6" rx="1" fill="#EC6819"/>
      <path d="M8 30L20 30" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <rect x="10" y="28" width="12" height="3" fill="#EC6819" transform="rotate(-15 10 28)"/>
      <circle cx="8" cy="34" r="4" fill="#EC6819"/>
      <circle cx="20" cy="34" r="3" fill="#EC6819"/>
      <circle cx="32" cy="32" r="5" fill="#EC6819"/>
    </svg>
  ),
  
  // Grúa Móvil - camión con pluma telescópica
  grua: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="4" y="26" width="16" height="8" rx="2" fill="#EC6819"/>
      <rect x="16" y="22" width="10" height="12" rx="1" fill="#EC6819"/>
      <path d="M20 22L12 6" stroke="#EC6819" strokeWidth="4" strokeLinecap="round"/>
      <path d="M12 6L8 4" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M8 4V10" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="22" cy="26" r="3" fill="#1A1A1A"/>
      <circle cx="8" cy="34" r="4" fill="#EC6819"/>
      <circle cx="22" cy="34" r="4" fill="#EC6819"/>
    </svg>
  ),
  
  // Camión Pluma (Hiab) - camión con grúa pequeña
  camion_pluma: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="4" y="24" width="24" height="8" rx="2" fill="#EC6819"/>
      <rect x="26" y="20" width="10" height="12" rx="1" fill="#EC6819"/>
      <rect x="30" y="22" width="4" height="4" rx="1" fill="#1A1A1A"/>
      <path d="M18 24L18 14" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M18 14L26 10" stroke="#EC6819" strokeWidth="3" strokeLinecap="round"/>
      <path d="M26 10V16" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="10" cy="34" r="4" fill="#EC6819"/>
      <circle cx="32" cy="34" r="4" fill="#EC6819"/>
    </svg>
  ),
  
  // Compactadora / Rodillo - máquina con rodillos
  compactadora: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="10" y="16" width="18" height="10" rx="2" fill="#EC6819"/>
      <rect x="14" y="10" width="8" height="7" rx="1" fill="#EC6819"/>
      <ellipse cx="10" cy="32" rx="8" ry="6" fill="#EC6819"/>
      <ellipse cx="32" cy="32" rx="6" ry="6" fill="#EC6819"/>
      <line x1="4" y1="32" x2="16" y2="32" stroke="#1A1A1A" strokeWidth="1.5"/>
      <line x1="10" y1="26" x2="10" y2="38" stroke="#1A1A1A" strokeWidth="1.5"/>
      <rect x="26" y="24" width="4" height="8" fill="#EC6819"/>
    </svg>
  ),
  
  // Camión Aljibe - camión cisterna
  camion_aljibe: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <ellipse cx="18" cy="24" rx="14" ry="8" fill="#EC6819"/>
      <rect x="30" y="20" width="10" height="12" rx="1" fill="#EC6819"/>
      <rect x="34" y="22" width="4" height="4" rx="1" fill="#1A1A1A"/>
      <circle cx="10" cy="34" r="4" fill="#EC6819"/>
      <circle cx="26" cy="34" r="4" fill="#EC6819"/>
      <circle cx="36" cy="34" r="4" fill="#EC6819"/>
      <path d="M18 16V12M14 14H22" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  
  // Minicargador - máquina compacta con pala
  minicargador: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="12" y="18" width="16" height="12" rx="2" fill="#EC6819"/>
      <rect x="16" y="12" width="8" height="7" rx="1" fill="#EC6819"/>
      <path d="M12 22L4 20V28L12 26" fill="#EC6819"/>
      <path d="M4 20L2 18H6" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="14" cy="34" r="5" fill="#EC6819"/>
      <circle cx="26" cy="34" r="5" fill="#EC6819"/>
      <line x1="9" y1="34" x2="19" y2="34" stroke="#1A1A1A" strokeWidth="2"/>
      <line x1="21" y1="34" x2="31" y2="34" stroke="#1A1A1A" strokeWidth="2"/>
    </svg>
  ),

};

// 10 maquinarias del MVP (alineadas con backend pricing/constants.py)
const MACHINERY = [
  { id: 'retroexcavadora', name: 'Retroexcavadora', priceType: 'hour' },
  { id: 'camion_tolva', name: 'Camión Tolva', priceType: 'trip' },
  { id: 'excavadora', name: 'Excavadora Hidráulica', priceType: 'hour' },
  { id: 'bulldozer', name: 'Bulldozer', priceType: 'hour' },
  { id: 'motoniveladora', name: 'Motoniveladora', priceType: 'hour' },
  { id: 'grua', name: 'Grúa Móvil', priceType: 'hour' },
  { id: 'camion_pluma', name: 'Camión Pluma (Hiab)', priceType: 'trip' },
  { id: 'compactadora', name: 'Compactadora', priceType: 'hour' },
  { id: 'camion_aljibe', name: 'Camión Aljibe', priceType: 'trip' },
  { id: 'minicargador', name: 'Minicargador', priceType: 'hour' },
];

function MachinerySelection() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const getSingleMachinery = () => {
    const raw = localStorage.getItem('selectedMachinery');
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    } catch (_) {}
    return typeof raw === 'string' ? raw : '';
  };
  const [selectedMachinery, setSelectedMachineryState] = useState(getSingleMachinery);
  const reservationType = localStorage.getItem('reservationType') || 'immediate';

  useEffect(() => {
    localStorage.removeItem('selectedMachineryList');
    const one = getSingleMachinery();
    setSelectedMachineryState(one);
    if (one) localStorage.setItem('selectedMachinery', one);
  }, []);

  const selectMachinery = (id) => {
    setSelectedMachineryState(id);
    localStorage.setItem('selectedMachinery', id);
    localStorage.removeItem('selectedMachineryList');
  };

  const handleContinue = () => {
    if (!selectedMachinery) return;
    localStorage.setItem('selectedMachinery', selectedMachinery);
    localStorage.removeItem('selectedMachineryList');
    const primary = selectedMachinery;

    const isPerTrip = MACHINERY_PER_TRIP.includes(primary);

    if (reservationType === 'scheduled') {
      localStorage.setItem('clientBookingStep', 'location');
      navigate('/client/service-location');
    } else {
      if (isPerTrip) {
        localStorage.setItem('priceType', 'trip');
        localStorage.setItem('clientBookingStep', 'urgency');
        navigate('/client/urgency');
      } else {
        localStorage.setItem('priceType', 'hour');
        localStorage.setItem('clientBookingStep', 'hours');
        navigate('/client/hours-selection');
      }
    }
  };

  return (
    <div className="maqgo-app" style={{ overflowY: 'auto' }}>
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 0', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12, flexShrink: 0 }}>
          <button onClick={() => navigate(backRoute || '/client/home')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label="Volver">
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

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8, flexShrink: 0 }}>
          Selecciona el tipo de maquinaria
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
          Elige la maquinaria para esta reserva
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
          En el siguiente paso eliges horas, ubicación y más.
        </p>

        {/* Lista scrollable + estimador */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 12 }}>
          <div className="maqgo-machinery-list">
            {MACHINERY.map(({ id, name }) => {
              const IconComponent = MachineryIcons[id];
              const current = typeof selectedMachinery === 'string' ? selectedMachinery : '';
              const isSelected = current === id;
              const description = MACHINERY_DESCRIPTIONS[id] || '';
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  className={`maqgo-machinery-item ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectMachinery(id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMachinery(id); } }}
                  aria-pressed={isSelected}
                  aria-label={`${name}${isSelected ? ', seleccionado' : ''}`}
                >
                  <div className="maqgo-machinery-icon">
                    {IconComponent && <IconComponent />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="maqgo-machinery-name">{name}</span>
                    {description && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.3 }}>
                        {description}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="11" cy="11" r="10" fill="#EC6819"/>
                      <path d="M6 11L9.5 14.5L16 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Botón fijo abajo - siempre visible (90px para barra inferior) */}
        <div style={{ flexShrink: 0, padding: '16px 0 56px', background: '#18181C' }}>
          <button
            className="maqgo-btn-primary"
            onClick={handleContinue}
            disabled={!selectedMachinery}
            style={{ opacity: selectedMachinery ? 1 : 0.5, width: '100%' }}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

export default MachinerySelection;
