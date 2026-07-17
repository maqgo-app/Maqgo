import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { Navigation, MapPin, Timer, AlertTriangle } from 'lucide-react';

// Coordenadas de demo para la obra (Santiago Centro)
const DEMO_WORK_LOCATION = { lat: -33.4489, lng: -70.6693 };

import BACKEND_URL from '../../utils/api';
import { getObject, getArray, getObjectFirst } from '../../utils/safeStorage';
import { isPerTripMachineryType } from '../../utils/machineryNames';

/**
 * Pantalla: En Camino a la Obra (PROVEEDOR)
 * 
 * Incluye:
 * - Dirección de destino con botón para abrir navegación
 * - ETA estimado
 * - Datos del cliente
 * - Botón para confirmar llegada
 * - Botón para reportar incidente
 */
function EnRouteScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [isOperator] = useState(() => {
    const pr = String(localStorage.getItem('providerRole') || '').toLowerCase();
    const ur = String(localStorage.getItem('userRole') || '').toLowerCase();
    return location.pathname.startsWith('/operator') || pr === 'operator' || ur === 'operator';
  });
  const [eta, setEta] = useState(15);
  const [serviceData, setServiceData] = useState({});
  const [assignedOperator, setAssignedOperator] = useState(null);
  const [canChangeAssignedOperator, setCanChangeAssignedOperator] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentReason, setIncidentReason] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [, setOperatorLocation] = useState({ lat: -33.4372, lng: -70.6506 });
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
    setCanChangeAssignedOperator(!isOperator && getArray('assignableServiceOperators', []).length > 1);
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

  const handleReportIncident = async () => {
    // Registrar incidente + activar ventana protegida
    const incidentData = {
      providerId: localStorage.getItem('userId'),
      serviceId: localStorage.getItem('currentServiceId'),
      timestamp: new Date().toISOString(),
      type: 'INCIDENT_REPORTED',
      reason: incidentReason,
      protectedWindowEnd: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };

    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/service-requests/${serviceId}/report-incident`,
        { reason: incidentReason, protectedWindowMinutes: 30 },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (res?.data?.activeIncident) {
        localStorage.setItem('activeIncident', JSON.stringify(res.data.activeIncident));
      } else {
        localStorage.setItem('activeIncident', JSON.stringify(incidentData));
      }
      toast.success('Incidente reportado.');
    } catch {
      const incidents = getArray('incidentEvents', []);
      incidents.push(incidentData);
      localStorage.setItem('incidentEvents', JSON.stringify(incidents));
      localStorage.setItem('activeIncident', JSON.stringify(incidentData));
      toast.success('Incidente reportado.');
    } finally {
      setShowIncidentModal(false);
      setIncidentReason('');
    }
  };

  const handleManualArrival = async () => {
    setCheckingLocation(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/service-requests/${serviceId}/mark-arrival`,
        { source: 'manual' },
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch {
      toast.error('No se pudo registrar la llegada en MAQGO. Intenta nuevamente.');
      setCheckingLocation(false);
      return;
    } finally {
      const nowIso = new Date().toISOString();
      localStorage.setItem('providerArrived', 'true');
      localStorage.setItem('arrivalConfirmedTime', nowIso);
      localStorage.setItem('operatorArrivalCoords', JSON.stringify({ source: 'manual' }));
      setCheckingLocation(false);
      navigate(isOperator ? '/operator/arrival' : '/provider/arrival');
    }
  };

  const handleConfirmArrival = () => {
    void handleManualArrival();
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

  // Sin llamada directa.

  const cardStyle = {
    background: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const sectionLabelStyle = {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: 900,
    textTransform: 'uppercase',
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: '16px 24px 24px', paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 1040 }}>
          <div style={{ marginBottom: 18 }}>
            <MaqgoLogo size="small" />
          </div>

          <div
            style={{
              background: '#363636',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16,
              padding: '16px 18px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: 'rgba(236, 104, 25, 0.18)',
                  border: '1px solid rgba(236, 104, 25, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Navigation size={20} color="#EC6819" strokeWidth={2.5} />
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: 0.2 }}>En ruta</div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6, lineHeight: 1.25 }}>
                  {isOperator ? 'En ruta al sitio del servicio' : 'En ruta a la obra'}
                </div>
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: 'rgba(236,104,25,0.12)', border: '1px solid rgba(236,104,25,0.28)' }}>
              <Timer size={16} color="#EC6819" />
              <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: 900 }}>{eta} min</div>
            </div>
          </div>

          <div style={{ background: 'rgba(255, 193, 7, 0.14)', border: '1px solid rgba(255, 193, 7, 0.30)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ color: '#ffc107', fontWeight: 900, letterSpacing: 0.2 }}>Tiempo estimado de llegada</div>
            <div style={{ color: '#fff', fontSize: 46, fontWeight: 950, letterSpacing: 1, marginTop: 8 }}>
              {eta}<span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 18, fontWeight: 700, marginLeft: 8 }}>min</span>
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={sectionLabelStyle}>Destino</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10 }}>
              <MapPin size={18} color="#EC6819" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{serviceData.location}</div>
                {serviceData.reference ? (
                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
                    Referencia: {serviceData.reference}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={sectionLabelStyle}>Navegación</div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 8, lineHeight: 1.35 }}>
              Abre la app que prefieras para seguir la ruta.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="maqgo-btn-secondary" type="button" onClick={handleOpenWaze} data-testid="open-waze-btn" style={{ flex: 1, minWidth: 160 }}>
                Abrir Waze
              </button>
              <button className="maqgo-btn-secondary" type="button" onClick={handleOpenGoogleMaps} data-testid="open-gmaps-btn" style={{ flex: 1, minWidth: 160 }}>
                Abrir Google Maps
              </button>
            </div>
          </div>

          {/* Cliente - DATOS PROTEGIDOS */}
          <div style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>
            Cliente MAQGO
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>
                {serviceData.clientName?.split(' ')[0]} {serviceData.clientName?.split(' ')[1]?.charAt(0)}.
              </div>
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 4 }}>
                Contacto protegido
              </div>
            </div>
          </div>
          {null}
        </div>

        {/* Servicio */}
        <div style={{ ...cardStyle, marginBottom: 12 }}>
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
                <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>{isPerTripMachineryType(serviceData.machinery) ? 'Valor viaje' : `${serviceData.hours} horas`}</div>
              </div>
            </div>
          </div>
        </div>

        {!isOperator && assignedOperator && assignedOperator.nombre && (
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>
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
                      fontSize: 12, 
                      background: 'rgba(236, 104, 25, 0.14)', 
                      color: 'rgba(255,255,255,0.92)',
                      border: '1px solid rgba(236, 104, 25, 0.28)',
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
            {canChangeAssignedOperator && (
                <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/provider/select-operator', { state: { fromEnRoute: true } })} style={{ marginTop: 12 }}>
                Cambiar operador
              </button>
            )}
          </div>
        )}

        {/* Botón confirmar llegada */}
        <button
          className="maqgo-btn-primary"
          onClick={handleConfirmArrival}
          disabled={checkingLocation}
          aria-busy={checkingLocation}
          aria-label={checkingLocation ? 'Registrando llegada' : 'Confirmar llegada a la obra'}
          style={{ 
            marginBottom: 12,
            opacity: checkingLocation ? 0.7 : 1
          }}
          data-testid="confirm-arrival-btn"
        >
          {checkingLocation ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Registrando llegada...
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

        <button className="maqgo-btn-secondary" type="button" onClick={() => setShowIncidentModal(true)} data-testid="report-incident-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <AlertTriangle size={18} />
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

              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                El incidente quedará registrado.
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

        {null}
        </div>
      </div>
    </div>
  );
}

export default EnRouteScreen;
