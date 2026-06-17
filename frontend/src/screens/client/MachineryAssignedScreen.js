import React, { useState, useEffect, useRef } from 'react';
import { getObject, getArray, getJSON } from '../../utils/safeStorage';
import { useNavigate } from 'react-router-dom';
import OnTheWayMap from '../../components/OnTheWayMap';
import { playAcceptedSound, playArrivingSound, playNotificationSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import axios from 'axios';
import BACKEND_URL from '../../utils/api';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { Truck, UserCheck } from 'lucide-react';
import { getOperatorDisplayNameForSite, getOperatorRutForSite, getProviderLicensePlate } from '../../utils/providerDisplay';

/**
 * Pantalla: Tu maquinaria ha sido asignada (MVP)
 * 
 * Incluye:
 * - Regla equilibrada: 60 min desde la hora indicada de llegada (ETA).
 *   Si el operador NO informó nada en la ruta → puede cancelar sin cargo a los ETA+60 min.
 *   Si el operador SÍ informó (ej. tráfico) → puede cancelar sin cargo a los ETA+90 min.
 * - Ventana protegida mientras hay incidente activo reportado por el operador.
 * - Mapa con ubicación del operador y la obra (post-pago)
 * - Sonidos de notificación (asignado, llegando)
 */

import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getMinutesAfterEtaToAllowCancel } from '../../utils/cancellationPolicy';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

// Mapeo de razones de incidente a mensajes amigables
const INCIDENT_MESSAGES = {
  'Tráfico pesado': 'tráfico pesado',
  'Parada por combustible': 'parada por combustible',
  'Bloqueo de ruta': 'un bloqueo de ruta',
  'Maniobra logística': 'una maniobra logística',
  'Incidente menor': 'un incidente menor'
};

// Radio para alertar al cliente: "El proveedor está llegando"
const ARRIVING_ALERT_RADIUS_METERS = 500;

