import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getObject, getJSON, getArray } from '../../utils/safeStorage';
import { playNewRequestSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { ProviderRequestExpired } from '../../components/ErrorStates';

import BACKEND_URL from '../../utils/api';
import { idempotencyKey } from '../../utils/bookingPaymentKeys';
import { syncAssignedOperatorToApi } from '../../utils/syncAssignedOperatorToApi';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { IMMEDIATE_MULTIPLIERS } from '../../utils/pricing';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
const MIN_HOURS_FOR_LUNCH = 6;

function buildInitialIncomingRequest() {
  const parsed = getJSON('incomingRequest', null);
  if (parsed) return parsed;

  const machineData = getObject('machineData', {});
  const machineryType = machineData.machineryType || 'retroexcavadora';
  const billingData = getObject('billingData', {});
  const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
  const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
  const serviceLocation = getBookingLocationLineOrEmpty() || 'Av. Providencia 1234, Santiago';
  const workCoords =
    Number.isFinite(serviceLat) && Number.isFinite(serviceLng) ? { lat: serviceLat, lng: serviceLng } : null;
  const clientPhone = localStorage.getItem('userPhone') || '+56987654321';
  const serviceReference = localStorage.getItem('serviceReference') || '';

  return {
    id: `req-${Date.now()}`,
    machineryType: MACHINERY_NAMES[machineryType] || machineryType,
    machineryId: machineryType,
    location: serviceLocation,
    hours: 4,
    date: new Date().toLocaleDateString('es-CL'),
    reservationType: 'immediate',
    clientName: billingData.nombre
      ? `${billingData.nombre} ${billingData.apellido || ''}`.trim()
      : 'Carlos González',
    clientPhone,
    clientRating: 4.7,
    pricePerHour: 80000,
    transportFee: 35000,
    distance: 5.2,
    eta: 10,
    client_lat: workCoords?.lat,
    client_lng: workCoords?.lng,
    workCoords,
    reference: serviceReference
  };
}

/**
 * Pantalla: Solicitud Recibida (PROVEEDOR)
 * 
 * UX RULES (Pricing Policy v1):
 * - Proveedor ve la BONIFICACIÓN como oportunidad
 * - Lenguaje positivo: "Bonificación por reserva prioritaria (inicio HOY)"
 * - Muestra ganancia extra en dinero, no solo %
 * - Debe pensar: "Si me activo, gano más por menos horas"
 */
function RequestReceivedScreen() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(60);
  const [request] = useState(buildInitialIncomingRequest);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [acceptError, setAcceptError] = useState(null); // Error al aceptar (pago, red, etc.)
  const expirationHandledRef = useRef(false);

  useEffect(() => {
    unlockAudio();
    playNewRequestSound();
    vibrate('newRequest');
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      if (!expirationHandledRef.current) {
        expirationHandledRef.current = true;
        setExpired(true);
        const home =
          localStorage.getItem('providerRole') === 'operator' ? '/operator/home' : getProviderLandingPath();
        const t = setTimeout(() => navigate(home), 3000);
        return () => clearTimeout(t);
      }
      return undefined;
    }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, navigate]);

  // Alertas periódicas mientras la solicitud está activa
  useEffect(() => {
    let soundInterval;
    
    // Vibración inicial fuerte
    vibrate('newRequest');
    
    // Repetir sonido cada 5 segundos mientras queda tiempo
    soundInterval = setInterval(() => {
      if (countdown > 10) {
        playNewRequestSound();
        vibrate('alert');
      }
    }, 5000);
    
    return () => {
      clearInterval(soundInterval);
      if ('vibrate' in navigator) navigator.vibrate(0);
    };
  }, [countdown]);

  // Cálculos según Pricing Policy v1
  const calculateEarnings = () => {
    if (!request) return { base: 0, bonus: 0, total: 0 };
    
    const hours = request.hours || 4;
    const basePrice = request.pricePerHour || 80000;
    const transportFee = request.transportFee || 0;
    const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.20;
    
    // Ganancia base (sin bonificación)
    const baseService = basePrice * hours;
    const baseTotal = baseService + transportFee;
    
    // Ganancia con bonificación inmediata
    const immediateService = Math.round(basePrice * hours * multiplier);
    const immediateTotal = immediateService + transportFee;
    
    // Bonificación (lo extra que gana)
    const bonus = immediateService - baseService;
    const bonusPercent = Math.round((multiplier - 1) * 100);
    
    return {
      baseService,
      baseTotal,
      immediateService,
      immediateTotal,
      bonus,
      bonusPercent,
      multiplier,
      transportFee,
      hours
    };
  };

  const earnings = calculateEarnings();

  const handleAccept = async () => {
    setAcceptError(null);
    setLoading(true);
    try {
      const userId = localStorage.getItem('userId');
      if (request?.id && !request.id.startsWith('req-')) {
        await axios.put(
          `${BACKEND_URL}/api/service-requests/${request.id}/accept`,
          { providerId: userId },
          {
            timeout: 12000,
            headers: { 'Idempotency-Key': idempotencyKey(`accept-${request.id}`) },
          }
        );
      }
      localStorage.setItem('acceptedRequest', JSON.stringify(request));
      localStorage.setItem('currentServiceId', request?.id || `demo-${Date.now()}`);
      localStorage.setItem('activeServiceRequest', JSON.stringify(request));

      // Verificar si hay múltiples operadores para mostrar pantalla de selección
      const savedOperators = getArray('operatorsData', []);
      if (savedOperators.length > 1) {
        navigate('/provider/select-operator');
      } else {
        const operator = savedOperators[0] || {};
        localStorage.setItem('assignedOperator', JSON.stringify(operator));
        void syncAssignedOperatorToApi(operator);
        navigate('/provider/en-route');
      }
    } catch (e) {
      console.error(e);
      const isPaymentError = e.response?.status === 400 && (e.response?.data?.detail || '').toString().toLowerCase().includes('pago');
      const isGone = e.response?.status === 410 || (e.response?.data?.detail || '').toString().toLowerCase().includes('no está disponible');
      const msg = isPaymentError
        ? 'No se pudo procesar el cobro al cliente. La solicitud sigue activa para otro proveedor.'
        : isGone
          ? 'Esta solicitud ya no está disponible (expirada o asignada).'
          : e.response?.data?.detail
            ? (Array.isArray(e.response.data.detail) ? e.response.data.detail[0]?.msg : e.response.data.detail)
            : e.code === 'ECONNABORTED' || e.message?.includes('timeout')
              ? 'Tiempo de espera agotado. Revisa tu conexión e intenta de nuevo.'
              : 'Error al aceptar. Revisa tu conexión e intenta de nuevo.';
      setAcceptError(msg);
    }
    setLoading(false);
  };

  const isOperator = localStorage.getItem('providerRole') === 'operator';
  const homeRoute = isOperator ? '/operator/home' : getProviderLandingPath();

  const handleReject = async () => {
    try {
      if (request?.id && !request.id.startsWith('req-')) {
        await axios.put(`${BACKEND_URL}/api/service-requests/${request.id}/reject`, {}, { timeout: 12000 });
      }
    } catch {
      // Ya manejamos fallback de navegación aunque falle el rechazo.
    }
    localStorage.removeItem('incomingRequest');
    navigate(homeRoute);
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP',
      maximumFractionDigits: 0 
    }).format(amount);
  };

  // Estado: Solicitud expirada
  if (expired) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div className="maqgo-screen">
          <ProviderRequestExpired onClose={() => navigate(homeRoute)} />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 25px', overflowY: 'auto' }}>
        <style>{`
          @keyframes alertPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
          }
          @keyframes borderPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(236, 104, 25, 0.7); }
            50% { box-shadow: 0 0 0 10px rgba(236, 104, 25, 0); }
          }
          .alert-badge { animation: alertPulse 1s ease-in-out infinite; }
          .countdown-ring { animation: borderPulse 1.5s ease-in-out infinite; }
        `}</style>

        {/* Badge NUEVA SOLICITUD - Sin emoji */}
        <div className="alert-badge" style={{
          background: '#EC6819',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 15,
          textTransform: 'uppercase',
          letterSpacing: 1
        }}>
          NUEVA SOLICITUD
        </div>

        {/* Countdown */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="countdown-ring" style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: `conic-gradient(#EC6819 ${(countdown/60)*360}deg, #333 0deg)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <div style={{
              width: 65,
              height: 65,
              borderRadius: '50%',
              background: '#2D2D2D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ 
                color: countdown <= 10 ? '#ff6b6b' : '#EC6819', 
                fontSize: 24, 
                fontWeight: 700,
                fontFamily: 'monospace'
              }}>
                {countdown}s
              </span>
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
            {countdown <= 10 ? '¡Responde rápido!' : 'Tiempo para responder'}
          </p>
        </div>

        {/* BONIFICACIÓN DESTACADA - Sin gradiente, sin emoji */}
        {request?.reservationType === 'immediate' && (
          <div style={{
            background: '#2A2A2A',
            border: '2px solid #90BDD3',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center'
          }}>
            <p style={{ 
              color: '#90BDD3', 
              fontSize: 13, 
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
              fontWeight: 600
            }}>
              Bonificación por reserva prioritaria
            </p>
            <p style={{ 
              color: '#90BDD3', 
              fontSize: 28, 
              fontWeight: 700, 
              margin: '0 0 4px' 
            }}>
              +{formatMoney(earnings.bonus)}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
              Ganas <strong style={{ color: '#90BDD3' }}>+{earnings.bonusPercent}%</strong> por inicio HOY ({isPerTripMachineryType(request?.machinery_type || request?.machineryType) ? 'Valor viaje' : `${earnings.hours} horas`})
            </p>
          </div>
        )}

        {/* Info de solicitud */}
        <div style={{
          background: '#363636',
          borderRadius: 14,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                <circle cx="12" cy="8" r="4" stroke="#EC6819" strokeWidth="2"/>
                <path d="M4 20C4 17 7 14 12 14C17 14 20 17 20 20" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
                Cliente MAQGO
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z" fill="#EC6819"/>
                </svg>
                <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                  {(request?.clientRating ?? 4.5).toFixed(1)}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                  · Contacto protegido
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detalles de la reserva */}
        <div style={{
          background: '#363636',
          borderRadius: 14,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
            Detalles
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Maquinaria</span>
            <span style={{ color: '#EC6819', fontSize: 13, fontWeight: 600 }}>{request?.machineryType ? (MACHINERY_NAMES[request.machineryType] || request.machineryType) : '-'}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Duración</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {isPerTripMachineryType(request?.machinery_type || request?.machineryType) ? 'Valor viaje' : (<>{request?.hours} horas{request?.hours >= MIN_HOURS_FOR_LUNCH && <span style={{ color: '#90BDD3' }}> + 1h colación</span>}</>)}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Ubicación</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>
              {request?.location}
            </span>
          </div>

          {/* ETA y distancia */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #444' }}>
            <div style={{ flex: 1, background: '#2D2D2D', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Distancia</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{request?.distance || 5} km</div>
            </div>
            <div style={{ flex: 1, background: '#2D2D2D', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Llegar en</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{request?.eta || 10} min</div>
            </div>
          </div>
        </div>

        {/* TU GANANCIA TOTAL */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 14,
          padding: 16,
          marginBottom: 12,
          textAlign: 'center'
        }}>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 12, 
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1
          }}>
            Tu ganancia total
          </p>
          <p style={{ 
            color: '#90BDD3', 
            fontSize: 32, 
            fontWeight: 700, 
            margin: '0 0 8px' 
          }}>
            {formatMoney(earnings.immediateTotal)}
          </p>
          
          {earnings.transportFee > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
              Incluye {formatMoney(earnings.transportFee)} de traslado
            </p>
          )}
        </div>

        {/* INFO FACTURA Y PAGO */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
            <path d="M12 6V12L16 14" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600 }}>
            Sube factura 24 h después del servicio · Pago en 2 días hábiles tras subirla
          </span>
        </div>

        {/* Microcopy sobre cobro al cliente */}
        <div style={{
          background: 'rgba(236, 104, 25, 0.1)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 16
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 13,
            margin: 0,
            textAlign: 'center'
          }}>
            Al aceptar, se cobra al cliente desde su tarjeta guardada.
          </p>
        </div>

        {/* Error al aceptar (pago fallido, red, solicitud no disponible) */}
        {acceptError && (
          <div style={{
            background: 'rgba(229, 57, 53, 0.15)',
            border: '1px solid rgba(229, 57, 53, 0.5)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16
          }}>
            <p style={{ color: '#ff6b6b', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>
              No se pudo aceptar
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0, lineHeight: 1.4 }}>
              {acceptError}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { setAcceptError(null); handleAccept(); }}
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reintentar
              </button>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => { setAcceptError(null); navigate(homeRoute); }}
                style={{ flex: 1 }}
              >
                Volver al inicio
              </button>
            </div>
          </div>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={handleReject}
            style={{
              flex: 1,
              padding: 14,
              background: 'transparent',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: 30,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            No puedo esta reserva
          </button>
          <button 
            className="maqgo-btn-primary"
            onClick={handleAccept}
            disabled={loading}
            aria-busy={loading}
            aria-label={loading ? 'Aceptando solicitud' : 'Aceptar reserva'}
            style={{ flex: 2, padding: 14, fontSize: 16 }}
            data-testid="accept-request-btn"
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
                Aceptando...
              </span>
            ) : (
              'Aceptar reserva'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequestReceivedScreen;
