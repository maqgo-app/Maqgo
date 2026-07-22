import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';

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
    if (reason === 'inactive_user') return 'Tu acceso está desactivado o requiere revisión.';
    if (reason === 'phone_in_use') return 'Este número ya está registrado.';
    if (reason === 'otp_not_received') return 'Si el código no llega, revisa estos pasos.';
    if (reason === 'phone_blocked') return 'Detectamos un bloqueo de seguridad.';
    if (reason === 'temporary_lock') return 'Tu acceso está temporalmente bloqueado por seguridad.';
    return 'Revisa estos pasos y vuelve a intentarlo.';
  })();

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 18 }} />
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>{title}</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 0, marginBottom: 18, lineHeight: 1.45 }}>
          {subtitle}
        </p>

        <div
          style={{
            background: 'rgba(144, 189, 211, 0.10)',
            border: '1px solid rgba(144, 189, 211, 0.25)',
            borderRadius: 12,
            padding: '14px 14px',
            color: 'rgba(255,255,255,0.86)',
            lineHeight: 1.45,
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Qué puedes hacer ahora</div>
          <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13 }}>
            1) Verifica que tu celular esté bien escrito.
            <br />
            2) Revisa señal y modo avión.
            <br />
            3) Espera 1 minuto y reintenta.
            {normalizePhone9(phone9).length === 9 ? (
              <>
                <br />
                <span style={{ opacity: 0.85 }}>Celular: •••••{normalizePhone9(phone9).slice(-4)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div
          style={{
            borderRadius: 12,
            padding: '14px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.82)',
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          Si aún no puedes entrar, escríbenos a{' '}
          <a href="mailto:soporte@maqgo.cl" style={{ color: '#90BDD3' }}>
            soporte@maqgo.cl
          </a>
          .
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="maqgo-btn-primary"
          onClick={() => navigate('/login', { replace: true, state: { prefillPhoneDigits: phone9, requestedRole } })}
          style={{ width: '100%', marginTop: 14 }}
        >
          Volver y reintentar
        </button>

        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/login')}
          style={{ width: '100%', marginTop: 10 }}
        >
          Usar otro número
        </button>
      </div>
    </div>
  );
}

export default SupportAccessScreen;
