import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { getAndClearReturnUrl, peekReturnUrl, saveProviderReturnUrl } from '../utils/registrationReturn';
import MaqgoLogo from '../components/MaqgoLogo';

import BACKEND_URL from '../utils/api';
import { getObject } from '../utils/safeStorage';

/**
 * C09 - Seleccion de Rol
 * Soporta returnUrl para volver a la pantalla original después del registro
 */
function RoleSelection({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Get returnUrl from navigation state or localStorage
  const [returnUrl, setReturnUrl] = useState(null);
  const preselect = location.state?.preselect;

  useEffect(() => {
    // Priority: navigation state > localStorage > default
    const stateReturn = location.state?.returnUrl;
    const storedReturn = peekReturnUrl();

    if (stateReturn) {
      setReturnUrl(stateReturn);
    } else if (storedReturn) {
      setReturnUrl(storedReturn);
    }
  }, [location.state]);

  useEffect(() => {
    if (preselect && (preselect === 'client' || preselect === 'provider')) {
      setSelected(preselect);
    }
  }, [preselect]);

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = getObject('registerData', {});
      const apiCall = axios.post(
        `${BACKEND_URL}/api/users`,
        {
          role: selected,
          name: `${data.nombre || 'Usuario'} ${data.apellido || ''}`.trim(),
          email: data.email || `${selected}_${Date.now()}@maqgo.cl`,
        },
        { timeout: 4000 }
      );
      // Si el backend no responde en 1.5s, continuar en modo demo sin esperar
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
      try {
        const res = await Promise.race([apiCall, timeout(1500)]);
        setUserRole(selected);
        setUserId(res.data.id);
        localStorage.setItem('userId', res.data.id);
        localStorage.setItem('userRole', selected);
      } catch (e) {
        // Backend lento o no disponible → demo inmediato
        const id = `demo-${Date.now()}`;
        setUserRole(selected);
        setUserId(id);
        localStorage.setItem('userId', id);
        localStorage.setItem('userRole', selected);
      }
      const savedReturnUrl = getAndClearReturnUrl() || returnUrl;
      if (selected === 'client') {
        if (savedReturnUrl && savedReturnUrl.startsWith('/client/')) {
          navigate(savedReturnUrl);
        } else {
          navigate('/client/home');
        }
      } else {
        localStorage.removeItem('providerCameFromWelcome');
        localStorage.setItem('providerOnboardingCompleted', 'false');
        if (savedReturnUrl && savedReturnUrl.startsWith('/provider/')) {
          saveProviderReturnUrl(savedReturnUrl);
        }
        navigate('/provider/data');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <MaqgoLogo size="medium" />
        </div>

        <h2 style={{
          color: '#fff',
          fontSize: 24,
          fontWeight: 600,
          textAlign: 'center',
          marginBottom: 35
        }}>
          ¿Cómo usarás la app?
        </h2>

        {/* Opciones */}
        <div style={{ flex: 1 }}>
          <button 
            className={`maqgo-option-card ${selected === 'client' ? 'selected' : ''}`}
            onClick={() => setSelected('client')}
          >
            <span className="maqgo-option-title">Soy Cliente</span>
            <span className="maqgo-option-desc">Necesito maquinaria</span>
          </button>

          <button 
            className={`maqgo-option-card ${selected === 'provider' ? 'selected' : ''}`}
            onClick={() => setSelected('provider')}
          >
            <span className="maqgo-option-title">Soy Proveedor</span>
            <span className="maqgo-option-desc">Tengo maquinaria</span>
          </button>
        </div>

        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!selected || loading}
          aria-busy={loading}
          aria-label={loading ? 'Cargando cuenta' : 'Seleccionar y continuar'}
          style={{ opacity: selected ? 1 : 0.5 }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Cargando tu cuenta...
            </span>
          ) : (
            'Seleccionar y continuar'
          )}
        </button>
      </div>
    </div>
  );
}

export default RoleSelection;
