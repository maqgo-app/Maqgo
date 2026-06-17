import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import BACKEND_URL from '../utils/api';

function mapClientDestination(status) {
  if (status === 'arrived') return '/client/provider-arrived';
  if (status === 'last_30') return '/client/last-30';
  if (status === 'finished' || status === 'completed') return '/client/service-finished';
  if (status === 'started' || status === 'in_progress') return '/client/service-active';
  return '/client/assigned';
}

function mapProviderDestination(status) {
  if (status === 'arrived') return '/provider/arrival';
  if (status === 'last_30') return '/provider/last-30';
  if (status === 'finished' || status === 'completed') return '/provider/service-finished';
  if (status === 'started' || status === 'in_progress') return '/provider/service-active';
  return '/provider/en-route';
}

function normalizeStatusForStorage(status) {
  if (status === 'in_progress' || status === 'started' || status === 'last_30') return 'started';
  if (status === 'arrived') return 'arrived';
  if (status === 'en_route') return 'en_route';
  return 'assigned';
}

function LegacyChatRedirectScreen() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const role = useMemo(() => String(localStorage.getItem('userRole') || '').toLowerCase(), []);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const id = String(serviceId || '').trim();
      if (!id) {
        navigate('/client/home', { replace: true });
        return;
      }

      try {
        localStorage.setItem('currentServiceId', id);
      } catch {}

      try {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/${encodeURIComponent(id)}`);
        const s = res?.data?.status;
        const status = typeof s === 'string' ? s : '';

        try {
          localStorage.setItem('serviceStatus', normalizeStatusForStorage(status));
          const provider = res?.data?.provider || res?.data?.assignedProvider || res?.data?.provider_data;
          if (provider && typeof provider === 'object') {
            const acceptedProvider = {
              providerOperatorName:
                provider.providerOperatorName || provider.operator_name || provider.operatorName || provider.operator_name,
              operatorRut: provider.operatorRut || provider.operator_rut,
              licensePlate: provider.licensePlate || provider.license_plate || provider.patente,
              rating: provider.rating,
              eta_minutes: provider.eta_minutes,
            };
            localStorage.setItem('acceptedProvider', JSON.stringify(acceptedProvider));
          }
        } catch {}

        const destination = role === 'provider' || role === 'operator' ? mapProviderDestination(status) : mapClientDestination(status);
        if (!cancelled) navigate(destination, { replace: true });
      } catch (e) {
        if (cancelled) return;
        setError('No se pudo abrir este enlace.');
        const fallback = role === 'provider' || role === 'operator' ? '/provider/home' : '/client/home';
        setTimeout(() => {
          if (!cancelled) navigate(fallback, { replace: true });
        }, 1200);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, role, serviceId]);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center' }}>
          {error || 'Redirigiendo…'}
        </div>
      </div>
    </div>
  );
}

export default LegacyChatRedirectScreen;

