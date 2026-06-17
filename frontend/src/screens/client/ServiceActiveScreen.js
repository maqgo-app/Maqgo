import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';
import { getObjectFirst } from '../../utils/safeStorage';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { Activity } from 'lucide-react';
import { getOperatorDisplayNameForSite, getOperatorRutForSite, getProviderLicensePlate } from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

/**
 * Pantalla C14 - Servicio en Curso
 */
function ServiceActiveScreen() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const lastErrorLogAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId && !serviceId.startsWith('demo')) {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`, {
            timeout: 8000,
          });
          setService(res.data);
          
          if (res.data.status === 'completed' || res.data.status === 'finished') {
            localStorage.setItem('serviceEndTime', new Date().toISOString());
            navigate('/client/service-finished');
          }
        } else {
          // Demo / fallback: usar datos de localStorage
          const savedProvider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
          setService({
            machineryType: getMachineryDisplayName(localStorage.getItem('selectedMachinery') || 'retroexcavadora'),
            status: 'in_progress',
            providerOperatorName: savedProvider?.providerOperatorName || savedProvider?.operator_name || savedProvider?.operatorName || '',
            operatorRut: savedProvider?.operatorRut || savedProvider?.operator_rut || '',
            licensePlate: savedProvider?.licensePlate || savedProvider?.license_plate || '',
          });
        }
      } catch (e) {
        const now = Date.now();
        if (import.meta.env.DEV && now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('ServiceActiveScreen poll error:', e?.message || e);
          }
          lastErrorLogAtRef.current = now;
        }
        throw e;
      }
    };

    let cancelled = false;
    let timeoutId = null;

    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;

      // Backpressure: sólo 1 request a la vez.
      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await loadService();
        errorStreakRef.current = 0;
      } catch {
        errorStreakRef.current += 1;
      } finally {
        inFlightRef.current = false;
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * (2 ** errorStreakRef.current)
        );
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  // Demo: Botón para simular fin de servicio
  const handleFinish = () => {
    localStorage.setItem('serviceEndTime', new Date().toISOString());
    navigate('/client/service-finished');
  };

  const savedProvider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
  const cid = localStorage.getItem('currentServiceId') || '';
  const mergedForSite =
    service && !cid.startsWith('demo')
      ? {
          ...savedProvider,
          providerOperatorName: service.providerOperatorName ?? savedProvider.providerOperatorName,
          operator_name: service.providerOperatorName ?? savedProvider.operator_name,
          operator_rut: service.operatorRut ?? service.operator_rut ?? savedProvider.operator_rut,
        }
      : savedProvider;
  const locationLabel = getBookingLocationLineOrEmpty() || 'Por confirmar';
  const machineryLabel = service ? getMachineryDisplayName(service.machineryType) : 'Cargando...';
  const operatorName = getOperatorDisplayNameForSite(mergedForSite) || 'Por confirmar';
  const operatorRut = getOperatorRutForSite(mergedForSite) || 'Por confirmar';
  const licensePlate = getProviderLicensePlate(mergedForSite) || 'Por confirmar';

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: <Activity size={22} />,
        title: 'Servicio en curso',
        subtitle: 'Estado operativo del servicio.',
        badgeLabel: 'En curso',
        badgeTone: 'info',
        meta: [],
      }}
      primaryTitle="Estado"
      primary={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>
            Servicio activo.
          </div>
          <div style={{
            background: 'rgba(236, 104, 25, 0.14)',
            border: '1px solid rgba(236, 104, 25, 0.22)',
            color: '#EC6819',
            borderRadius: 999,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 0.6,
            textTransform: 'uppercase'
          }}>
            Activo
          </div>
        </div>
      }
      summary={{
        title: 'Resumen',
        machinery: machineryLabel,
        operatorName,
        operatorRut,
        licensePlate,
        location: locationLabel,
        duration: '',
      }}
      alerts={[]}
      secondaryActions={
        (localStorage.getItem('currentServiceId') || '').startsWith('demo-')
          ? [{ key: 'finish-demo', label: 'Finalizar servicio (Demo)', variant: 'primary', onClick: handleFinish, testId: 'finish-service-btn' }]
          : []
      }
    />
  );
}

export default ServiceActiveScreen;
