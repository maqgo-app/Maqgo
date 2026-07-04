import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';

function buildLast30Request() {
  try {
    const raw = localStorage.getItem('activeServiceRequest');
    if (raw) return JSON.parse(raw);
  } catch {
    void 0;
  }
  return {
    id: localStorage.getItem('currentServiceId') || 'svc',
    status: 'last_30',
  };
}

function OperatorLast30Screen() {
  const navigate = useNavigate();
  const [request] = useState(buildLast30Request);
  const [remaining, setRemaining] = useState(30 * 60);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen">
        <div style={{ marginBottom: 20 }}>
          <MaqgoLogo size="small" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              background: '#E53935',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: 22,
              fontSize: 13,
              fontWeight: 900,
              display: 'inline-block',
              marginBottom: 10,
            }}
          >
            ÚLTIMOS 30 MIN
          </div>
          <div style={{ color: '#fff', fontSize: 36, fontWeight: 900, letterSpacing: 1 }}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 }}>
            Prepárate para finalizar. La empresa gestiona extensiones.
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 900, marginBottom: 8 }}>
            Servicio
          </div>
          <div style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, lineHeight: 1.5 }}>
            ID: {String(request?.id || '').slice(0, 12)}
          </div>
        </div>

        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/operator/home')}
          style={{ width: '100%' }}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

export default OperatorLast30Screen;

