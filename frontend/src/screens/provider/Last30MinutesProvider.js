import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { playTimerWarningSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import axios from 'axios';
import BACKEND_URL from '../../utils/api';
import { useAdaptivePolling } from '../../hooks/useAdaptivePolling';
import MaqgoLogo from '../../components/MaqgoLogo';
import { Clock } from 'lucide-react';
import Last30CountdownHero from '../../components/Last30CountdownHero.jsx';

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

  const loadingTime = Boolean(serviceId) && !endTimeMs;

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
            <p style={{ color: 'rgba(255,255,255,0.95)' }}>Quedan aprox. 30 minutos para el término del servicio</p>
          </div>

          <Last30CountdownHero remainingSeconds={remainingTime} loading={loadingTime} />

          {!serviceId ? (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: -6, marginBottom: 10 }}>
              No hay un servicio activo asociado.
            </div>
          ) : null}

          <div style={{ background: '#363636', borderRadius: 14, padding: 24, width: '100%', marginBottom: 20 }}>
            <p style={{ color: '#fff', textAlign: 'center', margin: 0 }}>
              El cierre se realizará al cumplir la jornada contratada.
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
