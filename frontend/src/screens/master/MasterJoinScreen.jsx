import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BACKEND_URL from '../../utils/api';
import { getActivationErrorMessage } from '../../utils/activationErrors';

function MasterJoinScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromUrlToken = String(searchParams.get('token') || searchParams.get('code') || '').trim().toUpperCase();

  const [inviteToken] = useState(fromUrlToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [autoStarted, setAutoStarted] = useState(false);

  const handleJoinFromInvite = async () => {
    if (loading) return;
    if (inviteToken.length < 4) {
      setError('El enlace de invitacion no es valido.');
      setStatusMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setStatusMessage('Estamos preparando tu acceso.');

    try {
      await axios.post(
        `${BACKEND_URL}/api/operators/masters/join`,
        { token: inviteToken.toUpperCase() },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );
      try {
        localStorage.setItem('desiredRole', 'provider');
      } catch {
        /* ignore */
      }
      navigate('/login', {
        replace: true,
        state: { entry: 'provider', redirect: '/provider/home', enrollmentToken: inviteToken.toUpperCase() },
      });
    } catch (err) {
      setError(getActivationErrorMessage(err));
      setStatusMessage('');
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!fromUrlToken || autoStarted || loading) return;
    setAutoStarted(true);
    void handleJoinFromInvite();
  }, [autoStarted, fromUrlToken, loading]);

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
          Invitación de Gerente
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
          Abre el enlace que recibiste por SMS para continuar con tu incorporacion.
        </p>

        {!fromUrlToken ? (
          <div
            style={{
              width: '100%',
              marginBottom: 20,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              La invitacion la envia MAQGO automaticamente por SMS. Si llegaste aqui sin ese mensaje,
              vuelve a abrir el enlace recibido en tu celular.
            </p>
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

        {!fromUrlToken ? (
          <button
            className="maqgo-btn-secondary"
            onClick={() => navigate('/', { replace: true })}
            data-testid="back-home-btn"
          >
            Volver al inicio
          </button>
        ) : null}

        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', margin: '16px 0 0' }}>
          Válido por 7 días. Uso único (1 persona).
        </p>
      </div>
    </div>
  );
}

export default MasterJoinScreen;
