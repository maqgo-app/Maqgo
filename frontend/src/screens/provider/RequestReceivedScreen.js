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
import { AddressAutocomplete, getGoogleMapsApiKey } from '../../components/AddressAutocomplete';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
import { useAuth } from '../../context/authHooks';
const MIN_HOURS_FOR_LUNCH = 6;

function parseIsoToMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function toNumber(value) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getOfferRemainingSeconds(req) {
  const explicit = toNumber(req?.remainingSeconds);
  if (explicit != null) return Math.max(0, Math.floor(explicit));
  const expMs = parseIsoToMs(req?.offerExpiresAt);
  if (!expMs) return 60;
  const left = Math.ceil((expMs - Date.now()) / 1000);
  return Math.max(0, left);
}

function getProviderEarningsFromRequest(req) {
  const direct =
    toNumber(req?.providerEarnings) ??
    toNumber(req?.provider_earnings) ??
    toNumber(req?.pricing?.providerEarnings) ??
    toNumber(req?.pricing?.provider_earnings);
  if (direct != null) return direct;

  const isDemo = typeof req?.id === 'string' && req.id.startsWith('req-');
  if (!isDemo) return null;

  const hours = toNumber(req?.hours) ?? 0;
  const pricePerHour = toNumber(req?.pricePerHour) ?? 0;
  const transportFee = toNumber(req?.transportFee) ?? 0;
  const base = pricePerHour * hours + transportFee;
  return Number.isFinite(base) ? Math.round(base) : 0;
}

