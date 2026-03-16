import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getObject, getArray } from '../../utils/safeStorage';
import { MACHINERY_PER_TRIP, IMMEDIATE_MULTIPLIERS, MAQGO_CLIENT_COMMISSION_RATE, IVA_RATE, getDemoPriceList, getDemoTransportFee } from '../../utils/pricing';
import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Búsqueda Secuencial de Proveedor
 * Modos: Real (poll backend) / Demo (flujo simulado local).
 */

const MAQGO_COMMISSION = MAQGO_CLIENT_COMMISSION_RATE;
const ETA_TOLERANCE = 5; // minutos de tolerancia

function SearchingProviderScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, searching, found, not_found, no_eligible
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [eligibleProviders, setEligibleProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [maxTotal, setMaxTotal] = useState(0);
  const [isRealRequest, setIsRealRequest] = useState(false);
  
  const SECONDS_PER_ATTEMPT = 60;

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
    const isRealRequest = serviceId && !serviceId.startsWith('demo-');
    if (!isRealRequest) return;

    setIsRealRequest(true);
    setStatus('searching');
    const total = parseInt(localStorage.getItem('maxTotalAmount') || localStorage.getItem('totalAmount') || '0');
    if (total > 0) setMaxTotal(total);
    const selected = getObject('selectedProvider', {});
    if (selected.name) setCurrentProvider(selected);
    const providerIds = getArray('selectedProviderIds', []);
    const matched = getArray('matchedProviders', []);
    const providerCount = providerIds.length || matched.length || 1;
    setEligibleProviders(Array(providerCount).fill({ operator_name: selected.operator_name || 'Operador' }));

    const poll = async () => {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`, { timeout: 8000 });
        if (data.status === 'confirmed') {
          setStatus('found');
          const matching = data;
          if (matching.providerId || matching.providerName) {
            const allProviders = getArray('matchedProviders', []);
            const selectedObj = getObject('selectedProvider', {});
            const fromList = allProviders.find((p) => p.id === matching.providerId) || {};
            // Cliente ve solo operador, nunca empresa
            const operatorName = matching.providerOperatorName || fromList.operator_name || selectedObj.operator_name || 'Operador asignado';
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
        } else if (data.status === 'offer_sent' && typeof data.remainingSeconds === 'number') {
          setSecondsLeft(Math.max(0, data.remainingSeconds));
        }
      } catch (e) {
        console.warn('Poll service request:', e?.message);
      }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, []);

  // Segundero en modo real: decrementar cada segundo; si llega a 0 sin respuesta, mostrar not_found
  useEffect(() => {
    const serviceId = localStorage.getItem('currentServiceId') || '';
    if (!serviceId || serviceId.startsWith('demo-')) return;
    if (status !== 'searching') return;

    const tick = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 0) {
          setTimeout(() => setStatus('not_found'), 0);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

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
    const isPerTrip = MACHINERY_PER_TRIP.includes(machinery);

    setSelectedProvider(selected);
    setMaxTotal(maxTotalAmount);

    if (!selected.id || allProviders.length === 0) {
      const providerIds = getArray('selectedProviderIds', []);
      const n = Math.min(providerIds.length || 5, 5);
      const prices = getDemoPriceList(machinery);
      const transportFee = getDemoTransportFee(machinery);
      const transportFees = transportFee > 0 ? [25000, 30000, 22000, 28000, 24000] : [0, 0, 0, 0, 0];
      const demoProviders = [
        { id: 'demo-1', name: 'Transportes Silva', price_per_hour: prices[0], transport_fee: transportFees[0], eta_minutes: 45, rating: 4.8, license_plate: 'BGKL-45', operator_name: 'Carlos Silva' },
        { id: 'demo-2', name: 'Maquinarias del Sur', price_per_hour: prices[1], transport_fee: transportFees[1], eta_minutes: 54, rating: 4.6, license_plate: 'HJKL-78', operator_name: 'Pedro González' },
        { id: 'demo-3', name: 'Constructora Norte', price_per_hour: prices[2], transport_fee: transportFees[2], eta_minutes: 50, rating: 4.9, license_plate: 'MNOP-12', operator_name: 'Juan Martínez' },
        { id: 'demo-4', name: 'Arriendos Maipo', price_per_hour: prices[3], transport_fee: transportFees[3], eta_minutes: 58, rating: 4.7, license_plate: 'PQRS-33', operator_name: 'Luis Fernández' },
        { id: 'demo-5', name: 'Maquinarias Andes', price_per_hour: prices[4], transport_fee: transportFees[4], eta_minutes: 52, rating: 4.5, license_plate: 'TUVW-55', operator_name: 'Roberto Díaz' },
      ];
      const toShow = n > 0 ? demoProviders.slice(0, n) : demoProviders.slice(0, 1);
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
      const prices = getDemoPriceList(machinery);
      const transportFee = getDemoTransportFee(machinery);
      const transportFees = transportFee > 0 ? [25000, 30000, 22000, 28000, 24000] : [0, 0, 0, 0, 0];
      const providerIds = getArray('selectedProviderIds', []);
      const n = Math.min(providerIds.length || 5, 5) || 1;
      const demoProviders = [
        { id: 'demo-1', name: 'Transportes Silva', price_per_hour: prices[0], transport_fee: transportFees[0], eta_minutes: 45, rating: 4.8, license_plate: 'BGKL-45', operator_name: 'Carlos Silva' },
        { id: 'demo-2', name: 'Maquinarias del Sur', price_per_hour: prices[1], transport_fee: transportFees[1], eta_minutes: 54, rating: 4.6, license_plate: 'HJKL-78', operator_name: 'Pedro González' },
        { id: 'demo-3', name: 'Constructora Norte', price_per_hour: prices[2], transport_fee: transportFees[2], eta_minutes: 50, rating: 4.9, license_plate: 'MNOP-12', operator_name: 'Juan Martínez' },
      ];
      limitedEligible = demoProviders.slice(0, n);
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
      setStatus('found');
    }, demoDelay);
    return () => clearTimeout(t);
  }, [status, currentAttempt, eligibleProviders]);

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

  const handleRetry = () => {
    setStatus('searching');
    setCurrentAttempt(1);
    setSecondsLeft(SECONDS_PER_ATTEMPT);
    setTotalElapsed(0);
    if (eligibleProviders.length > 0) {
      setCurrentProvider(eligibleProviders[0]);
    }
  };

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

  // Pantalla de carga
  if (status === 'loading') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{
            width: 50,
            height: 50,
            border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#EC6819',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: '#fff', marginTop: 20 }}>Preparando búsqueda...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // No hay proveedores elegibles
  if (status === 'no_eligible') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <div style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: '#ff9800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 25
          }}>
            <svg width="45" height="45" viewBox="0 0 24 24" fill="none">
              <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 20, textAlign: 'center', marginBottom: 10 }}>
            Nadie disponible para iniciar hoy
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 30, lineHeight: 1.5 }}>
            Puedes agendar desde mañana o elegir otra fecha.
          </p>
          <button 
            className="maqgo-btn-primary"
            onClick={() => navigate('/client/providers')}
            style={{ width: '100%', maxWidth: 280, marginBottom: 12 }}
          >
            Volver a proveedores
          </button>
          <button 
            onClick={() => navigate('/client/home')}
            style={{ 
              background: 'none', 
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 30,
              padding: '12px 24px',
              color: 'rgba(255,255,255,0.95)',
              fontSize: 14,
              cursor: 'pointer',
              width: '100%',
              maxWidth: 280
            }}
          >
            Elegir otra fecha
          </button>
        </div>
      </div>
    );
  }

  const maxAttempts = Math.max(eligibleProviders.length, 1);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Header con botón volver */}
        <div style={{ 
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10
        }}>
          <button 
            onClick={() => navigate('/client/confirm')}
            style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            onClick={() => navigate('/client/home')}
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: '8px 12px', 
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13
            }}
          >
            Inicio
          </button>
        </div>

        {status === 'searching' && (
          <>
            {/* Progress de intentos */}
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: 30
            }}>
              {eligibleProviders.map((_, index) => (
                <div key={index} style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: index + 1 < currentAttempt 
                    ? '#666' 
                    : index + 1 === currentAttempt 
                      ? '#EC6819' 
                      : '#444',
                  transition: 'all 0.3s'
                }} />
              ))}
            </div>

            {/* Spinner: proveedor actual */}
            <div style={{
              position: 'relative',
              width: 140,
              height: 140,
              marginBottom: 30
            }}>
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
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#fff',
                  fontFamily: 'monospace'
                }}>
                  {formatTime(secondsLeft)}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {isRealRequest ? 'Proveedor actual' : `Proveedor ${currentAttempt} de ${maxAttempts}`}
                </div>
              </div>
            </div>

          {/* Info actual */}
          <h1 style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 8
          }}>
            {isRealRequest
              ? (maxAttempts > 1
                  ? `Buscando entre ${maxAttempts} proveedores`
                  : 'Buscando proveedor disponible')
              : `Contactando proveedor ${currentAttempt} de ${maxAttempts}`}
          </h1>

            <p style={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 6
            }}>
              Esperando confirmación...
            </p>
            <p style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 25
            }}>
              En promedio, la respuesta llega en 15 min
            </p>

            {/* Garantía de precio */}
            <div style={{
              background: 'rgba(144, 189, 211, 0.15)',
              border: '1px solid rgba(144, 189, 211, 0.3)',
              borderRadius: 10,
              padding: '10px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 16 }}>🛡️</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                Solo proveedores con precio ≤ {formatPrice(maxTotal)}
              </span>
            </div>

            {/* Temporizador: tiempo total restante */}
            <div style={{
              background: '#363636',
              borderRadius: 12,
              padding: '16px 24px',
              marginBottom: 20,
              textAlign: 'center'
            }}>
              <p style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11,
                margin: '0 0 6px',
                textTransform: 'uppercase',
                letterSpacing: 1
              }}>
                Tiempo total
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
                <span style={{
                  color: '#EC6819',
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: 'monospace'
                }}>
                  {isRealRequest ? formatTime(secondsLeft) : formatTime((maxAttempts * 60) - totalElapsed)}
                </span>
                <span style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 13
                }}>
                  restantes
                </span>
              </div>
              {/* Barra de progreso tiempo total */}
              <div style={{
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 4,
                height: 6,
                marginTop: 12,
                overflow: 'hidden'
              }}>
                <div style={{
                  background: '#EC6819',
                  height: '100%',
                  width: isRealRequest
                    ? `${(secondsLeft / SECONDS_PER_ATTEMPT) * 100}%`
                    : `${((maxAttempts * 60 - totalElapsed) / (maxAttempts * 60)) * 100}%`,
                  borderRadius: 4,
                  transition: 'width 1s linear'
                }} />
              </div>
            </div>

            {/* Nota sobre selección de proveedor */}
            <p style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 12,
              textAlign: 'center',
              maxWidth: 280
            }}>
              Tu solicitud se envía a los proveedores que seleccionaste. Cualquiera de ellos puede aceptar; el primero que acepte se queda con el servicio.
            </p>

            {/* Opciones de navegación */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, alignItems: 'stretch', maxWidth: 280 }}>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => navigate('/client/providers')}
                style={{ width: '100%' }}
              >
                Cancelar búsqueda
              </button>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => navigate('/client/home')}
                style={{ width: '100%' }}
              >
                Volver al inicio
              </button>
            </div>
          </>
        )}

        {status === 'found' && (
          <>
            <div className="maqgo-success-icon">
              <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
                <path d="M14 27L23 36L41 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h1 style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
              textAlign: 'center',
              marginTop: 20
            }}>
              ¡Proveedor confirmado!
            </h1>

            <p style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 15,
              textAlign: 'center',
              marginTop: 10
            }}>
              Tu servicio está en camino
            </p>

            {/* Mostrar si el precio fue menor */}
            {currentProvider && selectedProvider && currentProvider.id !== selectedProvider.id && (
              <div style={{
                background: 'rgba(144, 189, 211, 0.2)',
                borderRadius: 10,
                padding: 12,
                marginTop: 20
              }}>
                <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, textAlign: 'center' }}>
                  🎉 ¡Encontramos un proveedor a mejor precio!
                </p>
              </div>
            )}
          </>
        )}

        {status === 'not_found' && (
          <>
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: '#ff6b6b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 25
            }}>
              <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
                <path d="M12 12L33 33" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
                <path d="M33 12L12 33" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            </div>

            <h1 style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              textAlign: 'center',
              marginBottom: 10
            }}>
              No encontramos proveedores disponibles
            </h1>
            
            <p style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 24,
              maxWidth: 280
            }}>
              Contactamos a {maxAttempts} proveedores con tu precio garantizado pero ninguno pudo aceptar.
            </p>

            <p style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: 13,
              textAlign: 'center',
              marginBottom: 28,
              maxWidth: 280,
              lineHeight: 1.5
            }}>
              Te recomendamos programar la maquinaria para otro día o ajustar tu búsqueda.
            </p>

            {/* Opciones */}
            <div style={{ width: '100%', maxWidth: 300 }}>
              <button 
                className="maqgo-btn-primary"
                onClick={() => {
                  localStorage.removeItem('currentServiceId');
                  navigate('/client/providers');
                }}
                style={{ width: '100%', marginBottom: 12 }}
              >
                Reintentar búsqueda
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

              <button 
                onClick={() => window.location.reload()}
                className="maqgo-btn-secondary"
                style={{ width: '100%', marginBottom: 12 }}
              >
                Refrescar página
              </button>

              <button 
                onClick={() => navigate('/client/home')}
                className="maqgo-btn-secondary"
                style={{ width: '100%' }}
              >
                Volver al inicio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SearchingProviderScreen;
