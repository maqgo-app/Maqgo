import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import PasswordField from '../components/PasswordField';
import BACKEND_URL from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';
import { validateCelularChile } from '../utils/chileanValidation';
import { getPasswordHint, validatePassword, PASSWORD_RULES } from '../utils/passwordValidation';

/** 8 dígitos tras el 9 fijo del móvil chileno (+569). */
const CELULAR_SUFFIX_MAX = 8;

function maskCelularForDisplay(nineDigits) {
  if (!nineDigits || nineDigits.length !== 9) return '+569 ••• •••';
  const last3 = nineDigits.slice(-3);
  return `+569 ••• •${last3}`;
}

function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  /** Solo los 8 dígitos después del prefijo +569 (el 9 va implícito). */
  const [celularSuffix, setCelularSuffix] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const celularForApi = () => {
    const d = celularSuffix.replace(/\D/g, '');
    if (d.length !== CELULAR_SUFFIX_MAX) return '';
    return `9${d}`;
  };

  const onCelularSuffixChange = (value) => {
    const raw = value.replace(/\D/g, '');
    if (raw.length >= 9 && raw[0] === '9') {
      setCelularSuffix(raw.slice(1, 1 + CELULAR_SUFFIX_MAX));
      return;
    }
    setCelularSuffix(raw.slice(0, CELULAR_SUFFIX_MAX));
  };

  const requestCode = async () => {
    if (!email.trim()) {
      setError('Ingresa tu correo');
      return;
    }
    const cel = celularForApi();
    const celErr = validateCelularChile(cel);
    if (!cel || celErr) {
      setError(celErr || 'Completa el celular (8 dígitos después de +569)');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: email.trim(),
        celular: cel
      });
      const sent = res.data?.otp_sent !== false;
      if (sent) {
        setError('');
        setMessage('');
        setStep(2);
      } else {
        setMessage('');
        setError(
          'No encontramos coincidencia entre este correo y este celular. Revisá que sean los mismos que usaste al registrarte.'
        );
      }
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No se pudo solicitar el código. Intenta de nuevo.'
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    const cel = celularForApi();
    if (!email.trim() || !cel) {
      setError('Faltan correo o celular completo (8 dígitos tras +569)');
      return;
    }
    const celErr = validateCelularChile(cel);
    if (celErr) {
      setError(celErr);
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: email.trim(),
        celular: cel
      });
      if (res.data?.otp_sent === false) {
        setError('No pudimos reenviar el código. Verificá correo y celular.');
        return;
      }
      setMessage('Te enviamos un nuevo código por SMS.');
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No se pudo reenviar el código. Intenta de nuevo.'
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!code.trim()) {
      setError('Ingresá el código que te llegó por SMS');
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError('Completá la nueva contraseña en ambos campos');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const pwdHint = getPasswordHint(true);
    const pwdErr = validatePassword(newPassword, pwdHint);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    const cel = celularForApi();
    const celErr = validateCelularChile(cel);
    if (!cel || celErr) {
      setError(celErr || 'Celular incompleto. Volvé a “Cambiar correo o celular”.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/confirm`, {
        email: email.trim(),
        celular: cel,
        code: code.trim(),
        new_password: newPassword
      });
      setMessage(res.data?.message || 'Contraseña actualizada correctamente');
      setTimeout(() => navigate('/login'), 1200);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No se pudo actualizar la contraseña. Intenta de nuevo.'
        })
      );
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
    textTransform: 'uppercase'
  };
  const sectionTitle = { color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: 600, marginBottom: 6 };
  const sectionHint = { color: muted, fontSize: 12, marginBottom: 10, lineHeight: 1.4 };
  const infoBox = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 20
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: '24px', justifyContent: 'center' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 20 }} />

        {step === 1 ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <span style={stepBadgeStyle}>Paso 1 de 2</span>
            </div>
            <h2 style={headingStyle}>Restablecer contraseña</h2>
            <p style={subStyle}>
              Usamos un <strong style={{ color: '#fff' }}>código por SMS</strong> (no enviamos enlace por correo).
              Después vas a crear tu nueva contraseña en el siguiente paso.
            </p>

            <div style={infoBox}>
              <p style={{ color: muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: '#fff' }}>1.</strong> Correo y celular deben ser los de tu cuenta Maqgo.
                <br />
                <strong style={{ color: '#fff' }}>2.</strong> Te mandamos un SMS con un código.
                <br />
                <strong style={{ color: '#fff' }}>3.</strong> Ingresás el código y escribís la nueva contraseña{' '}
                <strong style={{ color: '#fff' }}>dos veces</strong> para confirmarla.
              </p>
            </div>

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
              Correo electrónico
            </label>
            <input
              className="maqgo-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              autoComplete="email"
            />

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block', marginTop: 4 }}>
              Celular registrado
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 16
              }}
            >
              <span
                style={{
                  padding: '14px 12px',
                  background: '#0f0f0f',
                  color: '#ccc',
                  borderRight: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 15,
                  whiteSpace: 'nowrap',
                  userSelect: 'none'
                }}
                aria-hidden
              >
                +569
              </span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={celularSuffix}
                onChange={(e) => onCelularSuffixChange(e.target.value)}
                placeholder="12345678"
                aria-label="Celular, 8 dígitos después de +569"
                style={{
                  flex: 1,
                  padding: '14px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 15,
                  outline: 'none'
                }}
              />
            </div>
            <p style={{ color: muted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
              Solo los 8 dígitos después del +569 (el 9 va incluido en el prefijo).
            </p>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <span style={stepBadgeStyle}>Paso 2 de 2</span>
            </div>
            <h2 style={headingStyle}>Código SMS y nueva contraseña</h2>
            <p style={subStyle}>
              Primero verificamos el código que te enviamos; después definís tu nueva clave (dos veces, igual que en
              otras apps).
            </p>

            <div style={{ ...infoBox, marginBottom: 16 }}>
              <p style={{ color: muted, fontSize: 12, margin: '0 0 8px 0' }}>Datos que estamos usando</p>
              <p style={{ color: '#fff', fontSize: 14, margin: '0 0 6px 0', wordBreak: 'break-all' }}>{email.trim()}</p>
              <p style={{ color: '#fff', fontSize: 14, margin: 0 }}>{maskCelularForDisplay(celularForApi())}</p>
            </div>

            <label htmlFor="forgot-otp-code" style={{ ...sectionTitle, display: 'block' }}>
              Código del SMS
            </label>
            <p style={sectionHint}>Revisá los mensajes de texto en este número. El código no llega por correo.</p>
            <input
              id="forgot-otp-code"
              name="one-time-code"
              className="maqgo-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              placeholder="Código que recibiste"
            />

            <label htmlFor="forgot-password-new" style={{ ...sectionTitle, marginTop: 20, display: 'block' }}>
              Nueva contraseña
            </label>
            <p style={sectionHint}>
              Escribila dos veces para confirmar. No usamos restablecimiento solo por enlace: siempre código SMS + nueva
              clave.
            </p>
            <p style={{ ...sectionHint, marginTop: -4, marginBottom: 8 }}>{getPasswordHint(true)}</p>
            <PasswordField
              id="forgot-password-new"
              name="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={getPasswordHint(true)}
              autoComplete="new-password"
              style={{ marginBottom: 12 }}
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
            />
            <label
              htmlFor="forgot-password-confirm"
              style={{ ...sectionTitle, display: 'block' }}
            >
              Confirmar nueva contraseña
            </label>
            <PasswordField
              id="forgot-password-confirm"
              name="confirm-new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repetir nueva contraseña"
              autoComplete="new-password"
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => {
                  setStep(1);
                  setCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setMessage('');
                  setError('');
                }}
                style={{ flex: 1 }}
                disabled={loading}
              >
                Cambiar correo o celular
              </button>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={resendCode}
                style={{ flex: 1 }}
                disabled={loading}
              >
                {loading ? 'Reenviando...' : 'Reenviar SMS'}
              </button>
            </div>
          </>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</p>}
        {message && <p style={{ color: '#2ecc71', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{message}</p>}

        {step === 1 ? (
          <button
            className="maqgo-btn-primary"
            onClick={requestCode}
            disabled={loading || !email.trim() || celularSuffix.replace(/\D/g, '').length !== CELULAR_SUFFIX_MAX}
            style={{ marginTop: 12 }}
          >
            {loading ? 'Enviando...' : 'Continuar — enviar código SMS'}
          </button>
        ) : (
          <button
            className="maqgo-btn-primary"
            onClick={confirmReset}
            disabled={loading || !code || !newPassword || !confirmPassword}
            style={{ marginTop: 16 }}
          >
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        )}

        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/login')}
          style={{ marginTop: 10 }}
        >
          Volver al login
        </button>
      </div>
    </div>
  );
}

export default ForgotPasswordScreen;
