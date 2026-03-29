import React, { useState, useLayoutEffect, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import PasswordField from '../components/PasswordField';
import { PASSWORD_RULES } from '../utils/passwordValidation';
import BACKEND_URL, { clearLocalSession } from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';
import { getLoginEmailPrefill, rememberLoginEmail } from '../utils/loginHints';
import { isAdminRoleStored } from '../utils/welcomeHome';
import { getPostLoginNavigation } from '../utils/postLoginNavigation';
import { formatRut, sanitizeRutInput } from '../utils/chileanValidation';

/**
 * Pantalla C8 - Login
 */
function LoginScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = location.state?.redirect || null;
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sesión ya válida: no mostrar login (móvil/navegador “recuerda” al usuario).
  // reauth=1 | expired=1 | state.allowReauth: limpia sesión y normaliza URL (evita token residual + bucle de efecto).
  useLayoutEffect(() => {
    const forceReauth =
      searchParams.get('reauth') === '1' ||
      searchParams.get('expired') === '1' ||
      location.state?.allowReauth === true;
    if (forceReauth) {
      clearLocalSession();
      navigate('/login', {
        replace: true,
        state: redirectTo ? { redirect: redirectTo } : undefined,
      });
      return;
    }
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (!token || !userId) return;
    const role = localStorage.getItem('userRole') || 'client';
    // Solo cuentas con rol admin van al panel; redirect=/admin sin rol admin debe mostrar login (otra cuenta).
    if (isAdminRoleStored()) {
      navigate('/admin', { replace: true });
      return;
    }
    if (role === 'client') {
      const target =
        redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/client/home';
      navigate(target, { replace: true });
      return;
    }
    const target =
      redirectTo && redirectTo.startsWith('/provider') ? redirectTo : '/provider/home';
    navigate(target, { replace: true });
  }, [navigate, redirectTo, searchParams, location.state]);

  // Prefill solo con correo real (evita RUT por autofill o datos mezclados).
  useEffect(() => {
    const hint = getLoginEmailPrefill();
    if (hint) setForm((f) => ({ ...f, identifier: hint }));
  }, []);

  const handleIdentifierChange = (value) => {
    const next = String(value || '');
    // Correo: no formatear.
    if (next.includes('@')) {
      setForm((f) => ({ ...f, identifier: next }));
      return;
    }
    // RUT: sanitizar y formatear con puntos + guion.
    const cleanRut = sanitizeRutInput(next);
    const formatted = formatRut(cleanRut);
    setForm((f) => ({ ...f, identifier: formatted }));
  };

  const handleLogin = async () => {
    if (!form.identifier || !form.password) return;
    setLoading(true);
    setError('');
    
    try {
      const identifier = String(form.identifier || '').trim();
      const payload = {
        identifier,
        password: form.password,
        // Backward compatibility: older backend contracts may still require `email`.
        ...(identifier.includes('@') ? { email: identifier.toLowerCase() } : {}),
      };
      const res = await axios.post(`${BACKEND_URL}/api/auth/login`, payload, {
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
      const next = getPostLoginNavigation({
        isAdmin,
        effectiveRole,
        redirectTo,
      });
      if (next.kind === 'error_not_admin') {
        setError(
          'Esta cuenta no tiene acceso al panel de administración. Usa el correo y clave de una cuenta admin.'
        );
        return;
      }
      setUserRole(effectiveRole);
      setUserId(res.data.id);
      localStorage.setItem('userId', res.data.id);
      localStorage.setItem('userRole', effectiveRole);
      localStorage.setItem('userRoles', JSON.stringify(roles));
      localStorage.setItem('providerRole', res.data.provider_role || 'super_master');
      if (res.data.token) localStorage.setItem('token', res.data.token);
      // Solo recordar si es email (evita guardar RUT en hint).
      if (String(form.identifier).includes('@')) rememberLoginEmail(form.identifier);
      navigate(next.path, { replace: true });
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

  const isValid = form.identifier && form.password;

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
            Correo o RUT
          </label>
          <input
            id="login-email"
            name="identifier"
            className="maqgo-input"
            placeholder="tu@correo.cl o 12.345.678-9"
            type="text"
            inputMode="text"
            autoComplete="username"
            value={form.identifier}
            onChange={e => handleIdentifierChange(e.target.value)}
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

          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="maqgo-link"
              onClick={() => {
                clearLocalSession();
                navigate('/login', { replace: true, state: redirectTo ? { redirect: redirectTo } : undefined });
                setError('');
              }}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
            >
              ¿No puedes entrar? Borra la sesión de este dispositivo e intenta otra vez
            </button>
          </p>

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
            onClick={() => navigate('/register', { state: { freshClientRegistration: true } })}
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
