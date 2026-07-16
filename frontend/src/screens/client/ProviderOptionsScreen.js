import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import axios from 'axios';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { getArray } from '../../utils/safeStorage';
import { calculateClientPrice, totalConFactura } from '../../utils/pricing';
import { NoProvidersTryTomorrow } from '../../components/ErrorStates';
import MaqgoLogo from '../../components/MaqgoLogo';
import BookingProgress from '../../components/BookingProgress';
import { ProviderOptionsSkeleton } from '../../components/ListSkeleton';
import MaqgoTitleCard from '../../components/MaqgoTitleCard';

import { needsTransport as checkNeedsTransport } from '../../utils/providerMachines';
import BACKEND_URL from '../../utils/api';

/**
 * STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
 *
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 */
// MACHINERY_NO_TRANSPORT y REFERENCE_PRICES desde pricing.js; por-viaje: isPerTripMachineryType (machineryNames)
import { MACHINERY_NO_TRANSPORT, REFERENCE_PRICES, getDemoProviders } from '../../utils/pricing';
import { MACHINERY_NAMES, getProviderSpecDisplay, getMachineryCapacityOptions, isPerTripMachineryType } from '../../utils/machineryNames';
import { ensurePushSubscribedIfGranted, requestPushPermissionAndSubscribe } from '../../utils/pushNotifications';
import {
  isTruckUrgencyBooking,
  getTruckPricingHoursFromUrgency,
} from '../../utils/clientBookingTruck';
import { getMachineTransportQuote } from '../../utils/transportZones';

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
function ProviderOptionsScreen({ previewPublic = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const backRoute = getBookingBackRoute(pathname);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [tomorrowAvailable, setTomorrowAvailable] = useState(false);
  const [tomorrowCount, setTomorrowCount] = useState(0);
  const [isDemoProviders, setIsDemoProviders] = useState(false);
  const [emptyState, setEmptyState] = useState(false);
  const [emptyKind, setEmptyKind] = useState('');
  const [availabilityToast, setAvailabilityToast] = useState(null);
  const prevAvailableCountRef = useRef(0);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const normalizeMachinery = (m) => String(m || '').trim().toLowerCase().replace(/\s+/g, '_');
  const [selectedMachinery, setSelectedMachinery] = useState(() =>
    normalizeMachinery(localStorage.getItem('selectedMachinery') || 'retroexcavadora')
  );
  const machinerySpec = typeof window !== 'undefined'
    ? (localStorage.getItem('selectedMachinerySpec') || '')
    : '';
  const [reservationType, setReservationType] = useState(localStorage.getItem('reservationType') || 'immediate');

  const previewCase = previewPublic ? String(searchParams.get('case') || '').trim() : '';

  const formatDistanceKmLabel = (km) => {
    const n = Number(km);
    if (!Number.isFinite(n) || n <= 0) return 'Distancia estimada';
    if (n < 1) return `${n.toFixed(1).replace('.', ',')} km`;
    return `${Math.round(n)} km`;
  };
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
    const serviceComuna = String(localStorage.getItem('serviceComuna') || '').trim();
    const serviceLat = parseFloat(localStorage.getItem('serviceLat') || '');
    const serviceLng = parseFloat(localStorage.getItem('serviceLng') || '');
    const hasTransport = checkNeedsTransport(selectedMachinery);
    return items
      .filter((p) => p && typeof p === 'object')
      .map((p, idx) => {
        const transportQuote = getMachineTransportQuote({
          machineData: p.machineData || p,
          serviceComuna,
          serviceLat: Number.isFinite(serviceLat) ? serviceLat : null,
          serviceLng: Number.isFinite(serviceLng) ? serviceLng : null,
        });
        return {
          ...p,
          id: p.id || p._id || `provider-${idx + 1}`,
          eta_minutes: Number.isFinite(Number(p.eta_minutes)) ? Number(p.eta_minutes) : 40,
          distance: Number.isFinite(Number(p.distance)) ? Number(p.distance) : 0,
          rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : 4.5,
          transport_fee: hasTransport
            ? transportQuote.amount || (Number.isFinite(Number(p.transport_fee)) ? Number(p.transport_fee) : 0)
            : 0,
          transport_tier_label: transportQuote.label || '',
          price_per_hour: Number.isFinite(Number(p.price_per_hour)) ? Number(p.price_per_hour) : 0,
          transport_quote_eligible: transportQuote.eligible !== false,
        };
      })
      .filter((p) => !hasTransport || p.transport_quote_eligible !== false);
  }, [selectedMachinery]);

  const needsTransport = useCallback(() => checkNeedsTransport(selectedMachinery), [selectedMachinery]);

  useEffect(() => {
    if (!previewPublic) return;
    const caseKey = previewCase || 'no_offer';
    try {
      localStorage.setItem('reservationType', 'immediate');
      localStorage.setItem('selectedMachinery', 'retroexcavadora');
      localStorage.setItem('selectedHours', '4');
      localStorage.removeItem('selectedMachinerySpec');
      localStorage.setItem('providerSelectionMachinery', 'retroexcavadora');
    } catch {
      void 0;
    }
    setReservationType('immediate');
    setSelectedMachinery('retroexcavadora');
    setIsDemoProviders(false);
    setTomorrowAvailable(false);
    setTomorrowCount(0);
    setSelectedProviderIds([]);

    if (caseKey === 'network') {
      setProviders([]);
      setEmptyState(true);
      setEmptyKind('network');
      setLoading(false);
      return;
    }

    if (caseKey === 'no_offer_tomorrow') {
      setProviders([]);
      setEmptyState(true);
      setEmptyKind('no_offer');
      setTomorrowAvailable(true);
      setTomorrowCount(3);
      setLoading(false);
      return;
    }

    if (caseKey === 'no_fit') {
      try {
        localStorage.setItem('clientRequiredBucketM3List', JSON.stringify([0.4]));
      } catch {
        void 0;
      }
      setProviders([
        {
          id: 'p-preview-1',
          machine_id: 'm-preview-1',
          eta_minutes: 25,
          distance: 9,
          rating: 4.6,
          price_per_hour: 42000,
          transport_fee: 0,
          bucket_m3: 0.5,
          total_price: 185000,
          has_transport: false,
        },
        {
          id: 'p-preview-2',
          machine_id: 'm-preview-2',
          eta_minutes: 40,
          distance: 18,
          rating: 4.4,
          price_per_hour: 39000,
          transport_fee: 0,
          bucket_m3: 0.6,
          total_price: 175000,
          has_transport: false,
        },
      ]);
      setEmptyState(false);
      setEmptyKind('');
      setLoading(false);
      return;
    }

    if (caseKey === 'available_3') {
      try {
        localStorage.setItem('maqgo_availability_watch_enabled', '1');
        localStorage.removeItem('clientRequiredBucketM3List');
        localStorage.removeItem('selectedMachinerySpec');
      } catch {
        void 0;
      }
      setProviders([
        {
          id: 'p-preview-1',
          machine_id: 'm-preview-1',
          eta_minutes: 18,
          distance: 6,
          rating: 4.7,
          price_per_hour: 42000,
          transport_fee: 25000,
          bucket_m3: 0.5,
          total_price: 210000,
          has_transport: true,
        },
        {
          id: 'p-preview-2',
          machine_id: 'm-preview-2',
          eta_minutes: 28,
          distance: 12,
          rating: 4.6,
          price_per_hour: 39000,
          transport_fee: 0,
          bucket_m3: 0.6,
          total_price: 195000,
          has_transport: false,
        },
        {
          id: 'p-preview-3',
          machine_id: 'm-preview-3',
          eta_minutes: 35,
          distance: 18,
          rating: 4.5,
          price_per_hour: 36000,
          transport_fee: 0,
          bucket_m3: 0.4,
          total_price: 180000,
          has_transport: false,
        },
      ]);
      setEmptyState(false);
      setEmptyKind('');
      setLoading(false);
      return;
    }

    setProviders([]);
    setEmptyState(true);
    setEmptyKind('no_offer');
    setLoading(false);
  }, [previewPublic, previewCase]);

  const canUseNotifications = useMemo(() => {
    try {
      if (typeof window === 'undefined') return false;
      if (typeof Notification === 'undefined') return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  const [availabilityWatchEnabled, setAvailabilityWatchEnabled] = useState(() => {
    try {
      return localStorage.getItem('maqgo_availability_watch_enabled') === '1';
    } catch {
      return false;
    }
  });

  const enableAvailabilityWatch = useCallback(async () => {
    setAvailabilityWatchEnabled(true);
    try {
      localStorage.setItem('maqgo_availability_watch_enabled', '1');
    } catch {
      void 0;
    }

    let msg = 'Listo. Verás aquí las opciones cuando aparezcan.';

    if (canUseNotifications) {
      try {
        if (Notification.permission === 'denied') {
          msg = 'Aviso activado. Para notificaciones, habilítalas en tu navegador.';
        } else if (Notification.permission === 'default') {
          const r = await requestPushPermissionAndSubscribe();
          if (r?.denied) {
            msg = 'Aviso activado. Si quieres notificaciones, permite notificaciones en el navegador.';
          } else if (r?.success) {
            msg = 'Aviso activado. Te enviaremos una notificación si aparecen opciones.';
          }
        } else if (Notification.permission === 'granted') {
          const r = await ensurePushSubscribedIfGranted();
          if (r?.success) {
            msg = 'Aviso activado. Te enviaremos una notificación si aparecen opciones.';
          }
        }
      } catch {
        void 0;
      }
    }

    setAvailabilityToast({
      kind: 'enabled',
      message: msg,
    });
  }, [canUseNotifications]);

  useEffect(() => {
    if (!availabilityToast) return;
    if (availabilityToast.kind !== 'enabled') return;
    const timer = setTimeout(() => {
      setAvailabilityToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [availabilityToast]);

  useEffect(() => {
    const count = Array.isArray(filteredProviders) ? filteredProviders.length : 0;
    const prev = prevAvailableCountRef.current || 0;
    prevAvailableCountRef.current = count;
    if (!availabilityWatchEnabled) return;
    if (count < 1) return;
    if (prev >= 1) return;
    let lastAt = 0;
    try {
      lastAt = Number(localStorage.getItem('maqgo_availability_watch_last_at') || '0') || 0;
    } catch {
      lastAt = 0;
    }
    const now = Date.now();
    if (now - lastAt < 24 * 60 * 60 * 1000) return;
    try {
      localStorage.setItem('maqgo_availability_watch_last_at', String(now));
    } catch {
      void 0;
    }
    setAvailabilityToast({ kind: 'available', count });
    try {
      if (canUseNotifications && Notification.permission === 'granted') {
        new Notification('MAQGO', {
          body: `Ya hay ${count} opciones disponibles para tu solicitud.`,
        });
      }
    } catch {
      void 0;
    }
  }, [filteredProviders, availabilityWatchEnabled, canUseNotifications]);

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

  const fetchProviders = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (!silent) setLoading(true);
    setEmptyState(false);
    setEmptyKind('');
    // Usar la ubicación exacta ingresada en ServiceLocationScreen.
    // Si no existe (ej. fallback sin Google Places), usar coordenadas demo.
    const savedLat = parseFloat(localStorage.getItem('serviceLat') || '');
    const savedLng = parseFloat(localStorage.getItem('serviceLng') || '');
    const clientLat = Number.isFinite(savedLat) ? savedLat : -33.4489;
    const clientLng = Number.isFinite(savedLng) ? savedLng : -70.6693;
    const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
    const allowDemoProviders =
      import.meta.env.DEV || localStorage.getItem('oneclickDemoMode') === 'true';

    try {
      const response = await axios.get(`${BACKEND_URL}/api/providers/match`, {
        params: { machinery_type: selectedMachinery, client_lat: clientLat, client_lng: clientLng, limit: 5, needs_invoice: needsInvoice },
        timeout: 8000
      });

      setTomorrowAvailable(response.data?.tomorrow_available ?? false);
      setTomorrowCount(response.data?.tomorrow_count ?? 0);

      // Agregar cálculo de horas máximas y precio total a cada proveedor
      if (response.data?.is_demo) {
        setProviders([]);
        setIsDemoProviders(false);
        setEmptyState(true);
        setEmptyKind('no_offer');
        return;
      }

      const rawProviders = sanitizeProviders(response.data?.providers || []);
      if (rawProviders.length === 0) {
        setProviders([]);
        setIsDemoProviders(false);
        setEmptyState(true);
        setEmptyKind('no_offer');
        return;
      }
      setIsDemoProviders(false);
      setEmptyState(false);
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
      setTomorrowAvailable(false);
      setTomorrowCount(0);

      if (!allowDemoProviders) {
        setProviders([]);
        setIsDemoProviders(false);
        setEmptyState(true);
        setEmptyKind('network');
        return;
      }

      setIsDemoProviders(true);
      setEmptyState(false);
      const fallbackProviders = sanitizeProviders(getDemoProvidersFallback());
      const safeFallback =
        Array.isArray(fallbackProviders) && fallbackProviders.length
          ? fallbackProviders
          : sanitizeProviders(getDemoProviders('retroexcavadora', 5, { extended: true }));

      setProviders(
        safeFallback.map((p) => ({
          ...p,
          total_price: totalConFactura(calculateTotalPrice(p, selectedMachinery)),
          has_transport: needsTransport(),
          max_hours: calculateMaxHours(p.closing_time || '20:00', p.eta_minutes || 40),
        }))
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedMachinery, needsTransport, calculateTotalPrice, getDemoProvidersFallback, sanitizeProviders]);

  useEffect(() => {
    if (!availabilityWatchEnabled) return;
    if (!emptyState) return;
    if (emptyKind !== 'no_offer') return;

    let stopped = false;
    let timer = null;
    let intervalMs = 30000;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      try {
        await fetchProviders({ silent: true });
      } catch {
        void 0;
      }
      intervalMs = Math.min(120000, intervalMs + 15000);
      timer = window.setTimeout(tick, intervalMs);
    };

    timer = window.setTimeout(tick, 5000);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [availabilityWatchEnabled, emptyState, emptyKind, fetchProviders]);

  useEffect(() => {
    if (previewPublic) return;
    fetchProviders();
    saveBookingProgress('providers', { machinery: selectedMachinery });
  }, [fetchProviders, previewPublic, selectedMachinery]);

  useEffect(() => {
    if (!isWhyOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsWhyOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isWhyOpen]);

  // Preload pasos 5 y 6 para evitar flash al navegar
  useEffect(() => {
    import('./ConfirmServiceScreen');
    import('./BillingDataScreen');
    import('./CardPaymentScreen');
  }, []);

  // Sincronizar tipo desde localStorage al montar/volver
  useEffect(() => {
    const type = localStorage.getItem('reservationType') || 'immediate';
    setReservationType(type);
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

  const machineryLabel = MACHINERY_NAMES[selectedMachinery] || selectedMachinery;
  const bookingSummaryShort = (() => {
    const parts = [];
    if (machineryLabel) parts.push(machineryLabel);
    if (machinerySpec) parts.push(machinerySpec);
    return parts.join(' • ');
  })();
  // bookingSummaryShort es el resumen que mostramos en pantallas/avisos: sin “Inicio hoy / X horas”.

  const showBookingSummaryLine = filteredProviders.length > 0;

  const capacityConstraintLabel = useMemo(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    const base = String(capOpts?.providerLabel || '').trim();
    if (!base) return '';
    const unit = String(capOpts?.unit || capOpts?.unitDisplay || '').trim();
    return unit ? `${base} (${unit})` : base;
  }, [selectedMachinery]);

  const capacityConstraintLabelShort = useMemo(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    return String(capOpts?.providerLabel || '').trim();
  }, [selectedMachinery]);

  const selectedCapacityLabel = useMemo(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    if (!capOpts?.clientStorageKey) return '';
    const raw = getArray(capOpts.clientStorageKey, []);
    if (!Array.isArray(raw) || raw.length === 0) return '';
    const unit = String(capOpts?.unitDisplay || capOpts?.unit || '').trim();
    const formatted = raw
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n))
      .map((n) => {
        if (!unit) return String(n);
        if (unit === 'litros') return n >= 1000 ? `${Math.round(n / 1000)}.000 L` : `${n} L`;
        if (unit === 'm³' || unit === 'm³ balde') return `${String(n).replace('.', ',')} m³`;
        if (unit === 'ton·m') return `${n} ton·m`;
        return `${n} ${unit}`;
      });
    if (formatted.length === 0) return '';
    return formatted.length === 1 ? formatted[0] : formatted.join(' · ');
  }, [selectedMachinery]);

  const clearCapacityFilter = useCallback(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    if (!capOpts?.clientStorageKey) return;
    try {
      localStorage.removeItem(capOpts.clientStorageKey);
      localStorage.removeItem('selectedMachinerySpec');
    } catch {
      void 0;
    }
    setProviders((prev) => (Array.isArray(prev) ? [...prev] : []));
  }, [selectedMachinery]);

  const applyCapacityFilter = useCallback((numericValue) => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    if (!capOpts?.clientStorageKey) return;
    const n = Number(numericValue);
    if (!Number.isFinite(n)) return;
    try {
      localStorage.setItem(capOpts.clientStorageKey, JSON.stringify([n]));
      localStorage.removeItem('selectedMachinerySpec');
    } catch {
      void 0;
    }
    setProviders((prev) => (Array.isArray(prev) ? [...prev] : []));
  }, [selectedMachinery]);

  const availableCapacityValues = useMemo(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    if (!capOpts?.providerField) return [];
    const keys = PROVIDER_FIELD_TO_KEYS[capOpts.providerField];
    if (!keys || !Array.isArray(providers) || providers.length === 0) return [];
    const found = [];
    for (const p of providers) {
      let value = null;
      for (const k of keys) {
        if (p?.[k] != null && p[k] !== '') { value = Number(p[k]); break; }
      }
      if (value == null && p?.machineData) {
        for (const k of keys) {
          if (p.machineData?.[k] != null && p.machineData[k] !== '') { value = Number(p.machineData[k]); break; }
        }
      }
      if (!Number.isFinite(value)) continue;
      found.push(value);
    }
    const uniq = [...new Set(found.map((v) => Number(v)))].filter((n) => Number.isFinite(n));
    uniq.sort((a, b) => a - b);
    return uniq.slice(0, 5);
  }, [providers, selectedMachinery]);

  const availableCapacityLabels = useMemo(() => {
    const capOpts = getMachineryCapacityOptions(selectedMachinery);
    const unit = String(capOpts?.unitDisplay || capOpts?.unit || '').trim();
    return availableCapacityValues.map((n) => {
      if (!unit) return { value: n, label: String(n) };
      if (unit === 'litros') return { value: n, label: n >= 1000 ? `${Math.round(n / 1000)}.000 L` : `${n} L` };
      if (unit === 'm³' || unit === 'm³ balde') return { value: n, label: `${String(n).replace('.', ',')} m³` };
      if (unit === 'ton·m') return { value: n, label: `${n} ton·m` };
      return { value: n, label: `${n} ${unit}` };
    });
  }, [availableCapacityValues, selectedMachinery]);

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
            {bookingSummaryShort}
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
  if (!loading && reservationType === 'immediate' && emptyState && tomorrowAvailable) {
    return (
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll">
          <NoProvidersTryTomorrow
            tomorrowCount={tomorrowCount}
            onReserveTomorrow={handleReserveTomorrow}
            onModify={() => navigate(backRoute || '/client/machinery')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-client-funnel maqgo-p4-provider-layout">
      <div className="maqgo-screen maqgo-screen--scroll maqgo-p4-provider-scroll">
        {availabilityToast ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: 'rgba(236,104,25,0.14)',
              border: '1px solid rgba(236,104,25,0.35)',
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ color: '#fff', fontSize: 13, lineHeight: 1.35, fontWeight: 700 }}>
              {availabilityToast.message
                ? availabilityToast.message
                : `Ya hay ${availabilityToast.count} opciones disponibles.`}
            </div>
            {typeof availabilityToast.count === 'number' ? (
              <button
                type="button"
                onClick={() => setAvailabilityToast(null)}
                className="maqgo-btn-secondary"
                style={{ width: 'auto', padding: '8px 12px', borderRadius: 12, fontSize: 13 }}
              >
                Ver
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAvailabilityToast(null)}
                className="maqgo-btn-secondary"
                style={{ width: 'auto', padding: '8px 12px', borderRadius: 12, fontSize: 13 }}
              >
                OK
              </button>
            )}
          </div>
        ) : null}

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
            No pudimos cargar proveedores en este momento. Estamos mostrando opciones referenciales.
          </div>
        )}

        <BookingProgress />

        <MaqgoTitleCard
          title={filteredProviders.length > 0 ? 'Elige tus proveedores' : 'Proveedores'}
          maxWidth={520}
        />

        {showBookingSummaryLine ? (
          <p
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
              textAlign: 'center',
              margin: '0 0 12px',
              lineHeight: 1.4,
              padding: '0 8px',
              fontWeight: 600,
            }}
          >
            {bookingSummaryShort}
          </p>
        ) : null}

        {!loading && emptyState && emptyKind === 'network' ? (
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 18,
              marginBottom: 14,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            role="status"
            aria-live="polite"
          >
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              No pudimos cargar proveedores
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.45 }}>
              Revisa tu conexión e inténtalo nuevamente.
            </p>
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button
                type="button"
                onClick={() => fetchProviders()}
                className="maqgo-btn-primary"
                style={{ width: '100%' }}
              >
                Volver a buscar
              </button>
              <button
                type="button"
                onClick={() => navigate(backRoute || '/client/machinery')}
                className="maqgo-btn-secondary"
                style={{ width: '100%' }}
              >
                Cambiar mi solicitud
              </button>
            </div>
          </div>
        ) : null}

        {!loading && emptyState && emptyKind !== 'network' ? (
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 18,
              marginBottom: 14,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            role="status"
            aria-live="polite"
          >
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              Por ahora no tenemos proveedores de {machineryLabel} activos en tu zona
              {selectedCapacityLabel && (capacityConstraintLabelShort || capacityConstraintLabel)
                ? ` (${(capacityConstraintLabelShort || capacityConstraintLabel)}: ${selectedCapacityLabel})`
                : ''}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.45 }}>
              Estamos activando proveedores en tu zona. La disponibilidad se actualizará cuando existan opciones.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.45 }}>
              Tu solicitud: {bookingSummaryShort}
            </p>
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button
                type="button"
                onClick={enableAvailabilityWatch}
                className="maqgo-btn-secondary"
                style={{ width: '100%' }}
              >
                Avisarme cuando haya opciones
              </button>
              <button
                type="button"
                onClick={() => navigate('/client/machinery')}
                className="maqgo-btn-primary"
                style={{ width: '100%' }}
              >
                Elegir otra maquinaria
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !emptyState && providers.length > 0 && filteredProviders.length === 0 ? (
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 18,
              marginBottom: 14,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            role="status"
            aria-live="polite"
          >
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              No hay opciones con esa capacidad
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, textAlign: 'center', margin: '0 0 10px', lineHeight: 1.45 }}>
              Tu solicitud: {bookingSummaryShort}.
            </p>
            {capacityConstraintLabel ? (
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: 12,
                textAlign: 'center'
              }}>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginBottom: 4 }}>
                  Capacidad requerida
                </div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                  {(capacityConstraintLabelShort || capacityConstraintLabel)}{selectedCapacityLabel ? `: ${selectedCapacityLabel}` : ''}
                </div>
              </div>
            ) : null}
            {availableCapacityLabels.length > 0 ? (
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
                  Disponible ahora
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {availableCapacityLabels.map(({ value, label }) => (
                    <button
                      key={`${value}`}
                      type="button"
                      onClick={() => applyCapacityFilter(value)}
                      className="maqgo-btn-secondary"
                      style={{
                        width: 'auto',
                        padding: '10px 12px',
                        borderRadius: 999,
                        fontSize: 13,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button
                type="button"
                onClick={() => navigate(backRoute || '/client/machinery')}
                className="maqgo-btn-primary"
                style={{ width: '100%' }}
              >
                Cambiar capacidad
              </button>
              <button
                type="button"
                onClick={clearCapacityFilter}
                className="maqgo-btn-secondary"
                style={{ width: '100%' }}
              >
                Quitar filtro de capacidad
              </button>
            </div>
          </div>
        ) : null}

        {filteredProviders.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 1.45 }}>
              Ordenado por precio total y cercanía.
            </span>
            <button
              type="button"
              onClick={() => setIsWhyOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#90BDD3',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3
              }}
              aria-haspopup="dialog"
              aria-expanded={isWhyOpen}
            >
              ¿Por qué?
            </button>
          </div>
        ) : null}

        {/* Aviso: pocos proveedores por sábado */}
        {reservationType === 'scheduled' && hasSaturday && providers.length > 0 && providers.length < 3 && (
          <div style={{ background: 'rgba(144, 189, 211, 0.18)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <p style={{ color: '#90BDD3', fontSize: 12, margin: 0, textAlign: 'center' }}>
              Hay pocos proveedores para un rango que incluye sábado. Si necesitas más opciones, ajusta fechas y quita el sábado.
            </p>
          </div>
        )}

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

        {isWhyOpen ? (
          <div
            className="maqgo-modal-overlay"
            role="presentation"
            onClick={() => setIsWhyOpen(false)}
          >
            <div
              className="maqgo-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Cómo ordenamos las opciones"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>
                Cómo ordenamos las opciones
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.5 }}>
                <li>Priorizamos el precio total (incluye traslado si aplica y Tarifa por Servicio).</li>
                <li>También consideramos la cercanía estimada (tiempo estimado).</li>
                <li>Si cambias ubicación, horas o fecha, el orden puede variar.</li>
              </ul>
              <button
                type="button"
                onClick={() => setIsWhyOpen(false)}
                style={{
                  width: '100%',
                  marginTop: 14,
                  padding: 12,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        ) : null}

        {/* Lista: sin scroll interno — el scroll es el de .maqgo-screen--scroll (evita CTA fuera de vista / doble scroll). */}
        {filteredProviders.length > 0 ? (
          <div style={{ paddingBottom: 8 }}>
            {filteredProviders.map((provider, index) => {
            const isSelected = selectedProviderIds.some((id) => idMatch(id, provider.id));
            const spec = getProviderSpecDisplay(selectedMachinery, provider);
            /** Regla de negocio: no mostrar nombre comercial / empresa del proveedor antes de asignación. */
            const optionLabel = `Opción ${index + 1}`;
            return (
            <div 
              key={provider.machine_id || provider.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleProvider(provider.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProvider(provider.id); } }}
              aria-label={`${optionLabel}, ${formatPrice(provider.total_price)}, ${provider.eta_minutes || '?'} min, ${formatDistanceKmLabel(provider.distance)}${isSelected ? ', seleccionado' : ''}`}
              style={{
                background: isSelected ? 'rgba(236, 104, 25, 0.12)' : '#1A1A1F',
                border: isSelected ? '2px solid #EC6819' : '1px solid rgba(255,255,255,0.10)',
                borderRadius: 14,
                padding: 16,
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
                    width: 86,
                    height: 64,
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
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1L7.2 4.2H10.6L7.9 6.3L8.8 9.8L6 7.8L3.2 9.8L4.1 6.3L1.4 4.2H4.8L6 1Z" fill="#EC6819"/>
                      </svg>
                      <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: 700 }}>
                        {(Number(provider.rating) || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    marginTop: 10,
                    color: 'rgba(255,255,255,0.88)',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    lineHeight: 1.25,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <path d="M6 3V6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>
                      Disponible aprox. en {provider.eta_minutes} min · {formatDistanceKmLabel(provider.distance)}
                    </span>
                  </div>

                  {/* Detalle de traslado MAQGO */}
                  {provider.has_transport && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Costos de traslado neto
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, margin: '0 0 2px' }}>Misma comuna</p>
                          <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0 }}>{formatPrice(provider.transport_same_comuna || provider.transport_fee)}</p>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 8 }}>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, margin: '0 0 2px' }}>Distinta comuna</p>
                          <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0 }}>{formatPrice(provider.transport_same_region || provider.transport_fee)}</p>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 8 }}>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, margin: '0 0 2px' }}>Región colindante</p>
                          <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0 }}>{formatPrice(provider.transport_other_region || provider.transport_same_region || provider.transport_fee)}</p>
                        </div>
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, margin: '6px 0 0', fontStyle: 'italic' }}>
                        * Máx. 150 km para región colindante.
                      </p>
                    </div>
                  )}
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

              {isSelected ? (
                <div style={{
                  marginTop: 4,
                  color: 'rgba(236,104,25,0.95)',
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: 'right',
                }}>
                  Seleccionado
                </div>
              ) : null}
            </div>
            );
            })}
          </div>
        ) : null}

        {/* Info de jornada (scroll; el CTA va en barra fija inferior) */}
        {filteredProviders.length > 0 && !isPerTripMachineryType(selectedMachinery) && (
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

      {filteredProviders.length > 0 ? (
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
          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.72)', fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
            No se cobrará hasta que un proveedor acepte tu solicitud.
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProviderOptionsScreen;
