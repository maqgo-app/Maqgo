import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import MaqgoLogo from '../../components/MaqgoLogo';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import BookingProgress from '../../components/BookingProgress';
import { MACHINERY_NAMES, getMachineryKeySpec, getMachineryCapacityOptions } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

/**
 * Pantalla: Selección de Urgencia
 * Para maquinaria por viaje (pluma, aljibe, tolva). Horas 4-8 para inmediata (IMMEDIATE_MULTIPLIERS).
 */

const MIN_HOURS_IMMEDIATE = 4;
const MAX_HOURS_IMMEDIATE = 8;

/** Opciones m³ para tolva (misma fuente que machineryNames; evita ReferenceError si algo en caché usa CAPACITY_M3_OPTIONS) */
const CAPACITY_M3_OPTIONS = getMachineryCapacityOptions('camion_tolva')?.options ?? [12, 14, 16, 18, 20];

/** Opciones de capacidad tolva vienen de getMachineryCapacityOptions (estándar maquinaria pesada) */

const URGENCY_OPTIONS = [
  { 
    id: 'urgent', 
    label: 'Urgente', 
    sublabel: 'Máxima urgencia',
    hours: 4,
    bonus: 15,
    color: '#E53935',
    iconColor: '#E53935'
  },
  { 
    id: 'express', 
    label: 'Express', 
    sublabel: '2 a 4 horas',
    hours: 5,
    bonus: 10,
    color: '#EC6819',
    iconColor: '#EC6819'
  },
  { 
    id: 'today', 
    label: 'Hoy', 
    sublabel: 'Más de 4 horas',
    hours: 6,
    bonus: 5,
    color: '#90BDD3',
    iconColor: '#90BDD3'
  },
  { 
    id: 'scheduled', 
    label: 'Programado', 
    sublabel: 'Otro día',
    hours: 8,
    bonus: 0,
    color: '#666',
    iconColor: '#666'
  }
];

