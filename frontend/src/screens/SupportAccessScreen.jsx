import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import PhoneNationalInput from '../components/PhoneNationalInput';
import BACKEND_URL from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';

function normalizePhone9(value) {
  return String(value || '').replace(/\D/g, '').slice(-9);
}

function SupportAccessScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const phoneRef = useRef(null);

  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const reason = String(params.get('reason') || location.state?.reason || 'other');
  const requestedRole = String(params.get('role') || location.state?.requestedRole || '');

  const [phone9, setPhone9] = useState('');
  const [email, setEmail] = useState('');
  const [rut, setRut] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const prefill =
      normalizePhone9(location.state?.prefillPhoneDigits) ||
      normalizePhone9(params.get('phone9')) ||
      normalizePhone9(localStorage.getItem('userPhone')) ||
      normalizePhone9(JSON.parse(localStorage.getItem('registerData') || '{}')?.celular);
    if (prefill) setPhone9(prefill);
  }, [location.state, params]);

  useEffect(() => {
    setTimeout(() => phoneRef.current?.focus?.(), 0);
  }, []);

  const title = (() => {
    if (reason === 'inactive_user') return 'Recuperar acceso';
    if (reason === 'phone_in_use') return 'Recuperar acceso';
    if (reason === 'otp_not_received') return 'Ayuda con el código';
    return 'Solicitar ayuda';
  })();

  const subtitle = (() => {
    if (reason === 'inactive_user') return 'Tu cuenta está desactivada. Envíanos esta solicitud y lo revisamos.';
    if (reason === 'phone_in_use') return 'Este número ya está registrado. Envíanos esta solicitud y te ayudamos a recuperar acceso.';
    if (reason === 'otp_not_received') return 'Si el código no llega, revisamos tu caso y te ayudamos.';
    return 'Cuéntanos el problema y te ayudamos a resolverlo.';
  })();

  const submit = async () => {
    setError('');
    const p9 = normalizePhone9(phone9);
    if (p9.length !== 9) {
      setError('Ingresa tu celular (9 dígitos).');
      setTimeout(() => phoneRef.current?.focus?.(), 0);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        reason,
        phone9: p9,
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
        ...(rut.trim() ? { rut: rut.trim() } : {}),
        ...(requestedRole ? { requested_role: requestedRole } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await axios.post(`${BACKEND_URL}/api/support/tickets`, payload, { timeout: 12000 });
      setSent(true);
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No pudimos enviar tu solicitud. Intenta nuevamente.',
          statusMessages: { 429: 'Recibimos varias solicitudes. Espera un momento e intenta de nuevo.' },
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-login-container">
      <div className="maqgo-login-card">
        <MaqgoLogo style={{ width: 140, margin: '0 auto 18px', display: 'block' }} />
        <h2 style={{ color: '#fff', textAlign: 'center', marginBottom: 8 }}>{title}</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 0, marginBottom: 18, lineHeight: 1.45 }}>
          {subtitle}
        </p>

        {sent ? (
          <>
            <div
              style={{
                background: 'rgba(76, 175, 80, 0.10)',
                border: '1px solid rgba(76, 175, 80, 0.35)',
                borderRadius: 12,
                padding: '14px 14px',
                color: '#fff',
                lineHeight: 1.45,
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              Recibimos tu solicitud. Te ayudaremos a resolverlo lo antes posible.
            </div>
            <button
              type="button"
              className="maqgo-btn-primary"
              onClick={() => navigate('/login', { replace: true })}
              style={{ width: '100%' }}
            >
              Volver a iniciar sesión
            </button>
          </>
        ) : (
          <>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
              Tu celular <span style={{ color: '#EC6819' }}>*</span>
            </label>
            <PhoneNationalInput
              value={phone9}
              onDigitsChange={(d) => setPhone9(d)}
              ariaLabel="Nueve dígitos del celular, empezando con 9"
              inputRef={phoneRef}
            />

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '14px 0 6px', display: 'block' }}>
              Correo (opcional)
            </label>
            <input
              className="maqgo-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              autoComplete="email"
            />

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '14px 0 6px', display: 'block' }}>
              RUT empresa (opcional)
            </label>
            <input className="maqgo-input" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="Ej: 76.873.366-K" />

            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '14px 0 6px', display: 'block' }}>
              Detalle (opcional)
            </label>
            <textarea
              className="maqgo-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: No me llega el código / Me aparece cuenta desactivada / Cambié de número"
              rows={3}
              style={{ resize: 'vertical' }}
            />

            {error ? (
              <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 1.45 }}>
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="maqgo-btn-primary"
              disabled={loading}
              onClick={submit}
              style={{ width: '100%', marginTop: 14 }}
            >
              {loading ? 'Enviando…' : 'Enviar solicitud'}
            </button>

            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={() => navigate('/login')}
              style={{ width: '100%', marginTop: 10 }}
            >
              Volver
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SupportAccessScreen;

