import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Pantalla - Calendario (Solo para reserva programada)
 * Calendario en cuadrícula para seleccionar fecha futura
 */
function CalendarSelection() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [selectedDate, setSelectedDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const isSelected = (date) => {
    if (!date || !selectedDate) return false;
    return date.toISOString().split('T')[0] === selectedDate;
  };

  const isPast = (date) => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isSunday = (date) => date && date.getDay() === 0;

  const selectDate = (date) => {
    if (!date || isPast(date) || isSunday(date)) return;
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const prevMonth = () => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    const today = new Date();
    if (prev >= new Date(today.getFullYear(), today.getMonth())) {
      setCurrentMonth(prev);
    }
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  useEffect(() => {
    const selectedDate = localStorage.getItem('selectedDate') || '';
    const machinery = localStorage.getItem('selectedMachinery') || '';
    saveBookingProgress('calendar', { selectedDate, machinery });
  }, []);

  const handleContinue = () => {
    if (!selectedDate) return;
    localStorage.setItem('selectedDate', selectedDate);
    saveBookingProgress('calendar', { selectedDate, machinery: localStorage.getItem('selectedMachinery') || '' });
    navigate('/client/service-location');
  };

  const days = getDaysInMonth(currentMonth);
  const today = new Date();

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 30px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 25 }}>
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

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          ¿Cuándo necesitas la maquinaria?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
          Selecciona la fecha para tu reserva programada
        </p>

        {/* Navegación de meses */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }} aria-label="Mes anterior">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 15L7 10L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }} aria-label="Mes siguiente">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8 5L13 10L8 15" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Calendario en cuadrícula */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 8 }}>
          {DAYS.map(day => (
            <div key={day} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.95)', fontSize: 11, padding: 4 }}>
              {day}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 24 }}>
          {days.map((date, i) => (
            <div
              key={i}
              onClick={() => selectDate(date)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                fontSize: 13,
                cursor: date && !isPast(date) && !isSunday(date) ? 'pointer' : 'default',
                background: isSelected(date) ? '#EC6819' : isSunday(date) ? 'rgba(255,255,255,0.05)' : 'transparent',
                color: !date ? 'transparent' : (isPast(date) || isSunday(date)) ? 'rgba(255,255,255,0.2)' : '#fff',
                fontWeight: isSelected(date) ? 600 : 400,
                textDecoration: isSunday(date) ? 'line-through' : 'none',
                border: date && date.toDateString() === today.toDateString() && !isSelected(date) ? '1px solid rgba(236,104,25,0.5)' : 'none'
              }}
            >
              {date ? date.getDate() : ''}
            </div>
          ))}
        </div>

        {selectedDate && (
          <div style={{
            background: 'rgba(247, 147, 30, 0.15)',
            border: '1px solid rgba(247, 147, 30, 0.3)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            textAlign: 'center'
          }}>
            <p style={{ color: '#EC6819', fontSize: 16, fontWeight: 600, margin: 0 }}>
              📅 {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        <div className="maqgo-spacer"></div>

        <button
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!selectedDate}
          style={{ opacity: selectedDate ? 1 : 0.5 }}
        >
          CONTINUAR
        </button>
      </div>
    </div>
  );
}

export default CalendarSelection;
