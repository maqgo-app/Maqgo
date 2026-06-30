import React, { useState, useEffect, useRef } from 'react';
import { getObject, getJSON } from '../../utils/safeStorage';
import { useNavigate } from 'react-router-dom';
import OnTheWayMap from '../../components/OnTheWayMap';
import { playAcceptedSound, playNotificationSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import axios from 'axios';
import BACKEND_URL from '../../utils/api';
import { useAdaptivePolling } from '../../hooks/useAdaptivePolling';
import ServiceSecondaryActions from '../../components/serviceState/ServiceSecondaryActions';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';
import { Truck, UserCheck } from 'lucide-react';
import { getOperatorDisplayNameForSite, getOperatorRutDisplayForSite, getProviderLicensePlateDisplay } from '../../utils/providerDisplay';

/** Pantalla: Tu maquinaria ha sido asignada (MVP) */

import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

// Mapeo de razones de incidente a mensajes amigables
const INCIDENT_MESSAGES = {
  'Tráfico pesado': 'tráfico pesado',
  'Parada por combustible': 'parada por combustible',
  'Bloqueo de ruta': 'un bloqueo de ruta',
  'Maniobra logística': 'una maniobra logística',
  'Incidente menor': 'un incidente menor'
};

function MachineryAssignedScreen() {
  const navigate = useNavigate();
  const [provider] = useState(() => {
    const selected = getObject('selectedProvider', {});
    const accepted = getObject('acceptedProvider', null);
    if (accepted && Object.keys(accepted || {}).length > 0) {
      // Mezclar datos: usar el que aceptó pero sin perder foto, patente u otros campos del seleccionado
      return { ...selected, ...accepted };
    }
    return selected;
  });
  const [machinery] = useState(localStorage.getItem('selectedMachinery') || 'retroexcavadora');
  const [location] = useState(() => getBookingLocationLineOrEmpty());

  // assigned = operador asignado, preparándose; en_route = ya salió
  const [serviceStatus, setServiceStatus] = useState(() => localStorage.getItem('serviceStatus') || 'assigned');
  const serviceStatusRef = useRef(serviceStatus);
  useEffect(() => {
    serviceStatusRef.current = serviceStatus;
  }, [serviceStatus]);

  // Sincronizar serviceTotal y serviceStatus para CancelServiceScreen (política de cancelación)
  useEffect(() => {
    const total = localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount');
    if (total) localStorage.setItem('serviceTotal', total);
    const status = localStorage.getItem('serviceStatus') || 'assigned';
    localStorage.setItem('serviceStatus', status);
    setServiceStatus(status);
  }, []);

  // Tras 10 s → "en camino" solo en dev, demo o QA (`maqgo_simulation_enabled`).
  // Producción con servicio real: no simular transición hasta integrar tracking en vivo.
  useEffect(() => {
    const allowSimulatedEnRoute =
      import.meta.env.DEV ||
      localStorage.getItem('maqgo_simulation_enabled') === 'true' ||
      String(localStorage.getItem('currentServiceId') || '').startsWith('demo-');
    if (!allowSimulatedEnRoute) return undefined;

    const t = setTimeout(async () => {
      if (serviceStatusRef.current !== 'assigned') return;
      setServiceStatus('en_route');
      localStorage.setItem('serviceStatus', 'en_route');
      try {
        await unlockAudio();
        playNotificationSound(); // suave: solo aviso de "ya va en camino"
        vibrate('accepted');
      } catch {
        void 0;
      }
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  const [etaMinutes, setEtaMinutes] = useState(provider.eta_minutes || 40);

  const operatorName = getOperatorDisplayNameForSite(provider) || 'Operador asignado';
  const operatorRut = getOperatorRutDisplayForSite(provider);
  const licensePlate = getProviderLicensePlateDisplay(provider);
  
  // Estado del incidente
  const [activeIncident, setActiveIncident] = useState(null);
  const [isProtectedWindow, setIsProtectedWindow] = useState(false);
  const [protectedMinutesLeft, setProtectedMinutesLeft] = useState(0);
  const serviceId = localStorage.getItem('currentServiceId') || '';
  
  // Ubicación de la obra
  const workLocation = {
    lat: parseFloat(localStorage.getItem('serviceLat')) || -33.4489,
    lng: parseFloat(localStorage.getItem('serviceLng')) || -70.6693
  };

  // Simular cuenta regresiva del ETA (demo) — solo cuando ya está en camino
  useEffect(() => {
    if (serviceStatus !== 'en_route') return;
    const etaInterval = setInterval(() => {
      setEtaMinutes(prev => {
        if (prev <= 1) return 1;
        return prev - 1;
      });
    }, 10000);
    return () => clearInterval(etaInterval);
  }, [serviceStatus]);

  // Detectar llegada del operador (operatorArrived desde ArrivalScreen) y redirigir
  // ProviderArrivedScreen reproducirá sonido y vibración al cargar
  useEffect(() => {
    const checkArrival = setInterval(() => {
      if (localStorage.getItem('operatorArrived') === 'true') {
        navigate('/client/provider-arrived');
      }
    }, 2000);
    return () => clearInterval(checkArrival);
  }, [navigate]);

  useEffect(() => {
    unlockAudio();
    playAcceptedSound();
    vibrate('accepted');

    const interval = setInterval(() => {
      const now = new Date();
      const incident = getObject('activeIncident', null);
      if (!incident) {
        setActiveIncident(null);
        setIsProtectedWindow(false);
        setProtectedMinutesLeft(0);
        return;
      }
      setActiveIncident(incident);
      const windowEnd = new Date(incident.protectedWindowEnd);
      if (now < windowEnd) {
        setIsProtectedWindow(true);
        setProtectedMinutesLeft(Math.ceil((windowEnd - now) / 60000));
      } else {
        setIsProtectedWindow(false);
        setProtectedMinutesLeft(0);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useAdaptivePolling({
    enabled: Boolean(serviceId) && !String(serviceId).startsWith('demo-'),
    baseIntervalMs: 10000,
    maxIntervalMs: 60000,
    run: async () => {
      const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
      const inc = res?.data?.activeIncident || null;
      if (inc) {
        localStorage.setItem('activeIncident', JSON.stringify(inc));
        setActiveIncident(inc);
        return true;
      }
      localStorage.removeItem('activeIncident');
      setActiveIncident(null);
      return true;
    },
  });

  const alerts = [];
  if (activeIncident) {
    alerts.push({
      tone: 'warn',
      title: 'Retraso reportado',
      description: `Motivo: ${INCIDENT_MESSAGES[activeIncident.reason] || String(activeIncident.reason || '').toLowerCase()}.`,
    });
  }
  if (isProtectedWindow && activeIncident) {
    alerts.push({
      tone: 'warn',
      title: 'Ventana protegida',
      description: `${protectedMinutesLeft} min restantes.`,
    });
  }

  const selectedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
  const durationLabel = isPerTripMachineryType(machinery)
    ? 'Valor viaje'
    : `${selectedHours} horas${selectedHours >= 6 ? ' + 1hr colación' : ''}`;

  const layout = (
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
              {serviceStatus === 'assigned' ? <UserCheck size={22} color="#90BDD3" /> : <Truck size={22} color="#90BDD3" />}
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
              {serviceStatus === 'assigned' ? 'Operador asignado' : 'Operador en camino'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6 }}>
              {serviceStatus === 'assigned' ? 'Tu reserva está confirmada.' : 'Seguimiento de tu servicio.'}
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 1.45 }}>
              {serviceStatus === 'assigned'
                ? 'Tu operador se está preparando.'
                : 'Tu operador está en camino. Revisa el estado del servicio en Avisos.'}
            </div>
          </MaqgoCard>

          {serviceStatus === 'en_route' && Number.isFinite(Number(etaMinutes)) ? (
            <>
              <div style={{ height: 10 }} />
              <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Llegada estimada
                </div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginTop: 6 }}>
                  ~{Math.max(1, Math.round(Number(etaMinutes)))} min
                </div>
              </MaqgoCard>
            </>
          ) : null}

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Operador asignado
            </div>
            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
              Prepárate para recibir al operador. Verifica nombre, RUT y patente en portería.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={16} color="rgba(255,255,255,0.9)" />
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 15, fontWeight: 900 }}>{operatorName}</div>
                <div style={{ color: 'rgba(255,255,255,0.60)', fontSize: 12, marginTop: 2 }}>Operación en obra</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  RUT
                </div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, marginTop: 4 }}>{operatorRut}</div>
              </div>
              <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Patente
                </div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, marginTop: 4 }}>{licensePlate}</div>
              </div>
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.45 }}>
              Las actualizaciones del servicio se registran en el Centro de Avisos.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{MACHINERY_NAMES[machinery] || machinery}</div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 4 }}>{durationLabel}</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 800, textAlign: 'right' }}>{location || ''}</div>
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ padding: 0, overflow: 'hidden' }}>
            <OnTheWayMap
              originLocation={(() => {
                const pd = provider?.providerData;
                const lat = pd?.addressLat;
                const lng = pd?.addressLng;
                const nLat = lat != null ? Number(lat) : NaN;
                const nLng = lng != null ? Number(lng) : NaN;
                if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
                return { lat: nLat, lng: nLng };
              })()}
              serviceLocation={{
                lat: workLocation.lat,
                lng: workLocation.lng,
                address: location || 'Tu obra'
              }}
              variant={serviceStatus === 'en_route' ? 'moving' : 'static'}
            />
          </MaqgoCard>

          <div style={{ height: 14 }} />

          <ServiceSecondaryActions
            actions={
              import.meta.env.VITE_IS_PRODUCTION !== 'true' && (localStorage.getItem('currentServiceId') || '').startsWith('demo-')
                ? [{
                    key: 'demo-arrival',
                    label: 'Simular llegada (Demo)',
                    variant: 'outline',
                    onClick: () => navigate('/client/provider-arrived'),
                  }]
                : []
            }
          />
        </div>
      </div>
    </div>
  );

  return layout;
}

export default MachineryAssignedScreen;
