import React, { useState, useEffect } from 'react';
import { getObject, getArray } from '../../utils/safeStorage';
import { getPerTripDateLabel, getPerTripCountLabel } from '../../utils/bookingDates';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { clearBookingProgress } from '../../utils/abandonmentTracker';
import { playPaymentSuccessSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { 
  RequestExpiredError, 
  ProviderRejectedError, 
  PaymentFailedError,
  ConnectionError 
} from '../../components/ErrorStates';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { getClientBreakdown, MACHINERY_NO_TRANSPORT, MACHINERY_PER_TRIP } from '../../utils/pricing';

const MIN_HOURS_IMMEDIATE = 4;
const MAX_HOURS_IMMEDIATE = 8;

// Íconos SVG específicos para cada tipo de maquinaria
const MachineryIcon = ({ type, size = 18 }) => {
  const icons = {
    retroexcavadora: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="4" y="16" width="20" height="10" rx="2" fill="#EC6819"/>
        <rect x="18" y="8" width="8" height="10" rx="1" fill="#EC6819"/>
        <path d="M26 10L34 4L36 8L28 14" stroke="#EC6819" strokeWidth="2" fill="none"/>
        <circle cx="8" cy="28" r="3" fill="#fff"/>
        <circle cx="20" cy="28" r="3" fill="#fff"/>
      </svg>
    ),
    excavadora: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="2" y="18" width="18" height="8" rx="2" fill="#EC6819"/>
        <rect x="14" y="10" width="10" height="10" rx="1" fill="#EC6819"/>
        <path d="M24 12L32 4L38 6L36 12L28 16" stroke="#EC6819" strokeWidth="2.5" fill="none"/>
        <rect x="2" y="26" width="20" height="4" rx="1" fill="#fff"/>
      </svg>
    ),
    bulldozer: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="8" y="14" width="22" height="10" rx="2" fill="#EC6819"/>
        <rect x="2" y="12" width="6" height="14" rx="1" fill="#EC6819"/>
        <rect x="12" y="8" width="8" height="8" rx="1" fill="#EC6819"/>
        <rect x="8" y="24" width="22" height="4" rx="1" fill="#fff"/>
      </svg>
    ),
    motoniveladora: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="4" y="16" width="28" height="8" rx="2" fill="#EC6819"/>
        <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
        <path d="M8 24L4 28L12 28L8 24Z" fill="#fff"/>
        <circle cx="8" cy="26" r="2" fill="#fff"/>
        <circle cx="28" cy="26" r="3" fill="#fff"/>
      </svg>
    ),
    compactadora: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="10" y="12" width="16" height="10" rx="2" fill="#EC6819"/>
        <circle cx="8" cy="22" r="6" stroke="#EC6819" strokeWidth="3" fill="none"/>
        <circle cx="32" cy="22" r="6" stroke="#EC6819" strokeWidth="3" fill="none"/>
        <rect x="14" y="6" width="8" height="8" rx="1" fill="#EC6819"/>
      </svg>
    ),
    minicargador: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="6" y="14" width="18" height="12" rx="2" fill="#EC6819"/>
        <rect x="10" y="8" width="10" height="8" rx="1" fill="#EC6819"/>
        <path d="M24 16L32 12L34 16L26 20" stroke="#EC6819" strokeWidth="2" fill="none"/>
        <circle cx="10" cy="28" r="3" fill="#fff"/>
        <circle cx="20" cy="28" r="3" fill="#fff"/>
      </svg>
    ),
    grua: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="4" y="20" width="20" height="8" rx="2" fill="#EC6819"/>
        <rect x="8" y="8" width="6" height="14" rx="1" fill="#EC6819"/>
        <path d="M11 8L11 2L32 2L32 6" stroke="#EC6819" strokeWidth="2"/>
        <path d="M32 6L32 16" stroke="#EC6819" strokeWidth="2"/>
        <circle cx="8" cy="30" r="2" fill="#fff"/>
        <circle cx="20" cy="30" r="2" fill="#fff"/>
      </svg>
    ),
    camion_pluma: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <rect x="2" y="18" width="24" height="10" rx="2" fill="#EC6819"/>
        <rect x="20" y="12" width="8" height="8" rx="1" fill="#EC6819"/>
        <path d="M12 18L12 6L28 6" stroke="#EC6819" strokeWidth="2.5"/>
        <path d="M28 6L28 14" stroke="#EC6819" strokeWidth="2"/>
        <circle cx="6" cy="30" r="2" fill="#fff"/>
        <circle cx="18" cy="30" r="2" fill="#fff"/>
        <circle cx="24" cy="30" r="2" fill="#fff"/>
      </svg>
    ),
    camion_aljibe: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <ellipse cx="14" cy="20" rx="12" ry="6" fill="#EC6819"/>
        <rect x="24" y="16" width="10" height="10" rx="2" fill="#EC6819"/>
        <circle cx="8" cy="28" r="2" fill="#fff"/>
        <circle cx="20" cy="28" r="2" fill="#fff"/>
        <circle cx="30" cy="28" r="2" fill="#fff"/>
        <path d="M6 14C6 14 10 10 14 10C18 10 22 14 22 14" stroke="#90BDD3" strokeWidth="1.5"/>
      </svg>
    ),
    camion_tolva: (
      <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none">
        <path d="M4 12L8 24H24L20 12H4Z" fill="#EC6819"/>
        <rect x="24" y="16" width="10" height="10" rx="2" fill="#EC6819"/>
        <circle cx="10" cy="28" r="2" fill="#fff"/>
        <circle cx="22" cy="28" r="2" fill="#fff"/>
        <circle cx="30" cy="28" r="2" fill="#fff"/>
      </svg>
    ),
  };

  return icons[type] || icons.retroexcavadora;
};

