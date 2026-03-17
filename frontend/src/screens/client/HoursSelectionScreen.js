import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { MACHINERY_NAMES, getMachineryKeySpec } from '../../utils/machineryNames';

const MIN_HOURS = 4;
const MAX_HOURS = 8;

/**
 * Selección de horas para INICIO HOY (urgencia)
 * Inmediato = solo hoy. Varios días → usar reserva programada (más cierres)
 */
function HoursSelectionScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [hoursToday, setHoursToday] = useState(() => {
    const saved = parseInt(localStorage.getItem('selectedHours') || '4', 10);
    return Math.max(MIN_HOURS, Math.min(MAX_HOURS, saved));
  });
  const [machinery] = useState(() => localStorage.getItem('selectedMachinery') || '');
  const keySpec = getMachineryKeySpec(machinery);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem('selectedHours') || '4', 10);
    setHoursToday(Math.max(MIN_HOURS, Math.min(MAX_HOURS, saved)));
  }, [pathname]);

  useEffect(() => {
    const machinery = localStorage.getItem('selectedMachinery') || '';
    saveBookingProgress('hours', { machinery });
  }, []);
  
  const MULTIPLIERS = { 4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10 };
  
  const decreaseHours = () => setHoursToday(h => Math.max(MIN_HOURS, h - 1));
  const increaseHours = () => setHoursToday(h => Math.min(MAX_HOURS, h + 1));

  const todayMultiplier = MULTIPLIERS[hoursToday];

  const handleContinue = () => {
    localStorage.setItem('selectedHours', hoursToday.toString());
    localStorage.setItem('additionalDays', '0'); // Inmediato = solo hoy
    localStorage.setItem('reservationType', 'immediate');
    localStorage.setItem('todayMultiplier', todayMultiplier.toString());
    navigate('/client/service-location');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120 }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 16
        }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="back-button"
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

        {/* Maquinaria seleccionada + dato clave (ref. plataformas top) */}
        {machinery && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 20,
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
                <rect x="4" y="8" width="14" height="10" rx="2" stroke="#EC6819" strokeWidth="2"/>
                <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#EC6819" strokeWidth="2"/>
                <circle cx="8" cy="18" r="2" stroke="#EC6819" strokeWidth="2"/>
                <circle cx="16" cy="18" r="2" stroke="#EC6819" strokeWidth="2"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
                {MACHINERY_NAMES[machinery] || machinery}
              </div>
              {keySpec && (
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                  {keySpec}
                </div>
              )}
            </div>
          </div>
        )}

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          ¿Cuántas horas necesitas?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Servicio para hoy.
        </p>

        {/* Sección horas */}
        <div style={{
          background: '#363636',
          borderRadius: 16,
          padding: 24,
          marginBottom: 16
        }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>
            Horas de la reserva
          </p>

          {/* Selector de horas */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 25
          }}>
            <button
              type="button"
              onClick={decreaseHours}
              disabled={hoursToday <= MIN_HOURS}
              aria-label="Reducir horas"
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                background: 'transparent',
                color: '#fff',
                fontSize: 24,
                cursor: hoursToday > MIN_HOURS ? 'pointer' : 'not-allowed',
                opacity: hoursToday > MIN_HOURS ? 1 : 0.4
              }}
              data-testid="decrease-hours"
            >
              −
            </button>
            
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <span style={{ fontSize: 52, fontWeight: 700, color: '#EC6819' }}>
                {hoursToday}
              </span>
              <span style={{ fontSize: 20, color: '#EC6819', marginLeft: 4 }}>hrs</span>
            </div>
            
            <button
              type="button"
              onClick={increaseHours}
              disabled={hoursToday >= MAX_HOURS}
              aria-label="Aumentar horas"
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                background: 'transparent',
                color: '#fff',
                fontSize: 24,
                cursor: hoursToday < MAX_HOURS ? 'pointer' : 'not-allowed',
                opacity: hoursToday < MAX_HOURS ? 1 : 0.4
              }}
              data-testid="increase-hours"
            >
              +
            </button>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            Mínimo {MIN_HOURS} hrs · Máximo {MAX_HOURS} hrs
            {hoursToday >= 6 && ' · Incluye 1 hora de colación durante el servicio'}
          </p>
        </div>

      </div>

      {/* Botón fijo - FUERA del scroll para que siempre sea visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          data-testid="continue-button"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default HoursSelectionScreen;
