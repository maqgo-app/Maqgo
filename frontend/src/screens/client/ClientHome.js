import React, { memo }, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getClientBookingRoute, resetBookingState } from '../../utils/bookingFlow';
import { preloadClientBookingFunnel } from '../../utils/preloadClientBookingFunnel';

/**
 * C10 - Tipo de Reserva - Diseño Premium
 * Inmediata → Maquinaria → Horas (si aplica) → Proveedores
 * Programada → Calendario multi-día → Maquinaria
 * Incluye acceso a Historial y Perfil
 */
function ClientHome() {
  const navigate = useNavigate();
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState(null);

  useEffect(() => {
    return () => { /* Cleanup preventivo Maqgo */ };
    preloadClientBookingFunnel();
  }, []);

  // Verificar si hay una reserva en progreso
  useEffect(() => {
    return () => { /* Cleanup preventivo Maqgo */ };
    const bookingStep = localStorage.getItem('clientBookingStep');
    const selectedMachinery = localStorage.getItem('selectedMachinery');
    
    if (bookingStep && selectedMachinery) {
      const route = getClientBookingRoute(bookingStep);
      if (route && route !== '/client/home') {
        setPendingRoute(route);
        setShowResumeModal(true);
      }
    }
  }, []);

  const handleResumeChoice = (continueBooking) => {
    setShowResumeModal(false);
    if (continueBooking && pendingRoute) {
      navigate(pendingRoute);
      setPendingRoute(null);
    } else {
      // Nueva reserva: limpiar todo el flujo de reserva
      resetBookingState();
      setPendingRoute(null);
    }
  };

  const handleSelect = (type) => {
    resetBookingState();
    localStorage.setItem('reservationType', type);
    // Inmediato: Maquinaria → Horas (si aplica) → ...
    // Programado: Calendario → Maquinaria → ...
    if (type === 'immediate') {
      localStorage.removeItem('selectedHours');
      localStorage.removeItem('selectedMachineryList');
      localStorage.removeItem('selectedMachinery');
      localStorage.setItem('clientBookingStep', 'machinery');
      navigate('/client/machinery');
    } else {
      localStorage.setItem('selectedHours', '8');
      localStorage.setItem('clientBookingStep', 'calendar');
      navigate('/client/calendar');
    }
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ justifyContent: 'center', paddingBottom: 52 }}>
        {/* Logo */}
        <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />

        {/* Título */}
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 30 }}>
          Arrendar maquinaria
        </h1>

        {/* Tarjeta Inicio HOY - Prioritario */}
        <div 
          onClick={() => handleSelect('immediate')}
          style={{
            background: 'linear-gradient(135deg, #EC6819 0%, #D45A10 100%)',
            borderRadius: 16,
            padding: '20px',
            marginBottom: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 4px 20px rgba(236, 104, 25, 0.25)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          data-testid="immediate-reservation-btn"
          aria-label="Inicio HOY - Servicio prioritario"
        >
          {/* Ícono Reloj Urgente */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2"/>
              <path d="M12 7V12L15 14" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M3 12H1M23 12H21M12 3V1M12 23V21" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          
          {/* Texto */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.01em', fontFamily: "'Inter', sans-serif" }}>
              Inicio HOY
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
              Disponibilidad inmediata. Solo se cobra cuando un operador acepta tu solicitud de reserva.
            </div>
          </div>

          {/* Flecha */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 6L15 12L9 18" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Tarjeta Programar - Elegir fecha */}
        <div 
          onClick={() => handleSelect('scheduled')}
          style={{
            background: '#1A1A1F',
            borderRadius: 16,
            padding: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            border: '1px solid #2E2E35',
            transition: 'border-color 0.2s, background 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(144, 189, 211, 0.4)'; e.currentTarget.style.background = '#1E1E24'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2E2E35'; e.currentTarget.style.background = '#1A1A1F'; }}
          data-testid="scheduled-reservation-btn"
          aria-label="Programar arriendo - Elige fecha"
        >
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: '#242429',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="#90BDD3" strokeWidth="2"/>
              <path d="M3 10H21" stroke="#90BDD3" strokeWidth="2"/>
              <path d="M8 2V6M16 2V6" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 14H10M14 14H16M8 17H10" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#FAFAFA', marginBottom: 4, letterSpacing: '-0.01em', fontFamily: "'Inter', sans-serif" }}>
              Programar arriendo
            </div>
            <div style={{ fontSize: 13, color: 'rgba(250,250,250,0.85)', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
              Elige fecha y planifica con anticipación
            </div>
          </div>

          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#242429',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 6L15 12L9 18" stroke="rgba(250,250,250,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Microcopy: propuesta de valor + cobro */}
        <p style={{
          color: 'rgba(250,250,250,0.5)',
          fontSize: 12,
          fontWeight: 400,
          textAlign: 'center',
          marginTop: 24,
          lineHeight: 1.4,
          fontFamily: "'Inter', sans-serif"
        }}>
          En horas, no días. Paga solo al confirmar.
        </p>

        <div style={{ flex: 1 }}></div>
      </div>

      {/* Modal: Reserva en progreso */}
      {showResumeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}>
          <div style={{
            background: '#1A1A1F',
            borderRadius: 16,
            padding: 24,
            maxWidth: 340,
            width: '100%',
            border: '1px solid #333'
          }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px', fontFamily: "'Inter', sans-serif" }}>
              Arriendo en progreso
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.5, margin: '0 0 24px', fontFamily: "'Inter', sans-serif" }}>
              ¿Continuar con esta reserva?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="maqgo-btn-primary"
                onClick={() => handleResumeChoice(true)}
                style={{ marginBottom: 0 }}
              >
                Continuar
              </button>
              <button
                onClick={() => handleResumeChoice(false)}
                style={{
                  padding: 16,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 12,
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                Empezar otra reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ClientHome);
