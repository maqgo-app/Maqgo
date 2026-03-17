import React, { useState, useEffect, useRef } from 'react';
import { getObject, getArray, getJSON } from '../../utils/safeStorage';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import OnTheWayMap from '../../components/OnTheWayMap';
import { playAcceptedSound, playArrivingSound, playNotificationSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

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

import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getMinutesAfterEtaToAllowCancel } from '../../utils/cancellationPolicy';

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
  const [location] = useState(localStorage.getItem('serviceLocation') || '');

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

  // Dev: a los 10 s pasar a "en camino" solo si sigue en assigned; notificar con vibración y sonido
  useEffect(() => {
    const t = setTimeout(async () => {
      if (serviceStatusRef.current !== 'assigned') return;
      setServiceStatus('en_route');
      localStorage.setItem('serviceStatus', 'en_route');
      try {
        await unlockAudio();
        playNotificationSound(); // suave: solo aviso de "ya va en camino"
        vibrate('accepted');
      } catch (_) {}
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  const [etaMinutes, setEtaMinutes] = useState(provider.eta_minutes || 40);
  
  // Estado del timeout
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [showTimeoutOption, setShowTimeoutOption] = useState(false);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  
  // Estado del incidente
  const [activeIncident, setActiveIncident] = useState(null);
  const [isProtectedWindow, setIsProtectedWindow] = useState(false);
  const [protectedMinutesLeft, setProtectedMinutesLeft] = useState(0);
  
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
      
      // Verificar si hay un incidente activo
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

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Banner de alerta: Operador cerca */}
        {showNearbyBanner && (
          <div style={{
            background: 'linear-gradient(135deg, #EC6819 0%, #FF8C42 100%)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center',
            animation: 'pulse-banner 1s infinite'
          }}>
            <style>{`
              @keyframes pulse-banner {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
              }
            `}</style>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 12
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/>
                  <circle cx="12" cy="9" r="2.5" fill="#EC6819"/>
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  El proveedor está llegando al lugar de acceso
                </p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '4px 0 0' }}>
                  Prepárate para recibir al operador
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Estado principal */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.15)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          textAlign: 'center'
        }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'rgba(144, 189, 211, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="maqgo-h1" style={{ margin: '0 0 8px' }}>
            ¡Operador asignado!
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 }}>
            Tu reserva está confirmada.
          </p>
        </div>

        {/* Estado: preparándose (mapa estático) o en camino (mapa + ETA) */}
        {serviceStatus === 'assigned' ? (
          <div
            style={{
              background: '#363636',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16
            }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                margin: 0,
                lineHeight: 1.5
              }}
            >
              Tu operador se está preparando. Te avisaremos cuando vaya en camino.
            </p>
          </div>
        ) : (
          <div style={{
            background: '#363636',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              marginBottom: 12
            }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#EC6819',
                animation: 'pulse 1.5s infinite'
              }} />
              <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, textTransform: 'uppercase' }}>
                Operador en camino
              </span>
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
            
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              El operador está en camino a tu ubicación.
            </p>

            {/* ETA estimado */}
            <div style={{
              background: '#2A2A2A',
              borderRadius: 8,
              padding: '10px 14px',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.95)" strokeWidth="2"/>
                <path d="M12 6V12L16 14" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Llegada estimada: <strong style={{ color: '#fff' }}>~{etaMinutes} min</strong>
              </span>
            </div>
          </div>
        )}

        {/* Mapa: pins fijos cuando assigned, movimiento cuando en_route */}
        <OnTheWayMap 
          operatorLocation={{
            lat: operatorLocationSim.lat,
            lng: operatorLocationSim.lng,
            name: provider.operator_name || provider.providerOperatorName || 'Operador'
          }}
          serviceLocation={{
            lat: workLocation.lat,
            lng: workLocation.lng,
            address: location || 'Tu obra'
          }}
        />

        {/* Notificación de incidente del proveedor */}
        {activeIncident && (
          <div style={{
            background: 'rgba(255, 193, 7, 0.15)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(255, 193, 7, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FFC107" strokeWidth="2"/>
                  <path d="M12 6V12" stroke="#FFC107" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="16" r="1" fill="#FFC107"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#FFC107', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
                  Retraso reportado por el operador
                </p>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.4 }}>
                  El operador ha reportado un retraso debido a {INCIDENT_MESSAGES[activeIncident.reason] || activeIncident.reason.toLowerCase()}.
                </p>
                {isProtectedWindow && (
                  <div style={{
                    background: 'rgba(255, 193, 7, 0.1)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    marginTop: 8
                  }}>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0 }}>
                      Tiempo de gracia: <strong style={{ color: '#FFC107' }}>{protectedMinutesLeft} min restantes</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TIMEOUT: Opción de No-Show - Solo si no está en ventana protegida */}
        {showTimeoutOption && !isProtectedWindow && (
          <div style={{
            background: 'rgba(236, 104, 25, 0.15)',
            border: '1px solid rgba(236, 104, 25, 0.5)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(236, 104, 25, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#EC6819" strokeWidth="2"/>
                  <path d="M12 6V12" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="16" r="1" fill="#EC6819"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
                  ¿El operador no ha llegado?
                </p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: '0 0 12px' }}>
                  {activeIncident
                    ? 'Pasaron más de 90 min desde la hora indicada. El operador había informado algo en ruta; si aun así no ha llegado, puedes reportar y cancelar sin cargo.'
                    : 'Pasaron más de 60 min desde la hora indicada de llegada y el operador no informó nada en ruta. Puedes reportar y cancelar sin cargo. Te reembolsamos todo.'}
                </p>
                <button
                  onClick={() => setShowNoShowModal(true)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#EC6819',
                    border: 'none',
                    borderRadius: 20,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  data-testid="no-show-btn"
                >
                  Reportar y cancelar sin cargo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Datos del operador */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16
        }}>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', marginBottom: 10 }}>
            Operador asignado
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 45,
              height: 45,
              borderRadius: '50%',
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.95)"/>
                <path d="M4 20C4 16 8 14 12 14C16 14 20 16 20 20" stroke="rgba(255,255,255,0.95)" strokeWidth="2"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
                {provider.operator_name || provider.providerOperatorName || 'Operador asignado'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="#EC6819">
                  <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z"/>
                </svg>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                  {(provider.rating ?? 4.8).toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Patente */}
          <div style={{
            background: '#EC6819',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, textTransform: 'uppercase' }}>
              Patente
            </span>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2 }}>
              {provider.license_plate || 'POR-DEFINIR'}
            </span>
          </div>
        </div>

        {/* Maquinaria y ubicación */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 56,
                height: 42,
                borderRadius: 8,
                background: '#444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              {provider.primaryPhoto ? (
                <img
                  src={provider.primaryPhoto}
                  alt="Foto maquinaria"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <svg width="20" height="16" viewBox="0 0 40 32" fill="none">
                  <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
                  <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
                  <circle cx="10" cy="28" r="3" fill="#fff"/>
                  <circle cx="22" cy="28" r="3" fill="#fff"/>
                </svg>
              )}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                {MACHINERY_NAMES[machinery] || machinery}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                {MACHINERY_PER_TRIP.includes(machinery) ? 'Valor viaje' : `${localStorage.getItem('selectedHours') || 4} horas`}
              </div>
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            paddingTop: 10,
            borderTop: '1px solid #444'
          }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M10 1C6.69 1 4 3.69 4 7C4 11.5 10 19 10 19S16 11.5 16 7C16 3.69 13.31 1 10 1Z" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" fill="none"/>
              <circle cx="10" cy="7" r="2" fill="rgba(255,255,255,0.95)"/>
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
              {location || 'Ubicación de la reserva'}
            </span>
          </div>
        </div>

        {/* Solo modo demo: atajo para llegar hasta el final (oculto en producción) */}
        {import.meta.env.VITE_IS_PRODUCTION !== 'true' && (localStorage.getItem('currentServiceId') || '').startsWith('demo-') && (
          <button
            onClick={() => navigate('/client/provider-arrived')}
            style={{
              width: '100%',
              padding: 14,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 25,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Simular llegada (Demo)
          </button>
        )}

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
                  fontSize: 11,
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
      </div>
    </div>
  );
}

export default MachineryAssignedScreen;
