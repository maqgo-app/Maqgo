import React, { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import LoginPhoneChileInput from '../../components/LoginPhoneChileInput';
import OtpSixDigitsInput from '../../components/OtpSixDigitsInput';
import { useToast } from '../../components/Toast';
import BACKEND_URL from '../../utils/api';
import { useAuth } from '../../context/authHooks';
import { getHttpErrorMessage } from '../../utils/httpErrors';

function ProviderChangePhoneScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { providerRole } = useAuth();
  const [step, setStep] = useState('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState('');

  const phone9 = useMemo(() => String(phoneDigits || '').replace(/\D/g, '').slice(-9), [phoneDigits]);
  const code6 = useMemo(() => String(otpCode || '').replace(/\D/g, '').slice(0, 6), [otpCode]);
  const isPhoneValid = /^9\d{8}$/.test(phone9);
  const isOtpValid = code6.length === 6;

  if (providerRole !== 'super_master') {
    return <Navigate to="/provider/profile" replace />;
  }

  const startChange = async () => {
    setInlineError('');
    if (!isPhoneValid) return;
    setLoading(true);
    try {
      const res = await axios.post(`${String(BACKEND_URL).replace(/\/+$/, '')}/api/auth/me/phone-change/start`, {
        celular: `+56${phone9}`,
      });
      const data = res.data || {};
      if (data.already) {
        toast.success('Este ya es tu celular actual.');
        navigate('/provider/profile', { replace: true });
        return;
      }
      setStep('otp');
      setOtpCode('');
      toast.success(data.reused ? 'Ya enviamos un código. Ingresa el mismo SMS.' : 'Código enviado. Ingresa los 6 dígitos.');
    } catch (e) {
      const msg = getHttpErrorMessage(e, {
        fallback: 'No pudimos enviar el código. Intenta nuevamente.',
        statusMessages: {
          400: 'No pudimos enviar el código. Revisa el número e intenta nuevamente.',
          403: 'Solo el titular puede cambiar el celular.',
          409: 'Este celular ya está asociado a otra cuenta. Solicita ayuda para recuperar acceso.',
          429: 'Demasiados intentos. Espera un momento e intenta nuevamente.',
        },
      });
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyChange = async () => {
    setInlineError('');
    if (!isOtpValid || !isPhoneValid) return;
    setLoading(true);
    try {
      const res = await axios.post(`${String(BACKEND_URL).replace(/\/+$/, '')}/api/auth/me/phone-change/verify`, {
        celular: `+56${phone9}`,
        code: code6,
      });
      const data = res.data || {};
      localStorage.setItem('userPhone', phone9);
      toast.success(data.message || 'Celular actualizado.');
      navigate('/provider/profile', { replace: true });
    } catch (e) {
      const msg = getHttpErrorMessage(e, {
        fallback: 'No pudimos verificar el código. Intenta nuevamente.',
        statusMessages: {
          400: 'Código inválido o expirado. Solicita uno nuevo.',
          403: 'Solo el titular puede cambiar el celular.',
          409: 'Este celular ya está asociado a otra cuenta. Solicita ayuda para recuperar acceso.',
          429: 'Demasiados intentos. Espera un momento e intenta nuevamente.',
        },
      });
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 18 }} />
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Cambiar celular
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginBottom: 22, lineHeight: 1.45 }}>
          Este cambio lo puede hacer solo el Titular. MAQGO enviará un código SMS al nuevo número.
        </p>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startChange();
            }}
            style={{ display: 'contents' }}
          >
            <LoginPhoneChileInput value={phoneDigits} onChange={setPhoneDigits} />
            {inlineError ? <p style={{ color: '#f44336', fontSize: 12, marginTop: 10 }}>{inlineError}</p> : null}
            <button
              type="submit"
              className="maqgo-btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              disabled={loading || !isPhoneValid}
            >
              {loading ? 'Enviando…' : 'Enviar código SMS'}
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => navigate('/provider/profile')}
              disabled={loading}
            >
              Volver
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyChange();
            }}
            style={{ display: 'contents' }}
          >
            <OtpSixDigitsInput 
              value={otpCode} 
              onChange={setOtpCode} 
              testIdPrefix="provider-change-phone-otp" 
              name="one-time-code"
            />
            {inlineError ? <p style={{ color: '#f44336', fontSize: 12, marginTop: 10 }}>{inlineError}</p> : null}
            <button
              type="submit"
              className="maqgo-btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              disabled={loading || !isOtpValid}
            >
              {loading ? 'Verificando…' : 'Confirmar cambio'}
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                setStep('phone');
                setOtpCode('');
                setInlineError('');
              }}
              disabled={loading}
            >
              Corregir número
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ProviderChangePhoneScreen;
