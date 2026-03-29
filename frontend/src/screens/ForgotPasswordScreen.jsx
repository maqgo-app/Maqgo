import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import PasswordField from '../components/PasswordField';
import BACKEND_URL from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';
import { validatePassword, PASSWORD_RULES } from '../utils/passwordValidation';

const PASSWORD_HELPER = 'Mínimo 8 caracteres. Letras y números.';

/** Celular chileno: 8 dígitos después del 9 (mismo criterio que backend). */
function buildCelularNational(eightDigits) {
  const d = String(eightDigits || '').replace(/\D/g, '').slice(0, 8);
  if (d.length !== 8) return '';
  return `9${d}`;
}

function isValidEmailLoose(email) {
  const s = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const phoneInputRef = useRef(null);
  const otpRef = useRef(null);
  const requestCodeInFlightRef = useRef(false);

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [phoneLocalDigits, setPhoneLocalDigits] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [didSubmit, setDidSubmit] = useState(false);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => emailRef.current?.focus(), 0);
    } else {
      setTimeout(() => otpRef.current?.focus(), 0);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 2) return;
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({
        otp: { transport: ['sms'] },
        signal: ac.signal,
      })
      .then((otp) => {
        if (!otp?.code) return;
        const digits = String(otp.code).replace(/\D/g, '').slice(0, 6);
        if (digits.length === 6) setCode(digits);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [step]);

  const applyPastedOtp = (text) => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  };

  const requestCode = async () => {
    if (requestCodeInFlightRef.current) return;
    setDidSubmit(true);
    const em = email.trim();
    const cel = buildCelularNational(phoneLocalDigits);
    if (!em) {
      setError('Ingresa tu correo registrado.');
      setMessage('');
      setTimeout(() => emailRef.current?.focus(), 0);
      return;
    }
    if (!isValidEmailLoose(em)) {
      setError('Revisa el formato del correo.');
      setMessage('');
      setTimeout(() => emailRef.current?.focus(), 0);
      return;
    }
    if (!cel) {
      setError('Ingresa los 8 dígitos de tu celular.');
      setMessage('');
      setTimeout(() => phoneInputRef.current?.focus(), 0);
      return;
    }
    requestCodeInFlightRef.current = true;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: em.toLowerCase(),
        celular: cel,
      });
      const ok = res.data?.success !== false && res.data?.requires_channel_selection !== true;
      if (ok) {
        setMaskedPhone(res.data?.masked_phone || res.data?.masked?.sms || '');
        setCode('');
        setStep(2);
        setTimeout(() => otpRef.current?.focus(), 50);
      } else {
        setMessage('');
        setError(
          String(res.data?.message || '').trim() ||
            'No pudimos enviar el código. Intenta de nuevo en unos minutos.'
        );
      }
    } catch (e) {
      const status = e.response?.status;
      setMessage('');
      if (status === 404) {
        setError('No encontramos una cuenta con esos datos. Revisa correo y celular.');
      } else {
        setError(
          getHttpErrorMessage(e, {
            fallback: 'No se pudo enviar el código. Intenta de nuevo.',
          })
        );
      }
      setTimeout(() => emailRef.current?.focus(), 0);
    } finally {
      requestCodeInFlightRef.current = false;
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setDidSubmit(true);
    const em = email.trim();
    const cel = buildCelularNational(phoneLocalDigits);
    if (!em || !cel) {
      setError('Vuelve al paso anterior y completa correo y celular.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: em.toLowerCase(),
        celular: cel,
      });
      if (res.data?.success === false) {
        setError(String(res.data?.message || '').trim() || 'No pudimos reenviar el código.');
        setMessage('');
        return;
      }
      setCode('');
      setMessage('Te enviamos un código nuevo.');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No se pudo reenviar el código. Intenta de nuevo.',
        })
      );
      setTimeout(() => otpRef.current?.focus(), 0);
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    setDidSubmit(true);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('El código debe tener 6 dígitos.');
      setMessage('');
      setTimeout(() => otpRef.current?.focus(), 0);
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError('Completa la nueva contraseña en ambos campos.');
      setMessage('');
      setTimeout(() => otpRef.current?.focus(), 0);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      setMessage('');
      return;
    }
    const pwdErr = validatePassword(newPassword, PASSWORD_HELPER);
    if (pwdErr) {
      setError(pwdErr);
      setMessage('');
      return;
    }
    const em = email.trim().toLowerCase();
    const cel = buildCelularNational(phoneLocalDigits);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/confirm`, {
        email: em,
        celular: cel,
        code: digits,
        new_password: newPassword,
      });
      setMessage(res.data?.message || 'Contraseña actualizada correctamente');
      setTimeout(() => navigate('/login'), 1200);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No se pudo actualizar la contraseña. Revisa el código e intenta de nuevo.',
        })
      );
      setTimeout(() => otpRef.current?.focus(), 0);
    } finally {
      setLoading(false);
    }
  };

  const muted = 'rgba(255,255,255,0.72)';
  const headingStyle = { color: '#fff', fontSize: 22, textAlign: 'center', marginBottom: 8 };
  const subStyle = { color: muted, fontSize: 14, textAlign: 'center', marginBottom: 18, lineHeight: 1.45 };
  const stepBadgeStyle = {
    display: 'inline-block',
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: '#EC6819',
    marginBottom: 10,
    textTransform: 'uppercase',
  };
  const sectionTitle = { color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: 600, marginBottom: 6 };

  const screenPaddingBottom = step === 2 ? '132px' : '168px';

  return (
    <div className="maqgo-app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        className="maqgo-screen"
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: `var(--maqgo-screen-padding-top, 24px) 24px ${screenPaddingBottom}`,
          justifyContent: 'flex-start',
        }}
      >
        <MaqgoLogo size="small" style={{ marginBottom: 16 }} />

        {didSubmit && (error || message) ? (
          <div
            style={{
              background: error ? 'rgba(239, 68, 68, 0.12)' : 'rgba(46, 204, 113, 0.12)',
              border: error
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : '1px solid rgba(46, 204, 113, 0.35)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 14,
            }}
            role="status"
            aria-live="polite"
            data-testid="forgot-feedback"
          >
            <p style={{ margin: 0, color: '#fff', fontSize: 13, lineHeight: 1.45 }}>{error || message}</p>
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <span style={stepBadgeStyle}>Paso 1 de 2</span>
            </div>
            <h2 style={headingStyle}>Restablecer contraseña</h2>
            <p style={subStyle}>
              Ingresa tu correo y celular registrados. Te enviaremos un código por SMS para continuar.
            </p>

            <label htmlFor="forgot-email" style={{ ...sectionTitle, display: 'block' }}>
              Correo
            </label>
            <input
              id="forgot-email"
              className="maqgo-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@correo.cl"
              autoComplete="email"
              data-testid="forgot-email"
              ref={emailRef}
            />

            <label htmlFor="forgot-phone-local" style={{ ...sectionTitle, display: 'block', marginTop: 14 }}>
              Celular
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  userSelect: 'none',
                }}
                aria-hidden
              >
                +56 9
              </span>
              <input
                id="forgot-phone-local"
                className="maqgo-input"
                type="text"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={8}
                value={phoneLocalDigits}
                onChange={(e) => setPhoneLocalDigits(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
                style={{ flex: 1, minWidth: 140 }}
                data-testid="forgot-phone-local"
                ref={phoneInputRef}
              />
            </div>
            <p style={{ color: muted, fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
              Solo los 8 dígitos después del 9.
            </p>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <span style={stepBadgeStyle}>Paso 2 de 2</span>
            </div>
            <h2 style={{ ...headingStyle, marginBottom: 6 }}>Verifica tu código</h2>
            <p style={{ ...subStyle, marginBottom: 12 }}>
              Ingresa el código de 6 dígitos que enviamos a tu celular y define tu nueva contraseña.
            </p>

            <label htmlFor="forgot-otp-code" style={{ ...sectionTitle, display: 'block' }}>
              Código
            </label>
            <input
              id="forgot-otp-code"
              name="one-time-code"
              className="maqgo-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onPaste={(e) => {
                e.preventDefault();
                applyPastedOtp(e.clipboardData.getData('text'));
              }}
              placeholder="000000"
              data-testid="forgot-otp"
              ref={otpRef}
            />

            <label htmlFor="forgot-password-new" style={{ ...sectionTitle, display: 'block', marginTop: 12 }}>
              Nueva contraseña
            </label>
            <p style={{ color: muted, fontSize: 12, marginBottom: 6 }}>{PASSWORD_HELPER}</p>
            <PasswordField
              id="forgot-password-new"
              name="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña"
              autoComplete="new-password"
              style={{ marginBottom: 12 }}
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
              data-testid="forgot-new-password"
            />
            <label htmlFor="forgot-password-confirm" style={{ ...sectionTitle, display: 'block' }}>
              Confirmar contraseña
            </label>
            <PasswordField
              id="forgot-password-confirm"
              name="confirm-new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
              data-testid="forgot-confirm-password"
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => {
                  setStep(1);
                  setCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setMaskedPhone('');
                  setMessage('');
                  setError('');
                }}
                style={{ flex: 1, minWidth: 120, padding: '10px 12px', fontSize: 13 }}
                disabled={loading}
              >
                Cambiar datos
              </button>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={resendCode}
                style={{ flex: 1, minWidth: 120, padding: '10px 12px', fontSize: 13 }}
                disabled={loading}
                data-testid="forgot-resend"
              >
                {loading ? 'Enviando...' : 'Reenviar código'}
              </button>
            </div>
            {!!maskedPhone && (
              <p style={{ color: muted, fontSize: 11, marginTop: 10, textAlign: 'center' }}>{maskedPhone}</p>
            )}
          </>
        )}
      </div>

      <div className="maqgo-fixed-bottom-bar">
        {step === 1 ? (
          <button
            type="button"
            className="maqgo-btn-primary"
            onClick={requestCode}
            disabled={
              loading ||
              !email.trim() ||
              !isValidEmailLoose(email.trim()) ||
              buildCelularNational(phoneLocalDigits).length !== 9
            }
            style={{ width: '100%' }}
            data-testid="forgot-request-code"
          >
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        ) : (
          <button
            type="button"
            className="maqgo-btn-primary"
            onClick={confirmReset}
            disabled={
              loading ||
              code.replace(/\D/g, '').length !== 6 ||
              !newPassword ||
              !confirmPassword
            }
            style={{ width: '100%' }}
            data-testid="forgot-confirm-reset"
          >
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        )}
        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/login')}
          style={{ marginTop: 10, width: '100%' }}
          data-testid="forgot-back-login"
        >
          Volver al login
        </button>
      </div>
    </div>
  );
}

export default ForgotPasswordScreen;