// Iconos SVG para cada opción
const UrgencyIcon = ({ type, color }) => {
  const icons = {
    urgent: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2"/>
        <path d="M12 7V12L15 14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
        <path d="M19 5L21 3M5 5L3 3" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    express: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    today: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2"/>
        <path d="M12 7V12L15 15" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    scheduled: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke={color} strokeWidth="2"/>
        <path d="M3 10H21M8 2V6M16 2V6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  };
  return icons[type] || icons.today;
};

function UrgencySelectionScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [selected, setSelected] = useState(null);
  const [machinery, setMachinery] = useState('');
  /** m³: selección múltiple (ej. 10, 12 y 14) para ver proveedores con cualquiera de esas capacidades */
  const [selectedCapacityM3List, setSelectedCapacityM3List] = useState(() => {
    const saved = localStorage.getItem('clientRequiredM3List');
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        return Array.isArray(arr) ? arr : [];
      } catch (_) { }
    }
    const single = localStorage.getItem('clientRequiredM3');
    return single ? [parseInt(single, 10)] : [];
  });

  const isPerTrip = machinery && MACHINERY_PER_TRIP.includes(machinery);
  const isTolva = machinery === 'camion_tolva';
  const isAljibe = machinery === 'camion_aljibe';
  const isPluma = machinery === 'camion_pluma';
  const capacityConfig = getMachineryCapacityOptions(machinery);

  /** Aljibe: selección múltiple de litros (como m³ en tolva) */
  const [selectedLitersList, setSelectedLitersList] = useState(() => {
    try {
      const s = localStorage.getItem('clientRequiredLitersList');
      if (s) { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : []; }
    } catch (_) {}
    return [];
  });
  /** Pluma: selección múltiple de ton·m */
  const [selectedTonMList, setSelectedTonMList] = useState(() => {
    try {
      const s = localStorage.getItem('clientRequiredTonMList');
      if (s) { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : []; }
    } catch (_) {}
    return [];
  });

  useEffect(() => {
    const savedMachinery = localStorage.getItem('selectedMachinery') || '';
    setMachinery(savedMachinery);
    const savedList = localStorage.getItem('clientRequiredM3List');
    if (savedList) {
      try {
        const arr = JSON.parse(savedList);
        if (Array.isArray(arr) && arr.length) setSelectedCapacityM3List(arr);
      } catch (_) { }
    } else {
      const savedM3 = localStorage.getItem('clientRequiredM3');
      if (savedM3) setSelectedCapacityM3List([parseInt(savedM3, 10)].filter((n) => !Number.isNaN(n)));
    }
    try {
      const liters = localStorage.getItem('clientRequiredLitersList');
      if (liters) { const arr = JSON.parse(liters); if (Array.isArray(arr) && arr.length) setSelectedLitersList(arr); }
    } catch (_) {}
    try {
      const tonM = localStorage.getItem('clientRequiredTonMList');
      if (tonM) { const arr = JSON.parse(tonM); if (Array.isArray(arr) && arr.length) setSelectedTonMList(arr); }
    } catch (_) {}
    saveBookingProgress('urgency', { machinery: savedMachinery });
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    if (isTolva && selectedCapacityM3List.length === 0) return;
    if (isAljibe && selectedLitersList.length === 0) return;
    if (isPluma && selectedTonMList.length === 0) return;

    if (isTolva) {
      localStorage.setItem('clientRequiredM3List', JSON.stringify(selectedCapacityM3List));
      localStorage.setItem('clientRequiredM3', String(selectedCapacityM3List[0]));
    }
    if (isAljibe) {
      localStorage.setItem('clientRequiredLitersList', JSON.stringify(selectedLitersList));
      localStorage.setItem('clientRequiredLiters', String(selectedLitersList[0]));
    }
    if (isPluma) {
      localStorage.setItem('clientRequiredTonMList', JSON.stringify(selectedTonMList));
      localStorage.setItem('clientRequiredTonM', String(selectedTonMList[0]));
    }

    const option = URGENCY_OPTIONS.find(o => o.id === selected);
    localStorage.setItem('urgencyType', selected);
    localStorage.setItem('urgencyBonus', option.bonus.toString());
    // Regla de negocio: horas 4-8 para reserva inmediata (backend IMMEDIATE_MULTIPLIERS)
    if (option.hours) {
      const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, option.hours));
      localStorage.setItem('selectedHours', hours.toString());
    }
    
    if (selected === 'scheduled') {
      // Programado: ir al flujo de reserva programada
      localStorage.setItem('reservationType', 'scheduled');
      localStorage.setItem('clientBookingStep', 'calendar');
      navigate('/client/calendar');
    } else {
      // Inmediato (Urgente, Express, Hoy): asegurar tipo y continuar
      localStorage.setItem('reservationType', 'immediate');
      localStorage.setItem('clientBookingStep', 'location');
      navigate('/client/service-location');
    }
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: '30px 24px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 30,
          gap: 12
        }}>
          <button 
            onClick={() => navigate(backRoute || -1)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#fff',
              fontSize: 24,
              cursor: 'pointer',
              padding: 0
            }}
            aria-label="Volver"
          >
            ←
          </button>
          <MaqgoLogo size="small" />
        </div>

        <BookingProgress />

        {/* Maquinaria seleccionada (por viaje: pluma, aljibe, tolva) */}
        {isPerTrip && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#363636',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="10" width="16" height="8" rx="1" stroke="#EC6819" strokeWidth="2"/>
                <circle cx="6" cy="20" r="2" stroke="#EC6819" strokeWidth="2"/>
                <circle cx="14" cy="20" r="2" stroke="#EC6819" strokeWidth="2"/>
                <path d="M18 14H22V18H18" stroke="#EC6819" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
                {MACHINERY_NAMES[machinery] || machinery}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                Pago por viaje · Sin costo de traslado
              </div>
              {getMachineryKeySpec(machinery) && (
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                  {getMachineryKeySpec(machinery)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Solo Camión Tolva: selección múltiple de capacidad de camión (m³) */}
        {isTolva && capacityConfig?.options && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Capacidad de camión tolva (m³)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar una o varias capacidades de camión. Verás camiones tolva que cumplan con cualquiera de ellas.
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10
            }}>
              {capacityConfig.options.map((m3) => {
                const isCapSelected = selectedCapacityM3List.includes(m3);
                return (
                  <button
                    key={m3}
                    type="button"
                    onClick={() => {
                      const next = isCapSelected
                        ? selectedCapacityM3List.filter((v) => v !== m3)
                        : [...selectedCapacityM3List, m3].sort((a, b) => a - b);
                      setSelectedCapacityM3List(next);
                      localStorage.setItem('clientRequiredM3List', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredM3', String(next[0]));
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isCapSelected ? '2px solid #EC6819' : '2px solid #444',
                      background: isCapSelected ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isCapSelected ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {m3} m³
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Camión Aljibe: selección de capacidad en litros */}
        {isAljibe && capacityConfig && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              ¿Qué capacidad necesitas? (litros)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar varias. Verás proveedores con cualquiera de esas capacidades.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {capacityConfig.options.map((val) => {
                const isSel = selectedLitersList.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = isSel ? selectedLitersList.filter((v) => v !== val) : [...selectedLitersList, val].sort((a, b) => a - b);
                      setSelectedLitersList(next);
                      localStorage.setItem('clientRequiredLitersList', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredLiters', String(next[0]));
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isSel ? '2px solid #EC6819' : '2px solid #444',
                      background: isSel ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isSel ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 ? 1 : 0)}.000` : val} L
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Camión Pluma: selección de capacidad (ton·m) */}
        {isPluma && capacityConfig && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              ¿Qué capacidad de pluma necesitas? (ton·m)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar varias. Verás proveedores con cualquiera de esas capacidades.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {capacityConfig.options.map((val) => {
                const isSel = selectedTonMList.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = isSel ? selectedTonMList.filter((v) => v !== val) : [...selectedTonMList, val].sort((a, b) => a - b);
                      setSelectedTonMList(next);
                      localStorage.setItem('clientRequiredTonMList', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredTonM', String(next[0]));
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isSel ? '2px solid #EC6819' : '2px solid #444',
                      background: isSel ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isSel ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {val} ton·m
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Título */}
        <h1 className="maqgo-h1" style={{ marginBottom: 8, textAlign: 'center' }}>
          ¿Cuándo lo necesitas?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Urgencia y horario para mostrar opciones disponibles
        </p>

        {/* Opciones de urgencia */}
        <div style={{ flex: 1 }}>
          {URGENCY_OPTIONS.map(option => (
            <button
              key={option.id}
              onClick={() => setSelected(option.id)}
              style={{
                width: '100%',
                background: selected === option.id ? 'rgba(236, 104, 25, 0.1)' : '#2A2A2A',
                border: selected === option.id ? '2px solid #EC6819' : '2px solid transparent',
                borderRadius: 14,
                padding: '16px',
                marginBottom: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: selected === option.id ? `${option.iconColor}20` : '#363636',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UrgencyIcon type={option.id} color={option.iconColor} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ 
                    color: '#fff', 
                    fontSize: 16, 
                    fontWeight: 600,
                    marginBottom: 2
                  }}>
                    {option.label}
                  </div>
                  <div style={{ 
                    color: 'rgba(255,255,255,0.95)', 
                    fontSize: 13 
                  }}>
                    {option.sublabel}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Botón continuar */}
        <button
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!selected || (isTolva && selectedCapacityM3List.length === 0) || (isAljibe && selectedLitersList.length === 0) || (isPluma && selectedTonMList.length === 0)}
          style={{
            opacity: selected && (!isTolva || selectedCapacityM3List.length > 0) ? 1 : 0.5,
            cursor: selected && (!isTolva || selectedCapacityM3List.length > 0) ? 'pointer' : 'not-allowed'
          }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default UrgencySelectionScreen;
