import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import axios from 'axios';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { getArray } from '../../utils/safeStorage';
import { calculateClientPrice, totalConFactura } from '../../utils/pricing';
import { NoProvidersError, NoProvidersTryTomorrow } from '../../components/ErrorStates';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { ProviderOptionsSkeleton } from '../../components/ListSkeleton';

import BACKEND_URL from '../../utils/api';

/**
 * STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
 *
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 */
// MACHINERY_NO_TRANSPORT y REFERENCE_PRICES desde pricing.js; por-viaje: isPerTripMachineryType (machineryNames)
import { MACHINERY_NO_TRANSPORT, REFERENCE_PRICES, getDemoProviders } from '../../utils/pricing';
import { getPerTripDateLabel } from '../../utils/bookingDates';
import { MACHINERY_NAMES, getProviderSpecDisplay, getMachineryCapacityOptions, isPerTripMachineryType } from '../../utils/machineryNames';
import {
  isTruckUrgencyBooking,
  getTruckPricingHoursFromUrgency,
  getTruckUrgencySummaryLine,
} from '../../utils/clientBookingTruck';

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

const PROVIDER_FIELD_TO_KEYS = {
  capacityM3: ['capacity_m3', 'capacityM3'],
  capacityLiters: ['capacity_liters', 'capacityLiters'],
  capacityTonM: ['capacity_ton_m', 'capacityTonM'],
  bucketM3: ['bucket_m3', 'bucketM3'],
  weightTon: ['weight_ton', 'weightTon'],
  powerHp: ['power_hp', 'powerHp'],
  bladeWidthM: ['blade_width_m', 'bladeWidthM'],
  craneTon: ['crane_ton', 'craneTon'],
  rollerTon: ['roller_ton', 'rollerTon'],
};

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
  const [tomorrowAvailable, setTomorrowAvailable] = useState(false);
  const [tomorrowCount, setTomorrowCount] = useState(0);
  const [isDemoProviders, setIsDemoProviders] = useState(false);
  const normalizeMachinery = (m) => String(m || '').trim().toLowerCase().replace(/\s+/g, '_');
  const [selectedMachinery, setSelectedMachinery] = useState(() =>
    normalizeMachinery(localStorage.getItem('selectedMachinery') || 'retroexcavadora')
  );
  const machinerySpec = typeof window !== 'undefined'
    ? (localStorage.getItem('selectedMachinerySpec') || '')
    : '';
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

  useEffect(() => {
    setSelectedMachinery(normalizeMachinery(localStorage.getItem('selectedMachinery') || 'retroexcavadora'));
  }, [pathname]);

  const filteredProviders = useMemo(() => {
    if (!providers || providers.length === 0) return [];

    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    let baseFiltered = providers;
    let requiredList = [];

    if (capOpts && capOpts.providerField) {
      const storageKey = capOpts.clientStorageKey;
      requiredList = getArray(storageKey, []);
      if (Array.isArray(requiredList) && requiredList.length > 0) {
        const keys = PROVIDER_FIELD_TO_KEYS[capOpts.providerField];
        if (keys) {
          baseFiltered = providers.filter((p) => {
            let value = null;
            for (const k of keys) {
              if (p[k] != null && p[k] !== '') {
                value = Number(p[k]);
                break;
              }
            }
            if (value == null || Number.isNaN(value)) return false;
            return requiredList.some((req) => Number(req) === value);
          });
        }
      }
    }

    // Spec única legacy: solo si no hay lista multi en localStorage (evita conflicto con "5 ton · 8 ton").
    if (machinerySpec && requiredList.length === 0) {
      const specMatched = baseFiltered.filter((p) => {
        const spec = getProviderSpecDisplay(selectedMachinery, p);
        return spec && spec.valueFormatted === machinerySpec;
      });
      return specMatched.length > 0 ? specMatched : baseFiltered;
    }

    return baseFiltered;
  }, [providers, selectedMachinery, machinerySpec]);

  const sanitizeProviders = useCallback((items) => {
    if (!Array.isArray(items)) return [];
    return items
      .filter((p) => p && typeof p === 'object')
      .map((p, idx) => ({
        ...p,
        id: p.id || p._id || `provider-${idx + 1}`,
        eta_minutes: Number.isFinite(Number(p.eta_minutes)) ? Number(p.eta_minutes) : 40,
        distance: Number.isFinite(Number(p.distance)) ? Number(p.distance) : 0,
        rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : 4.5,
        transport_fee: Number.isFinite(Number(p.transport_fee)) ? Number(p.transport_fee) : 0,
        price_per_hour: Number.isFinite(Number(p.price_per_hour)) ? Number(p.price_per_hour) : 0,
      }));
  }, []);

  const needsTransport = useCallback(() => !MACHINERY_NO_TRANSPORT.includes(selectedMachinery), [selectedMachinery]);

  const calculateTotalPrice = useCallback((provider, machineryType) => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    const urgencyType = localStorage.getItem('urgencyType') || '';
    const savedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
    const savedDays = getArray('selectedDates', []);
    const days = Math.max(1, savedDays.length);
    let hrs = type === 'scheduled' ? 8 : Math.max(4, Math.min(8, savedHours));
    if (type === 'immediate' && isTruckUrgencyBooking(machineryType)) {
      hrs = Math.max(4, Math.min(8, getTruckPricingHoursFromUrgency(urgencyType)));
    }
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
      if (import.meta.env.DEV) {
        console.error('getDemoProvidersFallback failed:', e);
      }
      const base = getDemoProviders(selectedMachinery, 5, { extended: true });
      if (Array.isArray(base) && base.length) return base;
      return getDemoProviders('retroexcavadora', 5, { extended: true });
    }
  }, [selectedMachinery]);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
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

      setTomorrowAvailable(response.data?.tomorrow_available ?? false);
      setTomorrowCount(response.data?.tomorrow_count ?? 0);

      // Agregar cálculo de horas máximas y precio total a cada proveedor
      let rawProviders = sanitizeProviders(response.data?.providers || []);
      let demoFlag = Boolean(response.data?.is_demo);
      if (rawProviders.length === 0) {
        rawProviders = sanitizeProviders(getDemoProvidersFallback());
        demoFlag = true;
      }
      setIsDemoProviders(demoFlag);
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
      const fallbackProviders = sanitizeProviders(getDemoProvidersFallback());
      const safeFallback = Array.isArray(fallbackProviders) && fallbackProviders.length
        ? fallbackProviders
        : sanitizeProviders(getDemoProviders('retroexcavadora', 5, { extended: true }));

      setProviders(safeFallback.map(p => ({
        ...p,
        total_price: totalConFactura(calculateTotalPrice(p, selectedMachinery)),
        has_transport: needsTransport(),
        max_hours: calculateMaxHours(p.closing_time || '20:00', p.eta_minutes || 40)
      })));
    } finally {
      setLoading(false);
    }
  }, [selectedMachinery, needsTransport, calculateTotalPrice, getDemoProvidersFallback, sanitizeProviders]);

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
    const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const urgencyType = localStorage.getItem('urgencyType') || '';
    let nextHours = type === 'scheduled' ? 8 : parseInt(localStorage.getItem('selectedHours') || '4', 10);
    if (type === 'immediate' && isTruckUrgencyBooking(machinery)) {
      nextHours = Math.max(4, Math.min(8, getTruckPricingHoursFromUrgency(urgencyType)));
    }
    setReservationType(type);
    setHours(nextHours);
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

  useEffect(() => {
    if (providers.length === 0) return;

    const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const savedFor = localStorage.getItem('providerSelectionMachinery') || '';
    const pool = filteredProviders;
    let next = selectedProviderIds.filter((id) => pool.some((p) => idMatch(p.id, id)));

    if (savedFor !== machinery) next = [];

    if (next.length === 0 && pool.length > 0) next = [pool[0].id];

    const sameLen = next.length === selectedProviderIds.length;
    const sameIds = sameLen && next.every((id, i) => idMatch(id, selectedProviderIds[i]));
    if (!sameIds || savedFor !== machinery) {
      setSelectedProviderIds(next);
      localStorage.setItem('selectedProviderIds', JSON.stringify(next));
      localStorage.setItem('providerSelectionMachinery', machinery);
    }
  }, [providers, filteredProviders, isDemoProviders, selectedProviderIds]);

  const validSelectedIds = useMemo(
    () => selectedProviderIds.filter((id) => filteredProviders.some((p) => idMatch(p.id, id))),
    [selectedProviderIds, filteredProviders]
  );

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

  const machineryLabel = MACHINERY_NAMES[selectedMachinery] || selectedMachinery;
  const bookingSummary = (() => {
    const parts = [];
    if (machineryLabel) parts.push(machineryLabel);
    if (machinerySpec) parts.push(machinerySpec);
    if (reservationType === 'immediate') {
      parts.push('Inicio hoy');
      if (isTruckUrgencyBooking(selectedMachinery)) {
        const line = getTruckUrgencySummaryLine(localStorage.getItem('urgencyType') || '');
        if (line) parts.push(line);
      } else if (hours) {
        parts.push(`${hours} horas`);
      }
    } else {
      if (perTripScheduledLabel) parts.push(perTripScheduledLabel);
      else parts.push('Programado');
    }
    return parts.join(' • ');
  })();

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
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll" style={{ paddingBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => navigate(backRoute || '/client/home')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              aria-label="Volver"
            >
              <BackArrowIcon style={{ color: '#fff' }} />
            </button>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <MaqgoLogo size="small" />
            </div>
            <div style={{ width: 24 }} />
          </div>
          <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
            Buscando proveedores para tu solicitud…
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 6 }}>
            Esto puede tardar unos momentos.
          </p>
          {/* Loader + resumen compacto de la solicitud */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.25)',
                borderTopColor: '#EC6819',
                animation: 'maqgo-spin 0.9s linear infinite'
              }}
              aria-label="Cargando proveedores"
            />
            <p
              style={{
                color: 'rgba(255,255,255,0.78)',
                fontSize: 12,
                textAlign: 'center',
                margin: 0,
                padding: '0 24px',
                lineHeight: 1.4
              }}
            >
              {bookingSummary}
            </p>
          </div>
          <style>
            {`
              @keyframes maqgo-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>
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
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll">
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
        <div className="maqgo-app maqgo-client-funnel">
          <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px', justifyContent: 'center' }}>
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
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll">
          <NoProvidersError onModify={() => navigate('/client/home')} />
        </div>
      </div>
    );
  }

  if (!loading && providers.length > 0 && filteredProviders.length === 0) {
    return (
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px', justifyContent: 'center' }}>
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 20,
              marginBottom: 16
            }}
          >
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 8px', textAlign: 'center' }}>
              Ningún proveedor coincide con tu selección
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.45 }}>
              No hay equipos que calzen con la capacidad o los requisitos elegidos (por ejemplo m³ en tolva o la especificación en la tarjeta). Prueba otra capacidad o vuelve más tarde.
            </p>
            <button
              type="button"
              onClick={() => navigate('/client/machinery')}
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
              Cambiar maquinaria o capacidad
            </button>
            <button
              type="button"
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
    <div className="maqgo-app maqgo-client-funnel maqgo-p4-provider-layout">
      <div className="maqgo-screen maqgo-screen--scroll maqgo-p4-provider-scroll">
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20,
          gap: 12,
          flexShrink: 0,
        }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {isDemoProviders && (
          <div className="demo-banner" role="status" aria-live="polite">
            Estamos mostrando opciones referenciales por un problema de conexión.
          </div>
        )}

        <BookingProgress />

        {/* Título */}
        <h1 style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 6
        }}>
          Elige tus proveedores
        </h1>

        {/* Resumen compacto del servicio (tipo, capacidad, modalidad, horas) */}
        <p
          style={{
            color: 'rgba(255,255,255,0.92)',
            fontSize: 13,
            textAlign: 'center',
            margin: '0 0 10px',
            lineHeight: 1.4,
            padding: '0 8px',
            fontWeight: 500
          }}
        >
          {bookingSummary}
        </p>
        
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, textAlign: 'center', marginBottom: 10, lineHeight: 1.45, padding: '0 12px' }}>
          Compara precio total y tiempo estimado; luego selecciona el proveedor que prefieras.
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
            No se cobra hasta que un operador acepte.
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

        {/* Lista: sin scroll interno — el scroll es el de .maqgo-screen--scroll (evita CTA fuera de vista / doble scroll). */}
        <div style={{ paddingBottom: 8 }}>
          {filteredProviders.map((provider, index) => {
            const isSelected = selectedProviderIds.some((id) => idMatch(id, provider.id));
            const spec = getProviderSpecDisplay(selectedMachinery, provider);
            /** Regla de negocio: no mostrar nombre comercial / empresa del proveedor antes de asignación. */
            const optionLabel = `Opción ${index + 1}`;
            return (
            <div 
              key={provider.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleProvider(provider.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProvider(provider.id); } }}
              aria-label={`${optionLabel}, ${formatPrice(provider.total_price)}, ${provider.eta_minutes || '?'} min, ${provider.distance || '?'} km${isSelected ? ', seleccionado' : ''}`}
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
                      alt={`${MACHINERY_NAMES[selectedMachinery] || 'Maquinaria'} - ${optionLabel}`}
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
                      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                        {optionLabel}
                      </div>
                      <span style={{ color: '#EC6819', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                        {formatPrice(provider.total_price)}
                      </span>
                      {/* Subtítulo: qué incluye el precio (transparencia) */}
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, lineHeight: 1.3 }}>
                        {isPerTripMachineryType(selectedMachinery) ? (
                          <span>Precio total por viaje, con Tarifa por Servicio incluida.</span>
                        ) : (
                          <span>
                            {provider.has_transport && provider.transport_fee > 0
                              ? 'Precio total del servicio, con traslado y Tarifa por Servicio incluidos.'
                              : 'Precio total del servicio, con Tarifa por Servicio incluida.'}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Calificación */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z" fill="#EC6819"/>
                      </svg>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Calificación</span>
                      <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: 600 }}>
                        {(Number(provider.rating) || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalle opcional: evita ruido visual en decisión rápida */}
              {spec && (
                <div>
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    borderLeft: '3px solid #EC6819',
                    marginTop: 8
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, display: 'block', marginBottom: 2 }}>
                      {spec.label}
                    </span>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {spec.valueFormatted}
                    </span>
                  </div>
                </div>
              )}

              {/* CTA explícita para selección */}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProvider(provider.id);
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: isSelected ? '#EC6819' : 'transparent',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isSelected ? 'Proveedor seleccionado' : 'Seleccionar proveedor'}
                </button>
              </div>

              {/* Una fila: disponibilidad (ETA + distancia); el título ya dice Opción N */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end',
                alignItems: 'center',
                borderTop: '1px solid #444',
                paddingTop: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <path d="M6 3V6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Disponible aprox. en {provider.eta_minutes} min
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>·</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{provider.distance} km</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Info de jornada (scroll; el CTA va en barra fija inferior) */}
        {!isPerTripMachineryType(selectedMachinery) && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 10,
            padding: 12,
            marginTop: 10,
            flexShrink: 0,
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

      {/* CTA al pie de columna (flujo flex, sin position:fixed — evita bloquear scroll táctil/WebKit) */}
      <div
        className="maqgo-p4-provider-footer"
        role="region"
        aria-label="Continuar con proveedores seleccionados"
      >
        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleContinueWithSelected}
          disabled={validSelectedIds.length === 0}
          style={{
            width: '100%',
            opacity: validSelectedIds.length > 0 ? 1 : 0.5,
            cursor: validSelectedIds.length > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          {validSelectedIds.length === 0
            ? 'Selecciona al menos 1 proveedor'
            : `Enviar solicitud a ${validSelectedIds.length} proveedor${validSelectedIds.length > 1 ? 'es' : ''}`}
        </button>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', margin: '8px 0 0' }}>
          Solo se cobrará si un proveedor acepta tu solicitud.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', margin: '4px 0 0' }}>
          Te llevamos al resumen final antes de enviarla.
        </p>
      </div>
    </div>
  );
}

export default ProviderOptionsScreen;
