import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BackToPortadaButton from '../../components/BackToPortadaButton';
import LoginPhoneChileInput from '../../components/LoginPhoneChileInput';
import OtpSixDigitsInput from '../../components/OtpSixDigitsInput';
import { useToast } from '../../components/Toast';
import BACKEND_URL from '../../utils/api';
import { establishSession, persistLoginSessionMetadata } from '../../utils/sessionPersistence';
import { useAuth } from '../../context/authHooks';
import { getDeviceId } from '../../utils/deviceId';
import { getHttpErrorMessage } from '../../utils/httpErrors';
import {
  getUserAuthState,
  logProviderFlowState,
  isProviderAccountInStorage,
  isOperatorAccountInStorage,
} from '../../utils/userAuthState';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
import { isAdminRoleStored } from '../../utils/welcomeHome';
import { ROUTES } from '../../constants';

const DRAFT_KEY = 'providerRegisterDraft';
const AUTH_FLOW_TIMEOUT_MS = 60000;
const JSON_POST = {
  timeout: AUTH_FLOW_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
};
const MAQGO_API_ORIGIN = 'https://api.maqgo.cl';

function logProviderUnifiedFlow({ requiresOTP, destination, roles, decision }) {
  const state = getUserAuthState();
  const roleList = Array.isArray(roles) ? roles : [];
  const isProvider = roleList.includes('provider');
  console.log('[MAQGO provider flow]', {
    hasSession: state.hasSession,
    isProvider,
    requiresOTP: Boolean(requiresOTP),
    destination,
  });
  logProviderFlowState(state, decision || (requiresOTP ? 'sms' : 'no-sms'));
}

async function postWithTransportRetry(urlBuilder, payload, extraHeaders = {}) {
  const primary = urlBuilder(BACKEND_URL);
  try {
    return await axios.post(primary, payload, {
      ...JSON_POST,
      headers: { ...JSON_POST.headers, ...extraHeaders },
    });
  } catch (firstErr) {
    if (firstErr.response) throw firstErr;
    const host =
      typeof window !== 'undefined' ? String(window.location.hostname || '').toLowerCase() : '';
    const isMaqgoWww =
      import.meta.env.PROD && (host === 'www.maqgo.cl' || host === 'maqgo.cl');
    if (!isMaqgoWww) throw firstErr;
    const current = String(BACKEND_URL || '').replace(/\/+$/, '');
    const alternate = current === MAQGO_API_ORIGIN ? '' : MAQGO_API_ORIGIN;
    try {
      return await axios.post(urlBuilder(alternate), payload, {
        ...JSON_POST,
        headers: { ...JSON_POST.headers, ...extraHeaders },
      });
    } catch (secondErr) {
      if (secondErr.response) throw secondErr;
      firstErr.PROVIDER_REGISTER_ALSO_FAILED = true;
      throw firstErr;
    }
  }
}

function maskPhone9(nineDigits) {
  const d = String(nineDigits || '').replace(/\D/g, '');
  if (d.length < 9) return '';
  return `+56 ${d.slice(0, 1)} ${d.slice(1, 5)} ${d.slice(5, 9)}`;
}

function resolveProviderNextPath(location) {
  const redirectTarget =
    typeof location?.state?.redirect === 'string' ? location.state.redirect.trim() : '';
  if (redirectTarget.startsWith('/provider/')) return redirectTarget;
  return '/provider/add-machine';
}

function ProviderRegisterScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);
  const [errors, setErrors] = useState({ celular: '' });

  const afterSmsSessionEstablished = useCallback(
    (data) => {
      persistLoginSessionMetadata(data);
      const roles = Array.isArray(data.roles) ? data.roles : [];
      const isAdmin = data.role === 'admin' || roles.includes('admin');
      const uid = String(data.id ?? data.user_id ?? localStorage.getItem('userId') ?? '');
      let effectiveRole = isAdmin ? 'admin' : String(data.role || 'client').trim() || 'client';
      if (!isAdmin && roles.includes('client') && !roles.includes('provider')) {
        effectiveRole = 'client';
      }
      let pr = data.provider_role || 'super_master';
      if (pr === 'owner') pr = 'super_master';
      login(uid, effectiveRole, pr, data.owner_id || null);
    },
    [login]
  );

  const navigateToProviderFlow = useCallback(() => {
    try {
      localStorage.setItem('desiredRole', 'provider');
      localStorage.setItem('providerCameFromWelcome', 'true');
    } catch {
      /* ignore */
    }
    navigate(resolveProviderNextPath(location), { replace: true });
  }, [location, navigate]);

  useLayoutEffect(() => {
    const state = getUserAuthState();
    if (!state.hasSession) {
      logProviderFlowState(state, 'mount');
      return;
    }
    if (isAdminRoleStored()) {
      logProviderFlowState(state, 'redirect-home');
      navigate('/admin', { replace: true });
      return;
    }
    if (isOperatorAccountInStorage()) {
      logProviderFlowState(state, 'redirect-home');
      navigate(ROUTES.OPERATOR_HOME, { replace: true });
      return;
    }
    if (isProviderAccountInStorage()) {
      logProviderFlowState(state, 'redirect-provider-landing');
      navigate(getProviderLandingPath(), { replace: true });
      return;
    }
    if (state.phone) setPhoneDigits(state.phone);
    logProviderFlowState(state, 'redirect-onboarding');
    navigateToProviderFlow();
  }, [navigate, navigateToProviderFlow]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      const state = getUserAuthState();
      if (!state.hasSession) {
        if (draft.phoneDigits) setPhoneDigits(draft.phoneDigits);
        if (draft.step === 'otp') setStep('otp');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          phoneDigits,
        })
      );
    } catch {
      /* ignore */
    }
  }, [step, phoneDigits]);

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) window.clearInterval(resendTimerRef.current);
    };
  }, []);

  const handlePhoneSubmit = useCallback(
    async (phone) => {
      const nine = String(phone ?? phoneDigits ?? '')
        .replace(/\D/g, '')
        .slice(-9);
      if (!/^9\d{8}$/.test(nine)) {
        setErrors({ celular: 'Ingresa un celular válido (9XXXXXXXX)' });
        return;
      }
      setLoading(true);
      setErrors({ celular: '' });
      try {
        const res = await postWithTransportRetry(
          (base) => `${String(base ?? '').replace(/\/+$/, '')}/api/auth/login-sms/start`,
          { celular: `+56${nine}`, device_id: getDeviceId() },
          {}
        );
        const data = res.data || {};
        const roles = Array.isArray(data.roles) ? data.roles : [];
        if (data.token && data.requires_otp === false) {
          if (!establishSession(data)) {
            const msg = 'No se pudo guardar la sesión. Intenta de nuevo.';
            setErrors({ celular: msg });
            toast.error(msg);
            return;
          }
          afterSmsSessionEstablished(data);
          logProviderUnifiedFlow({
            requiresOTP: false,
            roles,
            destination: 'redirect:/provider/add-machine',
            decision: 'details',
          });
          navigateToProviderFlow();
          return;
        }
        logProviderUnifiedFlow({
          requiresOTP: true,
          roles,
          destination: 'step:otp',
          decision: 'sms',
        });
        setStep('otp');
        setOtpCode('');
        const hint = typeof data.message === 'string' ? data.message.trim() : '';
        if (hint) toast.success(hint);
      } catch (err) {
        const msg = getHttpErrorMessage(err, {
          fallback: 'No pudimos continuar. Intenta nuevamente.',
          statusMessages: {
            502: 'No pudimos enviarte el código. Intenta nuevamente.',
            429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
          },
        });
        setErrors({ celular: msg });
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [afterSmsSessionEstablished, navigateToProviderFlow, phoneDigits, toast]
  );

  const resendProviderOtp = useCallback(async () => {
    const nine = String(phoneDigits || '').replace(/\D/g, '').slice(-9);
    if (!/^9\d{8}$/.test(nine)) return;
    setLoading(true);
    try {
      const res = await postWithTransportRetry(
        (base) => `${String(base ?? '').replace(/\/+$/, '')}/api/auth/login-sms/start`,
        { celular: `+56${nine}`, device_id: getDeviceId() }
      );
      const data = res.data || {};
      const roles = Array.isArray(data.roles) ? data.roles : [];
      if (data.token && data.requires_otp === false) {
        if (!establishSession(data)) {
          toast.error('No se pudo guardar la sesión.');
          return;
        }
        afterSmsSessionEstablished(data);
        logProviderUnifiedFlow({
          requiresOTP: false,
          roles,
          destination: 'redirect:/provider/add-machine',
          decision: 'details',
        });
        navigateToProviderFlow();
        return;
      }
      const hint =
        typeof data.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'Te enviamos un nuevo código.';
      toast.success(hint);
      setOtpCode('');
      setResendCooldown(45);
      if (resendTimerRef.current) window.clearInterval(resendTimerRef.current);
      resendTimerRef.current = window.setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) {
            if (resendTimerRef.current) window.clearInterval(resendTimerRef.current);
            resendTimerRef.current = null;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(
        getHttpErrorMessage(err, {
          fallback: 'No pudimos reenviar el código. Intenta nuevamente.',
          statusMessages: { 429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.' },
        })
      );
    } finally {
      setLoading(false);
    }
  }, [afterSmsSessionEstablished, navigateToProviderFlow, phoneDigits, toast]);

  const verifyOtpAndContinue = useCallback(
    async (digitsOverride) => {
      const code = String(digitsOverride ?? otpCode ?? '')
        .replace(/\D/g, '')
        .slice(0, 6);
      const nine = String(phoneDigits || '').replace(/\D/g, '').slice(-9);
      if (!/^9\d{8}$/.test(nine) || code.length !== 6) return;
      setLoading(true);
      try {
        const vres = await postWithTransportRetry(
          (base) => `${String(base ?? '').replace(/\/+$/, '')}/api/auth/login-sms/verify`,
          { celular: `+56${nine}`, code, device_id: getDeviceId() },
          {}
        );
        const data = vres.data || {};
        if (!establishSession(data)) {
          toast.error('No se pudo validar el código. Intenta de nuevo o solicita otro SMS.');
          setOtpCode('');
          return;
        }
        afterSmsSessionEstablished(data);
        const roles = Array.isArray(data.roles) ? data.roles : [];
        logProviderUnifiedFlow({
          requiresOTP: false,
          roles,
          destination: 'redirect:/provider/add-machine',
          decision: 'details',
        });
        toast.success('Código verificado. Continúa con la publicación de tu maquinaria.');
        navigateToProviderFlow();
      } catch (err) {
        toast.error(
          getHttpErrorMessage(err, {
            fallback: 'Código incorrecto o expirado.',
            statusMessages: { 400: 'Código incorrecto o expirado.' },
          })
        );
        setOtpCode('');
      } finally {
        setLoading(false);
      }
    },
    [afterSmsSessionEstablished, navigateToProviderFlow, otpCode, phoneDigits, toast]
  );

  const isPhoneValid = /^9\d{8}$/.test(String(phoneDigits || '').replace(/\D/g, ''));
  const otpDigits = String(otpCode || '').replace(/\D/g, '').slice(0, 6);
  const isOtpValid = otpDigits.length === 6;

  const handleBackToWelcome = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    navigate('/welcome', { replace: false });
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll">
        <div className="maqgo-back-portada-wrap">
          <BackToPortadaButton onClick={handleBackToWelcome} />
        </div>
        <MaqgoLogo size="medium" style={{ marginBottom: step === 'phone' ? 28 : 24 }} />

        {step === 'phone' && (
          <>
            <h1
              style={{
                color: '#fff',
                fontSize: 22,
                fontWeight: 600,
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              Ofrecer mi maquinaria
            </h1>
            <p
              style={{
                color: 'rgba(255,255,255,0.72)',
                fontSize: 14,
                textAlign: 'center',
                margin: '0 0 28px',
                lineHeight: 1.45,
              }}
            >
              Recibe solicitudes de reserva. Tú eliges cuándo aceptar.
            </p>
            <label
              htmlFor="provider-reg-phone"
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: 13,
                marginBottom: 6,
                display: 'block',
              }}
            >
              Tu celular
            </label>
            <LoginPhoneChileInput
              id="provider-reg-phone"
              name="phone"
              value={phoneDigits}
              onDigitsChange={(d) => {
                setPhoneDigits(d);
                if (errors.celular) setErrors({ celular: '' });
              }}
              ariaLabel="Nueve dígitos del celular, empezando con 9"
            />
            {errors.celular ? (
              <p style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>{errors.celular}</p>
            ) : null}
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 12, lineHeight: 1.4 }}>
              El enrolamiento inicial es por OTP SMS, igual que cliente. Luego continúas al registro
              de maquinaria; el correo y contraseña de proveedor se completan al final.
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2
              style={{
                color: '#fff',
                fontSize: 22,
                fontWeight: 600,
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              Código de verificación
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
                textAlign: 'center',
                marginBottom: 10,
                lineHeight: 1.45,
              }}
            >
              Ingresa el código enviado a {maskPhone9(phoneDigits)}
            </p>
            <label
              htmlFor="provider-reg-otp"
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: 13,
                marginBottom: 6,
                display: 'block',
              }}
            >
              Código SMS
            </label>
            <OtpSixDigitsInput
              key="provider-reg-otp"
              id="provider-reg-otp"
              name="code"
              value={otpDigits}
              onChange={(d) => setOtpCode(d)}
              onComplete={verifyOtpAndContinue}
              aria-label="Código SMS de 6 dígitos"
              data-testid="provider-register-otp"
            />
            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="maqgo-link"
                disabled={loading || resendCooldown > 0}
                onClick={() => resendProviderOtp()}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: resendCooldown > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(144, 189, 211, 0.95)',
                  fontSize: 13,
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
              </button>
            </p>
          </>
        )}

        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={() => {
            if (step === 'phone') handlePhoneSubmit(phoneDigits);
            else verifyOtpAndContinue();
          }}
          disabled={loading || (step === 'phone' ? !isPhoneValid : !isOtpValid)}
          style={{
            opacity: loading || (step === 'phone' ? !isPhoneValid : !isOtpValid) ? 0.5 : 1,
            marginTop: 8,
          }}
          aria-label={loading ? 'Cargando' : step === 'phone' ? 'Continuar' : 'Verificar y continuar'}
        >
          {loading ? 'Cargando...' : step === 'phone' ? 'Continuar' : 'Verificar y continuar'}
        </button>
      </div>
    </div>
  );
}

export default ProviderRegisterScreen;
