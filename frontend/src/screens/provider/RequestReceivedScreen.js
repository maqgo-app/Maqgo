import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getObject, getJSON, getArray } from '../../utils/safeStorage';
import { playNewRequestSound, playOfferExpiringSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { ProviderRequestExpired } from '../../components/ErrorStates';

import BACKEND_URL from '../../utils/api';
import { idempotencyKey } from '../../utils/bookingPaymentKeys';
import { syncAssignedOperatorToApi } from '../../utils/syncAssignedOperatorToApi';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { AddressAutocomplete, getGoogleMapsApiKey } from '../../components/AddressAutocomplete';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
import { fetchProviderMachinesFromApi, getMachines } from '../../utils/providerMachines';
import {
  clearReservationAssignedOperators,
  loadReservationAssignedOperators,
  saveReservationAssignedOperators,
} from '../../utils/reservationOperators';
import { useAuth } from '../../context/authHooks';
const MIN_HOURS_FOR_LUNCH = 6;

function normalizeMachineryKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .trim();
}

function getMatchedMachineForRequest(request) {
  const machines = getMachines();
  const requestMachineId = String(request?.machineId || request?.machine_id || '').trim();
  const requestMachineryKey = normalizeMachineryKey(
    request?.machineryId || request?.machineryType || request?.machinery_type
  );

  if (requestMachineId) {
    const machineById = machines.find((machine) => String(machine?.id || '').trim() === requestMachineId);
    if (machineById) return machineById;
  }

  if (!requestMachineryKey) return null;
  return (
    machines.find(
      (machine) =>
        normalizeMachineryKey(machine?.machineryType || machine?.type || machine?.id) === requestMachineryKey
    ) || null
  );
}

function normalizeOperatorForAssignment(operator = {}, index = 0) {
  if (!operator || typeof operator !== 'object') return null;
  const rawStatus = String(operator.visible_status || operator.status || '').trim().toLowerCase();
  if (rawStatus && rawStatus !== 'active') return null;
  const rawName = String(
    operator.nombre ||
    operator.name ||
    `${operator.firstName || operator.operatorFirstName || ''} ${operator.lastName || operator.operatorLastName || ''}`
  ).trim();
  if (!rawName) return null;
  const phone = String(operator.phone || operator.telefono || '').trim();
  if (!phone) return null;
  const nombre = String(operator.nombre || rawName).trim();
  const apellido = String(operator.apellido || '').trim();
  return {
    id: String(operator.id || `service-operator-${Date.now()}-${index}`),
    nombre,
    apellido,
    name: `${nombre} ${apellido}`.trim(),
    rut: String(operator.rut || operator.operatorRut || '').trim(),
    phone,
    isOwner: Boolean(operator.isOwner),
    licenseType: operator.licenseType || '',
    photo: operator.photo || null,
  };
}

function getAssignableOperatorsForRequest(request) {
  const matchedMachine = getMatchedMachineForRequest(request);
  const machineOperators = Array.isArray(matchedMachine?.operators) ? matchedMachine.operators : [];
  const normalizedMachineOperators = machineOperators
    .map((operator, index) => normalizeOperatorForAssignment(operator, index))
    .filter(Boolean);
  if (matchedMachine) {
    return normalizedMachineOperators;
  }

  return getArray('operatorsData', [])
    .map((operator, index) => normalizeOperatorForAssignment(operator, index))
    .filter(Boolean);
}

function getPreferredAssignedOperatorForRequest(request) {
  const matchedMachine = getMatchedMachineForRequest(request);
  const assignableOperators = getAssignableOperatorsForRequest(request);
  if (!assignableOperators.length) return null;
  const primaryOperatorId = String(matchedMachine?.primaryOperatorId || matchedMachine?.primary_operator_id || '').trim();
  if (primaryOperatorId) {
    const primary = assignableOperators.find((operator) => String(operator?.id || '').trim() === primaryOperatorId);
    if (primary) return primary;
  }
  return assignableOperators[0] || null;
}

async function refreshAssignableOperatorsForRequest(request) {
  try {
    await fetchProviderMachinesFromApi();
  } catch {
    // Si no podemos refrescar, seguimos con el cache local para no romper el flujo.
  }
  const assignableOperators = getAssignableOperatorsForRequest(request);
  const preferredAssignedOperator = getPreferredAssignedOperatorForRequest(request);
  return {
    assignableOperators,
    preferredAssignedOperator,
  };
}

