import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { playTimerWarningSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import axios from 'axios';
import BACKEND_URL from '../../utils/api';
import { useAdaptivePolling } from '../../hooks/useAdaptivePolling';
import MaqgoLogo from '../../components/MaqgoLogo';
import { Clock } from 'lucide-react';

function Last30MinutesProvider() {
  const navigate = useNavigate();
  const [remainingTime, setRemainingTime] = useState(30 * 60);

  const serviceId = useMemo(() => {
    try {
      const raw = localStorage.getItem('activeServiceRequest');
      if (raw) {
        const sr = JSON.parse(raw);
        const id = String(sr?.id || '').trim();
        if (id) return id;
      }
    } catch {
      void 0;
    }
    const raw = localStorage.getItem('currentServiceId') || localStorage.getItem('currentServiceRequestId') || '';
    return String(raw || '').trim();
  }, []);

  const [endTimeMs, setEndTimeMs] = useState(null);

  useEffect(() => {
    unlockAudio();
    playTimerWarningSound();
    vibrate('alert');
  }, []);

  useEffect(() => {
    if (!endTimeMs) return undefined;
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      setRemainingTime(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [endTimeMs]);

  useAdaptivePolling({
    enabled: Boolean(serviceId) && !String(serviceId).startsWith('demo-'),
    baseIntervalMs: 5000,
    maxIntervalMs: 30000,
    run: async () => {
      const res = await axios.get(`${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}`);
      const sr = res?.data || {};
      const rawEnd = sr.endTime;
      const end = rawEnd ? new Date(String(rawEnd)).getTime() : null;
      if (Number.isFinite(end)) {
        setEndTimeMs(end);
      }
      const st = String(sr.status || '').toLowerCase();
      if (st === 'finished' || st === 'rated') {
        navigate('/provider/service-finished');
      }
      return true;
    },
  });

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timeLabel = endTimeMs ? formatTime(remainingTime) : '--:--';

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen">
        <div style={{ marginBottom: 30 }}>
          <MaqgoLogo size="small" />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: 'rgba(236, 104, 25, 0.18)',
                border: '1px solid rgba(236, 104, 25, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Clock size={34} color="#EC6819" strokeWidth={2.5} />
            </div>
            <h2 style={{ color: '#EC6819', marginBottom: '15px', fontSize: 24, fontWeight: 700 }}>Últimos 30 Minutos</h2>
            <p style={{ color: 'rgba(255,255,255,0.95)' }}>El servicio finalizará pronto automáticamente</p>
          </div>

          <div
            style={{
              background: 'rgba(255, 193, 7, 0.18)',
              border: '1px solid rgba(255, 193, 7, 0.35)',
              borderRadius: 14,
              padding: 18,
              width: '100%',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={{ color: '#ffc107', fontWeight: 800 }}>Tiempo restante</div>
            <div style={{ color: '#fff', fontSize: 42, fontWeight: 900, letterSpacing: 1 }}>{timeLabel}</div>
            {!serviceId ? (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>No hay un servicio activo asociado.</div>
            ) : !endTimeMs ? (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>Cargando tiempo restante…</div>
            ) : null}
          </div>

          <div style={{ background: '#363636', borderRadius: 14, padding: 24, width: '100%', marginBottom: 20 }}>
            <p style={{ color: '#fff', textAlign: 'center', margin: 0 }}>
              El servicio se cerrará automáticamente al cumplir la jornada contratada.
            </p>
          </div>
        </div>

        <button className="maqgo-btn-primary" onClick={() => navigate('/provider/service-active')} data-testid="back-to-progress-btn">
          Volver a Servicio
        </button>
      </div>
    </div>
  );
}

export default Last30MinutesProvider;
