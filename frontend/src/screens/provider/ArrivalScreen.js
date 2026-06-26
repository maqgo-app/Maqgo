import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playAccessGrantedAlert, playSuccessAlert, playArrivalAlert, vibrate } from '../../utils/alertSound';

import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getObjectFirst } from '../../utils/safeStorage';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { useAdaptivePolling } from '../../hooks/useAdaptivePolling';

/**
 * Pantalla: Llegada a Destino (PROVEEDOR)
 * 
 * Se muestra cuando el proveedor confirma que llegó a la obra.
 * Espera confirmación del cliente para iniciar el servicio.
 */
function buildArrivalServiceData() {
  const request = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
  return {
    clientName: request.clientName || 'Carlos González',
    location: request.location || localStorage.getItem('serviceLocation') || 'Av. Providencia 1234, Santiago',
    machinery: request.machineryType || localStorage.getItem('selectedMachinery') || 'retroexcavadora',
    hours: request.hours || parseInt(localStorage.getItem('selectedHours') || '4', 10)
  };
}

function resolveServiceRequestId() {
  const req = getObjectFirst(['activeServiceRequest', 'acceptedRequest', 'incomingRequest'], {});
  const id = req?.id || req?.requestId || localStorage.getItem('currentServiceId');
  return id ? String(id).trim() : '';
}

