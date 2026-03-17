import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { getObject, getArray } from '../../utils/safeStorage';
import { buildPricingFallback, calculateClientPrice, MACHINERY_NO_TRANSPORT, totalConFactura, MAQGO_CLIENT_COMMISSION_RATE, IVA_RATE, MACHINERY_PER_TRIP, REFERENCE_PRICES } from '../../utils/pricing';
import BACKEND_URL from '../../utils/api';
import { ConnectionError } from '../../components/ErrorStates';
import { MACHINERY_NAMES, getProviderSpecDisplay } from '../../utils/machineryNames';
import { getPerTripDateLabel, getDateRangeShort as getDateRangeShortUtil, formatDateSingle } from '../../utils/bookingDates';
import { MaqgoButton } from '../../components/base';

const MIN_HOURS_IMMEDIATE = 4;
const MAX_HOURS_IMMEDIATE = 8;

/**
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
  // Inicializar desde localStorage en el primer render para evitar flash "No hay proveedor"
  const [location, setLocation] = useState(() => localStorage.getItem('serviceLocation') || '');
  const [provider, setProvider] = useState(() => getObject('selectedProvider', {}));
  const [hoursToday, setHoursToday] = useState(() => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    const saved = parseInt(localStorage.getItem('selectedHours') || '4');
    return type === 'scheduled' ? 8 : Math.max(MIN_HOURS_IMMEDIATE, Math.min(MAX_HOURS_IMMEDIATE, saved));
  });
  const [additionalDays, setAdditionalDays] = useState(() => parseInt(localStorage.getItem('additionalDays') || '0'));
  const [reservationType, setReservationType] = useState(() => localStorage.getItem('reservationType') || 'immediate');
  const [machinery, setMachinery] = useState(() => localStorage.getItem('selectedMachinery') || 'retroexcavadora');
  const [selectedDate, setSelectedDate] = useState(() => localStorage.getItem('selectedDate') || '');
  const [selectedDates, setSelectedDates] = useState(() => getArray('selectedDates', []));
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [pricing, setPricing] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceError, setPriceError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [needsInvoice, setNeedsInvoice] = useState(() => localStorage.getItem('needsInvoice') === 'true');
  const [urgencyType, setUrgencyType] = useState(() => localStorage.getItem('urgencyType') || null);
  const [selectedProviderIds, setSelectedProviderIds] = useState(() => getArray('selectedProviderIds', []));
  const [matchedProviders, setMatchedProviders] = useState(() => getArray('matchedProviders', []));
  const [isConfirming, setIsConfirming] = useState(false);

  const isPerTrip = MACHINERY_PER_TRIP.includes(machinery);
  const isHybrid = reservationType === 'immediate' && additionalDays > 0;
  const totalDays = selectedDates.length || 1;
  const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machinery);

  const refTrip = isPerTrip ? REFERENCE_PRICES[machinery] : null;
  const tripSpread = [0.85, 0.92, 1, 1.08, 1.15];
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
      let base = p.price_per_hour || 0;
      if (refTrip && base > 0 && base < 100000) base = Math.round(refTrip * (tripSpread[Math.min(idx, 4)] || 1));
      return calculateClientPrice({
        machineryType: machinery,
        basePrice: base,
        transportFee: needsTransport ? (p.transport_fee || 0) : 0,
        hours: hoursForPricing,
        days: totalDays,
        reservationType
      });
    });

    if (selected.length === 1) {
      return { priceRange: null, providerForMax: selected[0] };
    }
    const minT = Math.min(...totals);
    const maxT = Math.max(...totals);
    const maxIdx = totals.indexOf(maxT);
    return { priceRange: { min: minT, max: maxT }, providerForMax: selected[maxIdx] };
  }, [provider, selectedProviderIds, matchedProviders, machinery, hoursToday, totalDays, reservationType, needsTransport, isPerTrip, hoursForPricing]);

  // Proveedor usado para pedir precio al backend: el que da el máximo del rango (así el desglose = valor máximo mostrado)
  const effectiveProvider = useMemo(() => {
    const base = providerForMax;
    if (!base?.id) return base;
    const price = base.price_per_hour ?? 0;
    if (isPerTrip && price > 0 && price < 100000) {
      return { ...base, price_per_hour: refTrip || price };
    }
    return base;
  }, [providerForMax, machinery, isPerTrip, refTrip]);

  useEffect(() => {
    const fetchPricing = async () => {
      if (!effectiveProvider?.price_per_hour) {
        setLoadingPrice(false);
        return;
      }
      // Solo mostrar "Calculando precio..." en carga inicial; al cambiar con/sin factura mantener el desglose visible para evitar parpadeo
      const isInitialLoad = !pricing;
      if (isInitialLoad) setLoadingPrice(true);
      const transportCost = needsTransport ? (effectiveProvider.transport_fee || 0) : 0;
      const FAST_FALLBACK_MS = 2500;
      const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_FALLBACK_MS));
      try {
        let apiPromise;
        if (isHybrid) {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/hybrid`, {
            machinery_type: machinery,
            base_price_hr: effectiveProvider.price_per_hour,
            hours_today: hoursToday,
            additional_days: additionalDays,
            transport_cost: transportCost,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        } else if (reservationType === 'immediate') {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/immediate`, {
            machinery_type: machinery,
            base_price_hr: effectiveProvider.price_per_hour,
            hours: hoursToday,
            transport_cost: transportCost,
            is_immediate: true,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        } else {
          apiPromise = axios.post(`${BACKEND_URL}/api/pricing/scheduled`, {
            machinery_type: machinery,
            base_price: effectiveProvider.price_per_hour,
            days: totalDays,
            transport_cost: transportCost,
            needs_invoice: needsInvoice
          }, { timeout: 5000 });
        }
        const response = await Promise.race([apiPromise, timeoutPromise]);
        setPricing(response.data);
      } catch (error) {
        console.error('Error fetching pricing:', error);
        // Fast fallback: usar precio local para no bloquear; ConnectionError solo si fallo real
        const isFastTimeout = error?.message === 'timeout';
        const isNetworkError = !isFastTimeout && !error.response && (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error') || error.message?.includes('timeout'));
        if (isNetworkError) {
          setPriceError('connection');
          setLoadingPrice(false);
          return;
        }
        setPricing(buildPricingFallback({
          machineryType: machinery,
          basePrice: effectiveProvider.price_per_hour,
          transportFee: needsTransport ? (effectiveProvider.transport_fee || 0) : 0,
          hours: hoursToday,
          days: totalDays,
          reservationType,
          isHybrid,
          additionalDays
        }));
      } finally {
        setLoadingPrice(false);
      }
    };

    if (effectiveProvider?.price_per_hour) {
      fetchPricing();
    }
  }, [effectiveProvider, hoursToday, additionalDays, reservationType, machinery, totalDays, isHybrid, retryCount, needsInvoice]);

  // El total base sin considerar factura
  const totalBase = pricing?.final_price || 0;

  const formatPrice = (price) => {
    const n = price != null && !Number.isNaN(Number(price)) ? Number(price) : 0;
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(n);
  };

  const formatDate = (dateStr) => formatDateSingle(dateStr);

  // Mostrar ConnectionError cuando falló la conexión al obtener precio
  if (priceError === 'connection') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ justifyContent: 'center', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          <ConnectionError onRetry={() => {
            setPriceError(null);
            setRetryCount(c => c + 1);
          }} />
        </div>
      </div>
    );
  }

  const doConfirm = () => {
    if (!location.trim()) {
      navigate('/client/service-location');
      return;
    }
    localStorage.setItem('totalAmount', totalFinal.toString());
    localStorage.setItem('maxTotalAmount', totalFinal.toString());
    localStorage.setItem('needsInvoice', needsInvoice.toString());
    // Guardar pricing completo para desglose en Servicio Finalizado
    const pricingToStore = {
      service_amount: pricing?.breakdown?.service_cost ?? pricing?.service_amount,
      transport_cost: pricing?.transport_cost ?? pricing?.breakdown?.transport_cost ?? 0,
      immediate_bonus: pricing?.immediate_bonus ?? pricing?.breakdown?.immediate_bonus ?? 0,
      client_commission: pricing?.client_commission ?? pricing?.breakdown?.client_commission ?? 0,
      client_commission_iva: pricing?.client_commission_iva ?? pricing?.breakdown?.client_commission_iva ?? 0,
      final_price: totalFinal,
      breakdown: pricing?.breakdown
    };
    localStorage.setItem('servicePricing', JSON.stringify(pricingToStore));
    // Para crear service request tras OneClick
    const transportCost = pricing?.transport_cost || pricing?.breakdown?.transport_cost || 0;
    localStorage.setItem('serviceBasePrice', Math.round(subtotalNeto - transportCost).toString());
    localStorage.setItem('serviceTransportFee', Math.round(transportCost).toString());
    if (needsInvoice) {
      navigate('/client/billing');
    } else {
      navigate('/client/card');
    }
  };

  const handleConfirm = () => {
    setIsConfirming(true);
    doConfirm();
  };

  const handleInvoiceToggle = (value) => {
    setNeedsInvoice(value);
    localStorage.setItem('needsInvoice', value.toString());
  };

  // Calcular subtotal neto del proveedor (sin IVA)
  const getSubtotalNeto = () => {
    if (!pricing) return 0;
    
    let subtotal = 0;
    
    if (isHybrid && pricing.today) {
      subtotal += pricing.today.total_cost || 0;
      subtotal += pricing.additional_days?.total_cost || 0;
    } else if (reservationType === 'immediate') {
      subtotal += pricing.service_amount || pricing.breakdown?.service_cost || 0;
      subtotal += pricing.breakdown?.immediate_bonus || pricing.immediate_bonus || 0;
    } else {
      subtotal += pricing.breakdown?.service_cost || 0;
    }
    
    subtotal += pricing.transport_cost || pricing.breakdown?.transport_cost || 0;
    
    return subtotal;
  };

  const subtotalNeto = getSubtotalNeto();
  
  // Tarifa MAQGO: 10% sobre subtotal neto (API o fallback local)
  const maqgoFeeNeto = pricing?.breakdown?.client_commission ?? pricing?.client_commission ?? Math.round(subtotalNeto * MAQGO_CLIENT_COMMISSION_RATE);
  // IVA sobre Tarifa: siempre 19% de la Tarifa por Servicio (para que el desglose y la etiqueta coincidan)
  const maqgoFeeIva = Math.round(maqgoFeeNeto * IVA_RATE);
  const maqgoFeeConIva = maqgoFeeNeto + maqgoFeeIva;
  
  // Total sin factura (base para fallback)
  const totalSinFactura = pricing?.final_price ?? Math.round(subtotalNeto + maqgoFeeConIva);
  // Total a pagar: API devuelve ya el correcto (con o sin factura) porque enviamos needs_invoice; fallback lo calculamos
  let totalFinal;
  let ivaTotal;
  if (pricing?.final_price != null && pricing.final_price > 0) {
    totalFinal = pricing.final_price;
    ivaTotal = needsInvoice ? Math.max(0, totalFinal - subtotalNeto - maqgoFeeNeto) : 0;
  } else {
    if (needsInvoice) {
      totalFinal = totalConFactura(totalSinFactura);
      ivaTotal = totalFinal - totalSinFactura;
    } else {
      totalFinal = totalSinFactura;
      ivaTotal = 0;
    }
  }

  const dateRangeShort = getDateRangeShortUtil(selectedDates, selectedDate);
  const dateRangeWithYear = getDateRangeShortUtil(selectedDates, selectedDate, { includeYear: true });

  // Calcular descripción del servicio (sin duplicar con la línea de fecha debajo)
  const getServiceDescription = () => {
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
    // Inmediato (solo hoy): aquí mostramos solo horas / tipo de servicio.
    // El "Inicio hoy · Servicio prioritario" ya se muestra en la línea inferior de la tarjeta.
    return isPerTrip ? 'Valor viaje' : `${hoursToday} horas`;
  };

  // Sin proveedor = datos incompletos → redirigir a elegir proveedores
  if (!provider?.id) {
    return (
      <div className="maqgo-app">
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
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="back-button"
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}><MaqgoLogo size="small" /></div>
          <div style={{ width: 24 }}></div>
        </div>

        <BookingProgress />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 16 }}>
          Confirma tu reserva
        </h1>

        {selectedProviderIds.length > 1 && (
          <div style={{
            background: 'rgba(144, 189, 211, 0.15)',
            border: '1px solid rgba(144, 189, 211, 0.4)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 14
          }}>
            <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Enviarás la solicitud a <strong>{selectedProviderIds.length} proveedores</strong>. El precio final dependerá de quién acepte primero.
            </p>
          </div>
        )}

        {/* Precio, Con/Sin factura y desglose en una sola tarjeta */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 14
        }}>
          <p
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 12,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1
            }}
          >
            {hasMultipleProviders ? 'Rango estimado' : 'Total a pagar'}
          </p>
          {hasMultipleProviders && !loadingPrice && pricing && (
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 0, marginBottom: 10 }}>
              Nunca pagarás más que el valor máximo que ves aquí. El monto final puede ser menor según quién acepte primero tu reserva.
            </p>
          )}
          {loadingPrice ? (
            <div style={{ height: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <div style={{
                width: 20,
                height: 20,
                border: '2px solid rgba(236,104,25,0.3)',
                borderTopColor: 'var(--maqgo-orange)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Calculando precio...</span>
            </div>
          ) : !pricing ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 12px' }}>
                No pudimos calcular el precio
              </p>
              <button
                className="maqgo-btn-primary"
                onClick={() => navigate('/client/providers')}
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                Elegir otro proveedor
              </button>
            </div>
          ) : (
            <>
              {priceRange && hasMultipleProviders ? (
                <p style={{ color: 'var(--maqgo-orange)', fontSize: 28, fontWeight: 700, margin: '0 0 16px', whiteSpace: 'nowrap' }}>
                  <span>{formatPrice(needsInvoice ? totalConFactura(priceRange.min) : priceRange.min)}</span>
                  <span style={{ margin: '0 6px', opacity: 0.9 }}>a</span>
                  <span>{formatPrice(needsInvoice ? totalConFactura(priceRange.max) : priceRange.max)}</span>
                </p>
              ) : (
                <p style={{ color: 'var(--maqgo-orange)', fontSize: 32, fontWeight: 700, margin: '0 0 16px', whiteSpace: 'nowrap' }}>
                  {formatPrice(priceRange ? (needsInvoice ? totalConFactura(priceRange.min) : priceRange.min) : totalFinal)}
                </p>
              )}

              {/* Con / Sin factura - mismo bloque que el precio */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '12px 0',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                marginBottom: 14
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500 }}>
                    Necesitas factura:
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleInvoiceToggle(false)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 20,
                        border: 'none',
                        background: !needsInvoice ? 'var(--maqgo-orange)' : '#444',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      data-testid="no-invoice-btn"
                    >
                      No
                    </button>
                    <button
                      onClick={() => handleInvoiceToggle(true)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 20,
                        border: 'none',
                        background: needsInvoice ? 'var(--maqgo-orange)' : '#444',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      data-testid="yes-invoice-btn"
                    >
                      Sí
                    </button>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: 0 }}>
                  Si eliges factura, el total incluye IVA y emitiremos la factura a nombre de los datos de facturación que ingreses.
                </p>
              </div>

            </>
          )}
        </div>

        {/* Desglose de precio (misma tarjeta visual: abrir por defecto cuando hay pricing) */}
        {pricing && (
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: '0 16px 16px',
          marginTop: -6,
          marginBottom: 14
        }}>
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            aria-expanded={showBreakdown}
            aria-controls="price-breakdown"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '12px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              cursor: 'pointer'
            }}
            data-testid="toggle-breakdown"
          >
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
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
          {showBreakdown && pricing && (
            <div id="price-breakdown" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {hasMultipleProviders && (
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 12 }}>
                  Este desglose se basa en el valor máximo. Pagarás ese monto o menos, según quién acepte primero tu solicitud.
                </p>
              )}
              
              {/* CASO 1: Solo hoy (inmediato) */}
              {reservationType === 'immediate' && !isHybrid && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? 'Valor viaje' : `Servicio (${hoursToday}h)`}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.service_amount ?? pricing.breakdown?.base_service ?? (isPerTrip ? effectiveProvider.price_per_hour : effectiveProvider.price_per_hour * hoursToday))}</span>
                  </div>
                  {(pricing.breakdown?.immediate_bonus || pricing.immediate_bonus || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, minWidth: 0 }}>Alta demanda</span>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.breakdown?.immediate_bonus || pricing.immediate_bonus || 0)}</span>
                    </div>
                  )}
                </>
              )}

              {/* CASO 2: Híbrido (hoy + días adicionales) */}
              {isHybrid && pricing.today && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? 'Hoy (viaje)' : `Hoy (${pricing.today.hours}h)`}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.today.base_cost ?? (isPerTrip ? effectiveProvider.price_per_hour : effectiveProvider.price_per_hour * pricing.today.hours))}</span>
                  </div>
                  {(pricing.today.surcharge_amount || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, minWidth: 0 }}>Alta demanda</span>
                      <span style={{ color: 'var(--maqgo-orange)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.today.surcharge_amount || 0)}</span>
                    </div>
                  )}
                  {pricing.additional_days?.days > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? `${pricing.additional_days.days} viaje${pricing.additional_days.days > 1 ? 's' : ''} (1 por día) adicional${pricing.additional_days.days > 1 ? 'es' : ''}` : `${pricing.additional_days.days} día${pricing.additional_days.days > 1 ? 's' : ''} adicional${pricing.additional_days.days > 1 ? 'es' : ''} (8h/día)`}</span>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.additional_days.total_cost || 0)}</span>
                    </div>
                  )}
                </>
              )}

              {/* CASO 3: Programado */}
              {reservationType === 'scheduled' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>{isPerTrip ? (totalDays > 1 ? `${totalDays} viajes (1 por día)` : 'Valor viaje') : (totalDays > 1 ? `${totalDays} días (8h/día)` : 'Jornada (8h)')}</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.breakdown?.service_cost ?? pricing.service_amount ?? 0)}</span>
                </div>
              )}

              {/* Fallback: si no entró en ningún caso (ej. datos incompletos), mostrar al menos una línea */}
              {!reservationType && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Servicio</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.service_amount ?? pricing.breakdown?.service_cost ?? subtotalNeto)}</span>
                </div>
              )}
              {reservationType === 'immediate' && isHybrid && !pricing?.today && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Servicio</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.service_amount ?? pricing.breakdown?.service_cost ?? subtotalNeto)}</span>
                </div>
              )}

              {/* Traslado: solo si la maquinaria lleva traslado (no camión tolva/pluma/aljibe) */}
              {!isPerTrip && (pricing.transport_cost || pricing.breakdown?.transport_cost || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13, minWidth: 0 }}>Traslado</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(pricing.transport_cost || pricing.breakdown?.transport_cost || 0)}</span>
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
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, minWidth: 0 }}>Subtotal operador (sin IVA)</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(subtotalNeto)}</span>
              </div>

              {/* Tarifa por Servicio */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, minWidth: 0 }}>Tarifa por Servicio</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(maqgoFeeNeto)}</span>
              </div>

              {/* IVA: sin factura = 19% solo sobre Tarifa; con factura = 19% sobre (Subtotal + Tarifa) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, minWidth: 0 }}>{needsInvoice ? 'IVA 19% (Subtotal + Tarifa por Servicio)' : 'IVA 19% sobre Tarifa por Servicio'}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(needsInvoice ? ivaTotal : maqgoFeeIva)}</span>
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
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 600, minWidth: 0 }}>Total a pagar</span>
                <span style={{ color: 'var(--maqgo-orange)', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatPrice(totalFinal)}</span>
              </div>
            </div>
          )}
        </div>
        )}
        
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Resumen de la reserva (no seleccionas nada aquí, solo confirmas) */}
        <div style={{
          background: '#363636',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="20" viewBox="0 0 40 32" fill="none">
                <rect x="4" y="16" width="24" height="10" rx="2" fill="var(--maqgo-orange)"/>
                <rect x="20" y="10" width="10" height="8" rx="1" fill="var(--maqgo-orange)"/>
                <circle cx="10" cy="28" r="3" fill="#fff"/>
                <circle cx="22" cy="28" r="3" fill="#fff"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
                {MACHINERY_NAMES[machinery] || machinery}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {getServiceDescription()}
              </div>
              {/* Especificación clave (capacidad/ton/HP) elegida para esta maquinaria, si aplica */}
              {(() => {
                const spec = getProviderSpecDisplay(machinery, provider || {});
                if (!spec) return null;
                return (
                  <div style={{ color: 'rgba(144,189,211,0.9)', fontSize: 12, marginTop: 3 }}>
                    <span style={{ opacity: 0.9 }}>{spec.label}: </span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{spec.valueFormatted}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 6,
            paddingTop: 10,
            borderTop: '1px solid #444'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="1.5"/>
              <path d="M12 6V12L16 14" stroke="#90BDD3" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ color: '#90BDD3', fontSize: 12 }}>
              {reservationType === 'immediate' 
                ? 'Inicio hoy · Servicio prioritario'
                : totalDays > 1 
                  ? `${dateRangeWithYear}`
                  : `Fecha de inicio: ${dateRangeWithYear || formatDate(selectedDate)}`
              }
            </span>
          </div>
        </div>

        {/* Ubicación */}
        <div style={{
          background: '#363636',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 1C6.69 1 4 3.69 4 7C4 11.5 10 19 10 19S16 11.5 16 7C16 3.69 13.31 1 10 1Z" stroke="var(--maqgo-orange)" strokeWidth="1.5" fill="none"/>
            <circle cx="10" cy="7" r="2" fill="var(--maqgo-orange)"/>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 13 }}>{location || 'Sin ubicación'}</div>
          </div>
          <button
            onClick={() => navigate('/client/service-location')}
            style={{ background: 'none', border: 'none', color: 'var(--maqgo-orange)', fontSize: 11, cursor: 'pointer' }}
          >
            Cambiar ubicación
          </button>
        </div>

        {/* Info */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 1L3 5V9C3 13.5 6 17.3 10 19C14 17.3 17 13.5 17 9V5L10 1Z" stroke="var(--maqgo-orange)" strokeWidth="1.5" fill="none"/>
              <path d="M7 10L9 12L13 8" stroke="var(--maqgo-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ color: 'var(--maqgo-orange)', fontSize: 12, fontWeight: 600 }}>
              Precio garantizado
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="1.5"/>
              <path d="M12 6V12L16 14" stroke="#90BDD3" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ color: '#90BDD3', fontSize: 12 }}>
              Sin cobro hasta que acepten tu solicitud
            </span>
          </div>
        </div>

        {/* Medio de pago - Transbank */}
        <div style={{
          background: '#363636',
          borderRadius: 12,
          padding: 16,
          marginBottom: 100
        }}>
          <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Medio de pago
          </p>
          
          {/* Tarjeta guardada o agregar nueva */}
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              width: '100%',
              background: '#2A2A2A',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              border: 'none',
              textAlign: 'left',
              fontFamily: 'inherit'
            }}
            data-testid="payment-method"
            aria-label="Pagar con Webpay OneClick"
          >
            <div style={{
              width: 40,
              height: 28,
              background: 'linear-gradient(135deg, #1a1a6c 0%, #b21f1f 50%, #fdbb2d 100%)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="20" height="14" viewBox="0 0 24 18" fill="none">
                <rect x="1" y="1" width="22" height="16" rx="2" stroke="#fff" strokeWidth="1.5"/>
                <path d="M1 6H23" stroke="#fff" strokeWidth="1.5"/>
                <rect x="4" y="10" width="6" height="2" rx="1" fill="#fff"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontSize: 13, margin: 0 }}>
                Webpay OneClick
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '2px 0 0' }}>
                Débito o crédito · Transbank
              </p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 6L15 12L9 18" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          
          {/* Mensaje de seguridad Transbank */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginTop: 12,
            padding: '10px 12px',
            background: 'rgba(144, 189, 211, 0.1)',
            borderRadius: 8
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="#90BDD3" strokeWidth="1.5"/>
              <path d="M7 11V7C7 4.24 9.24 2 12 2C14.76 2 17 4.24 17 7V11" stroke="#90BDD3" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={{ color: '#90BDD3', fontSize: 11, margin: 0, lineHeight: 1.4 }}>
              Tu tarjeta queda segura con Transbank. Nosotros no vemos tus datos.
            </p>
          </div>
        </div>
      </div>

      {/* Botón fijo - FUERA del scroll para que siempre sea visible */}
      <div className="maqgo-fixed-bottom-bar">
        <MaqgoButton
          onClick={handleConfirm}
          disabled={loadingPrice}
          loading={loadingPrice || isConfirming}
          style={{ fontSize: 15, fontWeight: 600, borderRadius: 30, width: '100%' }}
          data-testid="confirm-btn"
          aria-label={loadingPrice ? 'Calculando precio' : 'Enviar solicitud de reserva'}
        >
          Enviar solicitud (sin cobro aún)
        </MaqgoButton>
      </div>
    </div>
  );
}

export default ConfirmServiceScreen;
