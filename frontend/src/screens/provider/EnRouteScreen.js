import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ChatFloatingButton from '../../components/ChatFloatingButton';
import { useToast } from '../../components/Toast';

// Radio máximo para validar llegada (en metros)
const ARRIVAL_RADIUS_METERS = 150;

// Radio para notificar al cliente (WhatsApp + push)
const ARRIVING_NOTIFY_RADIUS_METERS = 500;

// Coordenadas de demo para la obra (Santiago Centro)
const DEMO_WORK_LOCATION = { lat: -33.4489, lng: -70.6693 };

import BACKEND_URL from '../../utils/api';
import { getObject, getArray, getObjectFirst } from '../../utils/safeStorage';
import { getMachineryId } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

/**
 * Pantalla: En Camino a la Obra (PROVEEDOR)
 * 
 * Incluye:
 * - Dirección de destino con botón para abrir navegación
 * - ETA estimado
 * - Datos del cliente
 * - Botón para confirmar llegada (requiere GPS ≤150m)
 * - Botón para reportar incidente (evita bloqueo por No-Show)
 */
function EnRouteScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [eta, setEta] = useState(15);
  const [serviceData, setServiceData] = useState({});
  const [assignedOperator, setAssignedOperator] = useState(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentReason, setIncidentReason] = useState('');
  const [gpsError, setGpsError] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [showLocationError, setShowLocationError] = useState(false);
  const [operatorLocation, setOperatorLocation] = useState({ lat: -33.4372, lng: -70.6506 });
  const [workLocation, setWorkLocation] = useState(DEMO_WORK_LOCATION);
  const serviceId = localStorage.getItem('currentServiceId') || `service-${Date.now()}`;

  useEffect(() => {
    // Cargar datos del servicio aceptado
    const request = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
    // Ubicación de la obra: prioridad request > localStorage (informada por el cliente)
    const clientLat = request.client_lat ?? request.workCoords?.lat ?? parseFloat(localStorage.getItem('serviceLat'));
    const clientLng = request.client_lng ?? request.workCoords?.lng ?? parseFloat(localStorage.getItem('serviceLng'));
    const destCoords = (Number.isFinite(clientLat) && Number.isFinite(clientLng))
      ? { lat: clientLat, lng: clientLng }
      : DEMO_WORK_LOCATION;
    setWorkLocation(destCoords);

    setServiceData({
      clientName: request.clientName || 'Carlos González',
      clientPhone: request.clientPhone || '+56 9 8765 4321',
      location: request.location || localStorage.getItem('serviceLocation') || 'Av. Providencia 1234, Santiago',
      machinery: request.machineryType || localStorage.getItem('selectedMachinery') || 'Retroexcavadora',
      hours: request.hours || parseInt(localStorage.getItem('selectedHours') || '4'),
      eta: request.eta || 40,
      workCoords: destCoords,
      reference: request.reference || localStorage.getItem('serviceReference') || ''
    });
    setEta(request.eta || 40);
    
    // Cargar operador asignado
    const operator = getObject('assignedOperator', {});
    setAssignedOperator(operator);
  }, []);

  // Obtener ubicación real del operador (GPS)
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setOperatorLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('GPS no disponible, usando ubicación demo');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Simular movimiento del operador hacia la obra (solo demo)
  useEffect(() => {
    const interval = setInterval(() => {
      setOperatorLocation(prev => ({
        lat: prev.lat + (workLocation.lat - prev.lat) * 0.02,
        lng: prev.lng + (workLocation.lng - prev.lng) * 0.02
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [workLocation]);

  // Simular countdown del ETA
  useEffect(() => {
    const timer = setInterval(() => {
      setEta(prev => Math.max(0, prev - 1));
    }, 60000); // Cada minuto
    return () => clearInterval(timer);
  }, []);

  // Calcular distancia entre dos puntos GPS (fórmula Haversine)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distancia en metros
  };

  // Notificar al cliente por WhatsApp cuando el proveedor está a 500m (solo una vez)
  useEffect(() => {
    const sentKey = `providerArrivingSent_${localStorage.getItem('currentServiceId') || 'demo'}`;
    if (localStorage.getItem(sentKey)) return;
    const dist = calculateDistance(
      operatorLocation.lat, operatorLocation.lng,
      workLocation.lat, workLocation.lng
    );
    if (dist <= ARRIVING_NOTIFY_RADIUS_METERS) {
      const request = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
      const clientPhoneRaw = request.clientPhone || request.client_phone || localStorage.getItem('userPhone');
      const phone = clientPhoneRaw ? (String(clientPhoneRaw).startsWith('+') ? clientPhoneRaw : `+56${String(clientPhoneRaw).replace(/\D/g, '')}`) : null;
      if (phone) {
        fetch(`${BACKEND_URL}/api/communications/whatsapp/provider-arriving`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_phone: phone })
        }).catch(() => {});
        localStorage.setItem(sentKey, '1');
      }
    }
  }, [operatorLocation.lat, operatorLocation.lng, workLocation.lat, workLocation.lng]);

  const handleConfirmArrival = () => {
    setCheckingLocation(true);
    setGpsError('');
    setShowLocationError(false);

    // Verificar si el navegador soporta geolocalización
    if (!navigator.geolocation) {
      setGpsError('Tu dispositivo no soporta geolocalización');
      setShowLocationError(true);
      setCheckingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const operatorLat = position.coords.latitude;
        const operatorLng = position.coords.longitude;
        
        // Obtener ubicación de la obra (en producción vendría del backend)
        const workLocation = serviceData.workCoords || DEMO_WORK_LOCATION;
        
        // Calcular distancia
        const distance = calculateDistance(
          operatorLat, operatorLng,
          workLocation.lat, workLocation.lng
        );

        console.log(`Distancia a la obra: ${Math.round(distance)} metros`);

        if (distance <= ARRIVAL_RADIUS_METERS) {
          // Está dentro del radio permitido - confirmar llegada
          localStorage.setItem('providerArrived', 'true');
          localStorage.setItem('arrivalConfirmedTime', new Date().toISOString());
          localStorage.setItem('operatorArrivalCoords', JSON.stringify({
            lat: operatorLat,
            lng: operatorLng,
            distance: Math.round(distance)
          }));
          navigate('/provider/arrival');
        } else {
          // Está fuera del radio permitido
          setGpsError(`Estás a ${Math.round(distance)} metros de la obra. Debes estar a menos de ${ARRIVAL_RADIUS_METERS}m para confirmar llegada.`);
          setShowLocationError(true);
        }
        setCheckingLocation(false);
      },
      (error) => {
        // Error de geolocalización
        let errorMsg = 'No se pudo obtener tu ubicación';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Debes permitir acceso a tu ubicación para confirmar llegada';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Ubicación no disponible. Verifica tu GPS';
            break;
          case error.TIMEOUT:
            errorMsg = 'Tiempo de espera agotado. Intenta de nuevo';
            break;
          default:
            errorMsg = 'Error al obtener ubicación';
        }
        setGpsError(errorMsg);
        setShowLocationError(true);
        setCheckingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleReportIncident = () => {
    // Registrar incidente (evita bloqueo por No-Show + activa ventana protegida)
    const incidentData = {
      providerId: localStorage.getItem('userId'),
      serviceId: localStorage.getItem('currentServiceId'),
      timestamp: new Date().toISOString(),
      type: 'INCIDENT_REPORTED',
      reason: incidentReason,
      protectedWindowEnd: new Date(Date.now() + 20 * 60 * 1000).toISOString() // 20 min
    };
    
    const incidents = getArray('incidentEvents', []);
    incidents.push(incidentData);
    localStorage.setItem('incidentEvents', JSON.stringify(incidents));
    
    // Guardar incidente activo para que el cliente lo vea
    localStorage.setItem('activeIncident', JSON.stringify(incidentData));
    
    // Cerrar modal y mostrar confirmación
    setShowIncidentModal(false);
    setIncidentReason('');
    toast.success('Incidente reportado. El cliente ha sido notificado.');
  };

  const handleOpenMaps = () => {
    setShowIncidentModal(false);
    setIncidentReason('');
    toast.success('Incidente reportado. El cliente ha sido notificado.');
  };

  // Navegación: Waze o Google Maps - priorizar coordenadas (exactas) cuando el cliente eligió dirección con mapa
  const getDestinationForNav = () => {
    const address = serviceData.location?.trim();
    const hasRealCoords = workLocation && Number.isFinite(workLocation.lat) && Number.isFinite(workLocation.lng)
      && (workLocation.lat !== DEMO_WORK_LOCATION.lat || workLocation.lng !== DEMO_WORK_LOCATION.lng);
    if (hasRealCoords) return { type: 'coords', value: `${workLocation.lat},${workLocation.lng}` };
    if (address) return { type: 'address', value: address };
    return { type: 'coords', value: `${workLocation.lat},${workLocation.lng}` };
  };

  const handleOpenWaze = () => {
    const dest = getDestinationForNav();
    const url = dest.type === 'address'
      ? `https://waze.com/ul?q=${encodeURIComponent(dest.value)}&navigate=yes`
      : `https://waze.com/ul?ll=${dest.value}&navigate=yes`;
    window.open(url, '_blank');
  };

  const handleOpenGoogleMaps = () => {
    const dest = getDestinationForNav();
    const param = dest.type === 'address' ? encodeURIComponent(dest.value) : dest.value;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${param}`, '_blank');
  };

  const handleCallClient = () => {
    // En producción: Twilio proxy number que conecta proveedor ↔ cliente
    // Los números reales nunca se exponen
    const maqgoProxyNumber = '+56227654321'; // Número MAQGO central
    window.open(`tel:${maqgoProxyNumber}`);
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Estado */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.15)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#90BDD3',
            animation: 'pulse 1.5s infinite'
          }} />
          <span style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600 }}>
            EN CAMINO A LA OBRA
          </span>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>

        {/* ETA grande */}
        <div style={{
          background: '#363636',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
            Tiempo estimado de llegada
          </div>
          <div style={{ color: '#90BDD3', fontSize: 42, fontWeight: 700 }}>
            {eta} <span style={{ fontSize: 18, fontWeight: 400 }}>min</span>
          </div>
        </div>

        {/* Destino */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>
            Destino
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M10 1C6.69 1 4 3.69 4 7C4 11.5 10 19 10 19S16 11.5 16 7C16 3.69 13.31 1 10 1Z" stroke="#EC6819" strokeWidth="1.5" fill="none"/>
              <circle cx="10" cy="7" r="2" fill="#EC6819"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                {serviceData.location}
              </div>
              {serviceData.reference && (
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
                  Referencia: {serviceData.reference}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* NAVEGACIÓN: Waze + Google Maps - el operador elige con qué app seguir la ruta */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 10 }}>
            Abre en la app que prefieras para seguir la ruta en línea
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
          {/* Waze */}
          <button
            onClick={handleOpenWaze}
            style={{
              flex: 1,
              padding: '14px 16px',
              background: '#33CCFF',
              border: 'none',
              borderRadius: 12,
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            data-testid="open-waze-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#000"/>
              <circle cx="9" cy="10" r="2" fill="#33CCFF"/>
              <circle cx="15" cy="10" r="2" fill="#33CCFF"/>
              <path d="M8 15C9 17 15 17 16 15" stroke="#33CCFF" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Waze
          </button>
          
          {/* Google Maps - Alternativa */}
          <button
            onClick={handleOpenGoogleMaps}
            style={{
              flex: 1,
              padding: '14px 16px',
              background: '#2A2A2A',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            data-testid="open-gmaps-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
              <circle cx="12" cy="9" r="2.5" fill="#fff"/>
            </svg>
            Google Maps
          </button>
          </div>
        </div>

        {/* Cliente - DATOS PROTEGIDOS */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', marginBottom: 8 }}>
            Cliente
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>
                {serviceData.clientName?.split(' ')[0]} {serviceData.clientName?.split(' ')[1]?.charAt(0)}.
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                Contacto protegido por MAQGO
              </div>
            </div>
            <button
              onClick={handleCallClient}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(144, 189, 211, 0.15)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Llamar a través de MAQGO"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 16.92V19.92C22 20.48 21.56 20.93 21 20.98C20.83 21 20.64 21 20.45 21C10.94 21 3.04 13.1 3 3.56C3 3.37 3 3.17 3.02 3C3.07 2.44 3.52 2 4.08 2H7.08C7.57 2 7.99 2.38 8.05 2.87C8.11 3.36 8.23 3.85 8.4 4.32L7.07 5.65C7.07 5.65 8 8.65 11 11.65C14 14.65 17 15.58 17 15.58L18.33 14.25C18.8 14.42 19.29 14.54 19.78 14.6C20.27 14.66 20.65 15.08 20.65 15.57V18.57" stroke="#90BDD3" strokeWidth="2" fill="none"/>
              </svg>
            </button>
          </div>
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'rgba(236, 104, 25, 0.1)',
            borderRadius: 6,
            fontSize: 11,
            color: 'rgba(255,255,255,0.9)'
          }}>
            La llamada se realiza a través de MAQGO para proteger tu privacidad y la del cliente.
          </div>
        </div>

        {/* Servicio */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="16" viewBox="0 0 40 32" fill="none">
                  <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
                  <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
                  <circle cx="10" cy="28" r="3" fill="#fff"/>
                  <circle cx="22" cy="28" r="3" fill="#fff"/>
                </svg>
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{serviceData.machinery}</div>
                <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>{MACHINERY_PER_TRIP.includes(getMachineryId(serviceData.machinery)) ? 'Valor viaje' : `${serviceData.hours} horas`}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Operador asignado */}
        {assignedOperator && assignedOperator.nombre && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20
          }}>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', marginBottom: 8 }}>
              Operador asignado
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke="#EC6819" strokeWidth="2"/>
                  <path d="M4 20C4 17 7 14 12 14C17 14 20 17 20 20" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>
                  {assignedOperator.nombre} {assignedOperator.apellido}
                  {assignedOperator.isOwner && (
                    <span style={{ 
                      marginLeft: 8, 
                      fontSize: 10, 
                      background: 'rgba(144, 189, 211, 0.2)', 
                      color: '#90BDD3',
                      padding: '2px 6px',
                      borderRadius: 4
                    }}>
                      Propietario
                    </span>
                  )}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                  RUT: {assignedOperator.rut}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botón confirmar llegada */}
        <button
          className="maqgo-btn-primary"
          onClick={handleConfirmArrival}
          disabled={checkingLocation}
          aria-busy={checkingLocation}
          aria-label={checkingLocation ? 'Verificando ubicación' : 'Confirmar llegada a la obra'}
          style={{ 
            marginBottom: 12,
            opacity: checkingLocation ? 0.7 : 1
          }}
          data-testid="confirm-arrival-btn"
        >
          {checkingLocation ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Verificando ubicación...
            </span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke="#fff" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="9" r="2" fill="#fff"/>
              </svg>
              He llegado a la obra
            </>
          )}
        </button>

        {/* Nota sobre GPS */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
            <path d="M12 8V12" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="16" r="1" fill="#90BDD3"/>
          </svg>
          <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11 }}>
            Mantén siempre el GPS activo para confirmar que has llegado a la obra
          </span>
        </div>

        {/* Modal de error de ubicación */}
        {showLocationError && (
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
              maxWidth: 320,
              width: '100%',
              textAlign: 'center'
            }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'rgba(255, 107, 107, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke="#ff6b6b" strokeWidth="2" fill="none"/>
                  <path d="M12 6V10M12 14H12.01" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>
                No estás en la obra
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
                {gpsError}
              </p>
              <button
                onClick={() => setShowLocationError(false)}
                className="maqgo-btn-primary"
                style={{ marginBottom: 10 }}
              >
                Entendido
              </button>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: 0 }}>
                Acércate a la dirección indicada y vuelve a intentar
              </p>
            </div>
          </div>
        )}

        {/* Botón reportar incidente */}
        <button
          onClick={() => setShowIncidentModal(true)}
          style={{
            width: '100%',
            padding: 14,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 25,
            color: 'rgba(255,255,255,0.95)',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
          data-testid="report-incident-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Reportar incidente en ruta
        </button>

        {/* Modal de incidente */}
        {showIncidentModal && (
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
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '0 0 16px' }}>
                Reportar incidente
              </h3>
              
              <div style={{ marginBottom: 16 }}>
                {[
                  'Tráfico pesado',
                  'Parada por combustible',
                  'Bloqueo de ruta',
                  'Maniobra logística',
                  'Incidente menor'
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setIncidentReason(reason)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: incidentReason === reason ? 'rgba(236, 104, 25, 0.2)' : '#363636',
                      border: incidentReason === reason ? '1px solid #EC6819' : '1px solid transparent',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 14,
                      textAlign: 'left',
                      cursor: 'pointer',
                      marginBottom: 8
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
                El cliente será notificado y tendrás 20 minutos de ventana protegida.
              </p>

              <button
                onClick={handleReportIncident}
                disabled={!incidentReason}
                style={{
                  width: '100%',
                  padding: 14,
                  background: incidentReason ? '#EC6819' : '#555',
                  border: 'none',
                  borderRadius: 25,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: incidentReason ? 'pointer' : 'not-allowed',
                  marginBottom: 10
                }}
              >
                Confirmar incidente
              </button>
              
              <button
                onClick={() => setShowIncidentModal(false)}
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
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Botón flotante de chat - Discreto */}
        <ChatFloatingButton
          serviceId={serviceId}
          userType="operator"
          userName={assignedOperator?.name || 'Operador'}
          otherName={serviceData.clientName || 'Cliente'}
        />
      </div>
    </div>
  );
}

export default EnRouteScreen;
