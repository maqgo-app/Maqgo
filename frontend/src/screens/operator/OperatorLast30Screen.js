import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';

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
