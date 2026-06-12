import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import {
  MACHINERY_DESCRIPTIONS,
  isPerTripMachineryType,
  getMachineryCapacityOptions,
  formatMachineryCapacityChipLabel,
  clearAllClientCapacityListsAndSpec,
  persistClientCapacitySelection,
} from '../../utils/machineryNames';
import { getArray } from '../../utils/safeStorage';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { useToast } from '../../components/Toast';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';

/**
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 *
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
  const toast = useToast();
  const getSingleMachinery = () => {
    const raw = localStorage.getItem('selectedMachinery');
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    } catch {
      // Valor previo inválido en localStorage.
    }
    return typeof raw === 'string' ? raw : '';
  };
  const [selectedMachinery, setSelectedMachineryState] = useState(getSingleMachinery);
  /** Valores numéricos de capacidad elegidos (0..N); vacío = sin filtro, ranking en proveedores. */
  const [selectedSpecNums, setSelectedSpecNums] = useState([]);
  const reservationType = localStorage.getItem('reservationType') || 'immediate';

  useEffect(() => {
    localStorage.removeItem('selectedMachineryList');
    const one = getSingleMachinery();
    if (one) localStorage.setItem('selectedMachinery', one);
    const machinery = one || '';
    const cap = getMachineryCapacityOptions(machinery);

    if (!cap?.clientStorageKey || !cap.options) {
      setSelectedSpecNums([]);
      return;
    }

    const fromList = getArray(cap.clientStorageKey, []);
    const optionNums = cap.options.map((n) => Number(n));
    const isValidOption = (v) =>
      optionNums.some((o) => Number(o) === Number(v));

    if (fromList.length > 0) {
      const nums = fromList
        .map((n) => Number(n))
        .filter((v) => !Number.isNaN(v) && isValidOption(v));
      const uniq = [...new Set(nums)].sort((a, b) => a - b);
      setSelectedSpecNums(uniq);
      return;
    }

    const savedSpec = localStorage.getItem('selectedMachinerySpec');
    if (!savedSpec?.trim() || !machinery) {
      setSelectedSpecNums([]);
      return;
    }

    const parts = savedSpec.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
    const nums = [];
    for (const part of parts) {
      const match = cap.options.find((n) => formatMachineryCapacityChipLabel(machinery, n) === part);
      if (match != null) nums.push(Number(match));
    }
    if (nums.length > 0) {
      setSelectedSpecNums([...new Set(nums)].sort((a, b) => a - b));
    } else {
      localStorage.removeItem('selectedMachinerySpec');
      setSelectedSpecNums([]);
    }
  }, []);

  const toggleSpecNum = (num) => {
    setSelectedSpecNums((prev) => {
      const n = Number(num);
      const has = prev.some((x) => Number(x) === n);
      if (has) return prev.filter((x) => Number(x) !== n).sort((a, b) => a - b);
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const selectMachinery = (id) => {
    setSelectedMachineryState(id);
    setSelectedSpecNums([]);
    localStorage.setItem('selectedMachinery', id);
    clearAllClientCapacityListsAndSpec();
    localStorage.removeItem('selectedMachineryList');
  };

  /** Ítems al final de la lista quedaban debajo del footer fijo: centrar fila + bloque capacidad en el scroll. */
  useEffect(() => {
    if (!selectedMachinery) return;
    const id = requestAnimationFrame(() => {
      document
        .getElementById(`machinery-select-${selectedMachinery}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedMachinery]);

  const handleContinue = () => {
    if (!selectedMachinery) {
      toast.warning('Selecciona un tipo de maquinaria');
      return;
    }
    localStorage.setItem('selectedMachinery', selectedMachinery);
    persistClientCapacitySelection(selectedMachinery, selectedSpecNums);
    localStorage.removeItem('selectedMachineryList');
    // Guardar tope de progreso para que el reingreso respete la ventana de 24h.
    saveBookingProgress('machinery', { machinery: selectedMachinery });
    const primary = selectedMachinery;

    const isPerTrip = isPerTripMachineryType(primary);

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
        // Conversión: eliminar pantalla separada de horas.
        // Horas se seleccionan directamente en pantalla de ubicación.
        if (!localStorage.getItem('selectedHours')) {
          localStorage.setItem('selectedHours', '4');
        }
        localStorage.setItem('clientBookingStep', 'location');
        navigate('/client/service-location');
      }
    }
  };

  // MVP conversión: atajo para llegar más rápido al "primer valor" (solicitar).
  // No elimina el flujo normal; solo precarga valores mínimos seguros y lleva a ubicación.
  const handleQuickRequest = () => {
    if (!selectedMachinery) return;
    const isPerTrip = isPerTripMachineryType(selectedMachinery);
    localStorage.setItem('selectedMachinery', selectedMachinery);
    persistClientCapacitySelection(selectedMachinery, selectedSpecNums);
    localStorage.removeItem('selectedMachineryList');
    localStorage.setItem('reservationType', 'immediate');
    localStorage.setItem('urgencyType', 'today');
    localStorage.setItem('urgencyBonus', '5');
    localStorage.setItem('priceType', isPerTrip ? 'trip' : 'hour');
    if (isPerTrip) {
      localStorage.setItem('clientBookingStep', 'urgency');
      saveBookingProgress('urgency', { machinery: selectedMachinery, mode: 'quick' });
      navigate('/client/urgency');
      return;
    }
    localStorage.setItem('selectedHours', '4');
    localStorage.setItem('clientBookingStep', 'location');
    saveBookingProgress('location', { machinery: selectedMachinery, mode: 'quick' });
    navigate('/client/service-location');
  };

  return (
    <div className="maqgo-app maqgo-client-funnel maqgo-funnel-split-layout">
      <div
        className="maqgo-screen maqgo-screen--scroll maqgo-funnel-split-scroll"
        style={{ flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12, flexShrink: 0 }}>
          <button onClick={() => navigate(backRoute || '/client/home')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label="Volver">
            <BackArrowIcon style={{ color: '#fff' }} />
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
        {/* Lista: el scroll es el de .maqgo-funnel-split-scroll (CTA fuera, sin anidar overflow) */}
        <div style={{ paddingBottom: 8 }}>
          <div className="maqgo-machinery-list">
            {MACHINERY.map(({ id, name }) => {
              const IconComponent = MachineryIcons[id];
              const current = typeof selectedMachinery === 'string' ? selectedMachinery : '';
              const isSelected = current === id;
              const description = MACHINERY_DESCRIPTIONS[id] || '';
              const capacityOptions = isSelected
                ? getMachineryCapacityOptions(id)?.options || []
                : [];
              return (
                <div
                  key={id}
                  id={`machinery-select-${id}`}
                  className={`maqgo-machinery-item ${isSelected ? 'selected' : ''}`}
                  style={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 0,
                    scrollMarginBottom: 100,
                    scrollMarginTop: 24,
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      width: '100%',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectMachinery(id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectMachinery(id);
                      }
                    }}
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

                  {isSelected && capacityOptions.length > 0 && (
                    <div
                      role="group"
                      aria-label="Selecciona capacidad"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        paddingLeft: 54,
                        paddingTop: 12,
                        paddingBottom: 4,
                      }}
                    >
                      <p
                        style={{
                          margin: '0 0 6px',
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.95)',
                          letterSpacing: 0.2,
                        }}
                      >
                        Selecciona capacidad
                      </p>
                      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                        Puedes elegir una o varias. Si no eliges ninguna, te mostramos las mejores opciones según precio,
                        cercanía y nuestro criterio de coincidencia.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
                        {capacityOptions.map((num) => {
                          const option = formatMachineryCapacityChipLabel(id, num);
                          const specSelected = selectedSpecNums.some((x) => Number(x) === Number(num));
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleSpecNum(num)}
                              className={`maqgo-chip ${specSelected ? 'maqgo-chip--selected' : ''}`}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 999,
                                border: '1px solid rgba(255,255,255,0.16)',
                                backgroundColor: specSelected ? '#EC6819' : 'transparent',
                                color: '#fff',
                                fontSize: 13,
                                cursor: 'pointer',
                                minWidth: 80,
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* CTA al pie: flujo flex, sin position fixed (mismo patrón que P4) */}
      <div className="maqgo-funnel-split-footer" role="region" aria-label="Continuar selección de maquinaria">
        <button
          className="maqgo-btn-primary"
          type="button"
          onClick={reservationType === 'immediate' ? handleQuickRequest : handleContinue}
          disabled={!selectedMachinery}
          style={{
            width: '100%',
            opacity: selectedMachinery ? 1 : 0.5,
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default MachinerySelection;
