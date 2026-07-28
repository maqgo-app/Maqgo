import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import OtpSixDigitsInput from '../../components/OtpSixDigitsInput';
import BACKEND_URL from '../../utils/api';
import { getActivationErrorMessage } from '../../utils/activationErrors';
import { getHttpErrorMessage } from '../../utils/httpErrors';
import { getDeviceId } from '../../utils/deviceId';
import { establishSession, persistLoginSessionMetadata } from '../../utils/sessionPersistence';

const PREPARE_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 15000;
const OTP_LENGTH = 6;

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function OperatorJoinScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromUrlCode = String(searchParams.get('code') || '').trim().toUpperCase();

  const [code, setCode] = useState(fromUrlCode);
  const [smsCode, setSmsCode] = useState('');
  const [phase, setPhase] = useState('code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [deviceId] = useState(() => getDeviceId());

  useEffect(() => {
    if (fromUrlCode && fromUrlCode !== code) {
      setCode(fromUrlCode);
    }
  }, [fromUrlCode, code]);

  const activationCode = String(code || '').trim().toUpperCase();

  const persistProviderIntent = () => {
    try {
      localStorage.setItem('desiredRole', 'provider');
    } catch {
      /* ignore */
    }
  };

  const completeOperatorSession = (payload) => {
    if (!establishSession(payload)) {
      throw new Error('No pudimos guardar tu sesión. Intenta nuevamente.');
    }
    persistLoginSessionMetadata(payload);
    persistProviderIntent();
    navigate('/operator/home', { replace: true });
  };

  const requestOtpForActivation = async (normalizedCode) => {
    const response = await axios.post(
      `${BACKEND_URL}/api/auth/login-sms/start`,
      {
        activation_code: normalizedCode,
        device_id: deviceId,
        requested_role: 'provider',
      },
      { timeout: REQUEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    return response.data;
  };

  const handleJoinWithCode = async () => {
    if (loading) return;
    if (activationCode.length < 4) {
      setError('Ingresa el código completo');
      setStatusMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setSmsCode('');
    setPhase('sending');
    setStatusMessage('Estamos preparando tu cuenta.');
    persistProviderIntent();

    try {
      try {
        await axios.post(
          `${BACKEND_URL}/api/operators/join`,
          { code: activationCode },
          { timeout: REQUEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        const activationError = getActivationErrorMessage(err);
        if (activationError !== 'Código ya utilizado') {
          throw new Error(activationError);
        }
      }

      const [otpData] = await Promise.all([requestOtpForActivation(activationCode), wait(PREPARE_DELAY_MS)]);
      if (otpData?.token) {
        completeOperatorSession(otpData);
        return;
      }
      setPhase('otp');
      setStatusMessage('Te enviamos un código de verificación por SMS.');
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : getHttpErrorMessage(err, { fallback: 'No pudimos iniciar tu activación. Intenta nuevamente.' });
      setPhase('code');
      setError(message);
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (loading) return;
    if (smsCode.length !== OTP_LENGTH) {
      setError('Ingresa el código SMS completo');
      return;
    }

    setLoading(true);
    setError('');
    setPhase('activating');
    setStatusMessage('Activando tu cuenta...');

    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/auth/login-sms/verify`,
        {
          activation_code: activationCode,
          code: smsCode,
          device_id: deviceId,
          requested_role: 'provider',
        },
        { timeout: REQUEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
      );
      completeOperatorSession(response.data);
    } catch (err) {
      setPhase('otp');
      setStatusMessage('Te enviamos un código de verificación por SMS.');
      setError(getHttpErrorMessage(err, { fallback: 'No pudimos verificar el código. Intenta nuevamente.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setPhase('sending');
    setStatusMessage('Estamos preparando tu cuenta.');

    try {
      const [otpData] = await Promise.all([requestOtpForActivation(activationCode), wait(PREPARE_DELAY_MS)]);
      if (otpData?.token) {
        completeOperatorSession(otpData);
        return;
      }
      setPhase('otp');
      setStatusMessage('Te enviamos un código de verificación por SMS.');
    } catch (err) {
      setPhase('otp');
      setStatusMessage('Te enviamos un código de verificación por SMS.');
      setError(
        getHttpErrorMessage(err, {
          fallback: 'No pudimos reenviar el código. Si el problema continúa, solicita ayuda a tu empresa.',
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen"
        style={{ justifyContent: 'flex-start', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}
      >
        <MaqgoLogo size="small" style={{ marginBottom: 30 }} />

        <h1
          style={{
            color: '#fff',
            fontSize: 24,
            fontWeight: 700,
            textAlign: 'center',
            margin: '0 0 10px',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {phase === 'code'
            ? 'Bienvenido a MAQGO'
            : phase === 'sending'
              ? 'Verificando...'
              : phase === 'otp'
                ? 'Te enviamos un código de verificación por SMS.'
                : 'Activando tu cuenta...'}
        </h1>
        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            textAlign: 'center',
            margin: '0 0 30px',
            lineHeight: 1.5,
          }}
        >
          {phase === 'code'
            ? 'Ingresa tu invitación de empresa'
            : phase === 'sending'
              ? 'Estamos preparando tu cuenta.'
              : phase === 'otp'
                ? 'Ingresa el código SMS para continuar.'
                : 'Un momento mientras terminamos tu acceso.'}
        </p>

        {phase === 'code' ? (
          <div style={{ marginBottom: 20 }}>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(String(e.target.value || '').toUpperCase().slice(0, 6));
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && activationCode.length >= 4 && !loading) {
                  handleJoinWithCode();
                }
              }}
              placeholder="CÓDIGO"
              maxLength={6}
              style={{
                width: '100%',
                padding: '18px 20px',
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'center',
                letterSpacing: 8,
                background: '#2A2A2A',
                border: error ? '2px solid #ff6b6b' : '2px solid #444',
                borderRadius: 12,
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              data-testid="invite-code-input"
            />
          </div>
        ) : null}

        {phase === 'otp' ? (
          <div style={{ marginBottom: 20, width: '100%' }}>
            <OtpSixDigitsInput
              id="operator-enrollment-otp"
              value={smsCode}
              onChange={(next) => {
                setSmsCode(next);
                if (error) setError('');
              }}
              disabled={loading}
              data-testid="operator-otp-input"
              aria-label="Código SMS"
            />
          </div>
        ) : null}

        {phase === 'sending' || phase === 'activating' ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <span
              style={{
                width: 32,
                height: 32,
                border: '3px solid rgba(236,104,25,0.25)',
                borderTopColor: 'var(--maqgo-orange)',
                borderRadius: '50%',
                animation: 'maqgo-spin 0.8s linear infinite',
              }}
            />
          </div>
        ) : null}

        {statusMessage ? (
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>
            {statusMessage}
          </p>
        ) : null}

        {error ? (
          <div
            style={{
              background: 'rgba(244,67,54,0.15)',
              border: '1px solid rgba(244,67,54,0.35)',
              borderRadius: 12,
              padding: '14px 16px',
              color: '#ffb4b4',
              fontSize: 14,
              lineHeight: 1.4,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : null}

        {phase === 'code' ? (
          <button
            className="maqgo-btn-primary"
            onClick={handleJoinWithCode}
            disabled={loading || activationCode.length < 4}
            style={{ opacity: activationCode.length < 4 ? 0.5 : 1 }}
            data-testid="validate-code-btn"
          >
            {loading ? 'Verificando...' : 'Continuar'}
          </button>
        ) : null}

        {phase === 'otp' ? (
          <>
            <button
              className="maqgo-btn-primary"
              onClick={handleVerifyOtp}
              disabled={loading || smsCode.length !== OTP_LENGTH}
              style={{ opacity: smsCode.length !== OTP_LENGTH ? 0.5 : 1 }}
              data-testid="verify-otp-btn"
            >
              {loading ? 'Activando...' : 'Verificar'}
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 13,
                textDecoration: 'underline',
                marginTop: 16,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              ¿No recibiste el código?
            </button>
          </>
        ) : null}

        {phase === 'code' ? (
          <div style={{ marginTop: 30, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0 }}>
              ¿No tienes código? Pídelo a tu empresa
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default OperatorJoinScreen;