// Calcular distancia Haversine (metros)
const calcDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

  // assigned = operador asignado, preparándose (mapa estático); en_route = ya salió (mapa se mueve, ETA)
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
  const operatorRut = getOperatorRutForSite(provider) || '';
  const licensePlate = getProviderLicensePlate(provider) || '';
  
  // Estado del timeout
  const [, setElapsedMinutes] = useState(0);
  const [showTimeoutOption, setShowTimeoutOption] = useState(false);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  
  // Estado del incidente
  const [activeIncident, setActiveIncident] = useState(null);
  const [isProtectedWindow, setIsProtectedWindow] = useState(false);
  const [protectedMinutesLeft, setProtectedMinutesLeft] = useState(0);
  const serviceId = localStorage.getItem('currentServiceId') || '';
  
  // Estado de alerta de proximidad
  const [nearbyAlertShown, setNearbyAlertShown] = useState(false);
  const [showNearbyBanner, setShowNearbyBanner] = useState(false);

  // Ubicación de la obra
  const workLocation = {
    lat: parseFloat(localStorage.getItem('serviceLat')) || -33.4489,
    lng: parseFloat(localStorage.getItem('serviceLng')) || -70.6693
  };

  // Simular posición del operador moviéndose hacia la obra (para demo)
  const [operatorLocationSim, setOperatorLocationSim] = useState(() => ({
    lat: provider.lat ?? -33.4372,
    lng: provider.lng ?? -70.6506
  }));

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

  // Simular movimiento del operador hacia la obra — solo cuando en_route (en assigned el mapa no se mueve)
  useEffect(() => {
    if (serviceStatus !== 'en_route') return;
    const interval = setInterval(() => {
      setOperatorLocationSim(prev => ({
        lat: prev.lat + (workLocation.lat - prev.lat) * 0.03,
        lng: prev.lng + (workLocation.lng - prev.lng) * 0.03
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [serviceStatus, workLocation.lat, workLocation.lng]);

  // Una sola alerta: cuando el operador está a 500m de la obra — solo si ya está en camino
  useEffect(() => {
    if (serviceStatus !== 'en_route') return;
    const dist = calcDistance(
      operatorLocationSim.lat, operatorLocationSim.lng,
      workLocation.lat, workLocation.lng
    );
    if (dist <= ARRIVING_ALERT_RADIUS_METERS && !nearbyAlertShown) {
      setNearbyAlertShown(true);
      setShowNearbyBanner(true);
      playArrivingSound();
      vibrate('arriving');
      setTimeout(() => setShowNearbyBanner(false), 10000);
      // WhatsApp ya cubre este evento (desde EnRouteScreen); in-app solo para feedback visual
    }
  }, [serviceStatus, operatorLocationSim.lat, operatorLocationSim.lng, workLocation.lat, workLocation.lng, nearbyAlertShown]);

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

  // Timer para contar minutos y verificar incidentes
  useEffect(() => {
    // Reproducir sonido cuando se asigna la maquinaria (proveedor en camino)
    unlockAudio();
    playAcceptedSound();
    vibrate('accepted');
    
    const startTime = localStorage.getItem('serviceAssignedTime') || new Date().toISOString();
    if (!localStorage.getItem('serviceAssignedTime')) {
      localStorage.setItem('serviceAssignedTime', startTime);
    }

    const interval = setInterval(() => {
      const now = new Date();
      
      const incident = getObject('activeIncident', null);
      if (incident) {
        setActiveIncident(incident);
        const windowEnd = new Date(incident.protectedWindowEnd);
        if (now < windowEnd) {
          setIsProtectedWindow(true);
          setProtectedMinutesLeft(Math.ceil((windowEnd - now) / 60000));
          setShowTimeoutOption(false); // No mostrar timeout durante ventana protegida
        } else {
          setIsProtectedWindow(false);
          // Después de ventana protegida, permitir opciones
        }
      }
      
      // Solo calcular timeout si no hay ventana protegida activa
      if (!isProtectedWindow) {
        const start = new Date(startTime);
        const diffMinutes = Math.floor((now - start) / 60000);
        setElapsedMinutes(diffMinutes);

        // Regla: 60 min desde la hora indicada (ETA). Si informó algo en ruta, 90 min (equilibrado).
        const incident = getObject('activeIncident', null);
        const minutesAfterEtaToAllowCancel = getMinutesAfterEtaToAllowCancel(!!incident);
        if (diffMinutes >= etaMinutes + minutesAfterEtaToAllowCancel) {
          setShowTimeoutOption(true);
        }
      }
    }, 5000); // Revisar cada 5 segundos

    // Para DEMO: mostrar opción después de 20 s (solo si no hay incidente)
    const demoTimer = setTimeout(() => {
      const incident = getJSON('activeIncident', null);
      if (!incident) {
        setShowTimeoutOption(true);
      }
    }, 20000);

    return () => {
      clearInterval(interval);
      clearTimeout(demoTimer);
    };
  }, [etaMinutes, isProtectedWindow]);

  useEffect(() => {
    if (!serviceId || String(serviceId).startsWith('demo-')) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
        if (!active) return;
        const inc = res?.data?.activeIncident || null;
        if (inc) {
          localStorage.setItem('activeIncident', JSON.stringify(inc));
          setActiveIncident(inc);
        }
      } catch {
        void 0;
      }
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [serviceId]);

  const handleNoShow = () => {
    // Obtener historial de No-Shows del proveedor
    const noShowEvents = getArray('noShowEvents', []);
    const providerId = provider.id;
    
    // Filtrar No-Shows de este proveedor
    const providerNoShows = noShowEvents.filter(e => e.providerId === providerId && e.type === 'NO_SHOW');
    
    // Contar No-Shows recientes
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    
    const noShowsLast30Days = providerNoShows.filter(e => new Date(e.timestamp) > thirtyDaysAgo).length;
    const noShowsLast60Days = providerNoShows.filter(e => new Date(e.timestamp) > sixtyDaysAgo).length;
    
    // Determinar bloqueo progresivo
    let blockHours = 72; // Default: 72 horas (3 días) - 1er No-Show
    let blockType = 'TEMPORARY_72H';
    
    if (noShowsLast30Days >= 1) {
      // 2do No-Show dentro de 30 días → 7 días
      blockHours = 168; // 7 días
      blockType = 'TEMPORARY_7D';
    }
    
    if (noShowsLast60Days >= 2) {
      // 3er No-Show dentro de 60 días → Indefinido (revisión manual)
      blockHours = -1; // Indefinido
      blockType = 'INDEFINITE_MANUAL_REVIEW';
    }
    
    // Registrar No-Show
    const noShowData = {
      providerId: providerId,
      serviceId: localStorage.getItem('currentServiceId'),
      timestamp: now.toISOString(),
      type: 'NO_SHOW',
      blockType: blockType,
      blockHours: blockHours,
      blockUntil: blockHours > 0 ? new Date(now.getTime() + blockHours * 60 * 60 * 1000).toISOString() : null,
      noShowCount: noShowsLast60Days + 1
    };
    
    noShowEvents.push(noShowData);
    localStorage.setItem('noShowEvents', JSON.stringify(noShowEvents));
    
    // Cancelar servicio sin cargo para el cliente
    localStorage.setItem('cancelReason', 'NO_SHOW');
    localStorage.setItem('cancelCharge', '0');
    
    // Limpiar datos del servicio
    localStorage.removeItem('selectedProvider');
    localStorage.removeItem('currentServiceId');
    localStorage.removeItem('serviceAssignedTime');
    
    navigate('/client/home');
  };

  const alerts = [];
  if (showNearbyBanner) {
    alerts.push({
      tone: 'info',
      title: 'Proximidad',
      description: 'El proveedor está llegando al lugar de acceso.'
    });
  }
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
      title: 'Tiempo de gracia',
      description: `${protectedMinutesLeft} min restantes.`,
    });
  }
  if (showTimeoutOption && !isProtectedWindow) {
    alerts.push({
      tone: 'danger',
      title: 'No-show del operador',
      description: activeIncident
        ? 'Pasó el plazo de espera. Puedes reportar y cancelar sin cargo.'
        : 'Pasó el plazo de espera sin aviso en ruta. Puedes reportar y cancelar sin cargo.',
      rightSlot: (
        <button
          type="button"
          onClick={() => setShowNoShowModal(true)}
          data-testid="no-show-btn"
          style={{
            height: 30,
            padding: '0 10px',
            borderRadius: 999,
            background: 'rgba(236, 104, 25, 0.16)',
            border: '1px solid rgba(236, 104, 25, 0.35)',
            color: '#EC6819',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          Reportar
        </button>
      )
    });
  }

  const selectedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
  const durationLabel = isPerTripMachineryType(machinery)
    ? 'Valor viaje'
    : `${selectedHours} horas${selectedHours >= 6 ? ' + 1hr colación' : ''}`;

  const layout = (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: serviceStatus === 'assigned' ? <UserCheck size={22} /> : <Truck size={22} />,
        title: serviceStatus === 'assigned' ? 'Operador asignado' : 'Operador en camino',
        subtitle: serviceStatus === 'assigned' ? 'El operador se está preparando.' : 'Seguimiento de ruta y llegada estimada.',
        badgeLabel: serviceStatus === 'assigned' ? 'Asignado' : 'En camino',
        badgeTone: serviceStatus === 'assigned' ? 'info' : 'info',
        meta: serviceId ? [{ label: 'ID servicio', value: String(serviceId).slice(0, 8) }] : [],
      }}
      primaryTitle={serviceStatus === 'assigned' ? 'Estado' : 'Seguimiento'}
      primary={
        <div>
          {serviceStatus === 'assigned' ? (
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>
              El operador se está preparando. La llegada estimada se actualizará en Avisos.
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>
                  El operador está en camino a tu ubicación.
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800
                }}>
                  ~{etaMinutes} min
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <OnTheWayMap
              operatorLocation={{
                lat: operatorLocationSim.lat,
                lng: operatorLocationSim.lng,
                name: 'Operador'
              }}
              serviceLocation={{
                lat: workLocation.lat,
                lng: workLocation.lng,
                address: location || 'Tu obra'
              }}
            />
          </div>
        </div>
      }
      summary={{
        title: 'Resumen',
        machinery: MACHINERY_NAMES[machinery] || machinery,
        operatorName,
        operatorRut,
        licensePlate,
        location: location || 'Por confirmar',
        duration: durationLabel,
      }}
      alerts={alerts}
      secondaryActions={
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
  );

  return (
    <>
      {layout}

        {/* Solo modo demo: atajo para llegar hasta el final (oculto en producción) */}
        {/* Modal de confirmación No-Show */}
        {showNoShowModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}>
            <div style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 24,
              maxWidth: 340,
              width: '100%'
            }}>
              <div style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'rgba(236, 104, 25, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#EC6819" strokeWidth="2"/>
                  <path d="M15 9L9 15M9 9L15 15" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              
              <h3
                style={{
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                  textAlign: 'center',
                  margin: '0 0 8px'
                }}
              >
                Confirmar No-Show del operador
              </h3>
              <p
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  textAlign: 'center',
                  margin: '0 0 8px'
                }}
              >
                Tu reserva se cancelará sin cobro y recibirás el reembolso completo. El operador será notificado.
              </p>
              <p
                style={{
                  color: '#90BDD3',
                  fontSize: 13,
                  textAlign: 'center',
                  margin: '0 0 20px',
                  lineHeight: 1.4
                }}
              >
                {activeIncident
                  ? 'Según nuestra política, ya pasaron más de 60 minutos desde la hora de inicio y el operador indicó problemas en la ruta. ¿Confirmas que deseas cancelar sin cargo?'
                  : 'Según nuestra política, ya pasaron más de 60 minutos desde la hora de inicio y el operador no indicó problemas en la ruta. ¿Confirmas que deseas cancelar sin cargo?'}
              </p>

              <button
                onClick={handleNoShow}
                style={{
                  width: '100%',
                  padding: 14,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 25,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 10
                }}
                data-testid="confirm-no-show-btn"
              >
                Confirmar y cancelar
              </button>
              
              <button
                onClick={() => setShowNoShowModal(false)}
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 25,
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 15,
                  cursor: 'pointer'
                }}
              >
                Seguir esperando
              </button>
            </div>
          </div>
        )}
    </>
  );
}

export default MachineryAssignedScreen;
