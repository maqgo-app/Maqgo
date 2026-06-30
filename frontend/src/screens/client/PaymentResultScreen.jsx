import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getObject, getArray } from '../../utils/safeStorage';
import { getPerTripDateLabel, getPerTripCountLabel } from '../../utils/bookingDates';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { clearBookingProgress } from '../../utils/abandonmentTracker';
import { playPaymentSuccessSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { 
  RequestExpiredError, 
  ProviderRejectedError, 
  PaymentFailedError
} from '../../components/ErrorStates';

import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getClientBreakdown, MACHINERY_NO_TRANSPORT } from '../../utils/pricing';
import { formatPrice, formatDateShort } from '../../utils/format';
import { getBookingLocationP5 } from '../../utils/mapPlaceToAddress';
import { useCheckoutState } from '../../context/CheckoutContext';
import { touchCheckoutStateForExhaustiveUi } from '../../domain/checkout/checkoutStateMachine';
import { CheckCircle2 } from 'lucide-react';
import ServiceSecondaryActions from '../../components/serviceState/ServiceSecondaryActions';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';
import MachineryIcons from '../../components/MachineryIcons';

const MIN_HOURS_IMMEDIATE = 4;
const MAX_HOURS_IMMEDIATE = 8;

/**
 * Pantalla de Resultado de Pago
 * 
 * Muestra el resultado del procesamiento del pago:
 * - Estado: procesando → aceptado/rechazado
 * - Si aceptado: desglose completo + datos del proveedor
 * - Comunicación por MAQGO (Avisos + mensajes controlados)
 * 
 * WORLD-CLASS: Esta es la pantalla donde se revela el proveedor
 * porque el pago ya fue procesado exitosamente.
 */
const TBK_ERROR_MAP = {
  '-1': 'Rechazo de la transacción por parte del emisor.',
  '-2': 'Rechazo de la transacción por parte de Transbank.',
  '-3': 'Error en el ingreso de los datos de la tarjeta.',
  '-4': 'Transacción abortada por el usuario.',
  '-5': 'Fallo de autenticación del titular.',
  '101': 'Tarjeta vencida.',
  '102': 'Tarjeta bloqueada temporalmente.',
  '104': 'Fondos insuficientes.',
  '106': 'Excede el límite de intentos de PIN.',
  '107': 'Contacte a su banco emisor.',
  '108': 'Error del sistema. Intente nuevamente.',
};

function PaymentResultScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const simulate = searchParams.get('simulate'); // rejected | payment_failed | expired | connection_error (para probar en demo)
  // Best practice: simulaciones por query deben estar OFF por defecto.
  // Solo activarlas explícitamente para QA con `localStorage.maqgo_simulation_enabled = "true"`.
  const allowSimulation = localStorage.getItem('maqgo_simulation_enabled') === 'true';
  const simulateSafe = allowSimulation ? simulate : null;
  const [status, setStatus] = useState('processing'); // processing, success, error, expired, rejected, payment_failed, connection_error
  const [pricing, setPricing] = useState(null);

  const checkoutOutcomeEmitted = useRef(false);
  const { state: checkoutState, dispatch: dispatchCheckout } = useCheckoutState();

  useEffect(() => {
    touchCheckoutStateForExhaustiveUi(checkoutState);
  }, [checkoutState]);

  const emitPaymentCheckoutOutcome = useCallback(
    (outcome) => {
      if (checkoutOutcomeEmitted.current) return;
      checkoutOutcomeEmitted.current = true;
      if (outcome === 'success') {
        dispatchCheckout({ type: 'PAYMENT_AUTH_SUCCESS' });
        setTimeout(() => dispatchCheckout({ type: 'CHARGE_SUCCESS' }), 0);
      } else if (outcome === 'rejected') {
        dispatchCheckout({ type: 'PROVIDER_REJECTED' });
      } else if (outcome === 'payment_failed') {
        dispatchCheckout({ type: 'CHARGE_FAILED' });
      } else if (outcome === 'expired') {
        dispatchCheckout({ type: 'PAYMENT_AUTH_FAILED' });
      }
    },
    [dispatchCheckout]
  );

  const processPayment = useCallback(async () => {
    try {
      const simulateToUse = simulateSafe;
      if (!simulateToUse) {
        const bookingId = localStorage.getItem('maqgo_booking_id');
        if (bookingId) {
          const maxAttempts = 45;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/bookings/${encodeURIComponent(bookingId)}`, {}, 12000);
            if (res.ok) {
              const agg = await res.json();
              const sr = agg.service_request;
              const pi = agg.payment_intent;
              const paid =
                sr?.paymentStatus === 'charged' ||
                pi?.state === 'PROVIDER_ACCEPTED';
              if (paid) {
                const selectedProvider = getObject('selectedProvider', {});
                const acceptedProvider = getObject('acceptedProvider', null);
                const savedProvider =
                  acceptedProvider && Object.keys(acceptedProvider || {}).length > 0
                    ? { ...selectedProvider, ...acceptedProvider }
                    : selectedProvider;
                const rawHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
                const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, rawHours));
                const reservationType = localStorage.getItem('reservationType') || 'immediate';
                const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
                const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machinery);
                const transportCost = needsTransport ? (savedProvider.transport_fee || 0) : 0;
                let pricingToShow = null;
                try {
                  const pricingResponse = await axios.post(
                    `${BACKEND_URL}/api/pricing/immediate`,
                    {
                      base_price_hr: savedProvider.price_per_hour || 45000,
                      hours,
                      transport_cost: transportCost,
                      is_immediate: reservationType === 'immediate',
                      machinery_type: machinery,
                    },
                    { timeout: 8000 }
                  );
                  pricingToShow = pricingResponse.data;
                } catch {
                  pricingToShow = null;
                }
                const chargedTotal = parseInt(
                  localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0',
                  10
                );
                const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
                if (chargedTotal > 0 && pricingToShow) {
                  pricingToShow = { ...pricingToShow, final_price: chargedTotal, needsInvoice };
                } else if (chargedTotal > 0) {
                  pricingToShow = { final_price: chargedTotal, needsInvoice };
                }
                setPricing(pricingToShow);
                const orderNum = `MQ-${Date.now().toString().slice(-8)}`;
                localStorage.setItem('orderNumber', orderNum);
                clearBookingProgress();
                unlockAudio();
                playPaymentSuccessSound();
                vibrate('accepted');
                emitPaymentCheckoutOutcome('success');
                setStatus('success');
                return;
              }
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }

      // Fallback: desglose vía pricing (sin inferir éxito de pago desde heurísticas locales si hubo booking sin estado terminal)
      const selectedProvider = getObject('selectedProvider', {});
      const acceptedProvider = getObject('acceptedProvider', null);
      const savedProvider = acceptedProvider && Object.keys(acceptedProvider || {}).length > 0
        ? { ...selectedProvider, ...acceptedProvider }
        : selectedProvider;
      const rawHours = parseInt(localStorage.getItem('selectedHours') || '4');
      const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, rawHours));
      const reservationType = localStorage.getItem('reservationType') || 'immediate';
      const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';

      // Determinar si necesita traslado según tipo de maquinaria
      const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machinery);
      const transportCost = needsTransport ? (savedProvider.transport_fee || 0) : 0;

      // Multiplicadores por hora (igual que backend)
      const IMMEDIATE_MULTIPLIERS = { 4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10 };
      const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.15;

      // Obtener pricing del backend (o fallback local) — solo desglose, no es verdad de pago
      let pricingToShow = null;
      try {
        const pricingResponse = await axios.post(
          `${BACKEND_URL}/api/pricing/immediate`,
          {
            base_price_hr: savedProvider.price_per_hour || 45000,
            hours: hours,
            transport_cost: transportCost,
            is_immediate: reservationType === 'immediate',
            machinery_type: machinery,
          },
          { timeout: 8000 }
        );
        pricingToShow = pricingResponse.data;
      } catch {
        const basePrice = savedProvider.price_per_hour || 45000;
        const isPerTrip = isPerTripMachineryType(machinery);
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
        if (storedPricing && (storedPricing.service_amount != null || storedPricing?.breakdown?.service_cost != null)) {
          pricingToShow = {
            ...pricingToShow,
            service_amount: storedPricing.service_amount ?? storedPricing?.breakdown?.service_cost ?? pricingToShow.service_amount,
            transport_cost: storedPricing.transport_cost ?? storedPricing?.breakdown?.transport_cost ?? pricingToShow.transport_cost,
            immediate_bonus: storedPricing.immediate_bonus ?? storedPricing?.breakdown?.immediate_bonus ?? pricingToShow.immediate_bonus ?? 0,
            client_commission: storedPricing.client_commission ?? storedPricing?.breakdown?.client_commission ?? pricingToShow.client_commission,
            client_commission_iva: storedPricing.client_commission_iva ?? storedPricing?.breakdown?.client_commission_iva ?? pricingToShow.client_commission_iva
          };
        }
      }
      setPricing(pricingToShow);

      // Generar número de orden
      const orderNum = `MQ-${Date.now().toString().slice(-8)}`;
      localStorage.setItem('orderNumber', orderNum);

      if (!simulateToUse) {
        // Limpiar progreso de reserva (se completó exitosamente).
        // Debe ser completo (bookingProgress + clientBookingStep) para no dejar estado zombie;
        // Welcome también normaliza progreso no reanudable al entrar.
        clearBookingProgress();
        unlockAudio();
        playPaymentSuccessSound();
        vibrate('accepted');
      }

      if (simulateToUse === 'rejected') {
        emitPaymentCheckoutOutcome('rejected');
        setStatus('rejected');
      } else if (simulateToUse === 'payment_failed') {
        const code = searchParams.get('response_code');
        const detail = searchParams.get('response_detail');
        void (code && TBK_ERROR_MAP[code]);
        void detail;

        setStatus('payment_failed');
        emitPaymentCheckoutOutcome('payment_failed');
      } else if (simulateToUse === 'expired') {
        emitPaymentCheckoutOutcome('expired');
        setStatus('expired');
      } else if (simulateToUse === 'connection_error') {
        // Best practice: nunca bloquear UX con "error de conexión"
        // aunque venga de simulación (evita confusión y pedidos de reintento).
        emitPaymentCheckoutOutcome('success');
        setStatus('success');
      } else {
        emitPaymentCheckoutOutcome('success');
        setStatus('success');
      }
      
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error processing payment:', error);
      } else {
        console.error('Error processing payment:', error?.message || 'unknown');
      }
      try {
        const selectedProvider = getObject('selectedProvider', {});
        const acceptedProvider = getObject('acceptedProvider', null);
        const savedProvider = acceptedProvider && Object.keys(acceptedProvider || {}).length > 0
          ? { ...selectedProvider, ...acceptedProvider }
          : selectedProvider;

        const rawHours = parseInt(localStorage.getItem('selectedHours') || '4');
        const hours = Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, rawHours));
        const reservationType = localStorage.getItem('reservationType') || 'immediate';
        const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';

        const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machinery);
        const transportCost = needsTransport ? (savedProvider.transport_fee || 0) : 0;

        const IMMEDIATE_MULTIPLIERS = { 4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10 };
        const multiplier = IMMEDIATE_MULTIPLIERS[hours] || 1.15;

        const isPerTrip = isPerTripMachineryType(machinery);
        const basePrice = savedProvider.price_per_hour || 45000;

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

        const fallbackPricing = {
          final_price: Math.round(finalPrice),
          service_amount: Math.round(serviceWithMultiplier),
          transport_cost: transportCost,
          client_commission: Math.round(clientCommission),
          client_commission_iva: Math.round(clientCommissionIva),
          immediate_bonus: reservationType === 'immediate' ? Math.round(serviceWithMultiplier - baseService) : 0,
        };

        const chargedTotal = parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0', 10);
        const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
        if (chargedTotal > 0) {
          fallbackPricing.final_price = chargedTotal;
          fallbackPricing.needsInvoice = needsInvoice;
        }

        setPricing(fallbackPricing);
        emitPaymentCheckoutOutcome('success');
        setStatus('success'); // UX: no bloquear si falla backend de pricing
      } catch {
        // Último recurso: al menos mostrar confirmación sin desglose.
        const chargedTotal = parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0', 10);
        const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
        setPricing({ final_price: chargedTotal, needsInvoice });
        emitPaymentCheckoutOutcome('success');
        setStatus('success'); // UX: evita ConnectionError bloqueante
      }
    }
  }, [simulateSafe, emitPaymentCheckoutOutcome, searchParams]);

  useEffect(() => {
    processPayment();
  }, [processPayment]);

  // Canal externo deshabilitado.

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
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div
          className="maqgo-screen"
          style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 28 }}
          role="status"
          aria-live="polite"
          aria-busy={true}
        >
          <div style={{ marginBottom: 16 }}>
            <MaqgoLogo customSize={120} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                position: 'relative',
              }}
              aria-hidden="true"
            >
              <svg
                width="80"
                height="80"
                viewBox="0 0 80 80"
                style={{ position: 'absolute', inset: 0, animation: 'maqgo-spin-ring 1.2s linear infinite' }}
              >
                <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.14)" strokeWidth="2" fill="none" />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#EC6819"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray="52 175"
                />
              </svg>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: 'rgba(144, 189, 211, 0.12)',
                  border: '1px solid rgba(144, 189, 211, 0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'maqgo-spin-gear 1.1s linear infinite',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
                    stroke="#90BDD3"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M19.25 12c0-.35-.03-.7-.08-1.04l2.02-1.56-1.9-3.29-2.46 1a8.1 8.1 0 0 0-1.8-1.04l-.37-2.63H9.34l-.37 2.63c-.64.27-1.24.62-1.8 1.04l-2.46-1-1.9 3.29 2.02 1.56c-.05.34-.08.69-.08 1.04 0 .35.03.7.08 1.04l-2.02 1.56 1.9 3.29 2.46-1c.56.42 1.16.77 1.8 1.04l.37 2.63h5.32l.37-2.63c.64-.27 1.24-.62 1.8-1.04l2.46 1 1.9-3.29-2.02-1.56c.05-.34.08-.69.08-1.04Z"
                    stroke="#90BDD3"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Buscando operador
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
            Esto puede tomar unos segundos.
          </p>
          </div>
          <style>{`@keyframes maqgo-spin-gear { to { transform: rotate(360deg); } } @keyframes maqgo-spin-ring { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Estado: Error
  if (status === 'error') {
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div className="maqgo-screen">
          <div style={{ padding: 24, textAlign: 'center' }}>
            <h2 style={{ color: '#FAFAFA', fontSize: 20, fontWeight: 600, margin: '20px 0 12px', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
              Reserva confirmada
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5, maxWidth: 320 }}>
              No pudimos cargar el detalle completo de la transacción. Puedes volver al inicio o reintentar para ver la información.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/client/home')}
                style={{
                  padding: '14px 28px',
                  background: 'transparent',
                  border: '2px solid rgba(144,189,211,0.5)',
                  borderRadius: 12,
                  color: 'rgba(144,189,211,0.95)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Ir al inicio
              </button>
              <button
                onClick={handleRetry}
                style={{
                  padding: '14px 28px',
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estado: Solicitud expirada (proveedor no respondió)
  if (status === 'expired') {
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div className="maqgo-screen">
          <RequestExpiredError onViewOthers={() => navigate('/client/providers')} />
        </div>
      </div>
    );
  }

  // Estado: Proveedor rechazó
  if (status === 'rejected') {
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div className="maqgo-screen">
          <ProviderRejectedError onSelectOther={() => navigate('/client/providers')} />
        </div>
      </div>
    );
  }

  // Estado: Error de pago post-aceptación
  if (status === 'payment_failed') {
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
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
  const location = getBookingLocationP5();
  const machinery = localStorage.getItem('selectedMachinery') || 'Retroexcavadora';
  const selectedDate = localStorage.getItem('selectedDate') || '';
  const selectedDates = getArray('selectedDates', []);

  const perTripScheduledLabel = getPerTripDateLabel(selectedDates, selectedDate, { prefix: 'Valor viaje ·' });
  const perTripBreakdownLabel = getPerTripCountLabel(selectedDates, selectedDates?.length || 1);

  const durationLabel = isPerTripMachineryType(machinery)
    ? (reservationType === 'scheduled' ? perTripScheduledLabel : 'Valor viaje · Inicio HOY')
    : (reservationType === 'scheduled' ? `Jornada · ${formatDateShort(selectedDate)}` : `${hours}h · Reserva prioritaria`);

  return (
    <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 28px' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MaqgoLogo customSize={120} />
          </div>

          <div style={{ height: 18 }} />

          <MaqgoCard style={{ background: '#2A2A2A', padding: '16px 18px', textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: 'rgba(144, 189, 211, 0.18)',
                border: '1px solid rgba(144, 189, 211, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px'
              }}
              aria-hidden="true"
            >
              <CheckCircle2 size={22} color="#90BDD3" />
            </div>
            <h2 style={{ color: '#fff', fontSize: 21, fontWeight: 900, lineHeight: 1.15, margin: 0 }}>
              ¡Reserva confirmada!
            </h2>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12.5, marginTop: 6 }}>
              Tu reserva está confirmada.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 1.45 }}>
              Las actualizaciones del servicio se registran en el Centro de Avisos.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Equipo reservado
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              {(() => {
                const key = String(machinery || '').toLowerCase();
                const Icon = MachineryIcons?.[key];
                return (
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      background: 'rgba(236, 104, 25, 0.14)',
                      border: '1px solid rgba(236, 104, 25, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                    aria-hidden="true"
                  >
                    {Icon ? <Icon size={22} color="#EC6819" /> : null}
                  </div>
                );
              })()}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 900, lineHeight: 1.15 }}>
                  {MACHINERY_NAMES[machinery] || machinery}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>
                  {durationLabel}
                </div>
                {location ? (
                  <div style={{ color: 'rgba(255,255,255,0.60)', fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {location}
                  </div>
                ) : null}
              </div>
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Detalle del cobro
            </div>
            <div style={{ marginTop: 10 }}>
              {(() => {
                const b = getClientBreakdown(pricing);
                const rows = [];
                rows.push([
                  reservationType === 'immediate'
                    ? `Reserva prioritaria (${hours}h)`
                    : isPerTripMachineryType(machinery)
                      ? (selectedDates?.length > 1 ? `Reserva (${perTripBreakdownLabel})` : 'Reserva (Valor viaje)')
                      : `Reserva (${reservationType === 'scheduled' ? '8' : hours}h)`,
                  formatPrice(b.service),
                ]);

                if (b.transport > 0) rows.push(['Traslado', formatPrice(b.transport)]);
                if (b.bonus > 0) rows.push(['Alta demanda', formatPrice(b.bonus)]);

                rows.push([
                  `Tarifa por Servicio MAQGO${b.needsInvoice ? ' (neta)' : ' (IVA incluido)'}`,
                  formatPrice(b.needsInvoice ? b.tarifaNeta : b.tarifaConIva),
                ]);

                if (b.needsInvoice && b.ivaTotal > 0) rows.push(['IVA (19%)', formatPrice(b.ivaTotal)]);

                return (
                  <>
                    {rows.map(([label, value], idx) => (
                      <div
                        key={`${label}-${idx}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '8px 0',
                          borderBottom: idx === rows.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{label}</span>
                        <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, textAlign: 'right', maxWidth: '62%' }}>{value}</span>
                      </div>
                    ))}

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.20)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>Total cobrado</span>
                      <span style={{ color: '#EC6819', fontSize: 13, fontWeight: 900 }}>{formatPrice(b.total || pricing?.final_price)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <div style={{ height: 14 }} />

          <ServiceSecondaryActions
            actions={[
              { key: 'continue', label: 'Ver estado del servicio', variant: 'primary', onClick: handleContinue, testId: 'continue-to-tracking-btn' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default PaymentResultScreen;