/**
 * Pantalla de Resultado de Pago
 * 
 * Muestra el resultado del procesamiento del pago:
 * - Estado: procesando → aceptado/rechazado
 * - Si aceptado: desglose completo + datos del proveedor
 * - Envía confirmación por WhatsApp
 * 
 * WORLD-CLASS: Esta es la pantalla donde se revela el proveedor
 * porque el pago ya fue procesado exitosamente.
 */
function PaymentResultScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing, success, error, expired, rejected, payment_failed, connection_error
  const [provider, setProvider] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notificationSent, setNotificationSent] = useState(false);

  useEffect(() => {
    processPayment();
  }, []);

  const processPayment = async () => {
    // Simular procesamiento de pago (2-3 segundos)
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      // Obtener datos guardados
      const selectedProvider = getObject('selectedProvider', {});
      const acceptedProvider = getObject('acceptedProvider', null);
      const savedProvider = acceptedProvider && Object.keys(acceptedProvider || {}).length > 0
        ? { ...selectedProvider, ...acceptedProvider }
        : selectedProvider;
      const rawHours = parseInt(localStorage.getItem('selectedHours') || '4');
      const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, rawHours));
      const reservationType = localStorage.getItem('reservationType') || 'immediate';
      const location = localStorage.getItem('serviceLocation') || '';
      const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';

      // En demo siempre es éxito - sin posibilidad de mostrar rechazo falso
      const isSuccess = true;

      // Determinar si necesita traslado según tipo de maquinaria
      const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machinery);
      const transportCost = needsTransport ? (savedProvider.transport_fee || 0) : 0;

      // Multiplicadores por hora (igual que backend)
      const IMMEDIATE_MULTIPLIERS = { 4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10 };
      const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.15;

      // Obtener pricing del backend (o fallback local)
      let pricingToShow = null;
      const FAST_FALLBACK_MS = 3000;
      const pricingPromise = axios.post(`${BACKEND_URL}/api/pricing/immediate`, {
        base_price_hr: savedProvider.price_per_hour || 45000,
        hours: hours,
        transport_cost: transportCost,
        is_immediate: reservationType === 'immediate',
        machinery_type: machinery
      }, { timeout: 5000 });
      const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_FALLBACK_MS));
      try {
        const pricingResponse = await Promise.race([pricingPromise, timeoutPromise]);
        pricingToShow = pricingResponse.data;
      } catch (e) {
        const basePrice = savedProvider.price_per_hour || 45000;
        const isPerTrip = MACHINERY_PER_TRIP.includes(machinery);
        let serviceWithMultiplier, baseService;
        if (isPerTrip) {
          baseService = basePrice;
          serviceWithMultiplier = reservationType === 'immediate' ? basePrice * multiplier : basePrice;
        } else {
          baseService = basePrice * hours;
          serviceWithMultiplier = reservationType === 'immediate' ? basePrice * hours * multiplier : basePrice * hours;
        }
        const subtotal = serviceWithMultiplier + transportCost;
        const clientCommission = subtotal * 0.10;
        const clientCommissionIva = clientCommission * 0.19;
        const finalPrice = subtotal + clientCommission + clientCommissionIva;
        pricingToShow = {
          final_price: Math.round(finalPrice),
          service_amount: Math.round(serviceWithMultiplier),
          transport_cost: transportCost,
          client_commission: Math.round(clientCommission),
          client_commission_iva: Math.round(clientCommissionIva),
          immediate_bonus: reservationType === 'immediate' ? Math.round(serviceWithMultiplier - baseService) : 0
        };
      }
      // Total realmente cobrado y desglose de Confirm (para que las líneas cuadren con factura)
      const chargedTotal = parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0', 10);
      const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
      const storedPricing = getObject('servicePricing', {});
      if (chargedTotal > 0 && pricingToShow) {
        pricingToShow = { ...pricingToShow, final_price: chargedTotal, needsInvoice };
        if (storedPricing && (storedPricing.service_amount != null || storedPricing.breakdown?.service_cost != null)) {
          pricingToShow = {
            ...pricingToShow,
            service_amount: storedPricing.service_amount ?? storedPricing.breakdown?.service_cost ?? pricingToShow.service_amount,
            transport_cost: storedPricing.transport_cost ?? storedPricing.breakdown?.transport_cost ?? pricingToShow.transport_cost,
            immediate_bonus: storedPricing.immediate_bonus ?? storedPricing.breakdown?.immediate_bonus ?? pricingToShow.immediate_bonus ?? 0,
            client_commission: storedPricing.client_commission ?? storedPricing.breakdown?.client_commission ?? pricingToShow.client_commission,
            client_commission_iva: storedPricing.client_commission_iva ?? storedPricing.breakdown?.client_commission_iva ?? pricingToShow.client_commission_iva
          };
        }
      }
      setPricing(pricingToShow);

      // Generar número de orden
      const orderNum = `MQ-${Date.now().toString().slice(-8)}`;
      setOrderNumber(orderNum);
      localStorage.setItem('orderNumber', orderNum);

      // Guardar datos del proveedor revelado
      setProvider(savedProvider);

      // Limpiar progreso de reserva (se completó exitosamente)
      localStorage.removeItem('clientBookingStep');

      // Enviar notificación WhatsApp
      sendWhatsAppConfirmation(orderNum, savedProvider, location);

      // ¡Sonido de pago exitoso! 🎉
      unlockAudio();
      playPaymentSuccessSound();
      vibrate('accepted');

      setStatus('success');
      
    } catch (error) {
      console.error('Error processing payment:', error);
      setStatus('error');
      setErrorMessage('Hubo un error procesando el pago. Por favor intenta nuevamente.');
    }
  };

  const sendWhatsAppConfirmation = async (orderNum, providerData, location) => {
    try {
      const clientPhone = localStorage.getItem('userPhone') || '+56912345678';
      
      await axios.post(`${BACKEND_URL}/api/communications/whatsapp/confirm-client`, {
        phone: clientPhone,
        service_id: orderNum,
        provider_name: providerData.operator_name || providerData.providerOperatorName || 'Operador asignado',
        operator_name: providerData.operator_name || providerData.providerOperatorName || 'Operador',
        license_plate: providerData.license_plate || 'Por confirmar',
        eta_minutes: providerData.eta_minutes || 40,
        location: location
      });
      
      setNotificationSent(true);
    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      // No bloquear el flujo si falla el WhatsApp
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(price || 0);
  };

  const handleContinue = () => {
    // Mostrar primero "preparándose", luego a los 10 s "en camino"
    localStorage.setItem('serviceStatus', 'assigned');
    navigate('/client/assigned');
  };

  const handleRetry = () => {
    navigate('/client/card');
  };

  // Estado: Procesando
  if (status === 'processing') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{
            width: 80,
            height: 80,
            border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#EC6819',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 24
          }} />
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Procesando pago
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
            Verificando tarjeta...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Estado: Error
  if (status === 'error') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <ConnectionError onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  // Estado: Solicitud expirada (proveedor no respondió)
  if (status === 'expired') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <RequestExpiredError onViewOthers={() => navigate('/client/providers')} />
        </div>
      </div>
    );
  }

  // Estado: Proveedor rechazó
  if (status === 'rejected') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <ProviderRejectedError onSelectOther={() => navigate('/client/providers')} />
        </div>
      </div>
    );
  }

  // Estado: Error de pago post-aceptación
  if (status === 'payment_failed') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <PaymentFailedError onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  // Estado: Éxito (regla: horas 4-8 para inmediato)
  const rawHours = parseInt(localStorage.getItem('selectedHours') || '4');
  const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, rawHours));
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const location = localStorage.getItem('serviceLocation') || '';
  const machinery = localStorage.getItem('selectedMachinery') || 'Retroexcavadora';
  const selectedDate = localStorage.getItem('selectedDate') || '';
  const selectedDates = getArray('selectedDates', []);

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-CL', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const perTripScheduledLabel = getPerTripDateLabel(selectedDates, selectedDate, { prefix: 'Valor viaje ·' });
  const perTripBreakdownLabel = getPerTripCountLabel(selectedDates, selectedDates?.length || 1);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingTop: 16, paddingBottom: 120, paddingLeft: 20, paddingRight: 20, overflowY: 'auto' }}>
        {/* Botones de navegación */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: 12
        }}>
          <button 
            onClick={() => navigate(-1)}
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

        {/* Header compacto: Logo + Estado + Título */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <MaqgoLogo size="small" />
          <div style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'rgba(255, 167, 38, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '10px auto 8px'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#FFA726" strokeWidth="2"/>
              <path d="M12 6v6l4 2" stroke="#FFA726" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
            ¡Reserva confirmada!
          </h1>
          <p style={{ color: '#4CAF50', fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>
            Un operador ha aceptado tu solicitud
          </p>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: 0 }}>
            Orden #{orderNumber}
          </p>
        </div>

        {/* Mensaje de confirmación */}
        <div
          style={{
            background: 'rgba(76, 175, 80, 0.1)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12
          }}
        >
          <p
            style={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: 12,
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.5
            }}
          >
            El cobro se realizó correctamente y tu reserva quedó confirmada. Te avisaremos con sonido y vibración cuando el operador salga en camino.
          </p>
        </div>

        {/* DESGLOSE COMPLETO - Compacto */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10
        }}>
          {/* Encabezado: Inicio del servicio */}
          <div style={{ 
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid #444'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Inicio del servicio
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Fecha:</span>
              <span style={{ color: '#fff', fontSize: 12 }}>
                {reservationType === 'immediate' ? 'HOY' : 'Programada'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Modalidad:</span>
              <span style={{ color: reservationType === 'immediate' ? '#4CAF50' : '#90BDD3', fontSize: 12, fontWeight: 600 }}>
                {reservationType === 'immediate' ? 'Reserva prioritaria (inicio hoy)' : 'Reserva programada'}
              </span>
            </div>
          </div>

          {/* Detalle de cobro */}
          <div style={{ 
            marginBottom: 8
          }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Detalle de cobro
            </span>
          </div>

          {(() => {
            const b = getClientBreakdown(pricing);
            return (
              <>
                {/* Línea servicio: hoy = prioritario (Xh); programado = Servicio (8h o viaje) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                    {reservationType === 'immediate' 
                      ? `Reserva prioritaria (${hours}h)`
                      : MACHINERY_PER_TRIP.includes(machinery) 
                        ? (selectedDates?.length > 1 ? `Reserva (${perTripBreakdownLabel})` : 'Reserva (Valor viaje)')
                        : `Reserva (${reservationType === 'scheduled' ? '8' : hours}h)`}
                  </span>
                  <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.service)}</span>
                </div>

                {/* Traslado - Solo si aplica */}
                {b.transport > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Traslado</span>
                    <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.transport)}</span>
                  </div>
                )}

                {/* Alta demanda - Solo si aplica */}
                {b.bonus > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Alta demanda</span>
                    <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.bonus)}</span>
                  </div>
                )}

                {/* Tarifa por Servicio: con factura = neta; sin factura = con IVA incluido */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                    Tarifa por Servicio MAQGO{b.needsInvoice ? ' (neta)' : ' (IVA incl.)'}
                  </span>
                  <span style={{ color: '#fff', fontSize: 12 }}>
                    {formatPrice(b.needsInvoice ? b.tarifaNeta : b.tarifaConIva)}
                  </span>
                </div>

                {/* Con factura: un solo IVA (servicio + tarifa MAQGO) */}
                {b.needsInvoice && b.ivaTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>IVA (19%)</span>
                    <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.ivaTotal)}</span>
                  </div>
                )}

                {/* Total */}
                <div style={{ 
                  borderTop: '1px solid #444', 
                  paddingTop: 8,
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>TOTAL COBRADO</span>
                  <span style={{ color: '#EC6819', fontSize: 18, fontWeight: 700 }}>
                    {formatPrice(b.total || pricing?.final_price)}
                  </span>
                </div>
              </>
            );
          })()}

          {/* Aviso factura: inline, no bloquea */}
          {(pricing?.needsInvoice || localStorage.getItem('needsInvoice') === 'true') && (
            <div style={{
              background: 'rgba(144, 189, 211, 0.12)',
              border: '1px solid rgba(144, 189, 211, 0.25)',
              borderRadius: 10,
              padding: 12,
              marginTop: 12,
              marginBottom: 4
            }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0, lineHeight: 1.45 }}>
                📄 Tu factura se emite dentro de los plazos legales del mes en que fue contratada y pagada la reserva, y se envía al correo que indicaste.
              </p>
            </div>
          )}

          {/* Texto legal para servicio prioritario */}
          {reservationType === 'immediate' && (
            <p style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 10, 
              margin: '10px 0 0',
              lineHeight: 1.4,
              textAlign: 'center'
            }}>
              La reserva prioritaria considera tiempos de traslado y coordinación logística.
              El sobreprecio aplica únicamente al inicio del servicio.
            </p>
          )}
        </div>

        {/* OPERADOR ASIGNADO - Compacto */}
        <div style={{
          background: '#363636',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 4,
            marginBottom: 8
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ color: '#90BDD3', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              Operador asignado
            </span>
          </div>

          {/* Nombre del operador + Rating en línea */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
              {provider?.operator_name || provider?.providerOperatorName || 'Operador asignado'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z" fill="#EC6819"/>
              </svg>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>{(provider?.rating ?? 4.8).toFixed(1)}</span>
            </div>
          </div>

          {/* Patente y ETA en una fila */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-around',
            alignItems: 'center',
            background: '#2A2A2A',
            borderRadius: 8,
            padding: '10px 14px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 9, marginBottom: 2 }}>PATENTE</div>
              <div style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>{provider?.license_plate}</div>
            </div>
            <div style={{ width: 1, height: 30, background: '#444' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 9, marginBottom: 2 }}>LLEGADA ESTIMADA</div>
              <div style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600 }}>{provider?.eta_minutes || 40} min</div>
            </div>
          </div>
        </div>

        {/* Maquinaria + Ubicación en una fila compacta */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 10,
          padding: 10,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: '#444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MachineryIcon type={machinery} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{MACHINERY_NAMES[machinery] || machinery}</div>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {MACHINERY_PER_TRIP.includes(machinery) 
                ? (reservationType === 'scheduled' ? perTripScheduledLabel : 'Valor viaje · Inicio HOY')
                : (reservationType === 'scheduled' ? `Jornada · ${formatDateShort(selectedDate)}` : `${hours}h · Reserva prioritaria`)
              } · {location}
            </div>
          </div>
        </div>

        {/* Notificación WhatsApp - compacta */}
        {notificationSent && (
          <div style={{
            background: 'rgba(37, 211, 102, 0.1)',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11 }}>
              Confirmación enviada a tu WhatsApp
            </span>
          </div>
        )}

        {/* QUÉ PASA DESPUÉS */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(144, 189, 211, 0.1) 0%, rgba(144, 189, 211, 0.05) 100%)',
          border: '1px solid rgba(144, 189, 211, 0.2)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12
        }}>
          <p style={{ 
            color: '#90BDD3', 
            fontSize: 12, 
            fontWeight: 600, 
            margin: '0 0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span>→</span> ¿Qué sigue ahora?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#4CAF50', fontSize: 12 }}>1.</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Te avisaremos cuando el operador salga en camino (aprox. {provider?.eta_minutes || 40} min a tu obra)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#4CAF50', fontSize: 12 }}>2.</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Te avisaremos cuando llegue</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#4CAF50', fontSize: 12 }}>3.</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Confirma su llegada y comienza el servicio</span>
            </div>
          </div>
        </div>

        {/* Botón continuar - NO FIJO, parte del flujo */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          style={{ fontSize: 14, marginTop: 4 }}
          data-testid="continue-to-tracking-btn"
        >
          Ver seguimiento en tiempo real
        </button>
      </div>
    </div>
  );
}

export default PaymentResultScreen;
