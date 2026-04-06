import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ConfirmModal from '../../components/ConfirmModal';
import { clearBookingProgress } from '../../utils/abandonmentTracker';

/**
 * Pantalla de espera mientras se busca operador
 * Promedio: 15 minutos para recibir confirmación
 */
function WaitingConfirmationScreen() {
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(0);
  const [dots, setDots] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    // Regla: la pantalla "tu proveedor va en camino" va después del pago.
    // Simular confirmación → ir a resultado de pago; desde ahí el usuario va a seguimiento (assigned).
    const timer = setTimeout(() => {
      navigate('/client/payment-result');
    }, 5000);

    // Contador de tiempo
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    // Animación de puntos
    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      clearInterval(dotsInterval);
    };
  }, [navigate]);

  const handleCancelClick = () => setShowCancelModal(true);

  const handleCancelConfirm = () => {
    setShowCancelModal(false);
    clearBookingProgress();
    navigate('/client/home');
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div
        className="maqgo-screen"
        style={{ justifyContent: 'center', alignItems: 'center' }}
        role="status"
        aria-live="polite"
        aria-busy={true}
      >
        {/* Logo */}
        <div style={{ marginBottom: 50 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Título */}
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 15, lineHeight: 1.4 }}>
          Estamos buscando el mejor operador disponible{dots}
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.82)',
          fontSize: 13,
          textAlign: 'center',
          margin: '0 16px 10px',
          lineHeight: 1.45,
          maxWidth: 320
        }}>
          Tu solicitud ya está enviada. En un momento seguimos al siguiente paso.
        </p>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 50
        }}>
          Esperando confirmación
        </p>

        {/* Reloj animado */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: '#EC6819',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 30,
            animation: 'maqgo-pulse-waiting-confirm 2s infinite',
          }}
          aria-hidden="true"
        >
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
            <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="3" fill="none"/>
            <path d="M25 12V25L33 33" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>

        <style>{`
          @keyframes maqgo-pulse-waiting-confirm {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>

        {/* Tiempo transcurrido */}
        <p style={{
          color: 'rgba(255,255,255,0.95)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 10
        }}>
          Tiempo: {formatTime(seconds)}
        </p>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 40
        }}>
          En promedio, se recibe respuesta en 15 minutos
        </p>

        {/* Nota sobre cobro - CELESTE */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          border: '1px solid rgba(144, 189, 211, 0.3)',
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 30,
          maxWidth: 300
        }}>
          <p style={{
            color: '#90BDD3',
            fontSize: 12,
            fontWeight: 600,
            margin: 0,
            textAlign: 'center'
          }}>
            No se ha realizado ningún cobro.
            <br />
            <span style={{ fontWeight: 400 }}>Solo se cobrará si el proveedor acepta.</span>
          </p>
        </div>

        {/* Botón cancelar */}
        <button 
          onClick={handleCancelClick}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: 16,
            background: '#F5EFE6',
            border: 'none',
            borderRadius: 30,
            color: '#2D2D2D',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Cancelar solicitud
        </button>

        <ConfirmModal
          open={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title="Cancelar solicitud"
          message="¿Estás seguro de cancelar la solicitud?"
          confirmLabel="Sí, cancelar"
          cancelLabel="No, continuar esperando"
          onConfirm={handleCancelConfirm}
          variant="danger"
        />
      </div>
    </div>
  );
}

export default WaitingConfirmationScreen;
