import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { getArray } from '../../utils/safeStorage';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import BookingProgress from '../../components/BookingProgress';
import {
  MACHINERY_NAMES,
  getMachineryKeySpec,
  getMachineryCapacityOptions,
  isPerTripMachineryType,
  formatMachineryCapacityChipLabel,
  persistClientCapacitySelection
} from '../../utils/machineryNames';
import { isTruckService, getTruckTimeRangeFromUrgency } from '../../utils/clientBookingTruck';

function readInitialMachinery() {
  try {
    return localStorage.getItem('selectedMachinery') || '';
  } catch {
    return '';
  }
}

function isCapacityOptionSelected(list, val) {
  return list.some((x) => Number(x) === Number(val));
}

/**
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 *
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
  const [machinery, setMachinery] = useState(readInitialMachinery);
  /** m³: selección múltiple (ej. 10, 12 y 14) para ver proveedores con cualquiera de esas capacidades */
  const [selectedCapacityM3List, setSelectedCapacityM3List] = useState(() => {
    const arr = getArray('clientRequiredM3List', []);
    if (arr.length) return arr;
    const single = localStorage.getItem('clientRequiredM3');
    return single ? [parseInt(single, 10)] : [];
  });

  const isPerTrip = isPerTripMachineryType(machinery);
  const isTolva = machinery === 'camion_tolva';
  const isAljibe = machinery === 'camion_aljibe';
  const isPluma = machinery === 'camion_pluma';
  const capacityConfig = getMachineryCapacityOptions(machinery);

  /** Aljibe: selección múltiple de litros (como m³ en tolva) */
  const [selectedLitersList, setSelectedLitersList] = useState(() => getArray('clientRequiredLitersList', []));
  /** Pluma: selección múltiple de ton·m */
  const [selectedTonMList, setSelectedTonMList] = useState(() => getArray('clientRequiredTonMList', []));

  useEffect(() => {
    const savedMachinery = localStorage.getItem('selectedMachinery') || '';
    setMachinery(savedMachinery);
    const arrM3 = getArray('clientRequiredM3List', []);
    if (arrM3.length) {
      setSelectedCapacityM3List(arrM3);
    } else {
      const savedM3 = localStorage.getItem('clientRequiredM3');
      if (savedM3) {
        setSelectedCapacityM3List([parseInt(savedM3, 10)].filter((n) => !Number.isNaN(n)));
      }
    }
    const arrLiters = getArray('clientRequiredLitersList', []);
    if (arrLiters.length) setSelectedLitersList(arrLiters);
    const arrTonM = getArray('clientRequiredTonMList', []);
    if (arrTonM.length) setSelectedTonMList(arrTonM);
    saveBookingProgress('urgency', { machinery: savedMachinery });
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    if (isTolva && selectedCapacityM3List.length === 0) return;
    if (isAljibe && selectedLitersList.length === 0) return;
    if (isPluma && selectedTonMList.length === 0) return;

    if (isTolva) {
      persistClientCapacitySelection('camion_tolva', selectedCapacityM3List);
      localStorage.setItem('clientRequiredM3', String(selectedCapacityM3List[0]));
    }
    if (isAljibe) {
      persistClientCapacitySelection('camion_aljibe', selectedLitersList);
      localStorage.setItem('clientRequiredLiters', String(selectedLitersList[0]));
    }
    if (isPluma) {
      persistClientCapacitySelection('camion_pluma', selectedTonMList);
      localStorage.setItem('clientRequiredTonM', String(selectedTonMList[0]));
    }

    const option = URGENCY_OPTIONS.find(o => o.id === selected);
    localStorage.setItem('urgencyType', selected);
    localStorage.setItem('urgencyBonus', option.bonus.toString());

    const truck = isTruckService(machinery);
    if (truck) {
      localStorage.setItem('clientBookingServiceType', 'truck');
      localStorage.setItem('serviceModel', 'truck');
      const range = getTruckTimeRangeFromUrgency(selected);
      if (range) localStorage.setItem('truckUrgencyTimeRange', range);
      else localStorage.removeItem('truckUrgencyTimeRange');
    } else {
      localStorage.removeItem('clientBookingServiceType');
      localStorage.removeItem('serviceModel');
      localStorage.removeItem('truckUrgencyTimeRange');
    }

    // Camiones: urgencia = ventana (express 2–4h); no persistir selectedHours como proxy de duración.
    // Maquinaria por hora: horas 4–8 para IMMEDIATE_MULTIPLIERS.
    if (!truck && option.hours) {
      const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, option.hours));
      localStorage.setItem('selectedHours', hours.toString());
    } else if (truck) {
      localStorage.removeItem('selectedHours');
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

  /** Capacidad concreta (P1 o lista en estado); si no hay, texto genérico de MACHINERY_KEY_SPEC */
  let perTripCapacityLine = null;
  try {
    perTripCapacityLine = localStorage.getItem('selectedMachinerySpec')?.trim() || null;
  } catch {
    perTripCapacityLine = null;
  }
  if (!perTripCapacityLine && isTolva && selectedCapacityM3List.length > 0) {
    perTripCapacityLine = selectedCapacityM3List
      .map((n) => formatMachineryCapacityChipLabel('camion_tolva', n))
      .join(' · ');
  } else if (!perTripCapacityLine && isAljibe && selectedLitersList.length > 0) {
    perTripCapacityLine = selectedLitersList
      .map((n) => formatMachineryCapacityChipLabel('camion_aljibe', n))
      .join(' · ');
  } else if (!perTripCapacityLine && isPluma && selectedTonMList.length > 0) {
    perTripCapacityLine = selectedTonMList
      .map((n) => formatMachineryCapacityChipLabel('camion_pluma', n))
      .join(' · ');
  }
  const perTripSubline = perTripCapacityLine || getMachineryKeySpec(machinery);

  return (
    <div className="maqgo-app maqgo-client-funnel maqgo-funnel-split-layout">
      <div
        className="maqgo-screen maqgo-screen--scroll maqgo-funnel-split-scroll"
      >
        {/* Header: mismo patrón que MachinerySelection (flecha SVG, no carácter ←) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 20,
            gap: 12,
            flexShrink: 0
          }}
        >
          <button
            type="button"
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }} />
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
              {perTripSubline && (
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                  {perTripSubline}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tolva: capacidad solo si no se eligió en P1 (opcional allí) */}
        {isTolva && capacityConfig?.options && selectedCapacityM3List.length === 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Capacidad de camión tolva (m³)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar una o varias capacidades de camión. Verás camiones tolva que cumplan con cualquiera de ellas.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {capacityConfig.options.map((m3) => {
                const isCapSelected = isCapacityOptionSelected(selectedCapacityM3List, m3);
                return (
                  <button
                    key={m3}
                    type="button"
                    onClick={() => {
                      const next = isCapSelected
                        ? selectedCapacityM3List.filter((v) => Number(v) !== Number(m3))
                        : [...selectedCapacityM3List, m3].sort((a, b) => a - b);
                      setSelectedCapacityM3List(next);
                      localStorage.setItem('clientRequiredM3List', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredM3', String(next[0]));
                      else localStorage.removeItem('clientRequiredM3');
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isCapSelected ? '2px solid #EC6819' : '2px solid #444',
                      background: isCapSelected ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isCapSelected ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
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

        {/* Aljibe: capacidad solo si no se eligió en P1 */}
        {isAljibe && capacityConfig && selectedLitersList.length === 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              ¿Qué capacidad necesitas? (litros)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar varias. Verás proveedores con cualquiera de esas capacidades.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {capacityConfig.options.map((val) => {
                const isSel = isCapacityOptionSelected(selectedLitersList, val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = isSel
                        ? selectedLitersList.filter((v) => Number(v) !== Number(val))
                        : [...selectedLitersList, val].sort((a, b) => a - b);
                      setSelectedLitersList(next);
                      localStorage.setItem('clientRequiredLitersList', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredLiters', String(next[0]));
                      else localStorage.removeItem('clientRequiredLiters');
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isSel ? '2px solid #EC6819' : '2px solid #444',
                      background: isSel ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isSel ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      cursor: 'pointer'
                    }}
                  >
                    {val >= 1000 ? `${(val / 1000).toFixed(0)}.000` : val} L
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pluma: capacidad solo si no se eligió en P1 */}
        {isPluma && capacityConfig && selectedTonMList.length === 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              ¿Qué capacidad de pluma necesitas? (ton·m)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 12 }}>
              Puedes marcar varias. Verás proveedores con cualquiera de esas capacidades.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {capacityConfig.options.map((val) => {
                const isSel = isCapacityOptionSelected(selectedTonMList, val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = isSel
                        ? selectedTonMList.filter((v) => Number(v) !== Number(val))
                        : [...selectedTonMList, val].sort((a, b) => a - b);
                      setSelectedTonMList(next);
                      localStorage.setItem('clientRequiredTonMList', JSON.stringify(next));
                      if (next.length) localStorage.setItem('clientRequiredTonM', String(next[0]));
                      else localStorage.removeItem('clientRequiredTonM');
                    }}
                    style={{
                      padding: '14px 8px',
                      borderRadius: 12,
                      border: isSel ? '2px solid #EC6819' : '2px solid #444',
                      background: isSel ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                      color: isSel ? '#EC6819' : 'rgba(255,255,255,0.95)',
                      fontSize: 14,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
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
        <div>
          {URGENCY_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              aria-label={option.label}
              aria-pressed={selected === option.id}
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
      </div>

      <div className="maqgo-funnel-split-footer" role="region" aria-label="Continuar urgencia">
        <button
          className="maqgo-btn-primary"
          type="button"
          onClick={handleContinue}
          disabled={!selected || (isTolva && selectedCapacityM3List.length === 0) || (isAljibe && selectedLitersList.length === 0) || (isPluma && selectedTonMList.length === 0)}
          style={{
            width: '100%',
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
