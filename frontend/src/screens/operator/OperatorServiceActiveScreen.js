import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Activity } from 'lucide-react';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';
import BACKEND_URL from '../../utils/api';
import { getObjectFirst } from '../../utils/safeStorage';
import { getMachineryDisplayName } from '../../utils/machineryNames';
import {
  getOperatorDisplayNameForSite,
  getOperatorRutDisplayForSite,
  getProviderLicensePlateDisplay,
} from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

function OperatorServiceActiveScreen() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const lastErrorLogAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}`, {
            timeout: 8000,
          });
          setService(res.data);
          localStorage.setItem('activeServiceRequest', JSON.stringify(res.data));
          localStorage.setItem('acceptedRequest', JSON.stringify(res.data));
          const st = String(res.data?.status || '').toLowerCase();
          if (st === 'completed' || st === 'finished' || st === 'rated') {
            localStorage.setItem('serviceEndTime', new Date().toISOString());
            navigate('/operator/completed');
          }
        }
      } catch (e) {
        const now = Date.now();
        if (import.meta.env.DEV && now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('OperatorServiceActiveScreen poll error:', e?.message || e);
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
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** errorStreakRef.current);
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  const savedProvider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
  const mergedForSite = service
    ? {
        ...savedProvider,
        providerOperatorName: service.providerOperatorName ?? savedProvider.providerOperatorName,
        operator_name: service.providerOperatorName ?? savedProvider.operator_name,
        operator_rut: service.operatorRut ?? service.operator_rut ?? savedProvider.operator_rut,
        licensePlate: service.licensePlate ?? service.license_plate ?? savedProvider.licensePlate,
        license_plate: service.license_plate ?? service.licensePlate ?? savedProvider.license_plate,
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
                margin: '0 auto 10px',
              }}
              aria-hidden="true"
            >
              <Activity size={22} color="#90BDD3" />
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>Servicio en curso</div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6 }}>Estado operativo del servicio.</div>
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
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{label}</div>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 800, textAlign: 'right', maxWidth: '62%' }}>{value}</div>
              </div>
            ))}
          </MaqgoCard>

          <div style={{ height: 14 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/operator/avisos')}>
              Ir a avisos
            </button>
            <button type="button" className="maqgo-btn-primary" onClick={() => navigate('/operator/home')}>
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OperatorServiceActiveScreen;
