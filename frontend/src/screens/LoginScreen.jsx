import React, { useState, useLayoutEffect, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import PasswordField from '../components/PasswordField';
import { PASSWORD_RULES } from '../utils/passwordValidation';
import BACKEND_URL from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';
import { getLoginEmailPrefill, rememberLoginEmail } from '../utils/loginHints';
import { isAdminRoleStored } from '../utils/welcomeHome';

/**
 * Pantalla C8 - Login
 */
function LoginScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirect || null;
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sesión ya válida: no mostrar login (móvil/navegador “recuerda” al usuario).
  useLayoutEffect(() => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (!token || !userId) return;
    const role = localStorage.getItem('userRole') || 'client';
    if (isAdminRoleStored() || redirectTo === '/admin') {
      navigate('/admin', { replace: true });
      return;
    }
    if (role === 'client') {
      const target = redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/';
      navigate(target, { replace: true });
      return;
    }
    const target = redirectTo && redirectTo.startsWith('/provider') ? redirectTo : '/';
    navigate(target, { replace: true });
  }, [navigate, redirectTo]);

  // Prefill solo con correo real (evita RUT por autofill o datos mezclados).
  useEffect(() => {
    const hint = getLoginEmailPrefill();
    if (hint) setForm((f) => ({ ...f, email: hint }));
  }, []);

  const handleLogin = async () => {
    if (!form.email || !form.password) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/login`, form, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      const roles = Array.isArray(res.data.roles) ? res.data.roles : [];
      const previouslySelectedRole = localStorage.getItem('userRole');
      // Prioridad: cuenta admin (role o roles[] desde /api/auth/login) → siempre panel admin
      const isAdmin = res.data.role === 'admin' || roles.includes('admin');
      let effectiveRole = isAdmin ? 'admin' : res.data.role;
      // Cuenta multirol: mantener el rol previamente elegido por el usuario si sigue disponible.
      if (!isAdmin && previouslySelectedRole && roles.includes(previouslySelectedRole)) {
        effectiveRole = previouslySelectedRole;
      }
      // Fallback defensivo: si role legacy no viene pero existe lista de roles.
      if (!effectiveRole && roles.length > 0) {
        effectiveRole = roles.includes('provider') ? 'provider' : roles[0];
      }
      setUserRole(effectiveRole);
      setUserId(res.data.id);
      localStorage.setItem('userId', res.data.id);
      localStorage.setItem('userRole', effectiveRole);
      localStorage.setItem('userRoles', JSON.stringify(roles));
      localStorage.setItem('providerRole', res.data.provider_role || 'super_master');
      if (res.data.token) localStorage.setItem('token', res.data.token);
      rememberLoginEmail(form.email);
      // Admin: siempre /admin (ignora redirect a /client si el usuario resultó ser admin)
      if (isAdmin || redirectTo === '/admin') {
        navigate('/admin', { replace: true });
      } else if (effectiveRole === 'client') {
        const target = redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/client/home';
        navigate(target, { replace: true });
      } else {
        const target = redirectTo && redirectTo.startsWith('/provider') ? redirectTo : '/provider/home';
        navigate(target, { replace: true });
      }
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'Error al iniciar sesión. Intenta nuevamente.',
          statusMessages: {
            401: 'Correo o contraseña incorrectos'
          }
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const isValid = form.email && form.password;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />

        <h2 style={{
          color: '#fff',
          fontSize: 24,
          fontWeight: 600,
          textAlign: 'center',
          marginBottom: redirectTo === '/admin' ? 8 : 35
        }}>
          Iniciar sesión
        </h2>
        {redirectTo === '/admin' && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 27 }}>
            Acceso al panel de administración MAQGO
          </p>
        )}

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          <label
            htmlFor="login-email"
            style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
          >
            Correo electrónico
          </label>
          <input
            id="login-email"
            name="email"
            className="maqgo-input"
            placeholder="tu@correo.cl"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
          />
          <label
            htmlFor="login-password"
            style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
          >
            Contraseña
          </label>
          <PasswordField
            id="login-password"
            name="password"
            placeholder="Contraseña"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            maxLength={PASSWORD_RULES.maxLength}
          />

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: 14, textAlign: 'center', marginTop: 10 }}>
              {error}
            </p>
          )}

          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            textAlign: 'center',
            marginTop: 20
          }}>
            <button
              type="button"
              className="maqgo-link"
              onClick={() => navigate('/forgot-password')}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
              aria-label="Recuperar contraseña"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        </div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleLogin}
          disabled={!isValid || loading}
          style={{ opacity: isValid ? 1 : 0.5, marginBottom: 15 }}
          aria-label={loading ? 'Iniciando sesión' : 'Iniciar sesión'}
        >
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>

        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            textAlign: 'center'
          }}
        >
          ¿No tienes cuenta?{' '}
          <button
            type="button"
            className="maqgo-link"
            onClick={() => navigate('/register')}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
            aria-label="Crear cuenta"
          >
            Regístrate
          </button>
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;
