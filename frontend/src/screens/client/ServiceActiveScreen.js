import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';
import { getObjectFirst } from '../../utils/safeStorage';
import { getClientProviderDisplayName } from '../../utils/privacy';
import { getOperatorDisplayNameForSite, getOperatorRutForSite } from '../../utils/providerDisplay';
import OpenServiceChatButton from '../../components/OpenServiceChatButton';

/**
 * Pantalla C14 - Servicio en Curso
 */
function ServiceActiveScreen() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const serviceId = localStorage.getItem('currentServiceId');
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
            providerOperatorName: getClientProviderDisplayName(savedProvider),
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
  const operatorSiteName = getOperatorDisplayNameForSite(mergedForSite);
  const operatorSiteRut = getOperatorRutForSite(mergedForSite);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Estado */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: '#EC6819',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            position: 'relative'
          }}>
            <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
              <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="3" fill="none"/>
              <path d="M25 12V25L32 32" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            {/* Pulso */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.45)',
                animation: 'maqgo-pulse-service-active 2s infinite',
              }}
            />
          </div>

          <span style={{
            display: 'inline-block',
            background: '#90BDD3',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            padding: '8px 20px',
            borderRadius: 20,
            letterSpacing: 1
          }}>
            SERVICIO EN CURSO
          </span>
        </div>

        {/* Info del servicio */}
        <div style={{
          background: '#363636',
          borderRadius: 16,
          padding: 24,
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Maquinaria</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {service ? getMachineryDisplayName(service.machineryType) : 'Cargando...'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Operador</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, textAlign: 'right', maxWidth: '62%' }}>
              {operatorSiteName}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>RUT</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {operatorSiteRut || 'Por confirmar'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Estado</span>
            <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>Activo</span>
          </div>
        </div>

        

        <OpenServiceChatButton
          serviceId={serviceId || service?.id}
          otherName={operatorSiteName}
          label="Abrir chat"
          style={{ width: '100%', marginTop: 16, background: '#2A2A2A' }}
        />

        {/* Solo modo demo (Continuar sin tarjeta): atajo para llegar hasta el final */}
        {(localStorage.getItem('currentServiceId') || '').startsWith('demo-') && (
          <button 
            className="maqgo-btn-primary"
            onClick={handleFinish}
            data-testid="finish-service-btn"
          >
            Finalizar servicio (Demo)
          </button>
        )}

        <style>{`
          @keyframes maqgo-pulse-service-active {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

export default ServiceActiveScreen;
