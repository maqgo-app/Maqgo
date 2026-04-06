import React, { useEffect, useState } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getPerTripCountLabel } from '../../utils/bookingDates';
import { getArray } from '../../utils/safeStorage';

function parseDatesFromStorage() {
  const raw = getArray('selectedDates', []);
  return raw
    .map(d => typeof d === 'string' ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')) : d)
    .filter(d => d && !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Calendario multi-día para reserva programada
 * Solo se permite un bloque de días dentro de un mismo rango (no saltar de una semana a otra).
 * Regla especial: domingo no se elige; viernes y lunes cuentan como “seguido” porque algunos proveedores no trabajan sábado.
 * Para maquinaria por hora: Jornadas de 8 horas + 1 hora almuerzo
 * Para maquinaria por viaje: Solo selección de fecha
 */

function CalendarMultiDayScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [selectedDates, setSelectedDates] = useState(parseDatesFromStorage);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const dates = parseDatesFromStorage();
    if (dates.length > 0 && dates[0]) {
      const d = new Date(dates[0]);
      return !isNaN(d.getTime()) ? d : new Date();
    }
    return new Date();
  });
  
  // Obtener tipo de maquinaria seleccionada
  const machinery = localStorage.getItem('selectedMachinery') || '';
  const isPerTrip = isPerTripMachineryType(machinery);

  const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    // Días vacíos al inicio (ajustar para que Lunes sea 0)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // Días del mes
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const isSelected = (date) => {
    if (!date) return false;
    return selectedDates.some(d => d.toDateString() === date.toDateString());
  };

  const todayMidnight = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  };

  // Reserva programada: no se puede reservar para hoy; solo desde mañana
  const isPastOrToday = (date) => {
    if (!date) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() <= todayMidnight().getTime();
  };

  const isSunday = (date) => {
    if (!date) return false;
    return date.getDay() === 0;
  };

  const oneDayMs = 24 * 60 * 60 * 1000;
  /** Siguiente día seleccionable: sábado → lunes (domingo no cuenta). */
  const nextSelectableDay = (d) => {
    const next = new Date(d.getTime() + oneDayMs);
    return next.getDay() === 0 ? new Date(next.getTime() + oneDayMs) : next;
  };
  /** Día anterior seleccionable: lunes → sábado (domingo no cuenta). */
  const prevSelectableDay = (d) => {
    const prev = new Date(d.getTime() - oneDayMs);
    return prev.getDay() === 0 ? new Date(prev.getTime() - oneDayMs) : prev;
  };
  /** Excepción: viernes y lunes son consecutivos (algunos proveedores no trabajan sábado). */
  const isFridayMondayConsecutive = (d, targetStr) => {
    if (d.getDay() === 5) {
      const nextMon = new Date(d.getTime() + 3 * oneDayMs);
      return targetStr === nextMon.toDateString();
    }
    if (d.getDay() === 1) {
      const prevFri = new Date(d.getTime() - 3 * oneDayMs);
      return targetStr === prevFri.toDateString();
    }
    return false;
  };

  /** Dos días son adyacentes (consecutivos) con la regla sábado/domingo. */
  const areAdjacent = (d1, d2) => {
    const s1 = d1.toDateString();
    const s2 = d2.toDateString();
    return s2 === nextSelectableDay(d1).toDateString() || s1 === prevSelectableDay(d2).toDateString() || isFridayMondayConsecutive(d1, s2) || isFridayMondayConsecutive(d2, s1);
  };

  /** True si la lista de fechas forma un solo bloque consecutivo. */
  const areDatesConsecutive = (dates) => {
    if (dates.length <= 1) return true;
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      if (!areAdjacent(sorted[i], sorted[i + 1])) return false;
    }
    return true;
  };

  const toggleDate = (date) => {
    if (!date || isPastOrToday(date) || isSunday(date)) return;

    if (isSelected(date)) {
      const remaining = selectedDates.filter(d => d.toDateString() !== date.toDateString());
      if (!areDatesConsecutive(remaining)) return;
      setSelectedDates(remaining);
      return;
    }
    if (selectedDates.length === 0) {
      setSelectedDates([date]);
      return;
    }
    const dateStr = date.toDateString();
    const isConsecutiveToSome = selectedDates.some((d) => {
      const n = nextSelectableDay(d);
      const p = prevSelectableDay(d);
      return dateStr === n.toDateString() || dateStr === p.toDateString() || isFridayMondayConsecutive(d, dateStr);
    });
    if (isConsecutiveToSome) {
      setSelectedDates([...selectedDates, date].sort((a, b) => a.getTime() - b.getTime()));
    } else {
      // Nuevo bloque desde este día (antes: no-op silencioso → parecía “no puedo elegir fecha”)
      setSelectedDates([date]);
    }
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const prevMonth = () => {
    const today = new Date();
    const prevM = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    if (prevM >= new Date(today.getFullYear(), today.getMonth())) {
      setCurrentMonth(prevM);
    }
  };

  const handleContinue = () => {
    // Guardar fechas seleccionadas
    localStorage.setItem('selectedDates', JSON.stringify(selectedDates.map(d => d.toISOString())));
    
    // Also save the first date as selectedDate (singular) for compatibility with other screens
    if (selectedDates.length > 0) {
      const firstDate = selectedDates[0];
      const dateStr = firstDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      localStorage.setItem('selectedDate', dateStr);
    }
    
    if (isPerTrip) {
      // Maquinaria por viaje: ir a ubicación
      localStorage.setItem('selectedHours', '1');
      localStorage.setItem('priceType', 'trip');
      navigate('/client/service-location');
    } else {
      // Maquinaria por hora: ir a seleccionar maquinaria (si no hay) o ubicación
      localStorage.setItem('selectedHours', '8'); // Jornada fija de 8 horas
      localStorage.setItem('priceType', 'hour');
      if (machinery) {
        navigate('/client/service-location');
      } else {
        navigate('/client/machinery');
      }
    }
  };

  useEffect(() => {
    // Autosave defensivo de calendario: mantiene selección al volver atrás/adelante.
    const isoDates = selectedDates.map((d) => d.toISOString());
    localStorage.setItem('selectedDates', JSON.stringify(isoDates));
    if (selectedDates.length > 0) {
      const firstDate = selectedDates[0];
      localStorage.setItem('selectedDate', firstDate.toISOString().split('T')[0]);
    }
  }, [selectedDates]);

  const days1 = getDaysInMonth(currentMonth);
  const nextMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
  const days2 = getDaysInMonth(nextMonthDate);

  return (
    <div className="maqgo-app maqgo-client-funnel maqgo-funnel-split-layout">
      <div
        className="maqgo-screen maqgo-screen--scroll maqgo-funnel-split-scroll"
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20
        }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          
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
          {isPerTrip ? 'Selecciona la fecha' : 'Selecciona las fechas'}
        </h1>
        {!isPerTrip && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>
            Elige un bloque de días dentro del mismo rango. Domingo no se elige y viernes y lunes cuentan como seguidos, porque algunos proveedores no trabajan sábado. Toca para sumar o quitar.
          </p>
        )}
        
        {/* Badge - diferente según tipo de maquinaria */}
        {isPerTrip ? (
          <>
            <div style={{
              background: 'rgba(236, 104, 25, 0.15)',
              border: '1px solid rgba(236, 104, 25, 0.3)',
              borderRadius: 20,
              padding: '8px 16px',
              margin: '0 auto 12px',
              width: 'fit-content'
            }}>
              <p style={{
                color: '#EC6819',
                fontSize: 13,
                fontWeight: 600,
                margin: 0,
                textAlign: 'center'
              }}>
                🚛 {MACHINERY_NAMES[machinery] || machinery} · Valor viaje
              </p>
            </div>
            {machinery === 'camion_tolva' && (
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', margin: '0 0 20px' }}>
                Verás la capacidad (m³) de cada opción al elegir proveedor.
              </p>
            )}
            {machinery !== 'camion_tolva' && <div style={{ marginBottom: 20 }} />}
          </>
        ) : (
          <div style={{
            background: 'rgba(144, 189, 211, 0.15)',
            border: '1px solid rgba(144, 189, 211, 0.3)',
            borderRadius: 20,
            padding: '8px 16px',
            margin: '0 auto 20px',
            width: 'fit-content'
          }}>
            <p style={{
              color: '#90BDD3',
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              textAlign: 'center'
            }}>
              📅 Jornada fija: 8 horas + 1hr colación
            </p>
          </div>
        )}

        {/* Navegación meses */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 15L7 10L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M8 5L13 10L8 15" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Calendarios lado a lado */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {/* Mes actual */}
          <div style={{ flex: 1 }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 2,
              marginBottom: 8
            }}>
              {DAYS.map(day => (
                <div key={day} style={{ 
                  textAlign: 'center', 
                  color: 'rgba(255,255,255,0.95)', 
                  fontSize: 13,
                  padding: 4
                }}>
                  {day}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {days1.map((date, i) => (
                <div
                  key={i}
                  role={date && !isPastOrToday(date) && !isSunday(date) ? 'button' : undefined}
                  tabIndex={date && !isPastOrToday(date) && !isSunday(date) ? 0 : undefined}
                  onClick={() => toggleDate(date)}
                  onKeyDown={(e) => {
                    if (!date || isPastOrToday(date) || isSunday(date)) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleDate(date);
                    }
                  }}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    fontSize: 13,
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    cursor: date && !isPastOrToday(date) && !isSunday(date) ? 'pointer' : 'default',
                    background: isSelected(date) ? '#EC6819' : isSunday(date) ? 'rgba(255,255,255,0.05)' : 'transparent',
                    color: !date ? 'transparent' : (isPastOrToday(date) || isSunday(date)) ? 'rgba(255,255,255,0.2)' : '#fff',
                    fontWeight: isSelected(date) ? 600 : 400,
                    textDecoration: isSunday(date) ? 'line-through' : 'none'
                  }}
                >
                  {date ? date.getDate() : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Mes siguiente */}
          <div style={{ flex: 1 }}>
            <div style={{ 
              textAlign: 'center', 
              color: 'rgba(255,255,255,0.95)', 
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              padding: 4
            }}>
              {MONTHS[nextMonthDate.getMonth()]}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {days2.map((date, i) => (
                <div
                  key={i}
                  role={date && !isPastOrToday(date) && !isSunday(date) ? 'button' : undefined}
                  tabIndex={date && !isPastOrToday(date) && !isSunday(date) ? 0 : undefined}
                  onClick={() => toggleDate(date)}
                  onKeyDown={(e) => {
                    if (!date || isPastOrToday(date) || isSunday(date)) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleDate(date);
                    }
                  }}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    fontSize: 13,
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    cursor: date && !isPastOrToday(date) && !isSunday(date) ? 'pointer' : 'default',
                    background: isSelected(date) ? '#EC6819' : isSunday(date) ? 'rgba(255,255,255,0.05)' : 'transparent',
                    color: !date ? 'transparent' : (isPastOrToday(date) || isSunday(date)) ? 'rgba(255,255,255,0.2)' : '#fff',
                    fontWeight: isSelected(date) ? 600 : 400,
                    textDecoration: isSunday(date) ? 'line-through' : 'none'
                  }}
                >
                  {date ? date.getDate() : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fechas seleccionadas */}
        {selectedDates.length > 0 && (
          <div style={{
            background: '#363636',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20
          }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, marginBottom: 8 }}>
              {isPerTrip
                ? (selectedDates.length > 1
                    ? `${getPerTripCountLabel(selectedDates)} seleccionados`
                    : '1 viaje seleccionado')
                : `${selectedDates.length} día${selectedDates.length > 1 ? 's' : ''} seleccionado${selectedDates.length > 1 ? 's' : ''}`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedDates.slice(0, 5).map((date, i) => (
                <span key={i} style={{
                  background: '#EC6819',
                  borderRadius: 20,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: '#fff'
                }}>
                  {date.getDate()}/{date.getMonth() + 1}
                </span>
              ))}
              {selectedDates.length > 5 && (
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, alignSelf: 'center' }}>
                  +{selectedDates.length - 5} más
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="maqgo-funnel-split-footer" role="region" aria-label="Continuar fechas seleccionadas">
        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={selectedDates.length === 0}
          style={{
            width: '100%',
            opacity: selectedDates.length > 0 ? 1 : 0.5
          }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default CalendarMultiDayScreen;
