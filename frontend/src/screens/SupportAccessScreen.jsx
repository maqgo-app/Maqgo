import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL from '../utils/api';
import { getHttpErrorMessage } from '../utils/httpErrors';

function normalizePhone9(value) {
  return String(value || '').replace(/\D/g, '').slice(-9);
}

function SupportAccessScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);

  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const reason = String(params.get('reason') || location.state?.reason || 'other');
  const requestedRole = String(params.get('role') || location.state?.requestedRole || '');

  const [phone9, setPhone9] = useState('');
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
    setTimeout(() => buttonRef.current?.focus?.(), 0);
  }, []);

  const title = (() => {
    if (reason === 'inactive_user') return 'Recuperar acceso';
    if (reason === 'phone_in_use') return 'Recuperar acceso';
    if (reason === 'phone_blocked') return 'Recuperar acceso';
    if (reason === 'temporary_lock') return 'Recuperar acceso';
    if (reason === 'otp_not_received') return 'Ayuda con el código';
    return 'Solicitar ayuda';
  })();

  const subtitle = (() => {
    if (reason === 'inactive_user') return 'Tu cuenta está desactivada. Envíanos esta solicitud y lo revisamos.';
    if (reason === 'phone_in_use') return 'Este número ya está registrado. Envíanos esta solicitud y te ayudamos a recuperar acceso.';
    if (reason === 'otp_not_received') return 'Si el código no llega, revisamos tu caso y te ayudamos.';
    if (reason === 'phone_blocked') return 'Detectamos un bloqueo de seguridad. Envíanos esta solicitud y lo revisamos.';
    if (reason === 'temporary_lock') return 'Tu acceso está temporalmente bloqueado por seguridad. Envíanos esta solicitud y lo revisamos.';
    return 'Cuéntanos el problema y te ayudamos a resolverlo.';
  })();

  const submit = async () => {
    setError('');
    const p9 = normalizePhone9(phone9);
    setLoading(true);
    try {
      const payload = {
        reason,
        ...(p9.length === 9 ? { phone9: p9 } : {}),
        ...(requestedRole ? { requested_role: requestedRole } : {}),
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
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 18 }} />
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>{title}</h1>
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
            {error ? (
              <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 1.45 }}>
                {error}
              </p>
            ) : null}

            <button
              ref={buttonRef}
              type="button"
              className="maqgo-btn-primary"
              disabled={loading}
              onClick={submit}
              style={{ width: '100%', marginTop: 14 }}
            >
              {loading ? 'Enviando…' : 'Solicitar revisión'}
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
