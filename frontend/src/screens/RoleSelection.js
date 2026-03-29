import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { getAndClearReturnUrl, peekReturnUrl, saveProviderReturnUrl } from '../utils/registrationReturn';
import MaqgoLogo from '../components/MaqgoLogo';

import BACKEND_URL from '../utils/api';
import { getObject } from '../utils/safeStorage';
import { rememberLoginEmail } from '../utils/loginHints';
import { PASSWORD_RULES } from '../utils/passwordValidation';

/**
 * C09 - Seleccion de Rol
 * Soporta returnUrl para volver a la pantalla original después del registro
 */
function RoleSelection({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
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

  // Seguridad UX: este screen debe usarse después de registro/verificación.
  // Si el usuario llega sin sesión/verificación, lo enviamos a registro (OTP).
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const phoneVerified = localStorage.getItem('phoneVerified') === 'true';
    const registerData = getObject('registerData', {});
    const pwd = registerData.password ? String(registerData.password) : '';

    if (!userId && !phoneVerified && !registerData?.celular) {
      navigate('/register', { replace: true });
      return;
    }
    // Tras OTP: debe existir contraseña en registerData para poder usar /login después.
    if (phoneVerified && pwd.length < 8) {
      navigate('/register', { replace: true });
    }
  }, [navigate]);

  const handleOptionClick = (role) => {
    if (loading) return;
    setSelected(role);
    // UX estable: un toque avanza, sin requerir doble toque.
    handleContinueWithRole(role);
  };

  const handleContinue = async () => {
    if (!selected) return;
    handleContinueWithRole(selected);
  };

  const handleContinueWithRole = async (roleToUse) => {
    if (!roleToUse || loading) return;
    setLoading(true);
    setError('');
    setSelected(roleToUse);
    try {
      const data = getObject('registerData', {});
      const celDigits = data.celular ? String(data.celular).replace(/\D/g, '').slice(-9) : '';
      const phone = celDigits.length >= 9 ? `+56${celDigits}` : undefined;
      const rawPwd = data.password ? String(data.password) : '';
      const pwd =
        rawPwd.length >= PASSWORD_RULES.minLength && rawPwd.length <= PASSWORD_RULES.maxLength
          ? rawPwd
          : undefined;
      const apiCall = axios.post(
        `${BACKEND_URL}/api/users`,
        {
          role: roleToUse,
          name: `${data.nombre || 'Usuario'} ${data.apellido || ''}`.trim(),
          email: data.email || `${roleToUse}_${Date.now()}@maqgo.cl`,
          ...(phone && { phone }),
          // Guardar RUT para permitir login por RUT (especialmente cliente).
          ...(data.rut && { rut: data.rut }),
          ...(pwd && { password: pwd }),
        },
        { timeout: 15000 }
      );
      const res = await apiCall;
      setUserRole(roleToUse);
      setUserId(res.data.id);
      localStorage.setItem('userId', res.data.id);
      localStorage.setItem('userRole', roleToUse);
      if (res.data.token) localStorage.setItem('token', res.data.token);
      if (data.email) rememberLoginEmail(data.email);
      const savedReturnUrl = getAndClearReturnUrl() || returnUrl;
      if (roleToUse === 'client') {
        // Evita contaminación de flujos de proveedor al volver al modo cliente.
        localStorage.removeItem('providerOnboardingCompleted');
        localStorage.removeItem('providerCameFromWelcome');
        if (savedReturnUrl && savedReturnUrl.startsWith('/client/')) {
          navigate(savedReturnUrl);
        } else {
          navigate('/client/home');
        }
      } else {
        // Evita reanudar pasos de reserva cliente al cambiar a proveedor.
        localStorage.removeItem('bookingProgress');
        localStorage.removeItem('clientBookingStep');
        localStorage.removeItem('reservationType');
        localStorage.removeItem('providerCameFromWelcome');
        localStorage.setItem('providerOnboardingCompleted', 'false');
        if (savedReturnUrl && savedReturnUrl.startsWith('/provider/')) {
          saveProviderReturnUrl(savedReturnUrl);
        }
        navigate('/provider/data');
      }
    } catch (e) {
      // Evitar "usuarios fantasma" sin password real: si falla /api/users,
      // el usuario después no podrá loguearse y terminará en recuperación.
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        'No se pudo crear tu cuenta. Intenta nuevamente.';
      setError(String(detail));
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
          marginBottom: 8
        }}>
          ¿Cómo usarás la app?
        </h2>
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: 13,
          textAlign: 'center',
          marginBottom: 28
        }}>
          Toca para continuar
        </p>

        {/* Opciones */}
        <div style={{ flex: 1 }}>
          <button 
            className={`maqgo-option-card ${selected === 'client' ? 'selected' : ''}`}
            onClick={() => handleOptionClick('client')}
            disabled={loading}
          >
            <span className="maqgo-option-title">Soy Cliente</span>
            <span className="maqgo-option-desc">Necesito maquinaria</span>
          </button>

          <button 
            className={`maqgo-option-card ${selected === 'provider' ? 'selected' : ''}`}
            onClick={() => handleOptionClick('provider')}
            disabled={loading}
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
        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 1.35 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default RoleSelection;
