import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { getAndClearReturnUrl, peekReturnUrl, saveProviderReturnUrl } from '../utils/registrationReturn';
import MaqgoLogo from '../components/MaqgoLogo';

import BACKEND_URL from '../utils/api';
import { clearPersistedCheckoutState } from '../domain/checkout/checkoutPersistence';
import { getObject } from '../utils/safeStorage';
import { rememberLoginEmail } from '../utils/loginHints';
import { PASSWORD_RULES } from '../utils/passwordValidation';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';
import { getProviderLandingPath } from '../utils/providerOnboardingStatus';

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

  // Tras verificación SMS o sesión OTP: debe haber teléfono o sesión activa.
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const registerData = getObject('registerData', {});
    const phoneVerified = localStorage.getItem('phoneVerified') === 'true';
    const celRaw = registerData?.celular || localStorage.getItem('userPhone');
    const hasPhone = celRaw && String(celRaw).replace(/\D/g, '').length >= 9;
    if (!userId && !token && !(phoneVerified && hasPhone)) {
      traceRedirectToLogin('src/screens/RoleSelection.js (useEffect guard)');
      navigate('/login', { replace: true });
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
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const existingUserId = localStorage.getItem('userId');
      const storedRoles = (() => {
        try {
          const raw = localStorage.getItem('userRoles');
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      const isSessionMultiRole =
        Boolean(token && existingUserId) &&
        storedRoles.includes('client') &&
        storedRoles.includes('provider');

      if (isSessionMultiRole) {
        localStorage.removeItem('desiredRole');
        setUserRole(roleToUse);
        setUserId(existingUserId);
        localStorage.setItem('userRole', roleToUse);
        const savedReturnUrl = getAndClearReturnUrl() || returnUrl;
        if (roleToUse === 'client') {
          if (savedReturnUrl && savedReturnUrl.startsWith('/client/')) {
            navigate(savedReturnUrl);
          } else {
            navigate('/client/home');
          }
          return;
        }
        if (savedReturnUrl && savedReturnUrl.startsWith('/provider/')) {
          saveProviderReturnUrl(savedReturnUrl);
        }
        navigate(getProviderLandingPath());
        return;
      }

      const data = getObject('registerData', {});
      const celDigits = data.celular
        ? String(data.celular).replace(/\D/g, '').slice(-9)
        : String(localStorage.getItem('userPhone') || '').replace(/\D/g, '').slice(-9);
      const phone = celDigits.length >= 9 ? `+56${celDigits}` : undefined;
      const rawPwd = data.password ? String(data.password) : '';
      const pwd =
        rawPwd.length >= PASSWORD_RULES.minLength && rawPwd.length <= PASSWORD_RULES.maxLength
          ? rawPwd
          : undefined;
      const emailFromForm = (data.email || '').trim();
      // Perfil progresivo: no enviar nombre/RUT desde registerData (OTP); nombre y facturación en P6 o perfil.
      const payload = {
        role: roleToUse,
        ...(emailFromForm ? { email: emailFromForm } : {}),
        ...(phone && { phone }),
        ...(pwd && { password: pwd }),
      };
      if (!payload.phone && !payload.email) {
        setError('Inicia sesión con tu celular para continuar.');
        setLoading(false);
        return;
      }
      const apiCall = axios.post(`${BACKEND_URL}/api/users`, payload, { timeout: 15000 });
      const res = await apiCall;
      setUserRole(roleToUse);
      setUserId(res.data.id);
      localStorage.setItem('userId', res.data.id);
      localStorage.setItem('userRole', roleToUse);
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('authToken', res.data.token);
      }
      if (emailFromForm) rememberLoginEmail(emailFromForm);
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
        clearPersistedCheckoutState();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('maqgo:reset-checkout'));
        }
        localStorage.removeItem('reservationType');
        localStorage.removeItem('providerCameFromWelcome');
        localStorage.setItem('providerOnboardingCompleted', 'false');
        if (savedReturnUrl && savedReturnUrl.startsWith('/provider/')) {
          saveProviderReturnUrl(savedReturnUrl);
        }
        navigate(getProviderLandingPath());
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
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll maqgo-funnel-scroll-compact">
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
