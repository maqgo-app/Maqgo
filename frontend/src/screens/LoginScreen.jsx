/**
 * STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
 *
 * UI: teléfono = LoginPhoneChileInput (un input + +56). OTP = OtpSixDigitsInput (6 cajas). No mezclar patrones.
 * Política OTP (identidad ≠ rol): `.cursor/rules/otp-single-source-of-truth-maqgo.mdc` + `utils/otpDecision.js`.
 */
import React, { useState, useLayoutEffect, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import BackToPortadaButton from '../components/BackToPortadaButton';
import LoginPhoneChileInput from '../components/LoginPhoneChileInput';
import OtpSixDigitsInput from '../components/OtpSixDigitsInput';
import PasswordField from '../components/PasswordField';
import BACKEND_URL, { clearLocalSession } from '../utils/api';
import { establishSession } from '../utils/sessionPersistence';
import { getDeviceId } from '../utils/deviceId';
import { getHttpErrorMessage } from '../utils/httpErrors';
import { getObject } from '../utils/safeStorage';
import { isAdminRoleStored } from '../utils/welcomeHome';
import {
  getPostLoginNavigation,
  normalizeProviderPostLoginRedirect,
} from '../utils/postLoginNavigation';
import { getProviderLandingPath } from '../utils/providerOnboardingStatus';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/** OTP (Redis + LabsMobile): 30s evita cortar antes que el backend; sin reintentos (evita SMS duplicado). */
const LOGIN_SMS_START_TIMEOUT_MS = 30000;
const LOGIN_SMS_VERIFY_TIMEOUT_MS = 20000;

function formatPhoneCL(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length < 9) return String(phone || '');

  const last9 = digits.slice(-9);

  const p1 = last9.slice(0, 1);
  const p2 = last9.slice(1, 5);
  const p3 = last9.slice(5, 9);

  return `+56 ${p1} ${p2} ${p3}`;
}

/** Enmascara los últimos 2 dígitos del número chileno (ej. +56 9 1234 56XX). */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9) return formatPhoneCL(phone);
  const last9 = digits.slice(-9);
  const p1 = last9.slice(0, 1);
  const p2 = last9.slice(1, 5);
  const p3 = last9.slice(5, 9);
  const p3masked = `${p3.slice(0, 2)}XX`;
  return `+56 ${p1} ${p2} ${p3masked}`;
}

/** 9 dígitos nacionales (9XXXXXXXX) desde cualquier formato guardado. */
function parseStoredChileMobileDigits(raw) {
  if (raw == null || raw === '') return '';
  const d = String(raw).replace(/\D/g, '');
  const last9 = d.length >= 9 ? d.slice(-9) : '';
  return /^9\d{8}$/.test(last9) ? last9 : '';
}

/** Último celular conocido: sesión previa (`userPhone`) o registro OTP (`registerData.celular`). */
function getHydratedPhoneDigitsFromStorage() {
  try {
    const fromSession = parseStoredChileMobileDigits(localStorage.getItem('userPhone'));
    if (fromSession) return fromSession;
    const reg = getObject('registerData', {});
    return parseStoredChileMobileDigits(reg?.celular);
  } catch {
    return '';
  }
}

/**
 * Pantalla C8 - Login
 *
 * - Cliente: celular + código SMS (identidad principal); no el registro “correo + clave” de proveedor.
 * - Proveedor: inscripción con SMS + correo + contraseña; acceso con correo/clave ese perfil. Admin: correo + clave en panel.
 * OTP SMS (6 dígitos) cuando step==='otp'. Único flujo OTP unificado (no /verify-sms legacy).
 */
function LoginScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = location.state?.redirect || null;
  /** Quién abrió login: cliente desde welcome vs proveedor/admin (muestra acceso correo+clave). */
  const entry = location.state?.entry;
  /**
   * Siempre visible: desde Welcome, "Iniciar sesión" entra como cliente (SMS). Quien se enroló como proveedor
   * usa "Entrar con correo y contraseña". Deep links (admin, /provider/…) siguen siendo válidos.
   */
  const showEmailPasswordToggle = true;

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Mensaje informativo (no error) tras enviar código: p. ej. canal email si SMS falló en backend */
  const [otpHint, setOtpHint] = useState('');
  /** 'sms' = cliente u otro vía celular; 'email' = proveedor (u cuenta con clave) → POST /api/auth/login */
  const [loginMode, setLoginMode] = useState('sms');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hasPersistedSession, setHasPersistedSession] = useState(false);

  useEffect(() => {
    if (!showEmailPasswordToggle && loginMode === 'email') {
      setLoginMode('sms');
      setEmail('');
      setPassword('');
      setError('');
    }
  }, [showEmailPasswordToggle, loginMode]);

  /** Precarga el celular en modo SMS (cliente): siempre hace falta OTP; evita reescribir el mismo número tras enrolar. */
  useEffect(() => {
    if (showEmailPasswordToggle && loginMode === 'email') return;
    if (loginMode !== 'sms') return;
    setPhone((prev) => {
      const cur = String(prev || '').replace(/\D/g, '');
      if (cur.length > 0) return prev;
      return getHydratedPhoneDigitsFromStorage() || prev;
    });
  }, [showEmailPasswordToggle, loginMode]);

  useLayoutEffect(() => {
    try {
      setHasPersistedSession(
        Boolean(
          (localStorage.getItem('authToken') || localStorage.getItem('token')) &&
            localStorage.getItem('userId')
        )
      );
    } catch {
      setHasPersistedSession(false);
    }
  }, []);

  // Sesión ya válida: no mostrar login (móvil/navegador “recuerda” al usuario).
  // reauth=1 | expired=1 | state.allowReauth: limpia sesión y normaliza URL (evita token residual + bucle de efecto).
  useLayoutEffect(() => {
    const forceReauth =
      searchParams.get('reauth') === '1' ||
      searchParams.get('expired') === '1' ||
      location.state?.allowReauth === true;
    if (forceReauth) {
      clearLocalSession();
      traceRedirectToLogin('src/screens/LoginScreen.jsx (useLayoutEffect forceReauth)');
      navigate('/login', {
        replace: true,
        state: {
          ...(redirectTo ? { redirect: redirectTo } : {}),
          ...(location.state?.entry ? { entry: location.state.entry } : {}),
        },
      });
      return;
    }
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
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
    const raw =
      redirectTo && redirectTo.startsWith('/provider') ? redirectTo : getProviderLandingPath();
    navigate(normalizeProviderPostLoginRedirect(raw), { replace: true });
  }, [navigate, redirectTo, searchParams, location.state]);

  const applySessionAndNavigate = (data, options = {}) => {
    if (!data || !data.token) {
      setError('No se generó sesión. Intenta nuevamente.');
      return false;
    }
    if (!establishSession(data)) {
      setError('No se generó sesión. Intenta nuevamente.');
      return false;
    }
    const uid = data.id ?? data.user_id ?? data.userId ?? localStorage.getItem('userId');
    const roles = Array.isArray(data.roles) ? data.roles : [];
    const previouslySelectedRole = localStorage.getItem('userRole');
    const isAdmin = data.role === 'admin' || roles.includes('admin');
    let effectiveRole = isAdmin ? 'admin' : data.role;

    const dualClientProvider = roles.includes('provider') && roles.includes('client');
    if (!isAdmin && dualClientProvider) {
      if (redirectTo && redirectTo.startsWith('/provider')) {
        effectiveRole = 'provider';
      } else if (redirectTo && redirectTo.startsWith('/client')) {
        effectiveRole = 'client';
      } else {
        const dr = localStorage.getItem('desiredRole');
        if (dr === 'provider') {
          effectiveRole = 'provider';
          localStorage.removeItem('desiredRole');
        } else if (dr === 'client') {
          effectiveRole = 'client';
          localStorage.removeItem('desiredRole');
        } else {
          effectiveRole = data.role;
        }
      }
    } else if (!isAdmin && previouslySelectedRole && roles.includes(previouslySelectedRole)) {
      effectiveRole = previouslySelectedRole;
    }
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
      return false;
    }
    console.log("LOGIN SUCCESS - SETTING ROLE:", effectiveRole);
    console.log("LOGIN SUCCESS - USER ID:", uid);
    console.log("LOGIN SUCCESS - ROLES FROM BACKEND:", roles);
    
    setUserRole(effectiveRole);
    setUserId(uid);
    localStorage.setItem('userRole', effectiveRole);
    localStorage.setItem('userRoles', JSON.stringify(roles));
    
    console.log("LOGIN SUCCESS - ROLE STORED IN LOCALSTORAGE:", localStorage.getItem('userRole'));
    if (roles.includes('provider')) {
      localStorage.setItem('providerRole', data.provider_role || 'super_master');
    } else {
      localStorage.removeItem('providerRole');
    }
    if (data.owner_id) {
      localStorage.setItem('ownerId', data.owner_id);
    } else {
      localStorage.removeItem('ownerId');
    }
    if (data.phone) {
      localStorage.setItem('userPhone', data.phone);
    }
    if (options.logSmsTrustedRouting) {
      const isProvider = roles.includes('provider');
      console.log({
        requires_otp: false,
        isProvider,
        destination: next.path,
      });
    }
    navigate(next.path, { replace: true });
    return true;
  };

  const handleStartLogin = async () => {
    if (loading) return;
    const existingToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('userRole') || 'client';
    if (existingToken && userId) {
      // Sesión persistente: reutilizar navegación sin pedir OTP.
      const isAdminStored = isAdminRoleStored();
      if (isAdminStored) {
        navigate('/admin', { replace: true });
        return;
      }
      if (role === 'client') {
        const target =
          redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/client/home';
        navigate(target, { replace: true });
        return;
      }
      const raw =
        redirectTo && redirectTo.startsWith('/provider') ? redirectTo : getProviderLandingPath();
      navigate(normalizeProviderPostLoginRedirect(raw), { replace: true });
      return;
    }
    const nine = String(phone || '').replace(/\D/g, '');
    if (!/^9\d{8}$/.test(nine)) {
      setError('Ingresa un celular válido (9XXXXXXXX)');
      return;
    }
    setLoading(true);
    setError('');
    setOtpHint('');

    try {
      const celular = `+56${nine}`;
      const deviceId = getDeviceId();

      const res = await axios.post(
        `${BACKEND_URL}/api/auth/login-sms/start`,
        { celular, device_id: deviceId },
        {
          timeout: LOGIN_SMS_START_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const result = res.data;
      // UI del botón en paso teléfono: "Comprobando..." (no "enviando código"), porque aquí el backend
      // puede devolver sesión sin SMS (requires_otp false) si el número/dispositivo ya es confiable.

      if (result?.requires_otp === false && result?.token) {
        applySessionAndNavigate(result, { logSmsTrustedRouting: true });
        return;
      }

      const hint =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : '';
      setOtpHint(hint);
      setStep('otp');
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No pudimos enviarte el código. Intenta nuevamente.',
          statusMessages: {
            404:
              'Inicio de sesión por celular no disponible (404). Revisa conexión, actualiza la página o confirma que la API en producción incluya login por SMS.',
            429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
          },
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async () => {
    if (loading) return;
    const em = email.trim();
    if (!em || !password) {
      setError('Ingresa el correo y la contraseña de tu cuenta proveedor.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/auth/login`,
        { identifier: em, password },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );
      applySessionAndNavigate(res.data);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No pudimos iniciar sesión. Revisa tus datos e intenta de nuevo.',
          statusMessages: {
            401: 'Correo o contraseña incorrectos.',
            429: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
          },
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (digitsOverride) => {
    if (loading) return;
    const digits = String(digitsOverride ?? code ?? '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!phone || digits.length !== 6) return;
    setLoading(true);
    setError('');

    try {
      const nine = String(phone || '').replace(/\D/g, '');
      if (!/^9\d{8}$/.test(nine)) {
        setError('Ingresa un celular válido (9XXXXXXXX)');
        setLoading(false);
        return;
      }
      const deviceId = getDeviceId();
      const payload = {
        celular: `+56${nine}`,
        code: digits,
        device_id: deviceId,
      };
      const res = await axios.post(`${BACKEND_URL}/api/auth/login-sms/verify`, payload, {
        timeout: LOGIN_SMS_VERIFY_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' }
      });
      applySessionAndNavigate(res.data);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'El código no es correcto. Intenta nuevamente.',
          statusMessages: {
            400: 'El código no es correcto. Intenta nuevamente.',
            404:
              'No pudimos validar el código (404). Revisa conexión o que la API esté actualizada.',
          },
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const isPhoneValid = /^9\d{8}$/.test(String(phone || '').replace(/\D/g, ''));
  const codeDigits = String(code || '').replace(/\D/g, '').slice(0, 6);
  const isCodeValid = Boolean(phone && codeDigits.length === 6);
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  const isEmailFormValid = emailLooksValid && password.length >= 1;

  const goBackToPhone = () => {
    setError('');
    setOtpHint('');
    setCode('');
    setStep('phone');
  };

  /** Vuelve a Welcome para cambiar arrendar vs ofrecer sin depender del botón atrás del navegador. */
  const handleBackToWelcome = () => {
    navigate('/welcome', { replace: false });
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll maqgo-funnel-scroll-compact">
        <div className="maqgo-back-portada-wrap">
          <BackToPortadaButton onClick={handleBackToWelcome} />
        </div>
        <MaqgoLogo size="medium" style={{ marginBottom: 36 }} />

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

        {showEmailPasswordToggle && (
          <p style={{ textAlign: 'center', marginBottom: 20 }}>
            <button
              type="button"
              className="maqgo-link"
              onClick={() => {
                setError('');
                setOtpHint('');
                setCode('');
                setStep('phone');
                setEmail('');
                setPassword('');
                setLoginMode((m) => (m === 'sms' ? 'email' : 'sms'));
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'rgba(255,255,255,0.78)',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {loginMode === 'sms'
                ? 'Entrar con correo y contraseña'
                : 'Entrar con celular (código SMS)'}
            </button>
          </p>
        )}

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          {loginMode === 'email' && (
            <>
              <p
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 13,
                  textAlign: 'center',
                  marginBottom: 14,
                  lineHeight: 1.45,
                }}
              >
                {redirectTo === '/admin'
                  ? 'Usa el correo y la clave de tu cuenta de administración.'
                  : 'Solo los proveedores se inscriben con SMS, correo y contraseña. Los clientes entran con celular y código (modo de abajo).'}
              </p>
              <label
                htmlFor="login-email"
                style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
              >
                Correo (cuenta proveedor)
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => {
                  setError('');
                  setEmail(ev.target.value);
                }}
                className="maqgo-input"
                placeholder="tu@correo.cl"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginBottom: 14,
                  padding: '14px 12px',
                  fontSize: 15,
                }}
              />
              <label
                htmlFor="login-password"
                style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
              >
                Contraseña del registro proveedor
              </label>
              <PasswordField
                id="login-password"
                name="password"
                value={password}
                onChange={(ev) => {
                  setError('');
                  setPassword(ev.target.value);
                }}
                autoComplete="current-password"
                placeholder="Tu contraseña"
                style={{ marginBottom: 10 }}
              />
              <p style={{ textAlign: 'right', marginBottom: 8 }}>
                <Link
                  to="/forgot-password"
                  style={{ color: 'rgba(144, 189, 211, 0.95)', fontSize: 13 }}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </p>
            </>
          )}

          {loginMode === 'sms' && step === 'phone' && (
            <>
              <label
                htmlFor="login-phone"
                style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
              >
                Ingresa tu celular
              </label>
              <LoginPhoneChileInput
                id="login-phone"
                name="phone"
                value={phone}
                onDigitsChange={(d) => {
                  setError('');
                  setPhone(d);
                }}
                ariaLabel="Nueve dígitos del celular, empezando con 9"
              />
            </>
          )}

          {loginMode === 'sms' && step === 'otp' && (
            <>
              <p
                className="otp-phone-text"
                style={{
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 14,
                  textAlign: 'center',
                  marginBottom: 10,
                  lineHeight: 1.45,
                }}
              >
                Ingresa el código enviado a {maskPhone(phone)}
              </p>
              {otpHint ? (
                <p
                  style={{
                    color: 'rgba(144, 189, 211, 0.95)',
                    fontSize: 13,
                    textAlign: 'center',
                    marginBottom: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {otpHint}
                </p>
              ) : null}
              <p style={{ textAlign: 'center', marginBottom: 12 }}>
                <button
                  type="button"
                  className="maqgo-link"
                  onClick={goBackToPhone}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: 'rgba(255,255,255,0.65)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  ¿Número incorrecto?
                </button>
              </p>
              <label
                htmlFor="login-code"
                style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
              >
                Código SMS
              </label>
              <OtpSixDigitsInput
                key="login-sms-otp"
                id="login-code"
                name="code"
                value={codeDigits}
                onChange={(d) => {
                  setError('');
                  setCode(d);
                }}
                onComplete={handleVerifyCode}
                aria-label="Código SMS de 6 dígitos"
                data-testid="login-otp-input"
              />
            </>
          )}

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: 14, textAlign: 'center', marginTop: 10 }}>
              {error}
            </p>
          )}

          {loginMode === 'sms' && hasPersistedSession && (
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="maqgo-link"
                onClick={() => {
                  clearLocalSession();
                  setHasPersistedSession(false);
                  setPhone('');
                  setCode('');
                  setOtpHint('');
                  setStep('phone');
                  setEmail('');
                  setPassword('');
                  traceRedirectToLogin('src/screens/LoginScreen.jsx (clear session link)');
                  navigate('/login', {
                    replace: true,
                    state: {
                      ...(redirectTo ? { redirect: redirectTo } : {}),
                      ...(entry ? { entry } : {}),
                    },
                  });
                  setError('');
                }}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
              >
                ¿Problemas para entrar? Borra la sesión en este dispositivo
              </button>
            </p>
          )}
        </div>

        {/* Botón */}
        <button
          className="maqgo-btn-primary"
          onClick={
            loginMode === 'email'
              ? handleEmailPasswordLogin
              : step === 'phone'
                ? handleStartLogin
                : handleVerifyCode
          }
          disabled={
            loading ||
            (loginMode === 'email'
              ? !isEmailFormValid
              : step === 'phone'
                ? !isPhoneValid
                : !isCodeValid)
          }
          style={{
            opacity:
              loading ||
              (loginMode === 'email'
                ? !isEmailFormValid
                : step === 'phone'
                  ? !isPhoneValid
                  : !isCodeValid)
                ? 0.5
                : 1,
            marginBottom: 15,
          }}
          aria-label={
            loading
              ? loginMode === 'email'
                ? 'Iniciando sesión'
                : step === 'phone'
                  ? 'Comprobando tu número'
                  : 'Iniciando sesión'
              : loginMode === 'email'
                ? 'Iniciar sesión proveedor con correo'
                : step === 'phone'
                  ? 'Continuar con tu celular'
                  : 'Confirmar código e ingresar'
          }
        >
          {loading
            ? loginMode === 'email'
              ? 'Iniciando sesión...'
              : step === 'phone'
                ? 'Comprobando...'
                : 'Iniciando sesión...'
            : loginMode === 'email'
              ? 'Entrar'
              : step === 'phone'
                ? 'Continuar'
                : 'Confirmar código'}
        </button>

      </div>
    </div>
  );
}

export default LoginScreen;
