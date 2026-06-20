import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';
import { getObjectFirst } from '../../utils/safeStorage';
import ServiceSecondaryActions from '../../components/serviceState/ServiceSecondaryActions';
import { Activity } from 'lucide-react';
import { getOperatorDisplayNameForSite, getOperatorRutDisplayForSite, getProviderLicensePlateDisplay } from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';

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
  const operatorName = getOperatorDisplayNameForSite(mergedForSite) || 'Operador asignado';
  const operatorRut = getOperatorRutDisplayForSite(mergedForSite);
  const licensePlate = getProviderLicensePlateDisplay(mergedForSite);

  const startIso = localStorage.getItem('serviceStartTime');
  const startDate = startIso ? new Date(startIso) : null;
  const startOk = startDate && !Number.isNaN(startDate.getTime());
  const elapsedMs = startOk ? Date.now() - startDate.getTime() : null;
  const elapsedMin = elapsedMs != null ? Math.max(0, Math.floor(elapsedMs / 60000)) : null;
  const elapsedLabel = elapsedMin != null ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : '—';
  const startLabel = startOk ? startDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MaqgoLogo customSize={120} />
          </div>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: '#2A2A2A', padding: 18, textAlign: 'center' }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                background: 'rgba(144, 189, 211, 0.18)',
                border: '1px solid rgba(144, 189, 211, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px'
              }}
              aria-hidden="true"
            >
              <Activity size={22} color="#90BDD3" />
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
              Servicio en curso
            </div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6 }}>
              Estado operativo del servicio.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Tiempo
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12 }}>Hora inicio</div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 900, marginTop: 4 }}>{startLabel}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12 }}>Tiempo transcurrido</div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 900, marginTop: 4 }}>{elapsedLabel}</div>
              </div>
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Datos del servicio
            </div>
            <div style={{ height: 10 }} />
            {[
              ['Maquinaria', machineryLabel],
              ['Operador', operatorName],
              ['RUT', operatorRut],
              ['Patente', licensePlate],
              ['Ubicación', locationLabel],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{label}</div>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 800, textAlign: 'right', maxWidth: '62%' }}>{value}</div>
              </div>
            ))}
          </MaqgoCard>

          <div style={{ height: 14 }} />

          <ServiceSecondaryActions
            actions={
              (localStorage.getItem('currentServiceId') || '').startsWith('demo-')
                ? [{ key: 'finish-demo', label: 'Finalizar servicio (Demo)', variant: 'primary', onClick: handleFinish, testId: 'finish-service-btn' }]
                : []
            }
          />
        </div>
      </div>
    </div>
  );
}

export default ServiceActiveScreen;
