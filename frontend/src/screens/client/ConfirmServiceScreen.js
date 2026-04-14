import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute, readClientBookingSnapshot } from '../../utils/bookingFlow';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { getObject, getArray } from '../../utils/safeStorage';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { buildPricingFallback, calculateClientPrice, MACHINERY_NO_TRANSPORT, totalConFactura, MAQGO_CLIENT_COMMISSION_RATE, IVA_RATE, REFERENCE_PRICES } from '../../utils/pricing';
import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getDateRangeShort as getDateRangeShortUtil } from '../../utils/bookingDates';
import { MaqgoButton } from '../../components/base';
import { getBookingLocationP5, hasBookingLocation } from '../../utils/mapPlaceToAddress';
import { PAYMENT_COPY } from '../../constants/bookingPaymentCopy';
import { useCheckoutState } from '../../context/CheckoutContext';
import { getOrCreateBookingId } from '../../utils/bookingPaymentKeys';
import { touchCheckoutStateForExhaustiveUi } from '../../domain/checkout/checkoutStateMachine';
import { useToast } from '../../components/Toast';
import { isEmpresaBillingComplete } from '../../utils/clientBillingInvoice';
import { getTruckUrgencySummaryLine } from '../../utils/clientBookingTruck';

/** Referencia estable para useMemo (evita deps falsas por array nuevo cada render). */
const TRIP_PRICE_SPREAD = [0.85, 0.92, 1, 1.08, 1.15];

/**
 * STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
 *
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 *
 * Pantalla: Confirma tu Servicio
 * Muestra resumen para 3 casos:
 * 1. Hoy (inmediato)
 * 2. Hoy + días adicionales (híbrido)
 * 3. Programar reserva (fecha futura)
 */
function ConfirmServiceScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  /** Una sola lectura coherente por navegación: evita mezclar inmediata/programada por estado inicial congelado. */
  const booking = useMemo(() => {
    void pathname;
    return readClientBookingSnapshot();
  }, [pathname]);
  const {
    reservationType,
    hoursToday,
    additionalDays,
    isHybrid,
    totalDays,
    selectedDate,
    selectedDates,
    serviceModel,
    urgencyType: bookingUrgencyType,
  } = booking;
  const machinery = booking.machinery;
  const machinerySpec = typeof window !== 'undefined'
    ? (localStorage.getItem('selectedMachinerySpec') || '').trim()
    : '';
  const [provider, _setProvider] = useState(() => getObject('selectedProvider', {}));
  /** Desglose siempre colapsado al entrar (1 o N proveedores); el usuario abre si quiere detalle. */
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [, setPriceError] = useState(null);
  const [retryCount] = useState(0);
  const [needsInvoice, setNeedsInvoice] = useState(() => localStorage.getItem('needsInvoice') === 'true');
  const [selectedProviderIds] = useState(() => getArray('selectedProviderIds', []));
  const [isConfirming, setIsConfirming] = useState(false);
  const toast = useToast();

  const confirmServiceEventSent = useRef(false);
  const { state: checkoutState, dispatch: dispatchCheckout } = useCheckoutState();

  useEffect(() => {
    touchCheckoutStateForExhaustiveUi(checkoutState);
  }, [checkoutState]);

  useEffect(() => {
    if (confirmServiceEventSent.current) return;
    confirmServiceEventSent.current = true;
    dispatchCheckout({ type: 'CONFIRM_SERVICE' });
  }, [dispatchCheckout]);

  // Actualiza el "tope" de navegación de la app en la bolita del paso 5.
  // Esto permite "adelantar/retroceder hasta donde llegaste" manteniendo el dato vigente por 24h.
  useEffect(() => {
    getOrCreateBookingId();
    saveBookingProgress('confirm');
  }, []);

  useEffect(() => {
    _setProvider(getObject('selectedProvider', {}));
  }, [pathname]);

  const machineryKey = (machinery || '').toLowerCase().replace(/\s+/g, '_');
  const isPerTrip = isPerTripMachineryType(machinery);
  const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machineryKey) && !MACHINERY_NO_TRANSPORT.includes(machinery);

  const refTrip = isPerTrip ? (REFERENCE_PRICES[machineryKey] ?? REFERENCE_PRICES[machinery]) : null;
  const hoursForPricing = reservationType === 'scheduled' ? 8 : hoursToday;

  /** Rango de precios (menor–mayor) y proveedor que da el máximo (para que el desglose coincida con el rango). */
  const { priceRange, providerForMax } = useMemo(() => {
    const ids = getArray('selectedProviderIds', []);
    const matched = getArray('matchedProviders', []);
    const selected = ids.length > 0 && matched.length > 0
      ? matched.filter((p) => new Set(ids.map((id) => String(id))).has(String(p.id)))
      : (provider?.id ? [provider] : []);
    if (selected.length === 0) return { priceRange: null, providerForMax: provider };

    const totals = selected.map((p, idx) => {
      // Mejor UX: si P4 ya calculó `total_price` para este proveedor,
      // lo reutilizamos para que P5 muestre exactamente el mismo mínimo/máximo.
      if (p?.total_price != null && Number.isFinite(Number(p.total_price))) {
        return Number(p.total_price);
      }

      let base = p.price_per_hour || 0;
      if (refTrip && base > 0 && base < 100000) base = Math.round(refTrip * (TRIP_PRICE_SPREAD[Math.min(idx, 4)] || 1));
      const sinFacturaTotal = calculateClientPrice({
        machineryType: machineryKey || machinery,
        basePrice: base,
        transportFee: needsTransport ? (p.transport_fee || 0) : 0,
        hours: hoursForPricing,
        days: totalDays,
        reservationType
      });
      // Convertimos al mismo bruto que ve el cliente en P4.
      return totalConFactura(sinFacturaTotal);
    });

    if (selected.length === 1) {
      return { priceRange: null, providerForMax: selected[0] };
    }
    const minT = Math.min(...totals);
    const maxT = Math.max(...totals);
    const maxIdx = totals.indexOf(maxT);
    return { priceRange: { min: minT, max: maxT }, providerForMax: selected[maxIdx] };
  }, [provider, machinery, machineryKey, refTrip, totalDays, reservationType, needsTransport, hoursForPricing]);

  // Proveedor usado para pedir precio al backend: el que da el máximo del rango (así el desglose = valor máximo mostrado)
  const effectiveProvider = useMemo(() => {
    const base = providerForMax;
    if (!base?.id) return base;
    const price = base.price_per_hour ?? 0;
    if (isPerTrip && price > 0 && price < 100000) {
      return { ...base, price_per_hour: refTrip || price };
    }
    return base;
  }, [providerForMax, isPerTrip, refTrip]);

  // Fallback local para mostrar desde el primer render (evita flash "Calculando precio..." → desglose)
  // Para per-trip (tolva, pluma, aljibe): si price_per_hour es 0, usar REFERENCE_PRICES
  const fallbackPricing = useMemo(() => {
    const basePrice = effectiveProvider?.price_per_hour ?? 0;
    const priceToUse = (basePrice > 0) ? basePrice : (isPerTrip && refTrip ? refTrip : 0);
    if (!priceToUse) return null;
    try {
      return buildPricingFallback({
        machineryType: machineryKey || machinery,
        basePrice: priceToUse,
        transportFee: needsTransport ? (effectiveProvider?.transport_fee || 0) : 0,
        hours: hoursToday,
        days: totalDays,
        reservationType,
        isHybrid,
        additionalDays
      });
    } catch {
      return null;
    }
  }, [effectiveProvider, machinery, machineryKey, hoursToday, totalDays, reservationType, isHybrid, additionalDays, needsTransport, isPerTrip, refTrip]);

  // Preload paso 6 para evitar flash al navegar
  useEffect(() => {
    import('./BillingDataScreen');
    import('./CardPaymentScreen');
  }, []);

  useEffect(() => {
    const fetchPricing = async () => {
      const basePrice = effectiveProvider?.price_per_hour ?? 0;
      const priceToUse = basePrice > 0 ? basePrice : (isPerTrip && refTrip ? refTrip : 0);
      if (!priceToUse) return;
      const transportCost = needsTransport ? (effectiveProvider?.transport_fee || 0) : 0;
      const FAST_FALLBACK_MS = 2500;
      const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_FALLBACK_MS));
      try {
        let apiPromise;
        if (isHybrid) {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/hybrid`, {
            machinery_type: machineryKey || machinery,
            base_price_hr: priceToUse,
            hours_today: hoursToday,
            additional_days: additionalDays,
            transport_cost: transportCost,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        } else if (reservationType === 'immediate') {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/immediate`, {
            machinery_type: machineryKey || machinery,
            base_price_hr: priceToUse,
            hours: hoursToday,
            transport_cost: transportCost,
            is_immediate: true,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        } else {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/scheduled`, {
            machinery_type: machineryKey || machinery,
            base_price: priceToUse,
            days: totalDays,
            transport_cost: transportCost,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        }
        const response = await Promise.race([apiPromise, timeoutPromise]);
        const data = response?.data;
        if (data && typeof data === 'object' && (data.final_price != null || data.breakdown)) {
          setPricing(data);
        }
      } catch (error) {
        console.error('Error fetching pricing:', error);
        // Fast fallback: usar precio local para no bloquear; ConnectionError solo si fallo real
        const isFastTimeout = error?.message === 'timeout';
        const isNetworkError = !isFastTimeout && !error.response && (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error') || error.message?.includes('timeout'));
        if (isNetworkError) {
          // No bloquear la UX: si el backend de pricing cae, mostramos el fallback local
          // y dejamos que el cliente complete igual el flujo.
          setPriceError(null);
          setPricing(buildPricingFallback({
            machineryType: machineryKey || machinery,
            basePrice: priceToUse,
            transportFee: needsTransport ? (effectiveProvider?.transport_fee || 0) : 0,
            hours: hoursToday,
            days: totalDays,
            reservationType,
            isHybrid,
            additionalDays
          }));
          return;
        }
        setPricing(buildPricingFallback({
          machineryType: machineryKey || machinery,
          basePrice: priceToUse,
          transportFee: needsTransport ? (effectiveProvider?.transport_fee || 0) : 0,
          hours: hoursToday,
          days: totalDays,
          reservationType,
          isHybrid,
          additionalDays
        }));
      }
    };

    fetchPricing();
  }, [effectiveProvider, hoursToday, additionalDays, reservationType, machinery, machineryKey, totalDays, isHybrid, retryCount, needsInvoice, isPerTrip, refTrip, needsTransport]);

  // Mostrar fallback desde el primer render para evitar flash (layout estable)
  const displayPricing = pricing ?? fallbackPricing;

  const formatPrice = (price) => {
    const n = price != null && !Number.isNaN(Number(price)) ? Number(price) : 0;
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(n);
  };

  // Best practice: si falla el backend de pricing, no bloqueamos el flujo.
  // Se renderiza el precio estimado con `fallbackPricing`.

  const handleConfirm = async () => {
    if (!hasValidPrice) return;
    setIsConfirming(true);
    try {
      if (!hasBookingLocation()) {
        navigate('/client/service-location');
        return;
      }
      localStorage.setItem('totalAmount', totalFinal.toString());
      localStorage.setItem('maxTotalAmount', totalFinal.toString());
      localStorage.setItem('needsInvoice', needsInvoice.toString());
      const p = displayPricing || pricing;
      const pricingToStore = {
        service_amount: p?.breakdown?.service_cost ?? p?.service_amount,
        transport_cost: p?.transport_cost ?? p?.breakdown?.transport_cost ?? 0,
        immediate_bonus: p?.immediate_bonus ?? p?.breakdown?.immediate_bonus ?? 0,
        client_commission: p?.client_commission ?? p?.breakdown?.client_commission ?? 0,
        client_commission_iva: p?.client_commission_iva ?? p?.breakdown?.client_commission_iva ?? 0,
        final_price: totalFinal,
        breakdown: p?.breakdown
      };
      const payloadToStore = JSON.stringify(pricingToStore);
      localStorage.setItem('servicePricing', payloadToStore);
      const transportCost =
        (displayPricing || pricing)?.transport_cost ||
        (displayPricing || pricing)?.breakdown?.transport_cost ||
        0;
      localStorage.setItem('serviceBasePrice', Math.round(subtotalNeto - transportCost).toString());
      localStorage.setItem('serviceTransportFee', Math.round(transportCost).toString());

      // Guard de rutas (BookingNavigationGuard): /client/card exige checkout "past idle" O
      // snapshot con paso payment. P5 guardaba solo "confirm" → al estar IDLE/UNKNOWN el
      // checkout, rebotaba a /client/confirm. Marcar payment antes de navegar + reforzar estado.
      dispatchCheckout({ type: 'CONFIRM_SERVICE' });
      saveBookingProgress('payment');

      if (needsInvoice) {
        const billing = getObject('billingData', {});
        if (!isEmpresaBillingComplete(billing)) {
          navigate('/client/billing');
          return;
        }
      }

      navigate('/client/card');
    } catch (e) {
      console.error('BOOKING ERROR:', e);
      toast.error('No pudimos continuar. Intenta de nuevo.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleInvoiceToggle = (value) => {
    setNeedsInvoice(value);
    localStorage.setItem('needsInvoice', value.toString());
  };

  // Calcular subtotal neto del proveedor (sin IVA) - usa displayPricing para render estable
  const getSubtotalNeto = () => {
    const p = displayPricing;
    if (!p) return 0;
    
    let subtotal = 0;
    
    if (isHybrid && p.today) {
      subtotal += p.today?.total_cost || 0;
      subtotal += p.additional_days?.total_cost || 0;
    } else if (reservationType === 'immediate') {
      subtotal += p.service_amount || p?.breakdown?.service_cost || 0;
      subtotal += p?.breakdown?.immediate_bonus || p.immediate_bonus || 0;
    } else {
      subtotal += p?.breakdown?.service_cost || 0;
    }
    
    subtotal += p.transport_cost || p?.breakdown?.transport_cost || 0;
    
    return subtotal;
  };

  const subtotalNeto = getSubtotalNeto();
  
  // Tarifa MAQGO: 10% sobre subtotal neto (API o fallback local)
  const maqgoFeeNeto = displayPricing?.breakdown?.client_commission ?? displayPricing?.client_commission ?? Math.round(subtotalNeto * MAQGO_CLIENT_COMMISSION_RATE);
  // IVA sobre Tarifa: siempre 19% de la Tarifa por Servicio (para que el desglose y la etiqueta coincidan)
  const maqgoFeeIva = Math.round(maqgoFeeNeto * IVA_RATE);
  const maqgoFeeConIva = maqgoFeeNeto + maqgoFeeIva;
  
  // Mismo bruto total para el cliente: IVA sobre (subtotal + Tarifa), independiente del toggle factura
  const totalFinal = displayPricing?.final_price ?? totalConFactura(Math.round(subtotalNeto + maqgoFeeConIva));
  const ivaTotal = Math.max(0, totalFinal - subtotalNeto - maqgoFeeNeto);

  const hasValidPrice =
    displayPricing != null &&
    Number.isFinite(totalFinal) &&
    totalFinal > 0;

  const dateRangeWithYear = getDateRangeShortUtil(selectedDates, selectedDate, { includeYear: true });

  const getServiceDescription = useCallback(() => {
    if (serviceModel === 'truck' && reservationType === 'immediate') {
      return getTruckUrgencySummaryLine(bookingUrgencyType);
    }
    if (reservationType === 'scheduled') {
      if (totalDays > 1) {
        return isPerTrip
          ? `${totalDays} viajes (1 por día)`
          : `${totalDays} días · 8hrs/día`;
      }
      return isPerTrip ? 'Valor viaje' : '8 horas';
    }
    if (isHybrid) {
      return isPerTrip ? `Hoy (viaje) + ${additionalDays} día${additionalDays > 1 ? 's' : ''}` : `Hoy ${hoursToday}hrs + ${additionalDays} día${additionalDays > 1 ? 's' : ''}`;
    }
    return isPerTrip ? 'Valor viaje' : `${hoursToday} horas`;
  }, [serviceModel, reservationType, totalDays, isPerTrip, isHybrid, additionalDays, hoursToday, bookingUrgencyType]);

  /** Resumen en 2–3 líneas: maquinaria · especificación | fechas | urgencia/duración (evita un solo párrafo cortado). */
  const bookingSummaryLayout = useMemo(() => {
    const machineryLabel = MACHINERY_NAMES[machinery] || machinery || 'Maquinaria';
    const machineLine = [machineryLabel, machinerySpec].filter(Boolean).join(' · ');
    const dateLine =
      reservationType !== 'immediate' && dateRangeWithYear ? dateRangeWithYear : null;
    const detailLine =
      reservationType === 'immediate'
        ? `Inicio hoy · ${getServiceDescription()}`
        : getServiceDescription();
    const ariaLabel = [machineLine, dateLine, detailLine].filter(Boolean).join('. ');
    return { machineLine, dateLine, detailLine, ariaLabel };
  }, [machinery, machinerySpec, reservationType, dateRangeWithYear, getServiceDescription]);

  // Sin proveedor = datos incompletos → redirigir a elegir proveedores
  if (!provider?.id) {
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          <p style={{ color: '#fff', marginBottom: 20, textAlign: 'center' }}>
            No hay proveedor seleccionado
          </p>
          <button
            className="maqgo-btn-primary"
            onClick={() => navigate('/client/providers')}
          >
            Elegir proveedor
          </button>
        </div>
      </div>
    );
  }

  const hasMultipleProviders = selectedProviderIds.length > 1;

  return (
    <div className="maqgo-app maqgo-client-funnel maqgo-funnel-split-layout" data-checkout-state={checkoutState}>
      <div
        className="maqgo-screen maqgo-screen--scroll maqgo-funnel-split-scroll"
        style={{ paddingBottom: 8 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="back-button"
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}><MaqgoLogo size="small" /></div>
          
        </div>

        <BookingProgress compact />

        <div
          role="group"
          aria-label={bookingSummaryLayout.ariaLabel}
          style={{
            textAlign: 'center',
            margin: '4px 0 6px',
            padding: '0 8px',
            maxWidth: '100%',
          }}
        >
          <div
            style={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.35,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {bookingSummaryLayout.machineLine}
          </div>
          {bookingSummaryLayout.dateLine ? (
            <div
              style={{
                marginTop: 6,
                color: 'rgba(255,255,255,0.82)',
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}
            >
              {bookingSummaryLayout.dateLine}
            </div>
          ) : null}
          <div
            style={{
              marginTop: bookingSummaryLayout.dateLine ? 4 : 6,
              color: 'rgba(255,255,255,0.72)',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {bookingSummaryLayout.detailLine}
          </div>
        </div>

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 6, fontSize: 16, lineHeight: 1.2 }}>
          Revisa tu solicitud
        </h1>

        <div
          style={{
            background: 'rgba(76, 175, 80, 0.12)',
            border: '1px solid rgba(76, 175, 80, 0.35)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 8
          }}
        >
          <p
            style={{
              color: 'rgba(255,255,255,0.98)',
              fontSize: 13,
              fontWeight: 600,
              margin: '0 0 4px',
              lineHeight: 1.35,
              textAlign: 'center',
            }}
          >
            {PAYMENT_COPY.P5_INIT.title}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, margin: 0, lineHeight: 1.35, textAlign: 'center' }}>
            {PAYMENT_COPY.P5_INIT.subtitle}
          </p>
        </div>

        {selectedProviderIds.length > 1 && (
          <div
            style={{
              background: 'rgba(144, 189, 211, 0.18)',
              border: '2px solid rgba(144, 189, 211, 0.55)',
              borderRadius: 10,
              padding: '8px 10px',
              marginBottom: 8,
            }}
            role="status"
          >
            <p style={{ color: '#B8DCEB', fontSize: 13, margin: 0, textAlign: 'center', lineHeight: 1.45 }}>
              Enviarás la solicitud a{' '}
              <strong style={{ color: '#E8F4FA' }}>{selectedProviderIds.length} proveedores</strong>.
              <br />
              <span style={{ color: '#E8F4FA', fontWeight: 600 }}>El precio final depende de quién acepte primero</span>
              {' '}(puede ser menor que el tope del rango).
            </p>
          </div>
        )}

        {/* Ubicación antes del precio: contexto “dónde” sin cortar entre monto y siguiente paso */}
        <div style={{ marginBottom: 8 }}>
          <p
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.35,
              textTransform: 'uppercase',
              margin: '0 0 4px',
              paddingLeft: 2,
            }}
          >
            Ubicación del servicio
          </p>
          <div
            style={{
              background: '#363636',
              borderRadius: 10,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M10 1C6.69 1 4 3.69 4 7C4 11.5 10 19 10 19S16 11.5 16 7C16 3.69 13.31 1 10 1Z"
                stroke="var(--maqgo-orange)"
                strokeWidth="1.5"
                fill="none"
              />
              <circle cx="10" cy="7" r="2" fill="var(--maqgo-orange)" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 12, lineHeight: 1.35 }}>{getBookingLocationP5()}</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/client/service-location')}
              style={{ background: 'none', border: 'none', color: 'var(--maqgo-orange)', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
              Cambiar
            </button>
          </div>
        </div>

        {/* Precio, factura y desglose (una sola tarjeta; sin scroll en vista típica) */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 10,
          padding: 12,
          marginBottom: 8
        }}>
          {!displayPricing || !hasValidPrice ? (
            <p
              style={{
                color: 'rgba(255, 230, 200, 0.95)',
                fontSize: 14,
                textAlign: 'center',
                margin: '8px 0 4px',
                lineHeight: 1.45,
              }}
            >
              Estamos preparando el total de tu solicitud.
            </p>
          ) : (
            <>
              {priceRange && hasMultipleProviders ? (
                <>
                  <div
                    role="status"
                    aria-label={`Rango estimado desde ${formatPrice(priceRange.min)} hasta ${formatPrice(priceRange.max)}`}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      columnGap: 8,
                      rowGap: 4,
                      color: 'var(--maqgo-orange)',
                      fontSize: 24,
                      fontWeight: 700,
                      margin: '0 0 4px',
                      lineHeight: 1.25,
                      textAlign: 'center'
                    }}
                  >
                    <span style={{ flex: '0 1 auto' }}>{formatPrice(priceRange.min)}</span>
                    <span style={{ opacity: 0.88, fontWeight: 600, fontSize: '0.55em', letterSpacing: 0.5 }}>–</span>
                    <span style={{ flex: '0 1 auto' }}>{formatPrice(priceRange.max)}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '0 0 8px', textAlign: 'center', lineHeight: 1.35 }}>
                    {PAYMENT_COPY.P5_INIT.priceCapNote}
                  </p>
                </>
              ) : (
                <>
                  <p
                    style={{
                      color: 'var(--maqgo-orange)',
                      fontSize: 26,
                      fontWeight: 700,
                      margin: '0 0 4px',
                      textAlign: 'center',
                      lineHeight: 1.15,
                      wordBreak: 'break-word'
                    }}
                  >
                    {formatPrice(priceRange ? priceRange.min : totalFinal)}
                  </p>
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: 13,
                      margin: '0 0 8px',
                      textAlign: 'center',
                      lineHeight: 1.35,
                    }}
                  >
                    {PAYMENT_COPY.P5_INIT.singleProviderCaption}
                  </p>
                </>
              )}

              {/* Factura empresa: solo checkbox; sin opción “boleta” ni segundo documento */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 0 0',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  marginTop: 4
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500 }}>
                  {PAYMENT_COPY.P5_INIT.invoiceQuestion}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.35 }}>
                  {PAYMENT_COPY.P5_INIT.invoiceSameTotalNote}
                </span>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginTop: 4,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={needsInvoice}
                    onChange={(e) => handleInvoiceToggle(e.target.checked)}
                    data-testid="p5-invoice-empresa-checkbox"
                    aria-describedby={needsInvoice ? 'p5-invoice-hint' : undefined}
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: 2,
                      flexShrink: 0,
                      accentColor: '#EC6819',
                      cursor: 'pointer',
                    }}
                  />
                  <span
                    style={{
                      color: 'rgba(255,255,255,0.92)',
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                  >
                    {PAYMENT_COPY.P5_INIT.invoiceCheckboxLabel}
                  </span>
                </label>
                {needsInvoice ? (
                  <p
                    id="p5-invoice-hint"
                    style={{
                      margin: '0 0 0 28px',
                      fontSize: 13,
                      lineHeight: 1.35,
                      color: 'rgba(255,255,255,0.72)',
                    }}
                  >
                    {PAYMENT_COPY.P5_INIT.invoiceYesHint}
                  </p>
                ) : null}
              </div>
            </>
          )}

          {/* Desglose (misma tarjeta; colapsado por defecto) */}
          {displayPricing && (
          <>
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            aria-expanded={showBreakdown}
            aria-controls="price-breakdown"
            aria-label={showBreakdown ? 'Ocultar desglose del precio' : 'Ver desglose del precio'}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px 0 0',
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              cursor: 'pointer'
            }}
            data-testid="toggle-breakdown"
          >
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
              {showBreakdown ? 'Ocultar desglose' : 'Ver desglose del precio'}
            </span>
            <svg 
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              style={{ transform: showBreakdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }}
            >
              <path d="M6 9L12 15L18 9" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Desglose expandido */}
          {showBreakdown && displayPricing && (
            <div
              id="price-breakdown"
              role="region"
              aria-label="Desglose del precio de tu solicitud"
              style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  margin: '0 0 12px',
                  lineHeight: 1.45,
                  textAlign: 'center',
                }}
              >
                {PAYMENT_COPY.P5_INIT.breakdownSameTotalHint}
              </p>
              {hasMultipleProviders && (
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 12 }}>
                  {PAYMENT_COPY.P5_INIT.breakdownMultiProviderHint}
                </p>
              )}
              
              {/* CASO 1: Solo hoy (inmediato) */}
              {reservationType === 'immediate' && !isHybrid && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{serviceModel === 'truck' ? getTruckUrgencySummaryLine(bookingUrgencyType) : isPerTrip ? 'Valor viaje' : `Servicio (${hoursToday}h)`}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.service_amount ?? displayPricing?.breakdown?.base_service ?? (isPerTrip ? (effectiveProvider?.price_per_hour ?? refTrip) : (effectiveProvider?.price_per_hour ?? refTrip) * hoursToday))}</span>
                  </div>
                  {((displayPricing?.breakdown?.immediate_bonus || displayPricing?.immediate_bonus || 0) > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, minWidth: 0 }}>Alta demanda</span>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.breakdown?.immediate_bonus || displayPricing?.immediate_bonus || 0)}</span>
                    </div>
                  )}
                </>
              )}

              {/* CASO 2: Híbrido (hoy + días adicionales) */}
              {isHybrid && displayPricing?.today && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{serviceModel === 'truck' ? getTruckUrgencySummaryLine(bookingUrgencyType) : isPerTrip ? 'Hoy (viaje)' : `Hoy (${displayPricing.today.hours}h)`}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing.today.base_cost ?? (isPerTrip ? (effectiveProvider?.price_per_hour ?? refTrip) : (effectiveProvider?.price_per_hour ?? refTrip) * displayPricing.today.hours))}</span>
                  </div>
                  {((displayPricing.today.surcharge_amount || 0) > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, minWidth: 0 }}>Alta demanda</span>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing.today.surcharge_amount || 0)}</span>
                    </div>
                  )}
                  {(displayPricing?.additional_days?.days > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? `${displayPricing?.additional_days?.days} viaje${(displayPricing?.additional_days?.days || 0) > 1 ? 's' : ''} (1 por día) adicional${(displayPricing?.additional_days?.days || 0) > 1 ? 'es' : ''}` : `${displayPricing?.additional_days?.days} día${(displayPricing?.additional_days?.days || 0) > 1 ? 's' : ''} adicional${(displayPricing?.additional_days?.days || 0) > 1 ? 'es' : ''} (8h/día)`}</span>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.additional_days?.total_cost || 0)}</span>
                    </div>
                  )}
                </>
              )}

              {/* CASO 3: Programado */}
              {reservationType === 'scheduled' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? (totalDays > 1 ? `${totalDays} viajes (1 por día)` : 'Valor viaje') : (totalDays > 1 ? `${totalDays} días (8h/día)` : 'Jornada (8h)')}</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.breakdown?.service_cost ?? displayPricing?.service_amount ?? 0)}</span>
                </div>
              )}

              {/* Fallback: si no entró en ningún caso (ej. datos incompletos), mostrar al menos una línea */}
              {!reservationType && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Servicio</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.service_amount ?? displayPricing?.breakdown?.service_cost ?? subtotalNeto)}</span>
                </div>
              )}
              {reservationType === 'immediate' && isHybrid && !displayPricing?.today && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Servicio</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.service_amount ?? displayPricing?.breakdown?.service_cost ?? subtotalNeto)}</span>
                </div>
              )}

              {/* Traslado: solo si la maquinaria lleva traslado (no camión tolva/pluma/aljibe) */}
              {!isPerTrip && (displayPricing?.transport_cost || displayPricing?.breakdown?.transport_cost || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Traslado</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(displayPricing?.transport_cost || displayPricing?.breakdown?.transport_cost || 0)}</span>
                </div>
              )}

              {/* Subtotal neto proveedor */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                gap: 8
              }}>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, minWidth: 0 }}>Subtotal del servicio (sin IVA)</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(subtotalNeto)}</span>
              </div>

              {/* Tarifa por Servicio */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, minWidth: 0 }}>Tarifa por Servicio</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(maqgoFeeNeto)}</span>
              </div>

              {/* IVA sobre subtotal + tarifa (mismo criterio de total que arriba) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, minWidth: 0 }}>IVA 19% (Subtotal + Tarifa por Servicio)</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(ivaTotal)}</span>
              </div>

              {/* Total a pagar */}
              <div style={{ 
                borderTop: '1px solid rgba(255,255,255,0.2)', 
                paddingTop: 12, 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 600, minWidth: 0 }}>{PAYMENT_COPY.P5_INIT.totalRowLabel}</span>
                <span style={{ color: 'var(--maqgo-orange)', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(totalFinal)}</span>
              </div>
            </div>
          )}
          </>
          )}
        </div>
        
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Próximo paso (sin repetir “no cobro”) */}
        <div
          style={{
            background: '#363636',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 8
          }}
          data-testid="payment-method"
          aria-label="Siguiente paso de pago"
        >
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: 'rgba(255,255,255,0.88)',
              fontSize: 12,
              lineHeight: 1.4
            }}
          >
            {PAYMENT_COPY.P5_INIT.methodBullets.map((line, i) => (
              <li key={`p5-bullet-${i}`} style={{ marginBottom: i < PAYMENT_COPY.P5_INIT.methodBullets.length - 1 ? 4 : 0 }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA al pie: flex + scroll medio (sin position:fixed; mismo patrón P1/P4) */}
      <div className="maqgo-funnel-split-footer" role="region" aria-label="Confirmar solicitud de servicio">
        {!hasValidPrice ? (
          <p
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: 12,
              textAlign: 'center',
              margin: '0 0 6px',
              lineHeight: 1.4,
            }}
          >
            En un momento podrás confirmar tu solicitud.
          </p>
        ) : null}
        <MaqgoButton
          onClick={handleConfirm}
          disabled={isConfirming || !hasValidPrice}
          loading={isConfirming}
          style={{ fontSize: 15, fontWeight: 600, borderRadius: 30, width: '100%' }}
          data-testid="confirm-btn"
          aria-label={isConfirming ? 'Confirmando' : 'Confirmar solicitud'}
        >
          Confirmar solicitud
        </MaqgoButton>
      </div>
    </div>
  );
}

export default ConfirmServiceScreen;
