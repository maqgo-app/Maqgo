import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { getArray, getObject } from '../../utils/safeStorage';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL, { hasPersistedSessionCredentials } from '../../utils/api';
import { traceRedirectToLogin } from '../../utils/traceLoginRedirect';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { getProviderOnboardingRoute } from '../../utils/providerOnboarding';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

/** Sin valor guardado → ON (optimización primera solicitud); backend/local sync pueden corregir después. */
function readProviderAvailableDefaultOn() {
  try {
    const v = localStorage.getItem('providerAvailable');
    if (v === null || v === '') return true;
    return v === 'true';
  } catch {
    return true;
  }
}

/**
 * Pantalla P09 - Home Proveedor con Toggle Disponibilidad
 * El toggle está bloqueado hasta completar el onboarding.
 * Disponibilidad: backend es fuente de verdad; localStorage es fallback (offline/demo).
 */
function ProviderHomeScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);
  const lastErrorLogAtRef = useRef(0);
  const [available, setAvailable] = useState(() => readProviderAvailableDefaultOn());
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bankDataComplete, setBankDataComplete] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showBankWarningModal, setShowBankWarningModal] = useState(false);
  const isBlockedByBank = onboardingCompleted && !bankDataComplete && !available;
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const providerMachines = getArray('providerMachines', []);
  const machineComplete =
    !!(machineData?.machineryType && machineData?.licensePlate) ||
    (Array.isArray(providerMachines) &&
      providerMachines.some((m) => Boolean(m?.machineryType && String(m?.licensePlate || '').trim())));
  const onboardingOperators = getArray('operatorsData', []).filter((op) => {
    if (!op || typeof op !== 'object') return false;
    const fullName = String(op.name || `${op.nombre || ''} ${op.apellido || ''}`.trim()).trim();
    return Boolean(fullName);
  });
  const operatorComplete =
    (machineComplete && onboardingOperators.length > 0) ||
    (Array.isArray(providerMachines) &&
      providerMachines.some((m, idx) => {
        if (!m || typeof m !== 'object') return false;
        const hasRegisteredMachine = Boolean(m.machineryType && String(m.licensePlate || '').trim());
        if (!hasRegisteredMachine) return false;
        const ops = Array.isArray(m.operators) ? m.operators : [];
        if (ops.length > 0) return true;
        return (idx === 0 || providerMachines.length === 1) && onboardingOperators.length > 0;
      }));
  const activationItems = [
    {
      label: 'Empresa',
      ok: companyComplete,
      missingHint: 'Falta completar datos de empresa',
      actionLabel: 'Completar empresa',
      onClick: () =>
        navigate('/provider/data', { state: { activationEdit: true, returnTo: '/provider/home' } })
    },
    {
      label: 'Maquinaria',
      ok: machineComplete,
      missingHint: 'Falta tipo o patente de la máquina',
      actionLabel: 'Completar maquinaria',
      onClick: () =>
        navigate('/provider/machine-data', { state: { activationEdit: true, returnTo: '/provider/home' } })
    },
    {
      label: 'Operador asignado',
      ok: operatorComplete,
      missingHint: 'Falta operador de maquinaria asignado',
      actionLabel: 'Asignar operador',
      onClick: () =>
        navigate('/provider/machines', { state: { activationEdit: true, returnTo: '/provider/home' } })
    },
    {
      label: 'Datos bancarios',
      ok: bankDataComplete,
      missingHint: 'Faltan datos bancarios',
      actionLabel: 'Completar datos bancarios',
      onClick: () =>
        navigate('/provider/profile/banco', { state: { activationEdit: true, returnTo: '/provider/home' } })
    },
  ];
  const activationCompletedCount = activationItems.filter((item) => item.ok).length;
  const activationProgressPct = Math.round((activationCompletedCount / activationItems.length) * 100);
  const activationAllComplete = activationCompletedCount === activationItems.length;
  const activationPending = onboardingCompleted && !activationAllComplete;
  const canReceiveRequests = onboardingCompleted && activationAllComplete;
  /** Solo falta banco: un único CTA principal (FASE 3). */
  const bankOnlyMissing =
    onboardingCompleted &&
    !bankDataComplete &&
    companyComplete &&
    machineComplete &&
    operatorComplete;

  const isBankComplete = (bankData) =>
    !!bankData?.bank &&
    !!bankData?.accountType &&
    !!bankData?.accountNumber &&
    !!bankData?.holderName &&
    !!bankData?.holderRut;

  useEffect(() => {
    const completedLocal = localStorage.getItem('providerOnboardingCompleted') === 'true';
    setOnboardingCompleted(completedLocal);

    const bankDataLocal = getObject('bankData', {});
    setBankDataComplete(isBankComplete(bankDataLocal));

    // Sincronizar disponibilidad/onboarding/banco desde backend (fuente de verdad)
    const userId = localStorage.getItem('userId');
    const isDemoId = userId && (userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-'));
    if (userId && !isDemoId) {
      axios.get(`${BACKEND_URL}/api/users/${userId}`, { timeout: 5000 })
        .then((res) => {
          const onboardingDb = Boolean(res.data?.onboarding_completed);
          setOnboardingCompleted(onboardingDb || completedLocal);
          if (onboardingDb) localStorage.setItem('providerOnboardingCompleted', 'true');

          const avail = res.data?.isAvailable ?? res.data?.available ?? false;
          setAvailable(!!avail);
          localStorage.setItem('providerAvailable', (!!avail).toString());

          const bankFromDb = res.data?.providerData?.bankData;
          if (bankFromDb && typeof bankFromDb === 'object') {
            localStorage.setItem('bankData', JSON.stringify(bankFromDb));
            setBankDataComplete(isBankComplete(bankFromDb));
          }
        })
        .catch(() => {
          setAvailable(readProviderAvailableDefaultOn());
        });
    } else {
      setAvailable(readProviderAvailableDefaultOn());
    }

    setBootstrapped(true);
  }, [navigate]);

  useEffect(() => {
    // Polling para verificar solicitudes entrantes (solo si disponible y onboarding completo)
    const checkRequests = async () => {
      const userId = localStorage.getItem('userId');
      if (userId && available && canReceiveRequests) {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/pending`);
        if (res.data && res.data.length > 0) {
          localStorage.setItem('incomingRequest', JSON.stringify(res.data[0]));
          unlockAudio();
          playNewRequestSound();
          vibrate('newRequest');
          navigate('/provider/request-received');
        }
      }
    };

    if (!available || !canReceiveRequests) return undefined;

    let cancelled = false;
    let timeoutId = null;

    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;

      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await checkRequests();
        errorStreakRef.current = 0;
      } catch (e) {
        const now = Date.now();
        if (now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('ProviderHomeScreen poll error:', e?.message || e);
          }
          lastErrorLogAtRef.current = now;
        }
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
  }, [available, canReceiveRequests, navigate]);

  const toggleAvailability = async () => {
    if (!onboardingCompleted || isToggling) return;
    if (!canReceiveRequests && !available) {
      const firstPending = activationItems.find((i) => !i.ok);
      toast.warning('Completa tu activación para conectarte y recibir solicitudes.');
      if (firstPending?.onClick) firstPending.onClick();
      return;
    }
    if (!bankDataComplete && !available) {
      setShowBankWarningModal(true);
      toast.warning('Completa tus datos bancarios antes de conectarte.');
      return;
    }

    setIsToggling(true);
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setIsToggling(false);
      toast.error('Debes iniciar sesión para conectarte. Cierra sesión y vuelve a entrar.');
      return;
    }

    const newStatus = !available;
    setAvailable(newStatus);

    // Desbloquear audio y feedback táctil (como en operadores)
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');

    // Persistir en localStorage
    localStorage.setItem('providerAvailable', newStatus.toString());

    // Modo demo: IDs de fallback no existen en backend, no llamar API
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-');
    if (isDemoId) {
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
      setIsToggling(false);
      return;
    }

    const machineDataLocal = getObject('machineData', {});
    const machineryType = machineDataLocal?.machineryType || machineDataLocal?.type || undefined;
    const doAvailability = () => axios.put(
      `${BACKEND_URL}/api/users/${encodeURIComponent(userId)}/availability`,
      { isAvailable: newStatus, machineryType },
      { timeout: 8000 }
    );

    try {
      await doAvailability();
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
    } catch (e) {
      // Un reintento en fallo de red (producción: conexiones transitorias)
      const isRetryable = !e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK' || e.message?.includes('Network Error');
      if (isRetryable) {
        try {
          await doAvailability();
          toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
          return;
        } catch (e2) {
          console.error('Reintento fallido:', e2);
        }
      }
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      const detailStr = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d?.msg || d).join(' ') : '');
      const isNetworkError = !e.response || e.code === 'ECONNREFUSED' || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.message?.includes('Network Error') || e.message?.includes('timeout');

      if (status === 404 || (detailStr && detailStr.toLowerCase().includes('no encontrado'))) {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('Tu sesión expiró. Cierra sesión e inicia sesión nuevamente.');
      } else if (status === 409) {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.warning('Antes de conectarte, completa tu activación (empresa, máquina, operador, banco y ubicación).');
      } else if (isNetworkError) {
        toast.success(newStatus ? 'Te conectaste. No se pudo sincronizar (sin conexión).' : 'Te desconectaste. No se pudo sincronizar (sin conexión).', 'availability');
      } else {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('No se pudo conectar. Intenta de nuevo.');
      }
    } finally {
      setIsToggling(false);
    }
  };

  // Demo: simular solicitud entrante
  const simulateRequest = () => {
    if (!onboardingCompleted) {
      toast.warning('Debes completar el registro de tu maquinaria primero');
      return;
    }
    
    // Obtener el tipo de maquinaria registrada por el proveedor
    const machineData = getObject('machineData', {});
    const machineryType = machineData.machineryType || 'retroexcavadora';
    
    const billingData = getObject('billingData', {});
    const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
    const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
    const serviceLocation = localStorage.getItem('serviceLocation') || 'Santiago Centro';
    const workCoords = (Number.isFinite(serviceLat) && Number.isFinite(serviceLng))
      ? { lat: serviceLat, lng: serviceLng } : null;
    const clientPhone = localStorage.getItem('userPhone') || '+56987654321';
    const serviceReference = localStorage.getItem('serviceReference') || '';
    localStorage.setItem('incomingRequest', JSON.stringify({
      id: `req-${Date.now()}`,
      machineryType: MACHINERY_NAMES[machineryType] || machineryType,
      machineryId: machineryType,
      location: serviceLocation,
      hours: 4,
      clientName: billingData.nombre ? `${billingData.nombre} ${billingData.apellido || ''}`.trim() : 'Carlos Gonz?lez',
      clientPhone,
      client_lat: workCoords?.lat,
      client_lng: workCoords?.lng,
      workCoords,
      reference: serviceReference
    }));
    unlockAudio();
    playNewRequestSound();
    vibrate('newRequest');
    navigate('/provider/request-received');
  };

  const goToOnboarding = () => {
    try {
      if (localStorage.getItem('providerCameFromWelcome') === 'true') {
        navigate(getProviderLandingPath());
        return;
      }
    } catch {
      /* ignore */
    }
    const savedStep = localStorage.getItem('providerOnboardingStep');
    const route = getProviderOnboardingRoute(savedStep);
    navigate(route || '/provider/data');
  };

  // Sin sesión e onboarding pendiente → login. Con sesión: NO forzar /provider/data (Paso 1/5);
  // el home ya muestra checklist y "Completar registro" / CTAs (evita saltar desde Welcome "Ofrecer maquinaria").
  if (bootstrapped && !onboardingCompleted && !hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/screens/provider/ProviderHomeScreen.js');
    return (
      <Navigate
        to="/login"
        replace
        state={{ entry: 'provider', redirect: '/provider/home' }}
      />
    );
  }

  if (!bootstrapped) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div className="maqgo-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 30,
              height: 30,
              border: '3px solid rgba(236,104,25,0.25)',
              borderTopColor: '#EC6819',
              borderRadius: '50%',
              animation: 'maqgo-spin 0.8s linear infinite',
            }}
            aria-label="Cargando estado del proveedor"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        {/* Header - Solo logo centrado */}
        <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />

        {location.state?.activationCongrats ? (
          <div
            role="status"
            style={{
              background: 'rgba(76, 175, 80, 0.12)',
              border: '1px solid rgba(76, 175, 80, 0.35)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 800, margin: 0, lineHeight: 1.35 }}>
              Felicitaciones, ya puedes recibir solicitudes
            </p>
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
              {available ? 'Estás en línea.' : 'Pulsa “Conectarme ahora” para quedar en línea.'}
            </p>
          </div>
        ) : null}

        {location.state?.showProfilePaymentsBanner && !canReceiveRequests ? (
          <div
            role="status"
            style={{
              background: 'rgba(144, 189, 211, 0.15)',
              border: '1px solid rgba(144, 189, 211, 0.45)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
              Tu máquina fue ingresada correctamente
            </p>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '10px 0 0', lineHeight: 1.4 }}>
              Aún no está activada para recibir solicitudes
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.35 }}>
              Completa los pasos pendientes para activarla.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/provider/profile')}
                style={{
                  flex: '1 1 190px',
                  padding: 12,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  lineHeight: 1.35,
                }}
              >
                Completar en Mi Empresa
              </button>
              <button
                type="button"
                onClick={() => navigate('/provider/machine-data')}
                style={{
                  flex: '1 1 190px',
                  padding: 12,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  lineHeight: 1.35,
                }}
              >
                Agregar otra máquina
              </button>
            </div>
          </div>
        ) : null}

        {/* Estado de activación: oculto si solo falta banco (un solo CTA abajo). */}
        {!(onboardingCompleted && bankOnlyMissing) ? (
        <div
          style={{
            background: '#1E1E24',
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>
              Estado de activación
            </p>
            <span style={{ 
              background: activationCompletedCount === activationItems.length ? 'rgba(76, 175, 80, 0.2)' : 'rgba(236, 104, 25, 0.2)',
              color: activationCompletedCount === activationItems.length ? '#4CAF50' : '#EC6819',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700
            }}>
              {activationCompletedCount}/{activationItems.length}
            </span>
          </div>

          <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 20 }}>
            <div
              style={{
                width: `${activationProgressPct}%`,
                height: '100%',
                background: activationCompletedCount === activationItems.length ? '#4CAF50' : 'linear-gradient(90deg, #EC6819, #FF8A48)',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activationItems.map((item) => (
              <div
                key={item.label}
                onClick={!item.ok ? item.onClick : undefined}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12,
                  cursor: !item.ok ? 'pointer' : 'default',
                  opacity: item.ok ? 0.6 : 1
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: item.ok ? '#4CAF50' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {item.ok ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#fff', fontSize: 14, fontWeight: item.ok ? 500 : 600, margin: 0 }}>
                    {item.label}
                  </p>
                  {!item.ok && (
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '2px 0 0' }}>
                      {item.missingHint}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: item.ok ? '#4CAF50' : '#F44336', fontSize: 12, fontWeight: 700 }}>
                    {item.ok ? '✓' : '✕ Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        {/* Alerta si no complet? onboarding */}
        {!onboardingCompleted && (
          <div style={{
            background: '#2A2A2A',
            border: '1px solid #EC6819',
            borderRadius: 14,
            padding: 24,
            marginBottom: 25
          }}>
            <p style={{ color: '#EC6819', fontSize: 14, margin: 0, marginBottom: 12, fontWeight: 600 }}>
              Registro incompleto
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, marginBottom: 15, lineHeight: 1.5 }}>
              Completa datos de empresa, maquinaria y operador para recibir solicitudes.
            </p>
            <button
              onClick={goToOnboarding}
              style={{
                width: '100%',
                padding: 14,
                background: '#EC6819',
                border: 'none',
                borderRadius: 25,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Completar registro
            </button>
          </div>
        )}

        {/* Un solo CTA principal cuando solo falta banco (FASE 3). */}
        {bankOnlyMissing ? (
          <div
            style={{
              width: '100%',
              padding: 16,
              background: 'rgba(236, 104, 25, 0.12)',
              border: '1px solid rgba(236, 104, 25, 0.65)',
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() =>
                navigate('/provider/profile/banco', { state: { activationEdit: true, returnTo: '/provider/home' } })
              }
              style={{
                width: '100%',
                padding: 14,
                background: '#EC6819',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                lineHeight: 1.35,
              }}
            >
              Completa datos bancarios para recibir pagos
            </button>
          </div>
        ) : null}

        {/* Centro de disponibilidad */}
        <div style={{
          background: 'linear-gradient(180deg, #363636 0%, #2f2f2f 100%)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.06)',
          padding: 22,
          marginBottom: 20,
          opacity: onboardingCompleted ? 1 : 0.5,
          textAlign: 'center',
          boxShadow: '0 12px 28px rgba(0,0,0,0.28)'
        }}>
          <p style={{
            margin: 0,
            marginBottom: 12,
            color: 'rgba(255,255,255,0.82)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            Centro de disponibilidad
          </p>

          {/* Toggle visual */}
          <button
            onClick={toggleAvailability}
            disabled={!canReceiveRequests || isToggling || isBlockedByBank}
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              border: canReceiveRequests && available ? '2px solid rgba(144,189,211,0.65)' : '2px solid rgba(236,104,25,0.65)',
              background: canReceiveRequests && available ? 'rgba(144,189,211,0.2)' : 'rgba(236,104,25,0.15)',
              cursor: canReceiveRequests && !isToggling && !isBlockedByBank ? 'pointer' : 'not-allowed',
              opacity: isToggling ? 0.7 : 1,
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px'
            }}
            data-testid="availability-toggle"
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path 
                d="M13 3L4 14H12L11 21L20 10H12L13 3Z" 
                fill="#fff" 
                stroke="#fff" 
                strokeWidth="1"
              />
            </svg>
          </button>
          
          {/* Estado texto */}
          <p style={{ 
            color: canReceiveRequests && available ? '#90BDD3' : '#ffb182',
            fontSize: 24, 
            margin: 0,
            fontWeight: 700,
            marginBottom: 4
          }}>
            {!onboardingCompleted ? 'Bloqueado' : (activationPending ? 'Activación pendiente' : (available ? 'Conectado' : 'Desconectado'))}
          </p>
          <p style={{
            color: onboardingCompleted ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)',
            fontSize: 13,
            margin: 0,
            marginBottom: 12
          }}>
            {!onboardingCompleted
              ? 'Primero completa tu registro para poder recibir solicitudes.'
              : activationPending
                ? 'Completa los pasos pendientes para habilitar la recepción de solicitudes.'
                : isBlockedByBank
                  ? 'Siguiente paso: completa tus datos bancarios para conectarte y recibir solicitudes.'
                  : available
                    ? 'Estás en línea. Recibirás una alerta cuando haya una solicitud cerca.'
                    : 'Estás desconectado. Conéctate para empezar a recibir solicitudes de arriendo.'}
          </p>
          {canReceiveRequests && available ? (
            <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Te avisaremos cuando llegue tu primera solicitud
            </p>
          ) : null}

          {/* CTA explícito: evita ambigüedad del "toca para conectarte" (no competir con banner post-inscripción) */}
          {!activationPending ? (
            <button
              onClick={
                !onboardingCompleted
                  ? undefined
                  : isBlockedByBank
                    ? () => navigate('/provider/profile/banco', { state: { activationEdit: true, returnTo: '/provider/home' } })
                    : toggleAvailability
              }
              disabled={!onboardingCompleted || isToggling}
              style={{
                width: '100%',
                marginTop: 4,
                padding: 13,
                borderRadius: 12,
                border: canReceiveRequests && available ? '1px solid rgba(255,255,255,0.25)' : 'none',
                background: canReceiveRequests && available ? 'rgba(255,255,255,0.06)' : '#EC6819',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: onboardingCompleted && !isToggling ? 'pointer' : 'not-allowed',
                opacity: onboardingCompleted ? (isToggling ? 0.7 : 1) : 0.5,
              }}
              aria-label={
                !onboardingCompleted
                  ? 'Registro incompleto'
                  : isBlockedByBank
                    ? 'Completar datos bancarios'
                    : (available ? 'Pausar disponibilidad' : 'Conectarme ahora')
              }
            >
              {!onboardingCompleted
                ? 'Completa tu registro para activar'
                : isBlockedByBank
                  ? 'Completar datos bancarios'
                  : (isToggling ? 'Actualizando estado...' : (available ? 'Pausar disponibilidad' : 'Conectarme ahora'))}
            </button>
          ) : null}
          {canReceiveRequests && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '10px 0 0' }}>
              Puedes pausar cuando no quieras recibir solicitudes.
            </p>
          )}
        </div>

        {available && onboardingCompleted && activationAllComplete && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20
          }}>
            <p style={{ color: '#90BDD3', fontSize: 15, fontWeight: 600, margin: 0, textAlign: 'center', marginBottom: 8 }}>
              Listo para recibir solicitudes
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Priorizamos asignaciones por cercanía, disponibilidad y ajuste operativo. Las reservas para <strong style={{ color: '#EC6819' }}>el mismo día</strong> suelen pagar hasta <strong style={{ color: '#EC6819' }}>+20%</strong> más que las programadas para otro día.
            </p>
          </div>
        )}

        <div className="maqgo-spacer"></div>

        {/* Botón demo: solo en desarrollo local */}
        {import.meta.env.DEV && (
          <button 
            className="maqgo-btn-primary"
            onClick={simulateRequest}
            disabled={!onboardingCompleted}
            style={{ marginBottom: 15, opacity: onboardingCompleted ? 1 : 0.5 }}
          >
            Simular solicitud entrante (Demo)
          </button>
        )}

      </div>
      {showBankWarningModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: 24
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: '#2A2A2A',
              border: '1px solid rgba(236, 104, 25, 0.45)',
              borderRadius: 14,
              padding: 20
            }}
          >
            <h3 style={{ color: '#fff', fontSize: 17, margin: '0 0 8px' }}>
              Completa datos bancarios
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
              Para conectarte y recibir solicitudes, primero debes configurar tus datos bancarios.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowBankWarningModal(false)}
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Ahora no
              </button>
              <button
                onClick={() => {
                  setShowBankWarningModal(false);
                  navigate('/provider/profile/banco');
                }}
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 20,
                  border: 'none',
                  background: '#EC6819',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Ir a banco
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderHomeScreen;
