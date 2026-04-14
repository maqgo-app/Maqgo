import React, { useEffect, useState, useRef } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getObject, getArray } from '../../utils/safeStorage';
import { MACHINERY_PER_TRIP, IMMEDIATE_MULTIPLIERS, MAQGO_CLIENT_COMMISSION_RATE, IVA_RATE, getDemoProviders } from '../../utils/pricing';
import BACKEND_URL from '../../utils/api';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { Z_INDEX } from '../../constants/zIndex';
import { useCheckoutState } from '../../context/CheckoutContext';

/**
 * Búsqueda secuencial de proveedor (única implementación).
 * - Estado `loading`: círculo tipo spinner + “Preparando búsqueda…”.
 * - Estado `searching`: anillo con cuenta regresiva (real: poll; demo: simulación local).
 * Re-export estable: `SearchingProvider.js` → mismo default.
 */

const MAQGO_COMMISSION = MAQGO_CLIENT_COMMISSION_RATE;
const ETA_TOLERANCE = 5; // minutos de tolerancia

function SearchingProviderScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backFromSearching = getBookingBackRoute(pathname) || '/client/card';
  const [status, setStatus] = useState('loading'); // loading, searching, found, not_found, no_eligible
  const statusRef = useRef(status);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [eligibleProviders, setEligibleProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [maxTotal, setMaxTotal] = useState(0);
  const [isRealRequest, setIsRealRequest] = useState(false);
  /** Fase UX alineada con API: clientPhase (searching | contacting | assigned). */
  const [clientPhase, setClientPhase] = useState('searching');
  const { dispatch: dispatchCheckout } = useCheckoutState();
  const providerAcceptedDispatched = useRef(false);

  const SECONDS_PER_ATTEMPT = 60;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Calcular total con comisión (por hora o por viaje según maquinaria)
  const calculateTotal = (provider, hours, machinery) => {
    const isPerTrip = machinery && MACHINERY_PER_TRIP.includes(machinery);
    const reservationType = localStorage.getItem('reservationType') || 'immediate';
    const mult = reservationType === 'immediate' ? (IMMEDIATE_MULTIPLIERS[hours] || 1.15) : 1;
    const basePrice = provider.price_per_hour || 0;
    let serviceAmount;
    const transportFee = isPerTrip ? 0 : (provider.transport_fee || 0);
    if (isPerTrip) {
      serviceAmount = basePrice * mult;
    } else {
      serviceAmount = basePrice * hours * (reservationType === 'immediate' ? mult : 1);
    }
    const subtotal = serviceAmount + transportFee;
    const commission = Math.round(subtotal * MAQGO_COMMISSION);
    const iva = Math.round(commission * IVA_RATE);
    return subtotal + commission + iva;
  };

  // Cargar maxTotal desde localStorage (todos los flujos)
  useEffect(() => {
    const total = parseInt(localStorage.getItem('maxTotalAmount') || localStorage.getItem('totalAmount') || '0');
    if (total > 0) setMaxTotal(total);
  }, []);

  // Polling cuando hay solicitud real en backend + segundero en tiempo real
  useEffect(() => {
    const serviceId = localStorage.getItem('currentServiceId') || '';
    const shouldPoll = serviceId && !serviceId.startsWith('demo-');
    if (!shouldPoll) return;

    setIsRealRequest(true);
    setStatus('searching');
    const total = parseInt(localStorage.getItem('maxTotalAmount') || localStorage.getItem('totalAmount') || '0');
    if (total > 0) setMaxTotal(total);
    const selected = getObject('selectedProvider', {});
    if (selected.name) setCurrentProvider(selected);
    const providerIds = getArray('selectedProviderIds', []);
    const matched = getArray('matchedProviders', []);
    const providerCount = Math.min(5, providerIds.length || matched.length || 5);
    setEligibleProviders(Array(providerCount).fill({ operator_name: selected.operator_name || 'Operador' }));

    let cancelled = false;
    let inFlight = false;
    let errorStreak = 0;
    let timeoutId = null;
    let lastWarnAt = 0;

    const baseDelayMs = 4000;
    const maxDelayMs = 30000;

    const poll = async () => {
      const { data } = await axios.get(
        `${BACKEND_URL}/api/service-requests/${serviceId}`,
        { timeout: 8000 }
      );

      if (cancelled) return;

      if (typeof data.matchingAttemptCount === 'number' && data.matchingAttemptCount >= 1) {
        setCurrentAttempt(Math.min(data.matchingAttemptCount, 5));
      }
      if (data.clientPhase === 'contacting' || data.status === 'offer_sent') {
        setClientPhase('contacting');
      } else if (data.clientPhase === 'searching' || data.status === 'matching') {
        setClientPhase('searching');
      } else if (data.clientPhase === 'assigned') {
        setClientPhase('assigned');
      }

      if (data.status === 'confirmed') {
        if (!providerAcceptedDispatched.current) {
          providerAcceptedDispatched.current = true;
          dispatchCheckout({ type: 'PROVIDER_ACCEPTED' });
        }
        setClientPhase('assigned');
        setStatus('found');
        cancelled = true;
        const matching = data;
        if (matching.providerId || matching.providerName) {
          const allProviders = getArray('matchedProviders', []);
          const selectedObj = getObject('selectedProvider', {});
          const fromList = allProviders.find((p) => p.id === matching.providerId) || {};
          // Cliente ve solo operador, nunca empresa
          const operatorName =
            matching.providerOperatorName ||
            fromList.operator_name ||
            selectedObj.operator_name ||
            'Operador asignado';
          const accepted = {
            ...selectedObj,
            ...fromList,
            id: matching.providerId || fromList.id || selectedObj.id,
            name: matching.providerName || fromList.name || selectedObj.name,
            operator_name: operatorName,
          };
          localStorage.setItem('acceptedProvider', JSON.stringify(accepted));
        }
      } else if (data.status === 'no_providers_available') {
        setStatus('not_found');
        cancelled = true;
      } else if (data.status === 'offer_sent' && typeof data.remainingSeconds === 'number') {
        setSecondsLeft(Math.max(0, data.remainingSeconds));
      }
    };

    const runPollingLoop = async () => {
      if (cancelled) return;

      // Detener polling cuando el usuario ya no está “searching”
      if (statusRef.current !== 'searching') {
        cancelled = true;
        return;
      }

      if (inFlight) {
        timeoutId = setTimeout(runPollingLoop, 1000);
        return;
      }

      inFlight = true;
      try {
        await poll();
        errorStreak = 0;
      } catch (e) {
        const now = Date.now();
        if (import.meta.env.DEV && now - lastWarnAt > 60000) {
          if (import.meta.env.DEV) {
            console.warn('SearchingProviderScreen poll error:', e?.message || e);
          }
          lastWarnAt = now;
        }
        errorStreak += 1;
      } finally {
        inFlight = false;
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * (2 ** errorStreak)
        );
        timeoutId = setTimeout(runPollingLoop, delay);
      }
    };

    void runPollingLoop();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [dispatchCheckout]);

  // Filtrar proveedores elegibles según la regla de garantía (solo modo demo)
  useEffect(() => {
    const serviceId = localStorage.getItem('currentServiceId') || '';
    if (serviceId && !serviceId.startsWith('demo-')) {
      setIsRealRequest(true);
      return; // Flujo real: no usar demo
    }
    setIsRealRequest(false);

    const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const selected = getObject('selectedProvider', {});
    const allProviders = getArray('matchedProviders', []);
    const hours = parseInt(localStorage.getItem('selectedHours') || '4');
    const maxTotalAmount = parseInt(localStorage.getItem('maxTotalAmount') || '0');

    setSelectedProvider(selected);
    setMaxTotal(maxTotalAmount);

    if (!selected.id || allProviders.length === 0) {
      const providerIds = getArray('selectedProviderIds', []);
      const n = Math.min(providerIds.length || 5, 5) || 1;
      const toShow = getDemoProviders(machinery, n);
      setEligibleProviders(toShow);
      setCurrentProvider(toShow[0]);
      setStatus('searching');
      return;
    }

    // Calcular el total del proveedor seleccionado (con machinery para por viaje)
    const selectedTotal = calculateTotal(selected, hours, machinery);
    const selectedETA = selected.eta_minutes || 40;

    // Filtrar proveedores que cumplan la regla de garantía
    const eligible = allProviders.filter(p => {
      const providerTotal = calculateTotal(p, hours, machinery);
      const providerETA = p.eta_minutes || 40;
      if (p.id === selected.id) return true;
      return providerTotal <= selectedTotal && providerETA <= (selectedETA + ETA_TOLERANCE);
    });

    eligible.sort((a, b) => {
      if (a.id === selected.id) return -1;
      if (b.id === selected.id) return 1;
      return calculateTotal(a, hours, machinery) - calculateTotal(b, hours, machinery);
    });

    // Limitar a 5 proveedores máximo
    let limitedEligible = eligible.slice(0, 5);

    // Modo demo: si el filtro deja vacío, usar proveedores demo para garantizar asignación
    if (limitedEligible.length === 0) {
      const providerIds = getArray('selectedProviderIds', []);
      const n = Math.min(providerIds.length || 5, 5) || 1;
      limitedEligible = getDemoProviders(machinery, n);
    }

    setEligibleProviders(limitedEligible);
    setCurrentProvider(limitedEligible[0]);
    setStatus('searching');

    // Sincronizar para CancelServiceScreen (si el usuario cancela desde otra ruta)
    const total = localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount');
    if (total) localStorage.setItem('serviceTotal', total);
    localStorage.setItem('serviceStatus', 'pending');
  }, []);

  // Demo: asignación directa y fiable (efecto dedicado, sin depender del timer complejo)
  useEffect(() => {
    const serviceId = localStorage.getItem('currentServiceId') || '';
    if (!serviceId.startsWith('demo-')) return;
    if (status !== 'searching' || eligibleProviders.length === 0) return;

    const accepted = eligibleProviders[currentAttempt - 1] || eligibleProviders[0];
    const demoDelay = 1800; // ~2s para que se vea la búsqueda
    const t = setTimeout(() => {
      if (accepted) {
        localStorage.setItem('acceptedProvider', JSON.stringify(accepted));
      }
      if (!providerAcceptedDispatched.current) {
        providerAcceptedDispatched.current = true;
        dispatchCheckout({ type: 'PROVIDER_ACCEPTED' });
      }
      setStatus('found');
    }, demoDelay);
    return () => clearTimeout(t);
  }, [status, currentAttempt, eligibleProviders, dispatchCheckout]);

  // Lógica de timer y secuencia (solo para animar el segundero en demo; la asignación va en el efecto anterior)
  useEffect(() => {
    const serviceId = localStorage.getItem('currentServiceId') || '';
    const isRealRequest = serviceId && !serviceId.startsWith('demo-');
    if (isRealRequest) return;

    if (status !== 'searching' || eligibleProviders.length === 0) return;

    const maxAttempts = eligibleProviders.length;
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (currentAttempt >= maxAttempts) {
            setStatus('not_found');
            return 0;
          }
          const nextAttempt = currentAttempt + 1;
          setCurrentAttempt(nextAttempt);
          setCurrentProvider(eligibleProviders[nextAttempt - 1] || null);
          return SECONDS_PER_ATTEMPT;
        }
        return prev - 1;
      });
      setTotalElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, currentAttempt, eligibleProviders, currentProvider]);

  // Navegar cuando el operador acepta: tarjeta ya registrada → resultado de pago
  useEffect(() => {
    if (status === 'found') {
      const timer = setTimeout(() => {
        navigate('/client/payment-result');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(price);
  };

  const maxAttempts = Math.max(eligibleProviders.length, 1);

  const headerNav = (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: Z_INDEX.sticky,
      }}
    >
      <button
        onClick={() => navigate(backFromSearching)}
        style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
        aria-label="Volver"
      >
        <BackArrowIcon style={{ color: '#fff' }} />
      </button>
      <button
        onClick={() => navigate('/client/home')}
        style={{
          background: 'none',
          border: 'none',
          padding: '8px 12px',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 13,
        }}
      >
        Inicio
      </button>
    </div>
  );

  const renderSearching = () => (
    <>
      <p
        style={{
          color: 'rgba(255,255,255,0.88)',
          fontSize: 13,
          textAlign: 'center',
          margin: '0 16px 14px',
          maxWidth: 320,
          lineHeight: 1.45,
        }}
      >
        Estamos buscando un proveedor disponible. Esto puede tardar algunos minutos.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 30 }}>
        {eligibleProviders.map((_, index) => (
          <div
            key={index}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background:
                index + 1 < currentAttempt
                  ? '#666'
                  : index + 1 === currentAttempt
                    ? '#EC6819'
                    : '#444',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      <div className="maqgo-spin-searching" style={{ position: 'relative', width: 140, height: 140, marginBottom: 30 }}>
        <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r="60" fill="none" stroke="#363636" strokeWidth="8" />
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#EC6819"
            strokeWidth="8"
            strokeDasharray={`${(secondsLeft / SECONDS_PER_ATTEMPT) * 377} 377`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {formatTime(secondsLeft)}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {isRealRequest
              ? clientPhase === 'contacting'
                ? `Intento ${currentAttempt} de 5`
                : 'Buscando en tu zona'
              : `Proveedor ${currentAttempt} de ${maxAttempts}`}
          </div>
        </div>
      </div>

      <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>
        {isRealRequest
          ? clientPhase === 'contacting'
            ? 'Contactando proveedor'
            : 'Buscando proveedor disponible'
          : `Contactando proveedor ${currentAttempt} de ${maxAttempts}`}
      </h1>

      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, textAlign: 'center', marginBottom: 6 }}>
        {isRealRequest && clientPhase === 'searching'
          ? 'Buscando…'
          : isRealRequest && clientPhase === 'contacting'
            ? 'Esperando respuesta…'
            : 'Esperando confirmación...'}
      </p>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', marginBottom: 25 }}>
        En maquinaria pesada la respuesta suele tardar varios minutos; no es instantánea.
      </p>

      <div
        style={{
          background: 'rgba(144, 189, 211, 0.15)',
          border: '1px solid rgba(144, 189, 211, 0.3)',
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>🛡️</span>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
          Solo proveedores con precio ≤ {formatPrice(maxTotal)}
        </span>
      </div>

      <div style={{ background: '#363636', borderRadius: 12, padding: '16px 24px', marginBottom: 20, textAlign: 'center' }}>
        <p
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13,
            margin: '0 0 6px',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Tiempo total
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ color: '#EC6819', fontSize: 28, fontWeight: 700, fontFamily: 'monospace' }}>
            {isRealRequest ? formatTime(secondsLeft) : formatTime((maxAttempts * 60) - totalElapsed)}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>restantes</span>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            height: 6,
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.max(
                0,
                Math.min(
                  100,
                  isRealRequest
                    ? (secondsLeft / SECONDS_PER_ATTEMPT) * 100
                    : (((maxAttempts * 60) - totalElapsed) / (maxAttempts * 60)) * 100
                )
              )}%`,
              height: '100%',
              background: '#EC6819',
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
        Tu solicitud se envía a los proveedores que seleccionaste. Cualquiera de ellos puede aceptar; el primero que acepte se queda con el servicio.
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 20,
          alignItems: 'stretch',
          maxWidth: 280,
        }}
      >
        <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/client/providers')} style={{ width: '100%' }}>
          Cancelar búsqueda
        </button>
        <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/client/home')} style={{ width: '100%' }}>
          Volver al inicio
        </button>
      </div>
    </>
  );

  const renderFound = () => (
    <>
      <div className="maqgo-success-icon">
        <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
          <path d="M14 27L23 36L41 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, textAlign: 'center', marginTop: 20 }}>
        ¡Proveedor confirmado!
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, textAlign: 'center', marginTop: 10 }}>
        Tu servicio está en camino
      </p>
      {currentProvider && selectedProvider && currentProvider.id !== selectedProvider.id ? (
        <div style={{ background: 'rgba(144, 189, 211, 0.2)', borderRadius: 10, padding: 12, marginTop: 20 }}>
          <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, textAlign: 'center' }}>
            🎉 ¡Encontramos un proveedor a mejor precio!
          </p>
        </div>
      ) : null}
    </>
  );

  const renderNotFound = () => (
    <>
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: '#ff6b6b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 25,
        }}
      >
        <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
          <path d="M12 12L33 33" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <path d="M33 12L12 33" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
        No encontramos un proveedor disponible en este momento
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 24, maxWidth: 280 }}>
        Contactamos a {maxAttempts} proveedores con tu precio garantizado pero ninguno pudo aceptar.
      </p>
      <p
        style={{
          color: 'rgba(255,255,255,0.75)',
          fontSize: 13,
          textAlign: 'center',
          marginBottom: 28,
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        Te recomendamos programar la maquinaria para otro día o ajustar tu búsqueda.
      </p>
      <div style={{ width: '100%', maxWidth: 300 }}>
        <button
          className="maqgo-btn-primary"
          onClick={() => {
            localStorage.removeItem('currentServiceId');
            navigate('/client/providers');
          }}
          style={{ width: '100%', marginBottom: 12 }}
        >
          Intentar nuevamente
        </button>
        <button
          className="maqgo-btn-primary"
          onClick={() => {
            localStorage.setItem('reservationType', 'scheduled');
            navigate('/client/calendar');
          }}
          style={{ width: '100%', marginBottom: 12 }}
        >
          Buscar para otro día
        </button>
        <button onClick={() => window.location.reload()} className="maqgo-btn-secondary" style={{ width: '100%', marginBottom: 12 }}>
          Refrescar página
        </button>
        <button onClick={() => navigate('/client/home')} className="maqgo-btn-secondary" style={{ width: '100%' }}>
          Volver al inicio
        </button>
      </div>
    </>
  );

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {headerNav}
        {status === 'searching' ? renderSearching() : null}
        {status === 'found' ? renderFound() : null}
        {status === 'not_found' ? renderNotFound() : null}
      </div>
    </div>
  );
}

export default SearchingProviderScreen;
