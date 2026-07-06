import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import BACKEND_URL from '../../utils/api';
import axios from 'axios';

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
  const [endTimeMs, setEndTimeMs] = useState(null);

  const serviceId = useMemo(() => String(request?.id || '').trim(), [request]);

  useEffect(() => {
    if (!endTimeMs) return undefined;
    const t = setInterval(() => {
      const diff = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      setRemaining(diff);
    }, 1000);
    return () => clearInterval(t);
  }, [endTimeMs]);

  useEffect(() => {
    if (!serviceId) return undefined;
    const poll = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}`);
        const sr = res?.data || {};
        const rawEnd = sr.endTime;
        const end = rawEnd ? new Date(String(rawEnd)).getTime() : null;
        if (Number.isFinite(end)) setEndTimeMs(end);
        const st = String(sr.status || '').toLowerCase();
        if (st === 'finished' || st === 'rated') {
          navigate('/operator/completed');
        }
      } catch {
        void 0;
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [serviceId, navigate]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/operator/home') }}
      header={{
        icon: <AlertTriangle size={22} />,
        title: 'Últimos 30 minutos',
        subtitle: 'Prepárate para el cierre. El sistema gestiona el término.',
        badgeLabel: 'Last 30',
        badgeTone: 'danger',
        meta: request?.id ? [{ label: 'ID servicio', value: String(request.id).slice(0, 8) }] : [],
      }}
      primaryTitle="Tiempo"
      primary={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0' }}>
          <div style={{ color: '#fff', fontSize: 40, fontWeight: 900, letterSpacing: 1 }}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
        </div>
      }
      summary={null}
      secondaryActions={[
        {
          key: 'to-avisos',
          label: 'Ir a avisos',
          variant: 'secondary',
          onClick: () => navigate('/operator/avisos'),
        },
        {
          key: 'to-home',
          label: 'Volver al inicio',
          variant: 'primary',
          onClick: () => navigate('/operator/home'),
        },
      ]}
    />
  );
}

export default OperatorLast30Screen;
