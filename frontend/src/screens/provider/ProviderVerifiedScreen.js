import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';

/**
 * Pantalla P2.1 - Número Verificado Proveedor
 */
function ProviderVerifiedScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Crear usuario proveedor
    const createProvider = async () => {
      try {
        const data = getObject('registerData', {});
        const res = await axios.post(`${BACKEND_URL}/api/users`, {
          role: 'provider',
          name: `${data.nombre || 'Proveedor'} ${data.apellido || ''}`.trim(),
          email: data.email || `provider_${Date.now()}@maqgo.cl`,
        });
        setUserRole?.('provider');
        setUserId?.(res.data.id);
        localStorage.setItem('userId', res.data.id);
        localStorage.setItem('userRole', 'provider');
        localStorage.setItem('providerCameFromWelcome', 'true');
        if (res.data.token) localStorage.setItem('token', res.data.token);
      } catch (e) {
        // Si ya tenemos userId (ej. de auth/register), no sobrescribir con fallback
        const existingId = localStorage.getItem('userId');
        const id = existingId || `provider-${Date.now()}`;
        setUserRole?.('provider');
        setUserId?.(id);
        localStorage.setItem('userId', id);
        localStorage.setItem('userRole', 'provider');
        localStorage.setItem('providerCameFromWelcome', 'true');
      }
    };
    
    createProvider();
    
    const timer = setTimeout(() => {
      navigate('/provider/data');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate, setUserRole, setUserId]);

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

        {/* Icono de éxito */}
        <div className="maqgo-success-icon">
          <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
            <path d="M14 27L23 36L41 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: 26,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 10
        }}>
          ¡Número verificado con éxito!
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 45
        }}>
          Completa los datos de tu empresa para empezar a recibir solicitudes.
        </p>

        <button 
          className="maqgo-btn-primary"
          onClick={() => navigate('/provider/data')}
          style={{ width: '100%', maxWidth: 320 }}
        >
          CONTINUAR
        </button>
      </div>
    </div>
  );
}

export default ProviderVerifiedScreen;
