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
import { getProviderLandingPath, getProviderOnboardingNextPath } from '../utils/providerOnboardingStatus';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';
import { peekReturnUrl } from '../utils/registrationReturn';
import { fetchAndHydrateProviderOnboardingDraft } from '../utils/providerOnboardingDraft';

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
 * - Cliente: celular + código SMS.
 * - Proveedor: celular + código SMS.
 * - Admin: acceso exclusivo en /admin.
 * OTP SMS (6 dígitos) cuando step==='otp'. Único flujo OTP unificado (no /verify-sms legacy).
 */
function LoginScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = location.state?.redirect || null;
  /** Quién abrió login: cliente desde welcome vs proveedor/admin (muestra acceso correo+clave). */
  const entry = location.state?.entry;
  const activationCode = location.state?.activationCode || null;

  const desiredRoleStored = (() => {
    try {
      return localStorage.getItem('desiredRole') || '';
    } catch {
      return '';
    }
  })();

  const returnUrlStored = (() => {
    try {
      return peekReturnUrl() || '';
    } catch {
      return '';
    }
  })();

  const inferredEntry =
    entry ||
    (redirectTo && redirectTo.startsWith('/provider')
      ? 'provider'
      : redirectTo && redirectTo.startsWith('/client')
        ? 'client'
        : desiredRoleStored === 'provider'
          ? 'provider'
          : desiredRoleStored === 'client'
            ? 'client'
            : returnUrlStored && returnUrlStored.startsWith('/provider')
              ? 'provider'
              : returnUrlStored && returnUrlStored.startsWith('/client')
                ? 'client'
                : null);

  const isClientEntry = inferredEntry === 'client';
  const isProviderEntry = inferredEntry === 'provider';

  const [step, setStep] = useState('phone'); // 'phone' | 'otp'

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessReview, setAccessReview] = useState(null);
  /** Mensaje informativo (no error) tras enviar código: p. ej. canal email si SMS falló en backend */
  const [otpHint, setOtpHint] = useState('');
  /**
   * Política MAQGO: Login público solo por SMS OTP.
   * El panel admin tiene login propio en /admin.
   */
  const [hasPersistedSession, setHasPersistedSession] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (step !== 'phone') return;
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (!token || !userId) return;
    handleStartLogin();
  }, [loading, step]);

  /** Precarga el celular en modo SMS (cliente): siempre hace falta OTP; evita reescribir el mismo número tras enrolar. */
  useEffect(() => {
    setPhone((prev) => {
      const cur = String(prev || '').replace(/\D/g, '');
      if (cur.length > 0) return prev;
      return getHydratedPhoneDigitsFromStorage() || prev;
    });
  }, []);

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
    const desiredRole = localStorage.getItem('desiredRole');
    const entryRole = location.state?.entry;
    const storedRole = localStorage.getItem('userRole');
    const storedRoles = (() => {
      try {
        const raw = localStorage.getItem('userRoles');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const intentRole = (desiredRole || entryRole || '').trim() || null;
    // Solo cuentas con rol admin van al panel; redirect=/admin sin rol admin debe mostrar login (otra cuenta).
    if (isAdminRoleStored()) {
      navigate('/admin', { replace: true });
      return;
    }
    const hasValidStoredRole = Boolean(storedRole && storedRoles.includes(storedRole));
    if (!intentRole && !redirectTo && storedRoles.includes('client') && storedRoles.includes('provider') && !hasValidStoredRole) {
      navigate('/welcome', { replace: true });
      return;
    }
    if (!storedRole && intentRole && storedRoles.includes(intentRole)) {
      localStorage.setItem('userRole', intentRole);
      setUserRole(intentRole);
    }

    const role = localStorage.getItem('userRole') || '';
    if (role === 'client') {
      const target =
        redirectTo && redirectTo.startsWith('/client') ? redirectTo : '/client/home';
      navigate(target, { replace: true });
      return;
    }
    const raw =
      redirectTo && redirectTo.startsWith('/provider') ? redirectTo : getProviderLandingPath();
    navigate(normalizeProviderPostLoginRedirect(raw), { replace: true });
  }, [navigate, redirectTo, searchParams, location.state, setUserRole]);

  const applySessionAndNavigate = async (data, options = {}) => {
    const authSource = options.authSource || 'unknown';
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
    const desiredRole = localStorage.getItem('desiredRole');
    const entryRole = location.state?.entry;
    const intentRole = (desiredRole || entryRole || '').trim() || null;
    const previouslySelectedRole = localStorage.getItem('userRole');
    let effectiveRole = null;
    
    const hasValidPreviouslySelectedRole = Boolean(previouslySelectedRole && roles.includes(previouslySelectedRole));
    if (!intentRole && !redirectTo && roles.includes('client') && roles.includes('provider') && !hasValidPreviouslySelectedRole) {
      setUserId(uid);
      localStorage.setItem('userId', String(uid || ''));
      localStorage.setItem('userRoles', JSON.stringify(roles));
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
      localStorage.removeItem('desiredRole');
      navigate('/welcome', { replace: true });
      return true;
    }

    if (intentRole && roles.includes(intentRole)) {
      effectiveRole = intentRole;
    } else if (previouslySelectedRole && roles.includes(previouslySelectedRole)) {
      effectiveRole = previouslySelectedRole;
    } else if (redirectTo) {
      if (redirectTo.startsWith('/admin') && (data.role === 'admin' || roles.includes('admin'))) effectiveRole = 'admin';
      else if (redirectTo.startsWith('/provider') && roles.includes('provider')) effectiveRole = 'provider';
      else if (redirectTo.startsWith('/client') && roles.includes('client')) effectiveRole = 'client';
    } else if (roles.length === 1) {
      effectiveRole = roles[0];
    }

    localStorage.removeItem('desiredRole');
    
    // Si nada de lo anterior aplica, usamos el rol por defecto del backend
    if (!effectiveRole) {
      effectiveRole = String(data.role || '').trim();
    }

    // Fallback final si no hay rol definido
    if (!effectiveRole && roles.length > 0) {
      effectiveRole = roles.includes('provider') ? 'provider' : roles[0];
    }
    if (!effectiveRole) effectiveRole = 'client';

    const isAdmin = effectiveRole === 'admin';
    const mustChangePassword = isAdmin && Boolean(data.must_change_password);
    const providerRole = roles.includes('provider')
      ? String(data.provider_role || '').trim() || 'super_master'
      : null;
    const next = getPostLoginNavigation({
      isAdmin,
      effectiveRole,
      providerRole,
      redirectTo,
    });
    if (next.kind === 'error_not_admin') {
      setError(
        'Esta cuenta no tiene acceso al panel de administración. Inicia sesión en /admin con una cuenta admin.'
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
    if (typeof data.has_password === 'boolean') {
      localStorage.setItem('hasPassword', data.has_password ? '1' : '0');
    } else {
      localStorage.removeItem('hasPassword');
    }
    if (mustChangePassword) {
      localStorage.setItem('adminMustChangePassword', '1');
    } else {
      localStorage.removeItem('adminMustChangePassword');
    }
    
    console.log("LOGIN SUCCESS - ROLE STORED IN LOCALSTORAGE:", localStorage.getItem('userRole'));
    if (roles.includes('provider')) {
      localStorage.setItem('providerRole', providerRole || 'super_master');
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
    if (intentRole === 'provider' && !roles.includes('provider')) {
      navigate('/provider/register', { replace: true, state: { entry: 'provider' } });
      return true;
    }
    if (mustChangePassword) {
      navigate('/admin/change-password', { replace: true });
      return true;
    }
    const providerRoleNormalized = String(providerRole || '').trim();
    const shouldResumeProviderOnboarding =
      providerRoleNormalized !== 'operator' && providerRoleNormalized !== 'master';
    if (next.path === '/provider/home' && effectiveRole === 'provider' && shouldResumeProviderOnboarding) {
      try {
        await fetchAndHydrateProviderOnboardingDraft(uid);
        const pending = getProviderOnboardingNextPath();
        if (pending && pending !== '/provider/home') {
          navigate(pending, { replace: true });
          return true;
        }
      } catch {
        void 0;
      }
    }
    navigate(next.path, { replace: true });
    return true;
  };

  const handleStartLogin = async () => {
    if (loading) return;
    const existingToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (existingToken && userId) {
      const storedRole = localStorage.getItem('userRole');
      const storedRoles = (() => {
        try {
          const raw = localStorage.getItem('userRoles');
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      // Sesión persistente: reutilizar navegación sin pedir OTP.
      const isAdminStored = isAdminRoleStored();
      if (isAdminStored) {
        if (localStorage.getItem('adminMustChangePassword') === '1') {
          navigate('/admin/change-password', { replace: true });
          return;
        }
        navigate('/admin', { replace: true });
        return;
      }
      const desiredRole = localStorage.getItem('desiredRole');
      const entryRole = location.state?.entry;
      const intentRole = (desiredRole || entryRole || '').trim() || null;
      const hasValidStoredRole = Boolean(storedRole && storedRoles.includes(storedRole));
      if (!intentRole && !redirectTo && storedRoles.includes('client') && storedRoles.includes('provider') && !hasValidStoredRole) {
        navigate('/welcome', { replace: true });
        return;
      }
      if (!storedRole && storedRoles.length === 1) {
        const r = String(storedRoles[0] || '').trim();
        if (r) {
          localStorage.setItem('userRole', r);
          setUserRole(r);
        }
      }
      const role = localStorage.getItem('userRole') || '';
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
    const requestedRole =
      localStorage.getItem('desiredRole') ||
      location.state?.entry ||
      null;
    setLoading(true);
    setError('');
      setAccessReview(null);
    setOtpHint('');

    try {
      const celular = `+56${nine}`;
      const deviceId = getDeviceId();
      const res = await axios.post(
        `${BACKEND_URL}/api/auth/login-sms/start`,
        {
          celular,
          device_id: deviceId,
          ...(requestedRole ? { requested_role: requestedRole } : {}),
          ...(activationCode ? { activation_code: activationCode } : {}),
        },
        {
          timeout: LOGIN_SMS_START_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const result = res.data;
      // UI del botón en paso teléfono: "Comprobando..." (no "enviando código"), porque aquí el backend
      // puede devolver sesión sin SMS (requires_otp false) si el número/dispositivo ya es confiable.

      if (result?.requires_otp === false && result?.token) {
      await applySessionAndNavigate(result, { logSmsTrustedRouting: true, authSource: 'sms' });
        return;
      }

      const hint =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : '';
      setOtpHint(hint);
      setStep('otp');
    } catch (e) {
      const st = e?.response?.status;
      const detail = e?.response?.data?.detail;
      const errCode = typeof detail === 'object' && detail ? String(detail.error || '') : '';
      const needsReview =
        (st === 423 && errCode === 'phone_blocked') ||
        (st === 429 && errCode === 'temporary_lock') ||
        (st === 403 && errCode === 'inactive_user_requires_review');
      if (needsReview) {
        setAccessReview({
          reason: st === 423 ? 'phone_blocked' : st === 429 ? 'temporary_lock' : 'inactive_user',
          requestedRole: requestedRole || '',
        });
      }
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No pudimos enviarte el código. Intenta nuevamente.',
          networkUnavailableMessage:
            'Sin conexión con el servidor. Revisa tu internet, desactiva VPN/Private DNS si aplica, o prueba con datos móviles.',
          statusMessages: {
            404:
              'Inicio de sesión por celular no disponible (404). Revisa conexión, actualiza la página o confirma que la API en producción incluya login por SMS.',
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
    const requestedRole = localStorage.getItem('desiredRole') || location.state?.entry || null;
    setLoading(true);
    setError('');
    setAccessReview(null);

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
        ...(requestedRole ? { requested_role: requestedRole } : {}),
        ...(activationCode ? { activation_code: activationCode } : {}),
      };
      const res = await axios.post(`${BACKEND_URL}/api/auth/login-sms/verify`, payload, {
        timeout: LOGIN_SMS_VERIFY_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.data?.requires_password) {
        setError('Este acceso requiere contraseña, pero MAQGO solo permite ingreso por código SMS.');
        return;
      }

      await applySessionAndNavigate(res.data, { authSource: 'sms' });
    } catch (e) {
      const st = e?.response?.status;
      const detail = e?.response?.data?.detail;
      const errCode = typeof detail === 'object' && detail ? String(detail.error || '') : '';
      const needsReview =
        (st === 423 && errCode === 'phone_blocked') ||
        (st === 429 && errCode === 'temporary_lock') ||
        (st === 403 && errCode === 'inactive_user_requires_review');
      if (needsReview) {
        setAccessReview({
          reason: st === 423 ? 'phone_blocked' : st === 429 ? 'temporary_lock' : 'inactive_user',
          requestedRole: requestedRole || '',
        });
      }
      setError(
        getHttpErrorMessage(e, {
          fallback: 'El código no es correcto. Intenta nuevamente.',
          networkUnavailableMessage:
            'Sin conexión con el servidor. Revisa tu internet, desactiva VPN/Private DNS si aplica, o prueba con datos móviles.',
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
  const goBackToPhone = () => {
    setError('');
    setAccessReview(null);
    setOtpHint('');
    setStep('phone');
    setCode('');
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
        
        {step === 'phone' && (
          <MaqgoLogo size="medium" style={{ marginBottom: 36 }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              background: 'rgba(22, 22, 28, 0.72)',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 999,
              padding: '10px 14px',
              width: '100%',
              maxWidth: 420,
              marginBottom: redirectTo === '/admin' ? 8 : step === 'phone' ? 35 : 20,
              marginTop: step !== 'phone' ? 20 : 0,
            }}
          >
            <h1 className="maqgo-h1" style={{ margin: 0, textAlign: 'center' }}>
              {step === 'otp' ? 'Verificar código' : 'Iniciar sesión'}
            </h1>
          </div>
        </div>
        {redirectTo === '/admin' && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 27 }}>
            Acceso al panel de administración MAQGO
          </p>
        )}

        {/* Formulario */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 'phone') handleStartLogin();
            else if (step === 'otp') handleVerifyCode();
          }}
          style={{ flex: 1 }}
        >
          {step === 'phone' && (
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

          {step === 'otp' && (
            <>
              <p
                className="otp-phone-text"
                style={{
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 16,
                  fontWeight: 500,
                  textAlign: 'center',
                  marginBottom: 8,
                  lineHeight: 1.4,
                }}
              >
                Código enviado al {maskPhone(phone)}
              </p>
              
              <p style={{ textAlign: 'center', marginBottom: 24 }}>
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

              {/* otpHint solo si es un mensaje especial (ej: canal email alternativo) */}
              {otpHint && !otpHint.toLowerCase().includes('sms') && (
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
              )}

              <label
                htmlFor="login-code"
                style={{ 
                  color: 'rgba(255,255,255,0.5)', 
                  fontSize: 12, 
                  marginBottom: 12, 
                  display: 'block',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Ingresa los 6 dígitos
              </label>
              <OtpSixDigitsInput
                key="login-sms-otp"
                id="login-code"
                name="one-time-code"
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

          {accessReview && (
            <div
              data-testid="inactive-user-guide"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '14px 12px',
                marginTop: 14,
              }}
            >
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>
                No pudimos validar tu acceso
              </p>
              <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.45 }}>
                Tu acceso requiere revisión. Si el número está mal escrito, corrígelo. Si es tu número real, solicita revisión y lo revisamos.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={goBackToPhone}
                  style={{
                    flex: '1 1 160px',
                    padding: 12,
                    background: '#EC6819',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Corregir número
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const rr = accessReview?.requestedRole || entry || null;
                    navigate(`/support/access?reason=${encodeURIComponent(accessReview?.reason || 'inactive_user')}`, {
                      state: { reason: accessReview?.reason || 'inactive_user', requestedRole: rr, prefillPhoneDigits: phone || getHydratedPhoneDigitsFromStorage() },
                    });
                  }}
                  style={{
                    flex: '1 1 160px',
                    padding: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Solicitar revisión
                </button>
              </div>
            </div>
          )}

          {hasPersistedSession && (
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
                ¿Problemas para entrar? Reinicia tu sesión en este dispositivo
              </button>
            </p>
          )}
        </form>

        <div className="maqgo-funnel-split-footer" role="region" aria-label="Continuar inicio de sesión">
          <button
            className="maqgo-btn-primary"
            type="button"
            onClick={step === 'phone' ? handleStartLogin : handleVerifyCode}
            disabled={loading || (step === 'phone' ? !isPhoneValid : !isCodeValid)}
            style={{
              width: '100%',
              opacity: loading || (step === 'phone' ? !isPhoneValid : !isCodeValid) ? 0.5 : 1,
            }}
          >
            {loading
              ? step === 'phone'
                ? 'Comprobando...'
                : 'Verificando...'
              : step === 'phone'
                ? 'Continuar con tu celular'
                : 'Confirmar código'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default LoginScreen;
