import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BackToPortadaButton from '../../components/BackToPortadaButton';
import LoginPhoneChileInput from '../../components/LoginPhoneChileInput';
import OtpSixDigitsInput from '../../components/OtpSixDigitsInput';
import PasswordField from '../../components/PasswordField';
import { validateEmail, validateCelularChile } from '../../utils/chileanValidation';
import { useToast } from '../../components/Toast';
import { getPasswordHint, validatePassword, PASSWORD_RULES } from '../../utils/passwordValidation';
import BACKEND_URL from '../../utils/api';
import { submitBecomeProviderMinimal, getBecomeProviderUrlForLogs } from '../../utils/providerBecomeApi';
import { establishSession, persistLoginSessionMetadata } from '../../utils/sessionPersistence';
import { useAuth } from '../../context/authHooks';
import { getDeviceId } from '../../utils/deviceId';
import { formatHttpErrorWithStatus, getHttpErrorMessage } from '../../utils/httpErrors';
import {
  buildOtpDecisionUser,
  OTP_INTENT_PROVIDER_SIGNUP,
  canSkipSmsForProviderSignup,
} from '../../utils/otpDecision';
import {
  getUserAuthState,
  logProviderFlowState,
  logProviderFlowDecision,
  isProviderAccountInStorage,
  isOperatorAccountInStorage,
} from '../../utils/userAuthState';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
import { isAdminRoleStored } from '../../utils/welcomeHome';
import { ROUTES } from '../../constants';

const DRAFT_KEY = 'providerRegisterDraft';

/** Auditable: sesión + OTP + destino (rol no decide autenticación). */
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

/** OTP/registro: primera petición tras despertar la API (p. ej. Railway) puede superar 20s. */
const AUTH_FLOW_TIMEOUT_MS = 60000;
const JSON_POST = {
  timeout: AUTH_FLOW_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' }
};

/** API canónica; en www a veces falla solo directo o solo mismo origen (rewrite). */
const MAQGO_API_ORIGIN = 'https://api.maqgo.cl';

/** Sesión JWT sin SMS: celular ya verificado en MAQGO (backend existente; no usa login-sms/start). */
function providerRegisterEstablishSessionUrl(base) {
  const b = String(base ?? '').replace(/\/+$/, '');
  return `${b}/api/auth/provider-register/establish-session`;
}

/** Reintento otro transporte en prod www si no hay respuesta HTTP. */
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
    console.warn('PROVIDER_API_RETRY alternate_transport', {
      failedUrl: firstErr.config?.url || primary,
      to: alternate || '(same-origin /api)',
    });
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

/**
 * Registro proveedor en 3 pasos: celular → OTP → cuenta mínima (correo + contraseña).
 * Datos de empresa, máquina, banco, etc. van en onboarding progresivo (/provider/data…).
 */
function ProviderRegisterScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  /** Igual que LoginScreen tras login-sms: LS + AuthContext alineados (Bearer + become-provider). */
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
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [step, setStep] = useState('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [form, setForm] = useState({
    /** Opcional; nombre para mostrar. Empresa/RUT van después en /provider/data. */
    nombreMostrar: '',
    password: ''
  });
  const [accepted, setAccepted] = useState(false);
  /** True si el alta puede marcar phone_preverified: OTP reciente en Redis o cuenta con celular ya verificado. */
  const [phonePreverified, setPhonePreverified] = useState(false);
  /** UX: saltamos SMS porque el número ya estaba verificado en MAQGO (p. ej. cliente). */
  const [skipOtpBecauseAccountVerified, setSkipOtpBecauseAccountVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);
  const [errors, setErrors] = useState({
    nombreMostrar: '',
    email: '',
    celular: '',
    password: ''
  });
  /** Error global del POST become-provider (toast se va; esto queda visible). */
  const [submitError, setSubmitError] = useState('');
  /** Depuración temporal: detalle crudo del API (quitar cuando estabilice). */
  const [submitErrorDebug, setSubmitErrorDebug] = useState('');
  const passwordHint = getPasswordHint(false);
  /** Evita doble POST /login-sms/start por doble clic o condiciones de carrera. */
  const smsStartInFlightRef = useRef(false);

  const celularStorage = phoneDigits.replace(/\D/g, '').slice(-9);

  /**
   * Sesión existente: cliente → step:details sin SMS; proveedor/onboarding → ruta correcta (no /login).
   * Sin sesión: no tocar (draft + teléfono/OTP normales).
   */
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
    const last9 = state.phone;
    if (last9) {
      setPhoneDigits(last9);
      setPhonePreverified(true);
      setSkipOtpBecauseAccountVerified(true);
      setStep('details');
      try {
        localStorage.setItem('desiredRole', 'provider');
        localStorage.setItem('providerCameFromWelcome', 'true');
      } catch {
        /* ignore */
      }
      logProviderFlowState(getUserAuthState(), 'details');
    } else {
      logProviderFlowState(state, 'mount');
    }
  }, [navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      const state = getUserAuthState();

      if (state.hasSession && !isProviderAccountInStorage() && !isOperatorAccountInStorage()) {
        setTimeout(() => {
          if (draft.form) {
            setForm((p) => ({
              ...p,
              ...draft.form,
              nombreMostrar:
                draft.form.nombreMostrar ?? draft.form.nombreCompleto ?? p.nombreMostrar ?? '',
            }));
          }
          if (typeof draft.accepted === 'boolean') setAccepted(draft.accepted);
        }, 0);
        return;
      }

      if (!state.hasSession) {
        setTimeout(() => {
          if (draft.phoneDigits) setPhoneDigits(draft.phoneDigits);
          if (draft.form) {
            setForm((p) => ({
              ...p,
              ...draft.form,
              nombreMostrar:
                draft.form.nombreMostrar ?? draft.form.nombreCompleto ?? p.nombreMostrar ?? '',
            }));
          }
          if (typeof draft.accepted === 'boolean') setAccepted(draft.accepted);
          if (draft.step === 'otp' || draft.step === 'details') setStep(draft.step);
          if (typeof draft.phonePreverified === 'boolean') setPhonePreverified(draft.phonePreverified);
          if (typeof draft.skipOtpBecauseAccountVerified === 'boolean') {
            setSkipOtpBecauseAccountVerified(draft.skipOtpBecauseAccountVerified);
          }
        }, 0);
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
          form,
          accepted,
          phonePreverified,
          skipOtpBecauseAccountVerified,
        })
      );
    } catch {
      /* ignore */
    }
  }, [step, phoneDigits, form, accepted, phonePreverified, skipOtpBecauseAccountVerified]);

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) window.clearInterval(resendTimerRef.current);
    };
  }, []);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
    setSubmitError('');
    setSubmitErrorDebug('');
  };

  /**
   * Único punto de entrada teléfono → POST /auth/login-sms/start (mismo criterio que LoginScreen).
   * 1 request por clic; sin reintentos automáticos ni segunda llamada encadenada (evita loops).
   */
  const handlePhoneSubmit = useCallback(
    async (phone) => {
      const nine = String(phone ?? phoneDigits ?? '')
        .replace(/\D/g, '')
        .slice(-9);
      if (!/^9\d{8}$/.test(nine)) {
        setErrors((e) => ({ ...e, celular: 'Ingresa un celular válido (9XXXXXXXX)' }));
        return;
      }
      const authSnapshot = getUserAuthState();
      const samePhone = Boolean(authSnapshot.phone && nine === authSnapshot.phone);
      const deviceTrusted = authSnapshot.deviceTrusted;

      setLoading(true);
      setErrors((e) => ({ ...e, celular: '' }));
      setSubmitError('');
      let acquiredSmsStart = false;
      try {
        const user = buildOtpDecisionUser();
        const otpContext = {
          enteredPhoneLast9: nine,
          intent: OTP_INTENT_PROVIDER_SIGNUP,
          sessionExpired: searchParams.get('expired') === '1',
          riskSignals: {},
        };
        const device = { trusted: authSnapshot.deviceTrusted };
        if (canSkipSmsForProviderSignup(user, device, otpContext)) {
          logProviderFlowDecision({
            hasSession: authSnapshot.hasSession,
            samePhone,
            deviceTrusted,
            decision: 'no-sms-session',
          });
          let rolesSkip = [];
          try {
            rolesSkip = JSON.parse(localStorage.getItem('userRoles') || '[]');
            if (!Array.isArray(rolesSkip)) rolesSkip = [];
          } catch {
            rolesSkip = [];
          }
          logProviderUnifiedFlow({
            requiresOTP: false,
            roles: rolesSkip,
            destination: 'step:details',
            decision: 'details',
          });
          try {
            localStorage.setItem('desiredRole', 'provider');
            localStorage.setItem('providerCameFromWelcome', 'true');
          } catch {
            /* ignore */
          }
          setPhonePreverified(true);
          setSkipOtpBecauseAccountVerified(true);
          setStep('details');
          setOtpCode('');
          toast.success(
            'Continúa con tus datos y contraseña para crear tu perfil de proveedor.'
          );
          return;
        }

        // Sin JWT pero mismo celular guardado + dispositivo conocido: JWT vía establish-session (sin SMS), no login-sms/start.
        if (!authSnapshot.hasSession && samePhone && deviceTrusted) {
          try {
            const esRes = await postWithTransportRetry(
              providerRegisterEstablishSessionUrl,
              { celular: `+56${nine}` },
              {}
            );
            const esData = esRes.data || {};
            if (esData.token && establishSession(esData)) {
              const enriched = {
                ...esData,
                role: 'client',
                roles:
                  Array.isArray(esData.roles) && esData.roles.length ? esData.roles : ['client'],
                phone: `+56${nine}`,
              };
              persistLoginSessionMetadata(enriched);
              afterSmsSessionEstablished(enriched);
              logProviderFlowDecision({
                hasSession: false,
                samePhone,
                deviceTrusted,
                decision: 'no-sms-trusted-device',
              });
              try {
                localStorage.setItem('desiredRole', 'provider');
                localStorage.setItem('providerCameFromWelcome', 'true');
              } catch {
                /* ignore */
              }
              setPhonePreverified(true);
              setSkipOtpBecauseAccountVerified(true);
              setStep('details');
              setOtpCode('');
              toast.success(
                'Continúa con tus datos y contraseña para crear tu perfil de proveedor.'
              );
              logProviderUnifiedFlow({
                requiresOTP: false,
                roles: enriched.roles,
                destination: 'step:details',
                decision: 'no-sms-trusted-device',
              });
              return;
            }
          } catch {
            logProviderFlowDecision({
              hasSession: false,
              samePhone,
              deviceTrusted,
              decision: 'establish-session-fallback-sms',
            });
          }
        }

        logProviderFlowDecision({
          hasSession: authSnapshot.hasSession,
          samePhone,
          deviceTrusted,
          decision: 'sms',
        });

        if (smsStartInFlightRef.current) {
          setLoading(false);
          return;
        }
        smsStartInFlightRef.current = true;
        acquiredSmsStart = true;

        const celular = `+56${nine}`;
        const res = await postWithTransportRetry(
          (base) => `${String(base ?? '').replace(/\/+$/, '')}/api/auth/login-sms/start`,
          { celular, device_id: getDeviceId() },
          {}
        );
        const data = res.data || {};
        const ro = data.requires_otp;
        const roles = Array.isArray(data.roles) ? data.roles : [];
        const hasToken = Boolean(data.token);

        // Misma regla que LoginScreen: solo trusted = token + requires_otp explícitamente false.
        if (hasToken && ro === false) {
          if (!establishSession(data)) {
            const msg = 'No se pudo guardar la sesión. Intenta de nuevo.';
            setErrors((e) => ({ ...e, celular: msg }));
            toast.error(msg);
            logProviderUnifiedFlow({ requiresOTP: false, roles, destination: 'error:no-session' });
            return;
          }
          afterSmsSessionEstablished(data);
          logProviderUnifiedFlow({
            requiresOTP: false,
            roles,
            destination: 'step:details',
            decision: 'details',
          });
          try {
            localStorage.setItem('desiredRole', 'provider');
            localStorage.setItem('providerCameFromWelcome', 'true');
          } catch {
            /* ignore */
          }
          setPhonePreverified(true);
          setSkipOtpBecauseAccountVerified(true);
          setStep('details');
          setOtpCode('');
          toast.success(
            'Sesión lista. Completa tus datos y contraseña para crear tu perfil de proveedor.'
          );
          return;
        }

        // Sin token = SMS/correo enviado → paso OTP (no exigir requires_otp === true: proxies/json raros).
        if (!hasToken) {
          logProviderUnifiedFlow({
            requiresOTP: true,
            roles,
            destination: 'step:otp',
            decision: 'sms',
          });
          setPhonePreverified(false);
          setSkipOtpBecauseAccountVerified(false);
          setStep('otp');
          setOtpCode('');
          const hint = typeof data.message === 'string' ? data.message.trim() : '';
          if (hint) toast.success(hint);
          return;
        }

        // Token pero no cumple trusted (ro !== false): intentar sesión y detalles (defensa).
        if (!establishSession(data)) {
          const msg = 'No se pudo guardar la sesión. Intenta de nuevo.';
          setErrors((e) => ({ ...e, celular: msg }));
          toast.error(msg);
          logProviderUnifiedFlow({ requiresOTP: false, roles, destination: 'error:no-session' });
          return;
        }
        afterSmsSessionEstablished(data);
        logProviderUnifiedFlow({
          requiresOTP: false,
          roles,
          destination: 'step:details',
          decision: 'details',
        });
        try {
          localStorage.setItem('desiredRole', 'provider');
          localStorage.setItem('providerCameFromWelcome', 'true');
        } catch {
          /* ignore */
        }
        setPhonePreverified(true);
        setSkipOtpBecauseAccountVerified(true);
        setStep('details');
        setOtpCode('');
        toast.success('Sesión lista. Completa tus datos y contraseña para crear tu perfil de proveedor.');
      } catch (err) {
        const msg = getHttpErrorMessage(err, {
          fallback: 'No pudimos continuar. Intenta nuevamente.',
          statusMessages: {
            502: 'No pudimos enviarte el código. Intenta nuevamente.',
            429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
          },
        });
        setErrors((e) => ({ ...e, celular: msg }));
        toast.error(msg);
      } finally {
        if (acquiredSmsStart) {
          smsStartInFlightRef.current = false;
        }
        setLoading(false);
      }
    },
    [phoneDigits, toast, searchParams, afterSmsSessionEstablished]
  );

  const resendLoginSms = useCallback(async () => {
    const nine = String(phoneDigits || '').replace(/\D/g, '').slice(-9);
    if (!/^9\d{8}$/.test(nine)) return;
    setLoading(true);
    try {
      const res = await postWithTransportRetry(
        (base) => `${String(base ?? '').replace(/\/+$/, '')}/api/auth/login-sms/start`,
        { celular: `+56${nine}`, device_id: getDeviceId() },
        {}
      );
      const data = res.data || {};
      const roles = Array.isArray(data.roles) ? data.roles : [];
      if (data.requires_otp === false && data.token) {
        if (!establishSession(data)) {
          toast.error('No se pudo guardar la sesión.');
          logProviderUnifiedFlow({
            requiresOTP: false,
            roles,
            destination: 'error:no-session',
          });
          return;
        }
        afterSmsSessionEstablished(data);
        logProviderUnifiedFlow({
          requiresOTP: false,
          roles,
          destination: 'step:details',
          decision: 'details',
        });
        setPhonePreverified(true);
        setSkipOtpBecauseAccountVerified(true);
        setStep('details');
        toast.success('Sesión lista. Completa tus datos y contraseña para crear tu perfil de proveedor.');
        return;
      }
      const hint = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : 'Te enviamos un nuevo código.';
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
  }, [phoneDigits, toast, afterSmsSessionEstablished]);

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
          {
            celular: `+56${nine}`,
            code,
            device_id: getDeviceId(),
          },
          {}
        );
        const data = vres.data || {};
        const roVerify = data.requires_otp !== undefined ? data.requires_otp : false;
        if (!establishSession(data)) {
          toast.error('No se pudo iniciar sesión con el código. Intenta de nuevo o solicita otro SMS.');
          setOtpCode('');
          logProviderUnifiedFlow({
            requiresOTP: Boolean(roVerify),
            roles: Array.isArray(data.roles) ? data.roles : [],
            destination: 'error:no-session',
          });
          return;
        }
        afterSmsSessionEstablished(data);
        const roles = Array.isArray(data.roles) ? data.roles : [];
        logProviderUnifiedFlow({
          requiresOTP: false,
          roles,
          destination: 'step:details',
          decision: 'details',
        });
        setPhonePreverified(true);
        setSkipOtpBecauseAccountVerified(false);
        setStep('details');
        setOtpCode(code);
        toast.success('Código verificado. Completa tus datos y contraseña para tu perfil de proveedor.');
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
    [otpCode, phoneDigits, toast, afterSmsSessionEstablished]
  );

  const handleSubmitRegister = async () => {
    if (!accepted) return;
    const nm = String(form.nombreMostrar || '').trim();
    const celularErr = validateCelularChile(celularStorage);
    const passwordErr = validatePassword(form.password, passwordHint);
    let nombreErr = '';
    if (nm.length > 120) {
      nombreErr = 'Usa un texto más corto (máx. 120 caracteres).';
    }
    if (celularErr || passwordErr || nombreErr) {
      setErrors({
        nombreMostrar: nombreErr,
        celular: celularErr,
        password: passwordErr
      });
      return;
    }
    setErrors({ nombreMostrar: '', celular: '', password: '' });
    setSubmitError('');
    setSubmitErrorDebug('');
    setLoading(true);

    const profilePayload = {
      celular: celularStorage,
      password: form.password,
      nombreMostrar: nm,
    };
    const endpointUsed = getBecomeProviderUrlForLogs();
    console.log('PROVIDER_SUBMIT_PAYLOAD', profilePayload);
    console.log('PROVIDER_SUBMIT_ENDPOINT', endpointUsed);

    try {
      const res = await submitBecomeProviderMinimal(profilePayload);
      console.log('PROVIDER_RESPONSE', { status: res.status, data: res.data });
      if (res.data?.id) {
        localStorage.setItem('userId', res.data.id);
      }
      if (Array.isArray(res.data?.roles) && res.data.roles.length) {
        try {
          localStorage.setItem('userRoles', JSON.stringify(res.data.roles));
          if (res.data.roles.includes('provider')) {
            localStorage.setItem('userRole', 'provider');
          }
        } catch {
          /* ignore */
        }
      }

      localStorage.setItem(
        'registerData',
        JSON.stringify({
          nombreMostrar: nm,
          email: emailTrim,
          celular: celularStorage,
          password: form.password,
          role: 'provider'
        })
      );

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }

      try {
        localStorage.setItem('phoneVerified', 'true');
      } catch {
        /* ignore */
      }
      const uidOut = String(res.data?.id || localStorage.getItem('userId') || '');
      if (uidOut && res.data?.roles?.includes('provider')) {
        login(uidOut, 'provider', 'super_master', null);
      }

      const redirectTarget =
        typeof location.state?.redirect === 'string' ? location.state.redirect.trim() : '';
      if (redirectTarget.startsWith('/provider/')) {
        if (!res.data?.already_provider && redirectTarget.includes('add-machine')) {
          try {
            sessionStorage.setItem('machineFirstFlow', '1');
          } catch {
            /* ignore */
          }
        }
        navigate(redirectTarget, { replace: true });
        return;
      }

      if (res.data?.already_provider) {
        toast.success('Tu cuenta ya tenía rol de proveedor. ¡Bienvenido de nuevo!');
        navigate(getProviderLandingPath(), { replace: true });
      } else {
        toast.success('Cuenta lista. Completa los datos de tu empresa en los siguientes pasos.');
        navigate(getProviderLandingPath(), { replace: true });
      }
    } catch (e) {
      console.error('PROVIDER_ERROR_RAW', {
        status: e.response?.status,
        data: e.response?.data,
        message: e.message,
        code: e.code,
      });
      console.error('PROVIDER_REGISTER_ERROR:', {
        status: e.response?.status,
        data: e.response?.data,
        message: e.message,
        code: e.code,
        requestUrl: e.config?.url,
        baseURL: e.config?.baseURL,
      });
      if (e.code === 'NO_SESSION') {
        const msg = e.message || 'Sesión requerida.';
        setSubmitError(msg);
        setSubmitErrorDebug(msg);
        toast.error(msg);
        return;
      }
      const rawDbg =
        (typeof e.response?.data?.detail === 'string' && e.response.data.detail) ||
        (e.response?.data && JSON.stringify(e.response.data)) ||
        e.message ||
        'error desconocido';
      setSubmitErrorDebug(rawDbg);
      const status = e.response?.status;
      const data = e.response?.data;
      const detail = data?.detail;

      const mapValidationRowsToErrors = (rows) => {
        const next = { nombreMostrar: '', email: '', celular: '', password: '' };
        if (!Array.isArray(rows)) return null;
        for (const row of rows) {
          const last = row.loc && row.loc[row.loc.length - 1];
          const text = typeof row.msg === 'string' ? row.msg : '';
          if (last === 'password') next.password = text;
          else if (last === 'email') next.email = text;
          else if (last === 'celular') next.celular = text;
          else if (last === 'nombre' || last === 'apellido') next.nombreMostrar = text || next.nombreMostrar;
        }
        if (next.password || next.email || next.celular || next.nombreMostrar) return next;
        return null;
      };

      if ((status === 422 || status === 400) && Array.isArray(detail)) {
        const mapped = mapValidationRowsToErrors(detail);
        if (mapped) {
          setErrors((prev) => ({ ...prev, ...mapped }));
          setSubmitError('');
          setSubmitErrorDebug('');
          return;
        }
        const firstFlat = detail
          .map((row) => (row && typeof row.msg === 'string' ? row.msg.trim() : ''))
          .find((m) => m);
        if (firstFlat) {
          setSubmitError(firstFlat);
          setSubmitErrorDebug('');
          toast.error(firstFlat);
          return;
        }
      }

      if (status === 409) {
        const msg =
          typeof detail === 'string' && detail.trim()
            ? detail.trim()
            : 'Este correo o cuenta ya está registrado. Inicia sesión o usa otro correo.';
        setSubmitError(msg);
        toast.error(msg);
        return;
      }

      if (typeof detail === 'string' && detail.trim()) {
        const d = detail.trim();
        if (/contraseña|cuenta maqgo|password/i.test(d)) {
          setErrors((prev) => ({ ...prev, password: d }));
          setSubmitError('');
          setSubmitErrorDebug('');
          return;
        }
        if (/correo|email|registrad/i.test(d)) {
          setErrors((prev) => ({ ...prev, email: d }));
          setSubmitError('');
          setSubmitErrorDebug('');
          return;
        }
        if (/celular|teléfono|número/i.test(d)) {
          setErrors((prev) => ({ ...prev, celular: d }));
          setSubmitError('');
          setSubmitErrorDebug('');
          return;
        }
        if (status === 404 || /^not found$/i.test(d)) {
          const msg = getHttpErrorMessage(e, {
            preferDetail: false,
            fallback: 'El registro no está disponible (404). Actualiza la página o vuelve a intentar en unos minutos.',
            statusMessages: {
              404:
                'El registro no está disponible (404). Actualiza la página o vuelve a intentar en unos minutos.',
              429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
            },
          });
          setSubmitError(msg);
          toast.error(msg);
          return;
        }
        setSubmitError(d);
        toast.error(d);
        return;
      }

      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const nested =
          typeof detail.msg === 'string'
            ? detail.msg
            : typeof detail.message === 'string'
              ? detail.message
              : '';
        if (nested.trim()) {
          setSubmitError(nested.trim());
          toast.error(nested.trim());
          return;
        }
      }

      if (Array.isArray(detail)) {
        const pwdErr = detail.find((m) => m.loc && m.loc[m.loc.length - 1] === 'password');
        if (pwdErr?.msg) {
          setErrors((prev) => ({ ...prev, password: pwdErr.msg || passwordHint }));
          setSubmitError('');
          setSubmitErrorDebug('');
          return;
        }
      }

      const fallbackMsg = !e.response
        ? `Sin respuesta HTTP (${e.code || 'red'}). ${e.message || ''}${
            e.PROVIDER_REGISTER_ALSO_FAILED
              ? ' (Se probó api.maqgo.cl y mismo origen /api; revisa consola.)'
              : ''
          }`.trim()
        : formatHttpErrorWithStatus(e) ||
          getHttpErrorMessage(e, {
            fallback:
              status === 400
                ? 'Revisa los datos ingresados.'
                : status === 422
                  ? 'Revisa el formato de los datos.'
                  : 'Error desconocido',
            preferDetail: true,
            statusMessages: {
              404:
                'No pudimos completar el registro (servicio no encontrado). Actualiza la página o intenta en unos minutos.',
              429: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
            },
          });
      setSubmitError(fallbackMsg);
      toast.error(fallbackMsg);
    } finally {
      setLoading(false);
    }
  };

  const isPhoneValid = /^9\d{8}$/.test(String(phoneDigits || '').replace(/\D/g, ''));
  const otpDigits = String(otpCode || '').replace(/\D/g, '').slice(0, 6);
  const isOtpValid = otpDigits.length === 6;
  const pwdErrLive = validatePassword(form.password, passwordHint);
  const isDetailsValid =
    !pwdErrLive &&
    celularStorage.length === 9 &&
    accepted;

  const detailsBlockers = [];
  if (step === 'details') {
    if (pwdErrLive) detailsBlockers.push('Contraseña (8–12 caracteres, letras y números)');
    if (celularStorage.length !== 9) detailsBlockers.push('Celular verificado');
    if (!accepted) detailsBlockers.push('Aceptar términos y política de privacidad');
  }

  const goBackToPhone = () => {
    setStep('phone');
    setOtpCode('');
    setPhonePreverified(false);
    setSkipOtpBecauseAccountVerified(false);
  };

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
                textAlign: 'center'
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
                lineHeight: 1.45
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
                display: 'block'
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
                if (errors.celular) setErrors((e) => ({ ...e, celular: '' }));
              }}
              ariaLabel="Nueve dígitos del celular, empezando con 9"
            />
            {errors.celular ? (
              <p style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>{errors.celular}</p>
            ) : null}
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 12, lineHeight: 1.4 }}>
              Si tu celular ya está verificado en MAQGO, solo correo y contraseña de proveedor. Si no,
              te enviaremos un código SMS; empresa, máquina y banco los completas después en el panel.
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
                marginBottom: 10
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
                lineHeight: 1.45
              }}
            >
              Ingresa el código enviado a {maskPhone9(phoneDigits)}
            </p>
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
                  textDecoration: 'underline'
                }}
              >
                ¿Número incorrecto?
              </button>
            </p>
            <label
              htmlFor="provider-reg-otp"
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: 13,
                marginBottom: 6,
                display: 'block'
              }}
            >
              Código SMS
            </label>
            <OtpSixDigitsInput
              key="provider-reg-otp"
              id="provider-reg-otp"
              name="code"
              value={otpDigits}
              onChange={(d) => {
                setOtpCode(d);
              }}
              onComplete={verifyOtpAndContinue}
              aria-label="Código SMS de 6 dígitos"
              data-testid="provider-register-otp"
            />
            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="maqgo-link"
                disabled={loading || resendCooldown > 0}
                onClick={() => resendLoginSms()}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: resendCooldown > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(144, 189, 211, 0.95)',
                  fontSize: 13,
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
              </button>
            </p>
          </>
        )}

        {step === 'details' && (
          <>
            <h2
              style={{
                color: '#fff',
                fontSize: 22,
                fontWeight: 600,
                textAlign: 'center',
                marginBottom: 8
              }}
            >
              Tu cuenta de proveedor
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.65)',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 22,
                lineHeight: 1.45
              }}
            >
              {skipOtpBecauseAccountVerified
                ? 'Este número ya estaba verificado en tu cuenta MAQGO. Solo elige correo y contraseña de acceso; los datos de empresa los completas después.'
                : `Celular verificado: ${maskPhone9(phoneDigits)}. Correo y contraseña para tu perfil proveedor; el resto es progresivo.`}
            </p>

            {submitError || submitErrorDebug ? (
              <>
                <p
                  role="alert"
                  style={{
                    color: '#f44336',
                    fontSize: 13,
                    textAlign: 'center',
                    marginBottom: 10,
                    lineHeight: 1.45,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(244, 67, 54, 0.12)',
                    border: '1px solid rgba(244, 67, 54, 0.35)',
                  }}
                >
                  {submitError ||
                    submitErrorDebug ||
                    'error desconocido'}
                </p>
                {/Sin respuesta HTTP|ECONNABORTED|timeout|failed to fetch|Network Error/i.test(
                  submitError || submitErrorDebug || ''
                ) ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.55)',
                      textAlign: 'center',
                      marginBottom: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    Abre la consola del navegador y busca <code style={{ color: 'rgba(255,255,255,0.75)' }}>PROVIDER_REGISTER_ERROR</code> para ver el status y el cuerpo del API. Prueba otra red (WiFi o datos) o desactiva VPN.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ width: '100%', marginBottom: 16 }}
                  disabled={loading || !isDetailsValid}
                  onClick={() => handleSubmitRegister()}
                >
                  Reintentar envío
                </button>
              </>
            ) : null}

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
              Nombre para mostrar <span style={{ color: 'rgba(255,255,255,0.45)' }}>(opcional)</span>
            </label>
            <input
              className="maqgo-input"
              placeholder="Ej: Juan o tu marca"
              value={form.nombreMostrar}
              onChange={(e) => update('nombreMostrar', e.target.value)}
              style={{ marginBottom: 6 }}
              name="name"
              autoComplete="name"
            />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.35 }}>
              Puedes dejarlo vacío y definir razón social más adelante.
            </p>
            {errors.nombreMostrar ? (
              <p style={{ color: '#f44336', fontSize: 12, marginTop: -6, marginBottom: 8 }}>{errors.nombreMostrar}</p>
            ) : null}

            <label
              htmlFor="provider-register-password"
              style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
            >
              {skipOtpBecauseAccountVerified ? (
                <>
                  Contraseña de tu cuenta MAQGO <span style={{ color: '#EC6819' }}>*</span>
                </>
              ) : (
                <>
                  Contraseña <span style={{ color: '#EC6819' }}>*</span>
                </>
              )}
            </label>
            <PasswordField
              id="provider-register-password"
              name={skipOtpBecauseAccountVerified ? 'password' : 'new-password'}
              placeholder="Letras y números, 8–12 caracteres"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              style={{ marginBottom: errors.password ? 8 : 12 }}
              error={Boolean(errors.password)}
              autoComplete={skipOtpBecauseAccountVerified ? 'current-password' : 'new-password'}
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
            />
            {errors.password ? <p style={{ color: '#f44336', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.password}</p> : null}
            {skipOtpBecauseAccountVerified ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: -4, marginBottom: 12, lineHeight: 1.35 }}>
                Usa la misma contraseña con la que inicias sesión; así confirmamos que eres tú.
              </p>
            ) : null}

            <div className="maqgo-checkbox-row">
              <div
                className={`maqgo-checkbox ${accepted ? 'checked' : ''}`}
                onClick={() => {
                  setAccepted(!accepted);
                  setSubmitError('');
                }}
                role="checkbox"
                aria-checked={accepted}
              >
                {accepted && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M2 6L4.5 8.5L10 3"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="maqgo-checkbox-label">
                Acepto los{' '}
                <button
                  type="button"
                  className="maqgo-link"
                  onClick={() => navigate('/terms')}
                  style={{ padding: 0, border: 'none', background: 'none', font: 'inherit', cursor: 'pointer' }}
                >
                  Términos y condiciones
                </button>
                <br />
                y la{' '}
                <button
                  type="button"
                  className="maqgo-link"
                  onClick={() => navigate('/privacy')}
                  style={{ padding: 0, border: 'none', background: 'none', font: 'inherit', cursor: 'pointer' }}
                >
                  Política de privacidad
                </button>
              </span>
            </div>
          </>
        )}

        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={() => {
            if (step === 'phone') handlePhoneSubmit(phoneDigits);
            else if (step === 'otp') verifyOtpAndContinue();
            else handleSubmitRegister();
          }}
          disabled={
            loading ||
            (step === 'phone' && !isPhoneValid) ||
            (step === 'otp' && !isOtpValid) ||
            (step === 'details' && !isDetailsValid)
          }
          style={{
            opacity:
              step === 'phone'
                ? isPhoneValid
                  ? 1
                  : 0.5
                : step === 'otp'
                  ? isOtpValid
                    ? 1
                    : 0.5
                  : isDetailsValid
                    ? 1
                    : 0.5,
            marginTop: 8
          }}
          aria-label={
            loading
              ? 'Cargando'
              : step === 'phone'
                ? 'Continuar'
                : step === 'otp'
                  ? 'Verificar código'
                  : 'Crear cuenta de proveedor'
          }
        >
          {loading
            ? 'Cargando...'
            : step === 'phone'
              ? 'Continuar'
              : step === 'otp'
                ? 'Verificar código'
                : 'Crear cuenta'}
        </button>

        {step === 'details' && !loading && !isDetailsValid && detailsBlockers.length > 0 ? (
          <p
            id="provider-reg-details-hint"
            role="status"
            style={{
              color: 'rgba(255,200,160,0.95)',
              fontSize: 12,
              marginTop: 14,
              lineHeight: 1.45,
              textAlign: 'center',
              maxWidth: 320,
              alignSelf: 'center',
            }}
          >
            Para activar el botón: {detailsBlockers.join(' · ')}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default ProviderRegisterScreen;