function ArrivalScreen() {
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [serviceData] = useState(buildArrivalServiceData);
  const [arrivalTime] = useState(() =>
    new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  );
  const [waitingForClient, setWaitingForClient] = useState(true);
  const [clientAccepted, setClientAccepted] = useState(false);
  const [waitingMinutes, setWaitingMinutes] = useState(0);
  const [autoStarting, setAutoStarting] = useState(false);
  const [autoStartRequested, setAutoStartRequested] = useState(false);
  const [clientOnTheWay, setClientOnTheWay] = useState(false);
  const [serviceRequestId] = useState(resolveServiceRequestId);

  // Timer de 30 minutos
  const MAX_WAITING_MINUTES = 30;

  const handleStartService = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    localStorage.setItem('serviceStarted', 'true');
    localStorage.setItem('serviceStartTime', new Date().toISOString());
    navigate('/provider/service-active');
  }, [navigate]);

  useEffect(() => {
    const now = new Date();
    localStorage.setItem('arrivalTime', now.toISOString());
    
    // Notificar al cliente que el operador llegó
    localStorage.setItem('operatorArrived', 'true');
    localStorage.setItem('operatorArrivedTime', now.toISOString());

    // Sonido y vibración de confirmación de llegada (proveedor)
    playArrivalAlert();
  }, []);

  // Confirmación de ingreso backend-driven (cross-dispositivo)
  useAdaptivePolling({
    enabled: Boolean(serviceRequestId) && waitingForClient,
    baseIntervalMs: 3000,
    maxIntervalMs: 30000,
    run: async () => {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceRequestId)}`,
        { redirectOn401: false },
        12000
      );
      if (!res.ok) return false;
      const data = await res.json();
      const confirmedAt = data?.clientEntryConfirmedAt;
      const status = String(data?.status || '').trim();

      if (confirmedAt || status === 'in_progress') {
        setWaitingForClient(false);
        setClientAccepted(true);
        playAccessGrantedAlert();
        setTimeout(() => {
          handleStartService();
        }, 1200);
      }
      return true;
    },
  });

  // Escuchar cuando el cliente presiona "Ya voy"
  useEffect(() => {
    const isDemo = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
    if (!isDemo) return undefined;
    const checkClientOnTheWay = setInterval(() => {
      const onTheWay = localStorage.getItem('clientOnTheWay');
      if (onTheWay === 'true' && !clientOnTheWay) {
        setClientOnTheWay(true);
        // Alerta amigable para el proveedor
        playSuccessAlert();
        vibrate([200, 100, 200]);
      }
    }, 1000);

    return () => {
      clearInterval(checkClientOnTheWay);
    };
  }, [clientOnTheWay]);

  // Timer de 30 minutos - inicio automático si cliente no responde
  useEffect(() => {
    if (!waitingForClient || clientAccepted) return;

    const isDemo = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
    const intervalMs = isDemo ? 3000 : 60000;

    const timerInterval = setInterval(() => {
      setWaitingMinutes((prev) => {
        const next = Math.min(prev + 1, MAX_WAITING_MINUTES);
        if (next >= MAX_WAITING_MINUTES) {
          setAutoStarting(true);
        }
        return next;
      });
    }, intervalMs);

    return () => {
      clearInterval(timerInterval);
    };
  }, [waitingForClient, clientAccepted, handleStartService]);

  useEffect(() => {
    if (!serviceRequestId) return undefined;
    if (!waitingForClient || clientAccepted) return undefined;
    if (waitingMinutes < MAX_WAITING_MINUTES) return undefined;
    if (autoStartRequested) return undefined;
    let cancelled = false;

    const attempt = async () => {
      try {
        setAutoStartRequested(true);
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceRequestId)}/auto-start`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, redirectOn401: false },
          12000
        );
        if (cancelled) return;
        if (!res.ok) {
          void 0;
        }
      } catch {
        void 0;
      }
    };

    attempt();
    return () => {
      cancelled = true;
    };
  }, [serviceRequestId, waitingForClient, clientAccepted, waitingMinutes, autoStartRequested]);

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Banner de auto-inicio (30 min sin respuesta) */}
        {autoStarting && (
          <div style={{
            background: 'linear-gradient(135deg, #FFC107 0%, #FF9800 100%)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center'
          }}>
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
                  <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2"/>
                  <path d="M12 6V12L16 14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  30 minutos desde la llegada
                </p>
                <p style={{ color: 'rgba(0,0,0,0.7)', fontSize: 13, margin: '4px 0 0' }}>
                  Si la llegada está verificada, el servicio pasa a En curso automáticamente
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Banner de confirmación del cliente */}
        {clientAccepted && !autoStarting && (
          <div style={{
            background: 'linear-gradient(135deg, #90BDD3 0%, #00ACC1 100%)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center',
            animation: 'pulse-banner 0.5s ease-out'
          }}>
            <style>{`
              @keyframes pulse-banner {
                0% { transform: scale(0.95); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
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
                  <path d="M5 13L9 17L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  ¡Cliente confirmó ingreso!
                </p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '4px 0 0' }}>
                  Puedes iniciar el servicio
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Banner "Cliente en camino" - cuando presiona "Ya voy" */}
        {clientOnTheWay && !clientAccepted && !autoStarting && (
          <div style={{
            background: 'linear-gradient(135deg, #EC6819 0%, #FF8C42 100%)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center',
            animation: 'pulse-banner 0.5s ease-out'
          }} data-testid="client-on-the-way-banner">
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
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  Llegada registrada
                </p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '4px 0 0' }}>
                  Enviamos un aviso al cliente informando de tu llegada.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Estado de llegada */}
        <div style={{
          background: waitingForClient ? 'rgba(255, 193, 7, 0.15)' : 'rgba(144, 189, 211, 0.15)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          textAlign: 'center'
        }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: waitingForClient ? 'rgba(255, 193, 7, 0.2)' : 'rgba(144, 189, 211, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            {waitingForClient ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 2s linear infinite' }}>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="10" stroke="#FFC107" strokeWidth="2" strokeDasharray="40 20"/>
              </svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M5 13L9 17L19 7" stroke="#90BDD3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <h2 style={{ color: waitingForClient ? '#FFC107' : '#90BDD3', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
            {waitingForClient ? 'Esperando autorización de ingreso' : 'Llegaste al destino'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
            {waitingForClient 
              ? 'El cliente debe confirmar tu ingreso a la obra' 
              : `Hora de llegada: ${arrivalTime}`}
          </p>
          
          {/* Timer de espera */}
          {waitingForClient && !autoStarting && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'rgba(255, 193, 7, 0.15)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#FFC107" strokeWidth="2"/>
                <path d="M12 6V12L16 14" stroke="#FFC107" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ color: '#FFC107', fontSize: 12, fontWeight: 600 }}>
                Esperando: {waitingMinutes} / {MAX_WAITING_MINUTES} min
              </span>
            </div>
          )}
        </div>

        {/* Dirección de destino */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16
        }}>
          <div style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 12, 
            textTransform: 'uppercase', 
            marginBottom: 10,
            letterSpacing: 1
          }}>
            Ubicación del servicio
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'rgba(236, 104, 25, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke="#EC6819" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="9" r="2.5" fill="#EC6819"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {serviceData.location}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                Servicio MAQGO
              </div>
            </div>
          </div>
        </div>

        {/* Detalle del servicio */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 12, 
            textTransform: 'uppercase', 
            marginBottom: 10,
            letterSpacing: 1
          }}>
            Servicio contratado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="20" viewBox="0 0 40 32" fill="none">
                <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
                <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
                <circle cx="10" cy="28" r="3" fill="#fff"/>
                <circle cx="22" cy="28" r="3" fill="#fff"/>
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
                {MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                {isPerTripMachineryType(serviceData.machinery) ? 'Valor viaje' : `${serviceData.hours} horas de servicio`}
              </div>
            </div>
          </div>
        </div>

        {/* Instrucciones */}
        <div style={{
          background: 'rgba(236, 104, 25, 0.1)',
          borderRadius: 10,
          padding: 14,
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" stroke="#EC6819" strokeWidth="2"/>
              <path d="M12 8V12" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#EC6819"/>
            </svg>
            <div>
              <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>
                Antes de iniciar
              </p>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                Confirma con el cliente que estás en el lugar correcto y que puede comenzar el servicio.
              </p>
            </div>
          </div>
        </div>

        {/* Botón iniciar servicio */}
        <button
          className="maqgo-btn-primary"
          onClick={handleStartService}
          disabled={waitingForClient}
          style={{ 
            marginBottom: 12,
            opacity: waitingForClient ? 0.5 : 1,
            cursor: waitingForClient ? 'not-allowed' : 'pointer'
          }}
          data-testid="start-service-btn"
        >
          {waitingForClient ? 'Esperando al cliente...' : 'Iniciar servicio'}
        </button>

        {/* Info de pago */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
            <path d="M12 6V12L16 14" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ color: '#90BDD3', fontSize: 12 }}>
            Sube factura 24 h después del servicio · Pago en 2 días hábiles tras subirla
          </span>
        </div>
      </div>
    </div>
  );
}

export default ArrivalScreen;
