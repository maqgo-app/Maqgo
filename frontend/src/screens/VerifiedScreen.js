import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import { peekReturnUrl } from '../utils/registrationReturn';

/**
 * C05 - SMS Success
 * Numero verificado con exito
 */
function VerifiedScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const returnUrl = peekReturnUrl();
    const desiredRole = localStorage.getItem('desiredRole');
    let preselect = null;
    if (desiredRole === 'provider') {
      preselect = 'provider';
    } else if (returnUrl && returnUrl.startsWith('/client/')) {
      preselect = 'client';
    }
    // Dejar la pantalla visible lo suficiente para leer (micro-UX).
    const timer = setTimeout(() => {
      navigate('/select-role', preselect ? { state: { preselect } } : {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Logo pequeno arriba */}
        <div style={{ position: 'absolute', top: 50 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Icono de exito */}
        <div className="maqgo-success-icon">
          <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
            <path d="M14 27L23 36L41 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: 24,
          fontWeight: 700,
          textAlign: 'center',
          marginTop: 20,
          marginBottom: 10
        }}>
          Número verificado con éxito
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 8
        }}>
          Ya puedes continuar con tu registro.
        </p>
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: 13,
          textAlign: 'center',
          marginBottom: 24
        }}>
          Redirigiendo en unos segundos...
        </p>

        <button 
          className="maqgo-btn-primary"
          onClick={() => {
            const returnUrl = peekReturnUrl();
            const desiredRole = localStorage.getItem('desiredRole');
            let preselect = null;
            if (desiredRole === 'provider') {
              preselect = 'provider';
            } else if (returnUrl && returnUrl.startsWith('/client/')) {
              preselect = 'client';
            }
            navigate('/select-role', preselect ? { state: { preselect } } : {});
          }}
          style={{ width: '100%', maxWidth: 300 }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default VerifiedScreen;
