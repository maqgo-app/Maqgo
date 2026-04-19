import React, { useState, useEffect } from 'react';
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
    preloadClientBookingFunnel();
  }, []);

  // Verificar si hay una reserva en progreso
  useEffect(() => {
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
            borderRadius: 20,
            padding: '24px 20px',
            marginBottom: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 8px 32px rgba(236, 104, 25, 0.25)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(236, 104, 25, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(236, 104, 25, 0.25)';
          }}
          data-testid="immediate-reservation-btn"
          aria-label="Inicio HOY - Servicio prioritario"
        >
          {/* Ícono Reloj Urgente */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backdropFilter: 'blur(4px)'
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2.5"/>
              <path d="M12 7V12L15 14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M3 12H1M23 12H21M12 3V1M12 23V21" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          
          {/* Texto */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4, letterSpacing: '-0.02em', fontFamily: "'Inter', sans-serif" }}>
              Inicio HOY
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500, fontFamily: "'Inter', sans-serif", lineHeight: 1.3 }}>
              Solicita maquinaria para que llegue a tu obra el mismo día.
            </div>
          </div>

          {/* Flecha */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 5L15 12L9 19" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Tarjeta Programar - Elegir fecha */}
        <div 
          onClick={() => handleSelect('scheduled')}
          style={{
            background: '#1E1E24',
            borderRadius: 20,
            padding: '24px 20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            border: '1px solid #2E2E35',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.borderColor = 'rgba(144, 189, 211, 0.5)'; 
            e.currentTarget.style.background = '#25252D';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.borderColor = '#2E2E35'; 
            e.currentTarget.style.background = '#1E1E24'; 
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          data-testid="scheduled-reservation-btn"
          aria-label="Programar arriendo - Elige fecha"
        >
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: '#2A2A32',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="3" stroke="#90BDD3" strokeWidth="2.5"/>
              <path d="M3 10H21" stroke="#90BDD3" strokeWidth="2.5"/>
              <path d="M8 2V6M16 2V6" stroke="#90BDD3" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M8 14H10M14 14H16M8 17H10" stroke="#90BDD3" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FAFAFA', marginBottom: 4, letterSpacing: '-0.02em', fontFamily: "'Inter', sans-serif" }}>
              Programar arriendo
            </div>
            <div style={{ fontSize: 13, color: 'rgba(250,250,250,0.7)', fontWeight: 500, fontFamily: "'Inter', sans-serif", lineHeight: 1.3 }}>
              Reserva para mañana o fechas futuras.
            </div>
          </div>

          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#2A2A32',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 5L15 12L9 19" stroke="rgba(250,250,250,0.6)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Atajo a Historial */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <button
            onClick={() => navigate('/client/history')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '10px 18px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Mis arriendos
          </button>
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

export default ClientHome;
