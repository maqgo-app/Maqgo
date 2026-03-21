import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL from '../utils/api';

function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestCode = async () => {
    if (!email.trim() || !celular.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: email.trim(),
        celular: celular.trim()
      });
      const msg = res.data?.message || 'Si los datos coinciden con tu cuenta, te enviamos un código por SMS.';
      setMessage(msg);
      // Backend nuevo: otp_sent; legacy sin campo → avanzar como antes.
      const sent = res.data?.otp_sent !== false;
      if (sent) {
        setStep(2);
      } else {
        setError('Revisa el correo y el celular (9 dígitos) registrados en tu cuenta.');
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo solicitar el código');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!email.trim() || !celular.trim()) {
      setError('Faltan correo o celular');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/request`, {
        email: email.trim(),
        celular: celular.trim()
      });
      if (res.data?.otp_sent === false) {
        setError('No pudimos reenviar. Verifica correo y celular.');
        return;
      }
      setMessage(res.data?.message || 'Te enviamos un nuevo código por SMS.');
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo reenviar el código');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!code.trim() || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/password-reset/confirm`, {
        email: email.trim(),
        celular: celular.trim(),
        code: code.trim(),
        new_password: newPassword
      });
      setMessage(res.data?.message || 'Contraseña actualizada correctamente');
      setTimeout(() => navigate('/login'), 1200);
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: '24px', justifyContent: 'center' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 20 }} />
        <h2 style={{ color: '#fff', fontSize: 22, textAlign: 'center', marginBottom: 10 }}>
          Restablecer contraseña
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          Verificamos por SMS para proteger tu cuenta.
        </p>

        <input
          className="maqgo-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo electrónico"
          disabled={step === 2}
        />
        <input
          className="maqgo-input"
          type="tel"
          value={celular}
          onChange={(e) => setCelular(e.target.value)}
          placeholder="Celular (9 dígitos)"
          disabled={step === 2}
        />

        {step === 2 && (
          <>
            <input
              className="maqgo-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código SMS"
            />
            <input
              className="maqgo-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña"
            />
            <input
              className="maqgo-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar nueva contraseña"
            />
            <div style={{ display: 'flex', gap: 10 }}>
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
                Editar datos
              </button>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={resendCode}
                style={{ flex: 1 }}
                disabled={loading}
              >
                {loading ? 'Reenviando...' : 'Reenviar código'}
              </button>
            </div>
          </>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center' }}>{error}</p>}
        {message && <p style={{ color: '#2ecc71', fontSize: 13, textAlign: 'center' }}>{message}</p>}

        {step === 1 ? (
          <button className="maqgo-btn-primary" onClick={requestCode} disabled={loading || !email || !celular}>
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        ) : (
          <button
            className="maqgo-btn-primary"
            onClick={confirmReset}
            disabled={loading || !code || !newPassword || !confirmPassword}
          >
            {loading ? 'Actualizando...' : 'Guardar nueva contraseña'}
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