function getUrgencyBonusFromRequest(req) {
  return (
    toNumber(req?.urgencyBonus) ??
    toNumber(req?.immediateBonus) ??
    toNumber(req?.breakdown?.urgency_bonus) ??
    toNumber(req?.breakdown?.immediate_bonus) ??
    toNumber(req?.pricing?.urgency_bonus) ??
    toNumber(req?.pricing?.immediate_bonus) ??
    null
  );
}

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
    reference: serviceReference,
    offerExpiresAt: new Date(Date.now() + 60000).toISOString(),
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
  const { hasPermission } = useAuth();
  const [request, setRequest] = useState(() => buildInitialIncomingRequest());
  const [countdown, setCountdown] = useState(() => getOfferRemainingSeconds(getJSON('incomingRequest', {}) || {}));
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [acceptError, setAcceptError] = useState(null); // Error al aceptar (pago, red, etc.)
  const [intentError, setIntentError] = useState(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [flowStep, setFlowStep] = useState('review'); // review | preconfirm
  const [storedDeparture, setStoredDeparture] = useState(null);
  const [departureMode, setDepartureMode] = useState('');
  const [departureLocation, setDepartureLocation] = useState(null);
  const [etaMode, setEtaMode] = useState('');
  const [etaMinutes, setEtaMinutes] = useState(null);
  const expirationHandledRef = useRef(false);

  useEffect(() => {
    unlockAudio();
    playNewRequestSound();
    vibrate('newRequest');
  }, []);

  useEffect(() => {
    setCountdown(getOfferRemainingSeconds(request));
  }, [request]);

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

  const handleAccept = async () => {
    setAcceptError(null);
    setLoading(true);
    try {
      const userId = localStorage.getItem('userId');
      const providerIdForOffer = String(
        request?.currentOfferId ||
          request?.providerId ||
          request?.provider_id ||
          localStorage.getItem('ownerId') ||
          userId ||
          ''
      );
      if (request?.id && !request.id.startsWith('req-')) {
        await axios.put(
          `${BACKEND_URL}/api/service-requests/${request.id}/accept`,
          { providerId: providerIdForOffer },
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

  const providerEarnings = getProviderEarningsFromRequest(request);
  const urgencyBonus = getUrgencyBonusFromRequest(request);
  const transportFee = toNumber(request?.transportFee);
  const countdownMax = Math.max(1, Math.floor(toNumber(request?.offerTimeoutSeconds) ?? 60));
  const reservationType = String(request?.reservationType || '').toLowerCase();
  const isImmediate = reservationType === 'immediate';
  const isScheduled = reservationType === 'scheduled';
  const scheduledDate = request?.scheduledDate || null;
  const showEtaDistance = toNumber(request?.distance) != null || toNumber(request?.eta) != null;
  const urgencyWindowMinutes = toNumber(request?.urgencyWindowMinutes);
  const hasDepartureConfirmed =
    request?.confirmedDepartureLocation &&
    request.confirmedDepartureLocation.lat != null &&
    request.confirmedDepartureLocation.lng != null;
  const hasEtaCommitted = typeof request?.etaCommitMinutes === 'number' && request.etaCommitMinutes > 0;
  const requiresPreconfirm = Boolean(isImmediate && !request?.id?.startsWith?.('req-') && (!hasDepartureConfirmed || !hasEtaCommitted));
  const canProceedToAccept = !requiresPreconfirm;
  const userId = localStorage.getItem('userId') || '';
  const operatorGpsConfirmed =
    Boolean(
      isOperator &&
      hasDepartureConfirmed &&
      String(request?.confirmedDepartureLocation?.source || '').toLowerCase() === 'gps' &&
      String(request?.confirmedDepartureLocation?.confirmedByUserId || '') === String(userId) &&
      hasEtaCommitted
    );
  const canAcceptRequests = typeof hasPermission === 'function' ? hasPermission('canAcceptRequests') : true;
  const canAcceptNow = canProceedToAccept && (canAcceptRequests || operatorGpsConfirmed);

  const loadStoredDepartureLocation = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-');
    if (isDemoId) return;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/users/${userId}`, { timeout: 6000 });
      const loc = res.data?.location;
      const lat = toNumber(loc?.lat);
      const lng = toNumber(loc?.lng);
      if (lat != null && lng != null) {
        setStoredDeparture({ lat, lng, address: '', source: 'stored' });
      }
    } catch {
      void 0;
    }
  };

  const captureGpsSnapshot = async () => {
    if (!navigator.geolocation) return null;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, address: '', source: 'gps' };
    } catch {
      return null;
    }
  };

  const handleStartPreconfirm = async () => {
    setIntentError(null);
    setAcceptError(null);
    setFlowStep('preconfirm');
    setDepartureMode('');
    setDepartureLocation(null);
    setEtaMode('');
    setEtaMinutes(null);
    await loadStoredDepartureLocation();
  };

  const handleConfirmIntent = async () => {
    setIntentError(null);
    setIntentLoading(true);
    try {
      if (!request?.id || request.id.startsWith('req-')) {
        setIntentLoading(false);
        setFlowStep('review');
        return;
      }
      const loc = departureLocation;
      if (!loc || loc.lat == null || loc.lng == null) {
        setIntentError('Debes confirmar desde dónde sale la máquina.');
        setIntentLoading(false);
        return;
      }
      if (isOperator && String(loc.source || '').toLowerCase() !== 'gps') {
        setIntentError('Como operador, debes confirmar usando GPS activo.');
        setIntentLoading(false);
        return;
      }
      const eta = typeof etaMinutes === 'number' ? etaMinutes : null;
      if (!eta || eta <= 0) {
        setIntentError('Debes confirmar el tiempo de llegada.');
        setIntentLoading(false);
        return;
      }
      if (typeof urgencyWindowMinutes === 'number' && urgencyWindowMinutes > 0 && eta > urgencyWindowMinutes) {
        setIntentError('El tiempo informado no cumple la urgencia solicitada.');
        setIntentLoading(false);
        return;
      }
      const { data } = await axios.post(
        `${BACKEND_URL}/api/service-requests/${request.id}/intent`,
        { departureLocation: loc, etaMinutes: eta },
        { timeout: 12000 }
      );
      const next = {
        ...request,
        confirmedDepartureLocation: data?.confirmedDepartureLocation || { lat: loc.lat, lng: loc.lng, address: loc.address || '', source: loc.source || 'manual' },
        etaCommitMinutes: data?.etaCommitMinutes || eta,
      };
      setRequest(next);
      localStorage.setItem('incomingRequest', JSON.stringify(next));
      setFlowStep('review');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setIntentError(typeof detail === 'string' && detail.trim() ? detail.trim() : 'No se pudo confirmar ubicación y llegada.');
    }
    setIntentLoading(false);
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
            background: `conic-gradient(#EC6819 ${(countdown / countdownMax) * 360}deg, #333 0deg)`,
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

        {isImmediate && urgencyBonus != null && urgencyBonus > 0 && (
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
              Adicional por urgencia
            </p>
            <p style={{ 
              color: '#90BDD3', 
              fontSize: 28, 
              fontWeight: 700, 
              margin: '0 0 4px' 
            }}>
              +{formatMoney(urgencyBonus)}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
              Inicio HOY
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

          {isScheduled && scheduledDate ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Fecha</span>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>
                {String(scheduledDate)}
              </span>
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Ubicación</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>
              {request?.location}
            </span>
          </div>

          {/* ETA y distancia */}
          {showEtaDistance ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #444' }}>
              {toNumber(request?.distance) != null ? (
                <div style={{ flex: 1, background: '#2D2D2D', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Distancia</div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{toNumber(request?.distance)} km</div>
                </div>
              ) : null}
              {toNumber(request?.eta) != null ? (
                <div style={{ flex: 1, background: '#2D2D2D', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Llegar en</div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{toNumber(request?.eta)} min</div>
                </div>
              ) : null}
            </div>
          ) : null}
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
            Ganas con este trabajo
          </p>
          <p style={{ 
            color: '#90BDD3', 
            fontSize: 32, 
            fontWeight: 700, 
            margin: '0 0 8px' 
          }}>
            {formatMoney(providerEarnings || 0)}
          </p>
          
          {transportFee != null && transportFee > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
              Incluye {formatMoney(transportFee)} de traslado
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
            Al aceptar, MAQGO confirma la solicitud y ejecuta el cobro OneClick al cliente.
          </p>
        </div>

        {flowStep === 'preconfirm' && isImmediate && (
          <div style={{ background: '#2A2A2A', borderRadius: 14, padding: 16, marginBottom: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0, marginBottom: 10 }}>
              Confirma ubicación y llegada
            </p>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: 0, marginBottom: 14, lineHeight: 1.45 }}>
              Para solicitudes inmediatas, confirma desde dónde sale la máquina y el tiempo de llegada.
            </p>

            <div style={{ marginBottom: 14 }}>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '0 0 8px', fontWeight: 700 }}>
                ¿Desde dónde sale la máquina?
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {storedDeparture ? (
                  <button
                    type="button"
                    onClick={() => { setDepartureMode('stored'); setDepartureLocation(storedDeparture); }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: departureMode === 'stored' ? '2px solid #EC6819' : '1px solid rgba(255,255,255,0.18)',
                      background: departureMode === 'stored' ? 'rgba(236,104,25,0.15)' : 'transparent',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      flex: '1 1 160px',
                    }}
                  >
                    Ubicación registrada
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    setDepartureMode('gps');
                    const gps = await captureGpsSnapshot();
                    if (!gps) {
                      setIntentError('No se pudo obtener tu ubicación. Activa GPS o marca una ubicación.');
                      return;
                    }
                    setDepartureLocation(gps);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: departureMode === 'gps' ? '2px solid #EC6819' : '1px solid rgba(255,255,255,0.18)',
                    background: departureMode === 'gps' ? 'rgba(236,104,25,0.15)' : 'transparent',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    flex: '1 1 160px',
                  }}
                >
                  Usar GPS ahora
                </button>
                <button
                  type="button"
                  onClick={() => { setDepartureMode('address'); setDepartureLocation(null); }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: departureMode === 'address' ? '2px solid #EC6819' : '1px solid rgba(255,255,255,0.18)',
                    background: departureMode === 'address' ? 'rgba(236,104,25,0.15)' : 'transparent',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    flex: '1 1 160px',
                  }}
                >
                  Marcar ubicación
                </button>
              </div>
            </div>

            {departureMode === 'address' && (
              <div style={{ marginBottom: 14 }}>
                {getGoogleMapsApiKey() ? (
                  <AddressAutocomplete
                    value={departureLocation?.address || ''}
                    onChange={() => void 0}
                    onSelect={(result) => {
                      const lat = toNumber(result?.lat);
                      const lng = toNumber(result?.lng);
                      if (lat == null || lng == null) return;
                      const addr = String(result?.address || result?.address_full || result?.address_short || '').trim();
                      setDepartureLocation({ lat, lng, address: addr, source: 'office_pin' });
                    }}
                    placeholder="Busca la dirección de salida"
                    testId="departure-address-autocomplete"
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      value={departureLocation?.lat ?? ''}
                      onChange={(e) => setDepartureLocation({ ...(departureLocation || {}), lat: e.target.value, source: 'manual' })}
                      placeholder="Lat"
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#1F1F1F', color: '#fff' }}
                    />
                    <input
                      value={departureLocation?.lng ?? ''}
                      onChange={(e) => setDepartureLocation({ ...(departureLocation || {}), lng: e.target.value, source: 'manual' })}
                      placeholder="Lng"
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#1F1F1F', color: '#fff' }}
                    />
                  </div>
                )}
                {departureLocation?.lat != null && departureLocation?.lng != null ? (
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '8px 0 0' }}>
                    Ubicación lista para confirmar.
                  </p>
                ) : null}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '0 0 8px', fontWeight: 700 }}>
                ¿En cuánto tiempo llegas?
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setEtaMode('preset'); setEtaMinutes(m); }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: etaMinutes === m ? '2px solid #90BDD3' : '1px solid rgba(255,255,255,0.18)',
                      background: etaMinutes === m ? 'rgba(144,189,211,0.15)' : 'transparent',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      flex: '1 1 110px',
                    }}
                  >
                    {m} min
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setEtaMode('custom'); setEtaMinutes(null); }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: etaMode === 'custom' ? '2px solid #90BDD3' : '1px solid rgba(255,255,255,0.18)',
                    background: etaMode === 'custom' ? 'rgba(144,189,211,0.15)' : 'transparent',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    flex: '1 1 110px',
                  }}
                >
                  Otro
                </button>
              </div>
              {etaMode === 'custom' ? (
                <input
                  value={etaMinutes ?? ''}
                  onChange={(e) => setEtaMinutes(Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                  placeholder="Minutos"
                  inputMode="numeric"
                  style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#1F1F1F', color: '#fff' }}
                />
              ) : null}
              {typeof urgencyWindowMinutes === 'number' && urgencyWindowMinutes > 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '10px 0 0' }}>
                  El cliente necesita inicio dentro de {urgencyWindowMinutes} min.
                </p>
              ) : null}
            </div>

            {intentError ? (
              <div style={{ background: 'rgba(229, 57, 53, 0.12)', border: '1px solid rgba(229, 57, 53, 0.35)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <p style={{ color: '#ffb4b4', fontSize: 13, margin: 0, lineHeight: 1.45 }}>{intentError}</p>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => { setFlowStep('review'); setIntentError(null); }}
                style={{ flex: 1 }}
                disabled={intentLoading}
              >
                Volver
              </button>
              <button
                type="button"
                className="maqgo-btn-primary"
                onClick={handleConfirmIntent}
                disabled={intentLoading}
                aria-busy={intentLoading}
                style={{ flex: 2 }}
              >
                {intentLoading ? 'Confirmando...' : 'Confirmar ubicación y llegada'}
              </button>
            </div>
          </div>
        )}

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
                onClick={() => {
                  setAcceptError(null);
                  if (canAcceptNow) {
                    handleAccept();
                  } else {
                    navigate(homeRoute);
                  }
                }}
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

        {isOperator && !canAcceptRequests && !operatorGpsConfirmed ? (
          <div style={{ background: 'rgba(144, 189, 211, 0.12)', border: '1px solid rgba(144, 189, 211, 0.35)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
              Si eres operador, puedes aceptar solo con GPS activo. Confirma ubicación y tiempo de llegada usando GPS.
            </p>
          </div>
        ) : null}

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
            No puedo tomarla
          </button>
          <button 
            className="maqgo-btn-primary"
            onClick={canAcceptNow ? handleAccept : (requiresPreconfirm ? handleStartPreconfirm : undefined)}
            disabled={loading || (flowStep === 'preconfirm') || (!canAcceptNow && !requiresPreconfirm)}
            aria-busy={loading}
            aria-label={
              loading
                ? 'Aceptando solicitud'
                : (canAcceptNow
                  ? 'Aceptar solicitud'
                  : (requiresPreconfirm ? 'Confirmar ubicación y llegada' : 'Debe aceptar tu titular o gerente'))
            }
            style={{ flex: 2, padding: 14, fontSize: 16 }}
            data-testid="accept-request-btn"
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
                Aceptando...
              </span>
            ) : (
              (canAcceptNow ? 'Aceptar solicitud' : (requiresPreconfirm ? 'Confirmar ubicación y llegada' : 'Debe aceptar tu titular/gerente'))
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequestReceivedScreen;