function uniqueOperatorsById(operators = []) {
  const seen = new Set();
  return (Array.isArray(operators) ? operators : []).filter((operator) => {
    const id = String(operator?.id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeScheduledDateKey(value) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : '';
}

function parseRequestStartMs(req) {
  const direct = parseIsoToMs(req?.startTime);
  if (direct != null) return direct;
  const day = normalizeScheduledDateKey(req?.scheduledDate);
  if (!day) return null;
  return parseIsoToMs(`${day}T08:00:00Z`);
}

function getRequestDurationMs(req) {
  const totalHours =
    toNumber(req?.totalDurationHours) ??
    ((toNumber(req?.workdayHours) ?? 0) + (toNumber(req?.breakHours) ?? 0)) ??
    toNumber(req?.hours);
  if (!totalHours || totalHours <= 0) return null;
  return totalHours * 60 * 60 * 1000;
}

function hasScheduledOverlap(targetRequest, otherRequest) {
  const targetDay = normalizeScheduledDateKey(targetRequest?.scheduledDate);
  const otherDay = normalizeScheduledDateKey(otherRequest?.scheduledDate);
  if (!targetDay || !otherDay || targetDay !== otherDay) return false;

  const targetStart = parseRequestStartMs(targetRequest);
  const otherStart = parseRequestStartMs(otherRequest);
  const targetDuration = getRequestDurationMs(targetRequest);
  const otherDuration = getRequestDurationMs(otherRequest);
  if (targetStart == null || otherStart == null || !targetDuration || !otherDuration) {
    return true;
  }

  const targetEnd = targetStart + targetDuration;
  const otherEnd = otherStart + otherDuration;
  return targetStart < otherEnd && otherStart < targetEnd;
}

async function validateAssignedOperatorsForReservation(request, assignedOperators = []) {
  const selected = uniqueOperatorsById(assignedOperators);
  if (!selected.length) {
    return {
      ok: false,
      message: 'Debes tener al menos un operador asignado antes de aceptar la reserva.',
    };
  }

  if (String(request?.reservationType || '').toLowerCase() !== 'scheduled') {
    return { ok: true };
  }

  const operatorIds = new Set(
    selected
      .map((operator) => String(operator?.id || '').trim())
      .filter(Boolean)
  );
  if (!operatorIds.size) {
    return {
      ok: false,
      message: 'Los operadores asignados no tienen un identificador válido para validar disponibilidad.',
    };
  }

  try {
    const { data } = await axios.get(`${BACKEND_URL}/api/service-requests`, { timeout: 10000 });
    const items = Array.isArray(data) ? data : [];
    const activeStatuses = new Set(['confirmed', 'en_route', 'in_progress', 'last_30']);
    const conflictingIds = new Set();

    items.forEach((item) => {
      if (String(item?.id || '').trim() === String(request?.id || '').trim()) return;
      if (!activeStatuses.has(String(item?.status || '').trim().toLowerCase())) return;
      if (!hasScheduledOverlap(request, item)) return;
      const operatorId = String(item?.operator_id || item?.operatorId || '').trim();
      if (operatorId && operatorIds.has(operatorId)) {
        conflictingIds.add(operatorId);
      }
    });

    if (!conflictingIds.size) return { ok: true };
    const names = selected
      .filter((operator) => conflictingIds.has(String(operator?.id || '').trim()))
      .map((operator) => `${operator?.nombre || operator?.name || ''} ${operator?.apellido || ''}`.trim())
      .filter(Boolean);
    return {
      ok: false,
      message:
        names.length > 0
          ? `${names.join(', ')} ya tienen otra reserva activa para ese horario.`
          : 'Uno o más operadores ya tienen otra reserva activa para ese horario.',
    };
  } catch {
    return {
      ok: false,
      message: 'No pudimos validar la disponibilidad de los operadores. Intenta nuevamente.',
    };
  }
}

function parseIsoToMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function formatSecondsToMinSec(totalSeconds) {
  const s = Math.max(0, Math.floor(toNumber(totalSeconds) ?? 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function redactServiceLocation(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const normalized = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const sectorRules = [
    { test: /escuela militar/, label: 'Sector Metro Escuela Militar' },
    { test: /(avenida la dehesa|av\.\s*la dehesa|av\s+la dehesa)/, label: 'Sector Portal La Dehesa' },
    { test: /(avenida las condes\s*15000|av\.\s*las condes\s*15000|av\s+las condes\s*15000|las condes\s*15000)/, label: 'Sector Canta Gallo' },
    { test: /(los trapenses|camino real)/, label: 'Sector Los Trapenses' },
    { test: /la dehesa/, label: 'Sector La Dehesa' },
  ];

  for (const rule of sectorRules) {
    if (rule.test.test(normalized)) return rule.label;
  }

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    let candidate = '';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const pLower = p.toLowerCase();
      if (!/\d/.test(p) && pLower !== 'chile' && !pLower.includes('región') && !pLower.includes('region')) {
        candidate = p;
        break;
      }
    }
    if (candidate) return candidate;
    return parts[parts.length - 1];
  }
  
  if (/\d/.test(s)) return 'Ubicación reservada';
  return s;
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
  if (!expMs) return 600;
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
    offerExpiresAt: new Date(Date.now() + 600000).toISOString(),
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
  const location = useLocation();
  const auth = useAuth();
  const { hasPermission } = auth;
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
  const offerExpiringPlayedRef = useRef(false);
  const matchedMachine = useMemo(() => getMatchedMachineForRequest(request), [request]);
  const requestId = String(request?.id || '').trim();
  const assignableOperators = useMemo(() => getAssignableOperatorsForRequest(request), [request]);
  const preferredAssignedOperator = useMemo(() => getPreferredAssignedOperatorForRequest(request), [request]);
  const [assignedOperators, setAssignedOperators] = useState([]);
  const primaryAssignedOperator = assignedOperators[0] || null;
  const hasRealAssignedOperator = Boolean(primaryAssignedOperator?.nombre || primaryAssignedOperator?.name);

  useEffect(() => {
    if (auth.providerRole === 'operator') {
      navigate('/operator/home', { replace: true });
    }
  }, [auth.providerRole, navigate]);

  useEffect(() => {
    unlockAudio();
    playNewRequestSound();
    vibrate('newRequest');
  }, []);

  useEffect(() => {
    if (offerExpiringPlayedRef.current) return;
    if (countdown > 0 && countdown <= 120) {
      offerExpiringPlayedRef.current = true;
      unlockAudio();
      playOfferExpiringSound();
      vibrate('warning');
    }
  }, [countdown]);

  useEffect(() => {
    setCountdown(getOfferRemainingSeconds(request));
  }, [request]);

  useEffect(() => {
    const assignableIds = new Set(assignableOperators.map((operator) => String(operator?.id || '').trim()).filter(Boolean));
    const stored = loadReservationAssignedOperators(requestId).filter((operator) =>
      assignableIds.has(String(operator?.id || '').trim())
    );
    const next = stored.length > 0
      ? uniqueOperatorsById(stored)
      : (preferredAssignedOperator ? [preferredAssignedOperator] : []);
    setAssignedOperators(next);
    if (requestId) {
      if (next.length > 0) {
        saveReservationAssignedOperators(requestId, next);
      } else {
        clearReservationAssignedOperators(requestId);
      }
    }
  }, [assignableOperators, preferredAssignedOperator, requestId]);

  useEffect(() => {
    if (countdown <= 0) {
      if (!expirationHandledRef.current) {
        expirationHandledRef.current = true;
        setExpired(true);
        const home =
          auth.providerRole === 'operator' ? '/operator/home' : getProviderLandingPath();
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
      const { assignableOperators: latestAssignableOperators, preferredAssignedOperator: latestPreferredOperator } =
        await refreshAssignableOperatorsForRequest(request);
      const selectedOperators = uniqueOperatorsById(assignedOperators);
      if (!selectedOperators.length) {
        setAcceptError('Debes asignar al menos un operador antes de aceptar la reserva.');
        setLoading(false);
        return;
      }
      if (!latestAssignableOperators.length) {
        setAssignedOperators([]);
        clearReservationAssignedOperators(requestId);
        setAcceptError('La máquina ya no tiene operadores activos habilitados. Revisa la máquina antes de aceptar la reserva.');
        setLoading(false);
        return;
      }
      const latestById = new Map(
        latestAssignableOperators.map((operator) => [String(operator?.id || '').trim(), operator])
      );
      const refreshedSelectedOperators = selectedOperators
        .map((operator) => latestById.get(String(operator?.id || '').trim()))
        .filter(Boolean);
      if (refreshedSelectedOperators.length !== selectedOperators.length) {
        const nextOperators = latestPreferredOperator ? [latestPreferredOperator] : [];
        setAssignedOperators(nextOperators);
        if (requestId) {
          if (nextOperators.length > 0) {
            saveReservationAssignedOperators(requestId, nextOperators);
          } else {
            clearReservationAssignedOperators(requestId);
          }
        }
        setAcceptError(
          nextOperators.length > 0
            ? 'El operador seleccionado ya no está disponible. Revisa la asignación antes de aceptar la reserva.'
            : 'La máquina ya no tiene operadores activos habilitados. Revisa la máquina antes de aceptar la reserva.'
        );
        setLoading(false);
        return;
      }
      const availability = await validateAssignedOperatorsForReservation(request, refreshedSelectedOperators);
      if (!availability.ok) {
        setAcceptError(availability.message);
        setLoading(false);
        return;
      }
      if (request?.id && !request.id.startsWith('req-')) {
        await axios.put(
          `${BACKEND_URL}/api/service-requests/${request.id}/accept`,
          { providerId: String(request?.providerId || '').trim() },
          {
            timeout: 12000,
            headers: { 'Idempotency-Key': idempotencyKey(`accept-${request.id}`) },
          }
        );
      }
      localStorage.setItem('acceptedRequest', JSON.stringify(request));
      localStorage.setItem('currentServiceId', request?.id || `demo-${Date.now()}`);
      localStorage.setItem('activeServiceRequest', JSON.stringify(request));
      localStorage.setItem('assignableServiceOperators', JSON.stringify(latestAssignableOperators));
      localStorage.setItem('assignedOperator', JSON.stringify(refreshedSelectedOperators[0]));
      localStorage.setItem('assignedOperators', JSON.stringify(refreshedSelectedOperators));
      clearReservationAssignedOperators(requestId);
      void syncAssignedOperatorToApi(refreshedSelectedOperators[0]);
      navigate('/provider/en-route');
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

  const isOperator = auth.providerRole === 'operator';
  const homeRoute = isOperator ? '/operator/home' : getProviderLandingPath();

  const handleReject = async () => {
    try {
      if (request?.id && !request.id.startsWith('req-')) {
        await axios.put(
          `${BACKEND_URL}/api/service-requests/${request.id}/reject`,
          { providerId: String(request?.providerId || '').trim() },
          { timeout: 12000 }
        );
      }
    } catch {
      // Ya manejamos fallback de navegación aunque falle el rechazo.
    }
    clearReservationAssignedOperators(requestId);
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
  const displayedEtaMinutes = toNumber(request?.eta) ?? toNumber(request?.etaCommitMinutes);
  const showEtaDistance = toNumber(request?.distance) != null || displayedEtaMinutes != null;
  const urgencyWindowMinutes = toNumber(request?.urgencyWindowMinutes);
  const hasDepartureConfirmed =
    request?.confirmedDepartureLocation &&
    request.confirmedDepartureLocation.lat != null &&
    request.confirmedDepartureLocation.lng != null;
  const hasEtaCommitted = typeof request?.etaCommitMinutes === 'number' && request.etaCommitMinutes > 0;
  const requiresPreconfirm = Boolean(isImmediate && !request?.id?.startsWith?.('req-') && (!hasDepartureConfirmed || !hasEtaCommitted));
  const canProceedToAccept = !requiresPreconfirm;
  const userId = auth.user?.id || '';
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

  const handleEditMachineOperators = () => {
    if (!matchedMachine?.id) return;
    navigate('/provider/machines', {
      state: {
        activationEdit: true,
        returnTo: location.pathname || '/provider/request-received',
        openOperatorForMachineId: matchedMachine.id,
      },
    });
  };

  const handleManageReservationOperators = (mode) => {
    navigate('/provider/select-operator', {
      state: {
        manageMode: mode,
        fromRequestReceived: true,
        returnTo: location.pathname || '/provider/request-received',
        requestId,
      },
    });
  };

  const loadStoredDepartureLocation = async () => {
    const userId = auth.user?.id;
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
        setIntentError('Debes confirmar tu ubicación para coordinar la salida de este servicio.');
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
                {formatSecondsToMinSec(countdown)}
              </span>
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
            {countdown <= 10 ? 'Responde pronto' : 'Tiempo para responder'}
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
              Inicio hoy
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
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Referencia</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>
              {redactServiceLocation(request?.location)}
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
              {displayedEtaMinutes != null ? (
                <div style={{ flex: 1, background: '#2D2D2D', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Tiempo estimado de llegada</div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{displayedEtaMinutes} min</div>
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

        {!isOperator && matchedMachine ? (
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, textTransform: 'uppercase', margin: 0, marginBottom: 12 }}>
              Operador
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#90BDD3', fontSize: 15 }}>✓</span>
                  <span>
                    {hasRealAssignedOperator
                      ? `${primaryAssignedOperator.nombre || primaryAssignedOperator.name || ''} ${primaryAssignedOperator.apellido || ''}`.trim()
                      : 'Sin operador asignado'}
                  </span>
                </p>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.45 }}>
                  {hasRealAssignedOperator
                    ? 'Operador predeterminado de esta máquina.'
                    : 'Esta máquina no tiene un operador real con celular asignado. Agrégalo ahora para no trabar la reserva.'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleManageReservationOperators('replace')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(236, 104, 25, 0.45)',
                  background: 'rgba(236, 104, 25, 0.10)',
                  color: '#EC6819',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cambiar operador
              </button>
              {!hasRealAssignedOperator ? (
                <button
                  type="button"
                  onClick={handleEditMachineOperators}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Editar máquina
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

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
              No pudimos aceptar esta solicitud
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
                Volver
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
            No puedo aceptar
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
