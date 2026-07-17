import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BACKEND_URL from '../../utils/api';
import { getActivationErrorMessage } from '../../utils/activationErrors';

function OperatorJoinScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromUrlCode = String(searchParams.get('code') || '').trim().toUpperCase();

  const [code, setCode] = useState(fromUrlCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const handleJoinWithCode = async () => {
    if (loading) return;
    if (code.length < 4) {
      setError('Ingresa el código completo');
      setStatusMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setStatusMessage('Verificando código...');

    try {
      await axios.post(
        `${BACKEND_URL}/api/operators/join`,
        { code: code.toUpperCase() },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );
      try {
        localStorage.setItem('desiredRole', 'provider');
      } catch {
        /* ignore */
      }
      navigate('/login', {
        replace: true,
        state: { entry: 'provider', redirect: '/operator/home', activationCode: code.toUpperCase() },
      });
    } catch (err) {
      setError(getActivationErrorMessage(err));
      setStatusMessage('');
    }

    setLoading(false);
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
          Activación de Operador
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
          Ingresa el código que te compartió tu empresa (no es el código SMS). Luego iniciarás sesión con un código SMS (MAQGO).
        </p>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(String(e.target.value || '').toUpperCase().slice(0, 6));
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.length >= 4 && !loading) {
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

        <button
          className="maqgo-btn-primary"
          onClick={handleJoinWithCode}
          disabled={loading || code.length < 4}
          style={{ opacity: code.length < 4 ? 0.5 : 1 }}
          data-testid="validate-code-btn"
        >
          {loading ? 'Verificando...' : 'Activar'}
        </button>

        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0 }}>
            ¿No tienes código? Pídelo al Titular de la empresa
          </p>
        </div>
      </div>
    </div>
  );
}

export default OperatorJoinScreen;
