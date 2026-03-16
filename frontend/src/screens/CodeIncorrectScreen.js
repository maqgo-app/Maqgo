import React from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';

/**
 * Pantalla C7 - Código Incorrecto
 */
function CodeIncorrectScreen() {
  const navigate = useNavigate();

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
            <path d="M15 15L35 35" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
            <path d="M35 15L15 35" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: 26,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 10
        }}>
          Código incorrecto
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 45,
          lineHeight: 1.5
        }}>
          El código ingresado no es válido.<br/>Intenta nuevamente.
        </p>

        <button 
          className="maqgo-btn-primary"
          onClick={() => navigate('/verify-sms')}
          style={{ width: '100%', maxWidth: 320 }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export default CodeIncorrectScreen;
