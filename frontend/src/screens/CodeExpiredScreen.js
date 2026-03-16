import React from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';

/**
 * Pantalla C6 - Código Expirado
 */
function CodeExpiredScreen() {
  const navigate = useNavigate();

  const handleResend = () => {
    // Reenviar código
    navigate('/verify-sms');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Logo */}
        <div style={{ 
          position: 'absolute',
          top: 55,
          left: 0,
          right: 0
        }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Icono de error */}
        <div style={{
          width: 110,
          height: 110,
          borderRadius: '50%',
          background: '#ff6b6b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 30
        }}>
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
            <path d="M25 15V28" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="25" cy="35" r="3" fill="#fff"/>
          </svg>
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: 26,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 10
        }}>
          El código ha expirado
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 45,
          lineHeight: 1.5
        }}>
          El código de verificación ya no es válido.<br/>Solicita uno nuevo.
        </p>

        <button 
          className="maqgo-btn-primary"
          onClick={handleResend}
          style={{ width: '100%', maxWidth: 320 }}
        >
          Reenviar código
        </button>
      </div>
    </div>
  );
}

export default CodeExpiredScreen;
