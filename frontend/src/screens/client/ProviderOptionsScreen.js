import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import axios from 'axios';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { getArray } from '../../utils/safeStorage';
import { calculateClientPrice, totalConFactura } from '../../utils/pricing';
import { NoProvidersError, NoProvidersTryTomorrow, LegalChargeNotice } from '../../components/ErrorStates';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { ProviderOptionsSkeleton } from '../../components/ListSkeleton';

import BACKEND_URL from '../../utils/api';

// MACHINERY_NO_TRANSPORT y REFERENCE_PRICES desde pricing.js; por-viaje: isPerTripMachineryType (machineryNames)
import { MACHINERY_NO_TRANSPORT, REFERENCE_PRICES, getDemoProviders } from '../../utils/pricing';
import { getPerTripDateLabel } from '../../utils/bookingDates';
import { MACHINERY_NAMES, getProviderSpecDisplay, getMachineryCapacityOptions, isPerTripMachineryType } from '../../utils/machineryNames';

/** Horas máximas: cierre − llegada − almuerzo + elasticidad (puro, sin estado). */
function calculateMaxHours(closingTime, etaMinutes) {
  const now = new Date();
  const [closeHour, closeMin] = closingTime.split(':').map(Number);
  const arrivalTime = new Date(now.getTime() + etaMinutes * 60000);
  const arrivalHour = arrivalTime.getHours() + arrivalTime.getMinutes() / 60;
  const closeHourWithElasticity = closeHour + closeMin / 60 + 0.5;
  const availableHours = closeHourWithElasticity - arrivalHour - 1;
  return Math.max(1, Math.floor(availableHours));
}

const PROVIDER_OPTIONS_TRIP_SPREAD = [0.85, 0.92, 1, 1.08, 1.15];

/**
 * Muestra las 5 mejores opciones de proveedores
 * Ordenados por score (precio 60% + distancia 40%)
 * 
 * UX: Muestra "Total del servicio" no "precio/hora"
 */
function ProviderOptionsScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [filteredProviders, setFilteredProviders] = useState([]);
  const [tomorrowAvailable, setTomorrowAvailable] = useState(false);
  const [tomorrowCount, setTomorrowCount] = useState(0);
  const [isDemoProviders, setIsDemoProviders] = useState(false);
  const normalizeMachinery = (m) => String(m || '').trim().toLowerCase().replace(/\s+/g, '_');
  const [selectedMachinery] = useState(() => normalizeMachinery(localStorage.getItem('selectedMachinery') || 'retroexcavadora'));
  const [hours, setHours] = useState(() => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    const saved = localStorage.getItem('selectedHours');
    return type === 'scheduled' ? 8 : parseInt(saved || '4', 10);
  });
  const [reservationType, setReservationType] = useState(localStorage.getItem('reservationType') || 'immediate');
  const [selectedProviderIds, setSelectedProviderIds] = useState(() => {
    const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const savedFor = localStorage.getItem('providerSelectionMachinery') || '';
    if (savedFor !== machinery) return [];
    return getArray('selectedProviderIds', []);
  });

  const needsTransport = useCallback(() => !MACHINERY_NO_TRANSPORT.includes(selectedMachinery), [selectedMachinery]);

  const calculateTotalPrice = useCallback((provider, machineryType) => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    const savedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
    const savedDays = getArray('selectedDates', []);
    const days = Math.max(1, savedDays.length);
    const hrs = type === 'scheduled' ? 8 : Math.max(4, Math.min(8, savedHours));
    const transportFee = needsTransport() ? (provider.transport_fee || 0) : 0;
    return calculateClientPrice({
      machineryType,
      basePrice: provider.price_per_hour || 0,
      transportFee,
      hours: hrs,
      days,
      reservationType: type
    });
  }, [needsTransport]);

  const getDemoProvidersFallback = useCallback(() => {
    try {
      const capOpts = getMachineryCapacityOptions(selectedMachinery);
      const specValues = capOpts?.options ? [...capOpts.options].slice(0, 5) : null;
      const providerFieldToSnake = {
        capacityM3: 'capacity_m3',
        capacityLiters: 'capacity_liters',
        capacityTonM: 'capacity_ton_m',
        bucketM3: 'bucket_m3',
        weightTon: 'weight_ton',
        powerHp: 'power_hp',
        bladeWidthM: 'blade_width_m',
        craneTon: 'crane_ton',
        rollerTon: 'roller_ton'
      };
      const specKey = capOpts?.providerField ? providerFieldToSnake[capOpts.providerField] : null;
      const baseProviders = getDemoProviders(selectedMachinery, 5, { extended: true });
      const all = specKey && specValues
        ? baseProviders.map((p, i) => ({ ...p, [specKey]: specValues[i % specValues.length] }))
        : baseProviders;
      return all;
    } catch (e) {
      console.error('getDemoProvidersFallback failed:', e);
      const base = getDemoProviders(selectedMachinery, 5, { extended: true });
      if (Array.isArray(base) && base.length) return base;
      return getDemoProviders('retroexcavadora', 5, { extended: true });
    }
  }, [selectedMachinery]);

  const fetchProviders = useCallback(async () => {
    // Usar la ubicación exacta ingresada en ServiceLocationScreen.
    // Si no existe (ej. fallback sin Google Places), usar coordenadas demo.
    const savedLat = parseFloat(localStorage.getItem('serviceLat') || '');
    const savedLng = parseFloat(localStorage.getItem('serviceLng') || '');
    const clientLat = Number.isFinite(savedLat) ? savedLat : -33.4489;
    const clientLng = Number.isFinite(savedLng) ? savedLng : -70.6693;
    const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
    const FAST_FALLBACK_MS = 2500; // Si la API tarda más, mostrar opciones de inmediato

    const apiCall = axios.get(`${BACKEND_URL}/api/providers/match`, {
      params: { machinery_type: selectedMachinery, client_lat: clientLat, client_lng: clientLng, max_radius: 30, limit: 5, needs_invoice: needsInvoice },
      timeout: 5000
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), FAST_FALLBACK_MS)
    );

    try {
      const response = await Promise.race([apiCall, timeoutPromise]);
      
      // Guardar flags de la API para mensaje "reservar mañana"
      setIsDemoProviders(response.data?.is_demo ?? false);
      setTomorrowAvailable(response.data?.tomorrow_available ?? false);
      setTomorrowCount(response.data?.tomorrow_count ?? 0);

      // Agregar cálculo de horas máximas y precio total a cada proveedor
      let rawProviders = response.data?.providers || [];
      if (rawProviders.length === 0) {
        rawProviders = getDemoProvidersFallback();
      }
      // Maquinaria por viaje: si el backend envía precios por hora (ej. 42k), normalizar a precio por viaje de mercado
      const refTrip = isPerTripMachineryType(selectedMachinery) ? REFERENCE_PRICES[selectedMachinery] : null;
      const providersWithData = rawProviders.map((provider, idx) => {
        let price = provider.price_per_hour ?? 0;
        if (refTrip && price > 0 && price < 100000) {
          price = Math.round(refTrip * (PROVIDER_OPTIONS_TRIP_SPREAD[Math.min(idx, 4)] || 1));
        }
        const p = { ...provider, price_per_hour: price };
        return {
          ...p,
          max_hours: calculateMaxHours(p.closing_time || '20:00', p.eta_minutes || 40),
          // UX: mostrar el mismo total bruto que se usa en P5 (con factura / mismo bruto).
          total_price: totalConFactura(calculateTotalPrice(p, selectedMachinery)),
          has_transport: needsTransport(),
          primaryPhoto: p.machineData?.primaryPhoto || null
        };
      });
      
      setProviders(providersWithData);
    } catch {
      setIsDemoProviders(true);
      setTomorrowAvailable(false);
      const fallbackProviders = getDemoProvidersFallback();
      const safeFallback = Array.isArray(fallbackProviders) && fallbackProviders.length
        ? fallbackProviders
        : getDemoProviders('retroexcavadora', 5, { extended: true });

      setProviders(safeFallback.map(p => ({
        ...p,
        total_price: totalConFactura(calculateTotalPrice(p, selectedMachinery)),
        has_transport: needsTransport(),
        max_hours: calculateMaxHours(p.closing_time || '20:00', p.eta_minutes || 40)
      })));
    } finally {
      setLoading(false);
    }
  }, [selectedMachinery, needsTransport, calculateTotalPrice, getDemoProvidersFallback]);

  useEffect(() => {
    fetchProviders();
    saveBookingProgress('providers', { machinery: selectedMachinery });
  }, [fetchProviders, selectedMachinery]);

  // Preload pasos 5 y 6 para evitar flash al navegar
  useEffect(() => {
    import('./ConfirmServiceScreen');
    import('./BillingDataScreen');
    import('./CardPaymentScreen');
  }, []);

  // Sincronizar horas y tipo desde localStorage al montar/volver (evita mostrar 8h cuando se eligieron 4h)
  useEffect(() => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    const saved = localStorage.getItem('selectedHours');
    setReservationType(type);
    setHours(type === 'scheduled' ? 8 : parseInt(saved || '4', 10));
  }, [pathname]);

  const handleBack = () => {
    const type = localStorage.getItem('reservationType') || reservationType || 'immediate';
    if (type === 'scheduled') {
      // Para reservas programadas, volver al calendario multi-día para ajustar fechas (ej. quitar sábado)
      navigate('/client/calendar-multi');
    } else {
      navigate(backRoute || '/client/home');
    }
  };

  const idMatch = (a, b) => String(a) === String(b);

  // Mostrar todos los proveedores (factura se elige en Confirm)
  useEffect(() => {
    setFilteredProviders(providers);
  }, [providers]);

  useEffect(() => {
    if (providers.length === 0) return;

    const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const savedFor = localStorage.getItem('providerSelectionMachinery') || '';
    let next = selectedProviderIds.filter((id) => providers.some((p) => idMatch(p.id, id)));

    // Si cambió el tipo de maquinaria, ignorar selección anterior
    if (savedFor !== machinery) next = [];

    // Si no hay ninguna selección válida, preseleccionar el primero para que siempre se pueda continuar a P5
    if (next.length === 0 && providers.length > 0) next = [providers[0].id];

    if (next.length !== selectedProviderIds.length || savedFor !== machinery) {
      setSelectedProviderIds(next);
      localStorage.setItem('selectedProviderIds', JSON.stringify(next));
      localStorage.setItem('providerSelectionMachinery', machinery);
    }
  }, [providers, isDemoProviders, selectedProviderIds]);

  const validSelectedIds = selectedProviderIds.filter((id) => providers.some((p) => idMatch(p.id, id)));

  // Detectar si la reserva programada incluye sábado
  const selectedDatesRaw = getArray('selectedDates', []);
  const hasSaturday = selectedDatesRaw.some((d) => {
    try {
      const date = new Date(d);
      return Number.isFinite(date.getTime()) && date.getDay() === 6;
    } catch {
      return false;
    }
  });

  const perTripScheduledLabel = getPerTripDateLabel(selectedDatesRaw, localStorage.getItem('selectedDate') || '', { prefix: 'Valor viaje ·' });

  const handleReserveTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    localStorage.setItem('reservationType', 'scheduled');
    localStorage.setItem('selectedDate', dateStr);
    localStorage.setItem('selectedDates', JSON.stringify([dateStr]));
    navigate('/client/reservation-data');
  };

  const toggleProvider = (providerId) => {
    setSelectedProviderIds((prev) => {
      const has = prev.some((id) => idMatch(id, providerId));
      const next = has ? prev.filter((id) => !idMatch(id, providerId)) : [...prev, providerId];
      localStorage.setItem('selectedProviderIds', JSON.stringify(next));
      localStorage.setItem('providerSelectionMachinery', selectedMachinery);
      return next;
    });
  };

  const handleContinueWithSelected = () => {
    const firstId = validSelectedIds[0];
    const provider = providers.find((p) => idMatch(p.id, firstId));
    if (!provider) return;
    const calculatedPrice = provider?.total_price ?? totalConFactura(calculateTotalPrice(provider, selectedMachinery));
    const adjustedProvider = {
      ...provider,
      transport_fee: needsTransport() ? provider.transport_fee : 0
    };
    localStorage.setItem('selectedProvider', JSON.stringify(adjustedProvider));
    localStorage.setItem('matchedProviders', JSON.stringify(providers));
    localStorage.setItem('selectedProviderIds', JSON.stringify(validSelectedIds));
    localStorage.setItem('providerSelectionMachinery', selectedMachinery);
    localStorage.setItem('totalAmount', calculatedPrice.toString());
    navigate('/client/confirm');
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);
  };

  if (loading) {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ paddingBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => navigate(backRoute || '/client/home')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              aria-label="Volver"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <MaqgoLogo size="small" />
            </div>
            <div style={{ width: 24 }} />
          </div>
          <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 16 }}>
            Buscando proveedores para tu reserva
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
            Te mostramos hasta 5 opciones que mejor calzan con tu solicitud (según precio y cercanía).
          </p>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ProviderOptionsSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // Estado: No hay proveedores hoy pero sí mañana (reserva inmediata)
  if (!loading && reservationType === 'immediate' && isDemoProviders && tomorrowAvailable) {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <NoProvidersTryTomorrow
            tomorrowCount={tomorrowCount}
            onReserveTomorrow={handleReserveTomorrow}
            onModify={() => navigate('/client/home')}
          />
        </div>
      </div>
    );
  }

  // Estado: No hay proveedores disponibles
  if (!loading && providers.length === 0) {
    // Caso especial: reserva programada que incluye sábado
    if (reservationType === 'scheduled' && hasSaturday) {
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px', justifyContent: 'center' }}>
            <div
              style={{
                background: '#2A2A2A',
                borderRadius: 16,
                padding: 20,
                marginBottom: 16
              }}
            >
              <h2
                style={{
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 600,
                  margin: '0 0 8px',
                  textAlign: 'center'
                }}
              >
                Pocos proveedores para estas fechas
              </h2>
              <p
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 13,
                  textAlign: 'center',
                  margin: '0 0 14px'
                }}
              >
                Para reservas que incluyen sábado hay menos operadores disponibles. Si puedes, prueba
                quitando el sábado para ver más opciones.
              </p>
              <button
                onClick={() => navigate('/client/calendar-multi')}
                style={{
                  width: '100%',
                  padding: 14,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 24,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 10
                }}
              >
                Ajustar fechas
              </button>
              <button
                onClick={() => navigate('/client/home')}
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 24,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <NoProvidersError onModify={() => navigate('/client/home')} />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 30 }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20,
          gap: 12
        }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        <BookingProgress />

        {/* Título */}
        <h1 style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 8
        }}>
          Elige tus proveedores
        </h1>

        {/* Una sola línea: modalidad + badge (HOY · Prioritario o Programado) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 10
        }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500 }}>
            {isPerTripMachineryType(selectedMachinery)
              ? (reservationType === 'scheduled' ? perTripScheduledLabel : 'Valor viaje · Inicio HOY')
              : reservationType === 'scheduled'
                ? 'Reserva programada'
                : `Servicio prioritario · ${hours} horas`}
          </span>
          <span style={{
            background: reservationType === 'immediate' ? 'rgba(236, 104, 25, 0.35)' : 'rgba(255, 255, 255, 0.15)',
            borderRadius: 10,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: reservationType === 'immediate' ? '#FF8A50' : 'rgba(255,255,255,0.95)'
          }}>
            {reservationType === 'immediate' ? 'HOY · Prioritario' : 'Programado'}
          </span>
        </div>
        
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
          Elige uno o más proveedores para enviar tu solicitud.
        </p>

        {/* Aviso: pocos proveedores por sábado */}
        {reservationType === 'scheduled' && hasSaturday && providers.length > 0 && providers.length < 3 && (
          <div style={{ background: 'rgba(144, 189, 211, 0.18)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <p style={{ color: '#90BDD3', fontSize: 12, margin: 0, textAlign: 'center' }}>
              Hay pocos proveedores para un rango que incluye sábado. Si necesitas más opciones, ajusta fechas y quita el sábado.
            </p>
          </div>
        )}

        {/* Un solo aviso: cobro y dónde ver precio */}
        <div style={{ background: 'rgba(236, 104, 25, 0.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <p style={{ color: '#fff', fontSize: 12, margin: 0, textAlign: 'center', lineHeight: 1.45 }}>
            No se cobra hasta que un operador acepte. El detalle del precio lo ves en “Confirma tu reserva”.
          </p>
        </div>

        {/* Camión tolva: recordatorio de m³ que busca el cliente (puede ser uno o varios) */}
        {selectedMachinery === 'camion_tolva' && (() => {
          const arr = getArray('clientRequiredM3List', []);
          let label = null;
          if (Array.isArray(arr) && arr.length) {
            label = arr.length === 1 ? `${arr[0]} m³` : `${arr.join(', ')} m³`;
          }
          if (!label) {
            const single = localStorage.getItem('clientRequiredM3');
            if (single) label = `${single} m³`;
          }
          return label ? (
            <div style={{
              background: 'rgba(144, 189, 211, 0.15)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 12,
              textAlign: 'center'
            }}>
              <span style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                Buscas {MACHINERY_NAMES[selectedMachinery] || selectedMachinery}: {label}
              </span>
            </div>
          ) : null;
        })()}

        {/* Lista de proveedores - scrolleable (sin badge por tarjeta; la modalidad va en la cabecera) */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
          {filteredProviders.map((provider, index) => {
            const isSelected = selectedProviderIds.some((id) => idMatch(id, provider.id));
            return (
            <div 
              key={provider.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleProvider(provider.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProvider(provider.id); } }}
              aria-label={`Proveedor ${index + 1}, ${formatPrice(provider.total_price)}, ${provider.eta_minutes || '?'} min, ${provider.distance || '?'} km${isSelected ? ', seleccionado' : ''}`}
              style={{
                background: isSelected ? 'rgba(236, 104, 25, 0.15)' : '#363636',
                border: isSelected ? '2px solid #EC6819' : '2px solid transparent',
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              {/* Fila superior: imagen + info principal */}
              <div style={{ display: 'flex', gap: 12 }}>
                {/* Imagen maquinaria */}
                <div
                  style={{
                    width: 75,
                    height: 55,
                    borderRadius: 8,
                    background: '#444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden'
                  }}
                >
                  {provider.primaryPhoto ? (
                    <img
                      src={provider.primaryPhoto}
                      alt={`${MACHINERY_NAMES[selectedMachinery] || 'Maquinaria'} - Opción ${index + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
                      <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
                      <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
                      <circle cx="10" cy="28" r="3" fill="#fff"/>
                      <circle cx="22" cy="28" r="3" fill="#fff"/>
                      <path d="M28 8L36 4" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                
                {/* Info principal - PRECIO TOTAL + DESGLOSE */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ color: '#EC6819', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                        {formatPrice(provider.total_price)}
                      </span>
                      {/* Subtítulo: qué incluye el precio (transparencia) */}
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>
                        {isPerTripMachineryType(selectedMachinery) ? (
                          <span>Incluye Tarifa por Servicio.</span>
                        ) : (
                          <span>
                            {provider.has_transport && provider.transport_fee > 0
                              ? 'Incluye traslado y Tarifa por Servicio.'
                              : 'Incluye Tarifa por Servicio.'}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Calificación */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z" fill="#EC6819"/>
                      </svg>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Calificación</span>
                      <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: 600 }}>
                        {(Number(provider.rating) || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Especificación de la máquina (ej. Capacidad de estanque: 10.000 L) - visible en cada opción */}
              {(() => {
                const spec = getProviderSpecDisplay(selectedMachinery, provider);
                if (!spec) return null;
                return (
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    borderLeft: '3px solid #EC6819'
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, display: 'block', marginBottom: 2 }}>
                      {spec.label}
                    </span>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {spec.valueFormatted}
                    </span>
                  </div>
                );
              })()}

              {/* Una fila: Opción N · Seleccionado | ETA · Distancia */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid #444',
                paddingTop: 10
              }}>
                <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                  Opción {index + 1}{isSelected ? ' · Seleccionado' : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <path d="M6 3V6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {provider.eta_minutes} min
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>·</span>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>{provider.distance} km</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {validSelectedIds.length > 0 && (
          <div style={{ paddingTop: 12, paddingBottom: 24 }}>
            <button
              className="maqgo-btn-primary"
              onClick={handleContinueWithSelected}
              style={{ width: '100%' }}
            >
              Siguiente
            </button>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', margin: '8px 0 0' }}>
              En el siguiente paso revisas todo antes de enviar.
            </p>
          </div>
        )}

        {/* Info de jornada - Simplificado */}
        {!isPerTripMachineryType(selectedMachinery) && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 10,
            padding: 12,
            marginTop: 10
          }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0, textAlign: 'center' }}>
              {reservationType === 'scheduled'
                ? 'Jornada fija: 8 horas + 1 hora de colación.'
                : 'En jornadas de 6 horas o más se considera 1 hora de colación.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProviderOptionsScreen;
