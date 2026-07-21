import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth, clearLocalSession } from '../../utils/api';
import { pingBackendHealth, maskBackendHost } from '../../utils/apiHealth';
import { friendlyFetchError, isDemoServiceId } from '../../utils/fetchErrors';
import { useToast } from '../../components/Toast';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import MaqgoLogo from '../../components/MaqgoLogo';
import { isPerTripMachineryType } from '../../utils/machineryNames';
import SystemHealthPanel from '../../components/admin/SystemHealthPanel';

/** Paleta admin unificada: menos acentos competidor entre sí (CTO UX) */
const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
  danger: '#E57373',
};
const ADMIN_THEME = {
  appBg: '#070B12',
  panelBg: '#0F172A',
  panelBgSoft: '#0B1220',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textMuted: 'rgba(255,255,255,0.70)',
};

// Estados de pipeline (misma familia cromática: info = cola, brand = cobro pendiente, success = cerrado)
const STATUS_CONFIG = {
  pending_review: { label: 'En revisión', color: ADMIN_PALETTE.warning, bg: 'rgba(232, 163, 75, 0.12)' },
  approved: { label: 'Aprobado', color: ADMIN_PALETTE.info, bg: 'rgba(126, 184, 212, 0.12)' },
  invoiced: { label: 'Facturado', color: ADMIN_PALETTE.brand, bg: 'rgba(236, 104, 25, 0.14)' },
  paid: { label: 'Pagado', color: ADMIN_PALETTE.success, bg: 'rgba(102, 187, 106, 0.12)' },
  disputed: { label: 'En disputa', color: ADMIN_PALETTE.danger, bg: 'rgba(229, 115, 115, 0.12)' }
};

const PAGE_SIZE = 50;

function normalizeInvoiceImageSrc(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t;
  return `data:image/jpeg;base64,${t}`;
}

function isPdfDataUrl(src) {
  return typeof src === 'string' && src.startsWith('data:application/pdf');
}

function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState({});
  const [finances, setFinances] = useState({
    totalGross: 0,
    totalNet: 0,
    clientCommission: 0,
    providerCommission: 0,
    totalCommission: 0,
    completed: 0,
    cancelled: 0,
    disputed: 0
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedService, setSelectedService] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [page, setPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [sla, setSla] = useState(null);
  const [weekComparison, setWeekComparison] = useState(null);
  /** Solo true cuando falló la red: datos demo locales; las mutaciones al API fallarían con IDs demo. */
  const [usingOfflineDemo, setUsingOfflineDemo] = useState(false);
  const actionsLocked = usingOfflineDemo;
  const [monthlyFinance, setMonthlyFinance] = useState(null);
  const [loadingMonthlyFinance, setLoadingMonthlyFinance] = useState(false);
  const [monthlyFinanceError, setMonthlyFinanceError] = useState('');
  const monthlyFinanceManualTriggerRef = useRef(false);
  const smsBalanceManualTriggerRef = useRef(false);
  const [monthlyFinanceUpdatedAt, setMonthlyFinanceUpdatedAt] = useState(null);
  const [smsBalance, setSmsBalance] = useState(null);
  const [loadingSmsBalance, setLoadingSmsBalance] = useState(false);
  const [smsBalanceError, setSmsBalanceError] = useState('');
  /** Último resultado de GET /healthz (sin auth) — diagnóstico DNS/CORS vs rutas admin. */
  const [healthSnapshot, setHealthSnapshot] = useState(null);
  /** Error HTTP u otro fallo del listado admin (no red demo); banner persistente. */
  const [listHttpError, setListHttpError] = useState(null);
  const [connDiagNonce, setConnDiagNonce] = useState(0);
  const [invoiceModalSrc, setInvoiceModalSrc] = useState('');
  const [invoiceModalLoading, setInvoiceModalLoading] = useState(false);
  const [invoiceModalHint, setInvoiceModalHint] = useState('');
  const [providerInvoiceConfirmed, setProviderInvoiceConfirmed] = useState('');
  const [showReportSubscriptions, setShowReportSubscriptions] = useState(false);
  const [reportSubsLoading, setReportSubsLoading] = useState(false);
  const [weeklyReportEmailsText, setWeeklyReportEmailsText] = useState('');
  const [monthlyReportEmailsText, setMonthlyReportEmailsText] = useState('');
  const [reportSubsMeta, setReportSubsMeta] = useState(null);
  const [reportTestSending, setReportTestSending] = useState('');
  const [reportSubsLoaded, setReportSubsLoaded] = useState(false);
  const [liveRequests, setLiveRequests] = useState([]);
  const [liveRequestsLoading, setLiveRequestsLoading] = useState(false);
  const [liveRequestsError, setLiveRequestsError] = useState('');
  const [liveRequestsUpdatedAt, setLiveRequestsUpdatedAt] = useState(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [adminMachines, setAdminMachines] = useState(null);
  const [adminMachinesLoading, setAdminMachinesLoading] = useState(false);
  const [adminMachinesError, setAdminMachinesError] = useState('');
  const [adminMachinesUpdatedAt, setAdminMachinesUpdatedAt] = useState(null);
  const [showIntegrationDetails, setShowIntegrationDetails] = useState(false);
  const [adminArea, setAdminArea] = useState(() => {
    try {
      return localStorage.getItem('maqgo_admin_area') || 'today';
    } catch {
      return 'today';
    }
  });
  const [accessTickets, setAccessTickets] = useState(null);
  const [accessTicketsLoading, setAccessTicketsLoading] = useState(false);
  const [accessTicketsError, setAccessTicketsError] = useState('');
  const [blockedPhones, setBlockedPhones] = useState(null);
  const [blockedPhonesLoading, setBlockedPhonesLoading] = useState(false);
  const [blockedPhonesError, setBlockedPhonesError] = useState('');
  const [blockPhone9, setBlockPhone9] = useState('');
  const [blockPhoneReason, setBlockPhoneReason] = useState('security');
  const [blockingPhone, setBlockingPhone] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('maqgo_admin_area', adminArea);
    } catch {
      void 0;
    }
  }, [adminArea]);

  const fetchAdminMachines = useCallback(async () => {
    if (actionsLocked) return;
    setAdminMachinesLoading(true);
    setAdminMachinesError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/machines`, {}, 12000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `No se pudieron cargar máquinas (${res.status})`);
      setAdminMachines(Array.isArray(data?.machines) ? data.machines : []);
      setAdminMachinesUpdatedAt(new Date());
    } catch (e) {
      setAdminMachinesError(friendlyFetchError(e, 'No se pudieron cargar las máquinas (admin).'));
      setAdminMachines(null);
    } finally {
      setAdminMachinesLoading(false);
    }
  }, [actionsLocked, setAdminMachines, setAdminMachinesLoading, setAdminMachinesError]);

  const fetchAccessTickets = useCallback(async () => {
    if (actionsLocked) return;
    setAccessTicketsLoading(true);
    setAccessTicketsError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/support/tickets?status=open`, { method: 'GET' }, 15000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `No se pudieron cargar tickets (${res.status})`);
      setAccessTickets(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setAccessTicketsError(friendlyFetchError(e, 'No se pudieron cargar tickets de acceso.'));
      setAccessTickets(null);
    } finally {
      setAccessTicketsLoading(false);
    }
  }, [actionsLocked]);

  const fetchBlockedPhones = useCallback(async () => {
    if (actionsLocked) return;
    setBlockedPhonesLoading(true);
    setBlockedPhonesError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/support/blocked-phones?active=true`, { method: 'GET' }, 15000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `No se pudieron cargar bloqueos (${res.status})`);
      setBlockedPhones(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setBlockedPhonesError(friendlyFetchError(e, 'No se pudieron cargar teléfonos bloqueados.'));
      setBlockedPhones(null);
    } finally {
      setBlockedPhonesLoading(false);
    }
  }, [actionsLocked]);

  useEffect(() => {
    if (adminArea !== 'access') return;
    if (actionsLocked) return;
    if (accessTickets == null) fetchAccessTickets();
    if (blockedPhones == null) fetchBlockedPhones();
  }, [adminArea, actionsLocked, accessTickets, blockedPhones, fetchAccessTickets, fetchBlockedPhones]);

  useEffect(() => {
    if (adminArea !== 'platform') return;
    if (actionsLocked) return;
    if (adminMachinesLoading) return;
    if (adminMachines != null) return;
    fetchAdminMachines();
  }, [adminArea, actionsLocked, adminMachines, adminMachinesLoading, fetchAdminMachines]);

  const integrations = useMemo(() => {
    const rows = Array.isArray(adminMachines) ? adminMachines : [];
    const now = Date.now();
    const parseDate = (v) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const hoursSince = (d) => (d ? (now - d.getTime()) / 36e5 : null);

    const komatsu = rows
      .filter((m) => {
        const ex = m?.external && typeof m.external === 'object' ? m.external : null;
        const k = ex?.komatsu && typeof ex.komatsu === 'object' ? ex.komatsu : null;
        return Boolean(k?.assetId);
      })
      .map((m) => {
        const ex = m?.external && typeof m.external === 'object' ? m.external : null;
        const k = ex?.komatsu && typeof ex.komatsu === 'object' ? ex.komatsu : {};
        const last = parseDate(k?.lastSyncAt);
        const ageH = hoursSince(last);
        return {
          id: m?.id,
          providerName: m?.providerName || m?.provider?.name || '-',
          licensePlate: m?.licensePlate || m?.license_plate || '-',
          machineryType: m?.machineryType || m?.machinery_type || '-',
          lastSyncAt: last,
          ageH,
          isOk24h: typeof ageH === 'number' ? ageH <= 24 : false,
          isStale72h: typeof ageH === 'number' ? ageH > 72 : true,
        };
      });

    const counts = (list) => {
      let ok24h = 0;
      let stale = 0;
      let never = 0;
      let newest = null;
      list.forEach((x) => {
        if (!x.lastSyncAt) never += 1;
        else {
          if (!newest || x.lastSyncAt > newest) newest = x.lastSyncAt;
          if (x.isOk24h) ok24h += 1;
          if (x.isStale72h) stale += 1;
        }
      });
      return { total: list.length, ok24h, stale72h: stale, never, newest };
    };

    return {
      komatsu: { machines: komatsu, ...counts(komatsu) },
    };
  }, [adminMachines]);

  // Fallback si el backend no envía `finances` (versiones viejas / demo)
  const calculateFinances = useCallback((serviceList) => {
    let totalGross = 0;
    let totalNet = 0;
    let clientCommNet = 0;
    let providerCommNet = 0;
    let completed = 0;
    let cancelled = 0;
    let disputed = 0;

    serviceList.forEach(s => {
      if (['approved', 'invoiced', 'paid'].includes(s.status)) {
        totalGross += s.gross_total || 0;
        const grossSinIva = (s.gross_total || 0) / 1.19;
        totalNet += grossSinIva;
        const subtotalBase = grossSinIva / 1.10;
        clientCommNet += subtotalBase * 0.10;
        const serviceFeeNet = (s.service_fee || 0) / 1.19;
        providerCommNet += serviceFeeNet;
      }
      if (s.status === 'paid') completed++;
      if (s.status === 'cancelled') cancelled++;
      if (s.status === 'disputed') disputed++;
    });

    setFinances({
      totalGross: Math.round(totalGross),
      totalNet: Math.round(totalNet),
      clientCommission: Math.round(clientCommNet),
      providerCommission: Math.round(providerCommNet),
      totalCommission: Math.round(clientCommNet + providerCommNet),
      completed,
      cancelled,
      disputed
    });
  }, []);

  const fetchLiveRequests = useCallback(async () => {
    setLiveRequestsLoading(true);
    setLiveRequestsError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/service-requests/admin/active?limit=200`,
        { method: 'GET' },
        15000
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail || `Error al cargar solicitudes activas (${res.status})`;
        setLiveRequests([]);
        setLiveRequestsError(msg);
        toast.error(msg, 'admin-live-requests');
        return;
      }
      setLiveRequests(Array.isArray(data) ? data : []);
      setLiveRequestsUpdatedAt(new Date());
    } catch (e) {
      const msg = friendlyFetchError(e);
      setLiveRequests([]);
      setLiveRequestsError(msg);
    } finally {
      setLiveRequestsLoading(false);
    }
  }, [toast]);

  const runLiveRequestAction = useCallback(
    async (requestId, action) => {
      if (!requestId) return false;
      if (actionsLocked) {
        toast.warning('Sin conexión al servidor: acción no disponible.');
        return false;
      }
      try {
        const endpoint =
          action === 'expire'
            ? `${BACKEND_URL}/api/service-requests/${encodeURIComponent(requestId)}/admin/expire-offer`
            : `${BACKEND_URL}/api/service-requests/${encodeURIComponent(requestId)}/admin/retry-matching`;
        const res = await fetchWithAuth(endpoint, { method: 'POST' }, 20000);
        const data = await res.json();
        if (!res.ok) {
          const msg = data?.detail || `Acción falló (${res.status})`;
          toast.error(msg);
          return false;
        }
        toast.success(action === 'expire' ? 'Oferta expirada' : 'Matching reintentado');
        fetchLiveRequests();
        return true;
      } catch (e) {
        toast.error(friendlyFetchError(e));
        return false;
      }
    },
    [actionsLocked, fetchLiveRequests, toast]
  );

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset)
      });
      if (filter && filter !== 'all') {
        qs.set('status', filter);
      }
      const response = await fetchWithAuth(
        `${BACKEND_URL}/api/services/admin/all?${qs.toString()}`,
        { method: 'GET' },
        15000
      );
      const data = await response.json();
      if (!response.ok) {
        const errMsg = data.detail || `Error al cargar reservas (${response.status})`;
        setListHttpError({ message: errMsg, status: response.status });
        setUsingOfflineDemo(false);
        setServices([]);
        setStats({});
        setListTotal(0);
        setSla(null);
        setWeekComparison(null);
        calculateFinances([]);
        toast.error(errMsg, 'admin-dashboard-load');
        return;
      }
      setListHttpError(null);
      setUsingOfflineDemo(false);
      const serviceList = data.services || [];
      setServices(serviceList);
      setStats(data.stats || {});
      setListTotal(typeof data.total === 'number' ? data.total : serviceList.length);
      if (data.finances && typeof data.finances === 'object') {
        setFinances({
          totalGross: data.finances.totalGross ?? 0,
          totalNet: data.finances.totalNet ?? 0,
          clientCommission: data.finances.clientCommission ?? 0,
          providerCommission: data.finances.providerCommission ?? 0,
          totalCommission: data.finances.totalCommission ?? 0,
          completed: data.finances.completed ?? 0,
          cancelled: data.finances.cancelled ?? 0,
          disputed: data.finances.disputed ?? 0
        });
      } else if (data.limit == null && data.offset == null) {
        // API legacy sin paginación: lista completa → cálculo local OK
        calculateFinances(serviceList);
      } else {
        // Respuesta paginada sin finances: no recalcular con página parcial
        if (import.meta.env.DEV) {
          console.warn('admin/all: respuesta sin finances; despliega backend actualizado');
        }
      }
      if (data.sla && typeof data.sla === 'object') {
        setSla(data.sla);
      } else {
        setSla(null);
      }
      if (data.week_comparison && typeof data.week_comparison === 'object') {
        setWeekComparison(data.week_comparison);
      } else {
        setWeekComparison(null);
      }
    } catch (error) {
      console.error('Error:', error);
      if (error.message === 'Sesión expirada') {
        setLoading(false);
        return;
      }
      const msg = error.message || '';
      const msgLow = String(msg).toLowerCase();
      const isNetwork =
        msg === 'Failed to fetch' ||
        error.name === 'TypeError' ||
        error.name === 'AbortError' ||
        msg.includes('NetworkError') ||
        msgLow.includes('aborted') ||
        msgLow.includes('abort') ||
        msgLow.includes('timeout') ||
        msgLow.includes('timed out') ||
        msgLow.includes('network');
      if (isNetwork) {
        setListHttpError(null);
        setUsingOfflineDemo(true);
        const demoServices = [
          {
            _id: 'demo-1',
            status: 'invoiced',
            provider_id: 'prov-1',
            client_name: 'Carlos González',
            machinery_type: 'retroexcavadora',
            hours: 4,
            gross_total: 126000,
            service_fee: 18900,
            net_total: 107100,
            invoice_number: '12345',
            created_at: new Date().toISOString()
          },
          {
            _id: 'demo-2',
            status: 'pending_review',
            provider_id: 'prov-1',
            client_name: 'María López',
            machinery_type: 'excavadora',
            hours: 6,
            gross_total: 189000,
            service_fee: 28350,
            net_total: 160650,
            created_at: new Date(Date.now() - 7200000).toISOString()
          }
        ];
        setServices(demoServices);
        setStats({
          pending_review: 1,
          approved: 0,
          invoiced: 1,
          paid: 0,
          disputed: 0,
          total: 2,
          maqgo_to_invoice: 0,
          maqgo_to_invoice_overdue: 0,
        });
        setListTotal(demoServices.length);
        calculateFinances(demoServices);
        setSla(null);
        setWeekComparison(null);
      } else {
        const friendlyMsg = friendlyFetchError(error, 'No se pudieron cargar las reservas');
        setUsingOfflineDemo(false);
        setListHttpError({
          message: friendlyMsg,
          status: null
        });
        setServices([]);
        setStats({});
        setListTotal(0);
        setSla(null);
        setWeekComparison(null);
        calculateFinances([]);
        toast.error(friendlyMsg, 'admin-dashboard-load');
      }
    } finally {
      setLoading(false);
    }
  }, [filter, page, calculateFinances, toast]);

  useEffect(() => {
    let cancelled = false;
    pingBackendHealth(BACKEND_URL).then((r) => {
      if (!cancelled) setHealthSnapshot(r);
    });
    return () => {
      cancelled = true;
    };
  }, [connDiagNonce]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    fetchLiveRequests();
    const id = window.setInterval(() => {
      fetchLiveRequests();
    }, 6000);
    return () => window.clearInterval(id);
  }, [fetchLiveRequests]);

  const retryConnection = useCallback(() => {
    setConnDiagNonce((n) => n + 1);
    fetchServices();
  }, [fetchServices]);

  const closeInvoiceModal = useCallback(() => {
    setShowInvoiceModal(false);
    setSelectedService(null);
    setInvoiceModalSrc('');
    setInvoiceModalHint('');
    setInvoiceModalLoading(false);
  }, []);

  useEffect(() => {
    if (!showInvoiceModal || !selectedService?._id) return undefined;
    const id = selectedService._id;
    if (String(id).startsWith('demo-')) {
      setInvoiceModalLoading(false);
      setInvoiceModalSrc('');
      setInvoiceModalHint(
        'Modo demo (API no disponible): no hay archivo. Con el backend activo, la factura se carga desde el servidor.'
      );
      return undefined;
    }
    let cancelled = false;
    setInvoiceModalLoading(true);
    setInvoiceModalHint('');
    setInvoiceModalSrc('');
    (async () => {
      try {
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/services/admin/${id}/invoice-image`,
          { method: 'GET' },
          60000
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInvoiceModalHint(data.detail || `No se pudo cargar la factura (${res.status})`);
          return;
        }
        const raw = data.invoice_image;
        if (!raw) {
          setInvoiceModalHint(
            'No hay archivo guardado en este servicio. Facturas antiguas (solo envío por correo) pueden no tener copia en BD; vuelve a subir desde proveedor o restaura desde email.'
          );
          return;
        }
        setInvoiceModalSrc(normalizeInvoiceImageSrc(raw));
      } catch (e) {
        if (!cancelled) setInvoiceModalHint(e.message || 'Error de red al cargar la factura');
      } finally {
        if (!cancelled) setInvoiceModalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showInvoiceModal, selectedService]);

  const updateStatus = async (serviceId, newStatus) => {
    if (usingOfflineDemo || isDemoServiceId(serviceId)) {
      toast.warning('Sin API o datos demo: esta acción no está disponible.');
      return false;
    }
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Error actualizando estado');
        return false;
      }
      fetchServices();
      toast.success(`Estado actualizado a "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
      return true;
    } catch (error) {
      toast.error(friendlyFetchError(error, 'Error actualizando estado'));
      return false;
    }
  };

  const markClientInvoiced = async (serviceId) => {
    if (usingOfflineDemo || isDemoServiceId(serviceId)) {
      toast.warning('Sin API o datos demo: esta acción no está disponible.');
      return;
    }
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}/client-invoiced`, {
        method: 'PATCH'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Error al marcar cliente facturado');
        return;
      }
      fetchServices();
      toast.success(data.message || 'Cliente facturado por MAQGO');
    } catch (error) {
      toast.error(friendlyFetchError(error, 'Error al marcar cliente facturado'));
    }
  };

  const viewInvoice = (service) => {
    setSelectedService(service);
    try {
      const v =
        service?.provider_invoice_total_confirmed_clp ??
        service?.provider_invoice_total_detected_clp ??
        service?.provider_invoice_expected_total_clp ??
        service?.net_total ??
        '';
      setProviderInvoiceConfirmed(v !== null && v !== undefined ? String(v) : '');
    } catch {
      setProviderInvoiceConfirmed('');
    }
    setShowInvoiceModal(true);
  };

  const approveProviderInvoice = async (serviceId, confirmedTotalClp) => {
    if (usingOfflineDemo || isDemoServiceId(serviceId)) {
      toast.warning('Sin API o datos demo: esta acción no está disponible.');
      return false;
    }
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}/provider-invoice/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed_total_clp: Number(confirmedTotalClp || 0) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Error al aprobar factura proveedor');
        return false;
      }
      fetchServices();
      toast.success(data.message || 'Factura proveedor aprobada');
      return true;
    } catch (error) {
      toast.error(friendlyFetchError(error, 'Error al aprobar factura proveedor'));
      return false;
    }
  };

  const downloadInvoiceFile = () => {
    if (!invoiceModalSrc || !selectedService) return;
    const base = selectedService.invoice_number || selectedService.invoiceFilename || 'factura';
    const safe = String(base).replace(/[^\w.-]+/g, '_').slice(0, 80);
    const ext = isPdfDataUrl(invoiceModalSrc) ? 'pdf' : 'jpg';
    const a = document.createElement('a');
    a.href = invoiceModalSrc;
    a.download = `maqgo_factura_${safe}.${ext}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const fetchWeeklyReport = async (weeksAgo = 0) => {
    setLoadingReport(true);
    try {
      const response = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/reports/weekly?weeks_ago=${weeksAgo}`,
        { method: 'GET' },
        20000
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `Error ${response.status}`);
      }
      setWeeklyReport(data);
      setShowWeeklyReport(true);
    } catch (error) {
      console.error('Error:', error);
      const isAbort =
        error?.name === 'AbortError' ||
        String(error?.message || '').toLowerCase().includes('aborted');
      if (isAbort) {
        toast.error(
          'El informe tardó demasiado. Reintenta y, si persiste, revisa carga del backend.',
          'admin-weekly-report'
        );
      } else {
        toast.error(friendlyFetchError(error, 'Error al cargar el informe'), 'admin-weekly-report');
      }
    }
    setLoadingReport(false);
  };

  const fetchMonthlyFinance = useCallback(async () => {
    if (usingOfflineDemo) {
      setMonthlyFinance(null);
      setMonthlyFinanceError('Modo demostración: métricas tributarias y margen no disponibles sin API.');
      if (monthlyFinanceManualTriggerRef.current) {
        toast.warning('Sin conexión al servidor: IVA y margen no disponibles.', 'admin-monthly-finance');
      }
      return;
    }
    setLoadingMonthlyFinance(true);
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/monthly-finance`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `Error ${response.status}`);
      }
      setMonthlyFinance(data);
      setMonthlyFinanceError('');
      setMonthlyFinanceUpdatedAt(Date.now());
      if (monthlyFinanceManualTriggerRef.current) {
        toast.success('IVA y margen actualizado.', 'admin-monthly-finance');
      }
    } catch (error) {
      setMonthlyFinance(null);
      setMonthlyFinanceError(friendlyFetchError(error, 'No se pudo cargar IVA/margen mensual'));
      if (monthlyFinanceManualTriggerRef.current) {
        toast.error(friendlyFetchError(error, 'No se pudo cargar IVA/margen mensual'), 'admin-monthly-finance');
      }
    } finally {
      setLoadingMonthlyFinance(false);
      monthlyFinanceManualTriggerRef.current = false;
    }
  }, [usingOfflineDemo, toast]);

  const handleMonthlyFinanceClick = useCallback(() => {
    monthlyFinanceManualTriggerRef.current = true;
    return fetchMonthlyFinance();
  }, [fetchMonthlyFinance]);

  const monthlyFinanceUpdatedLabel = useCallback(() => {
    if (!monthlyFinanceUpdatedAt) return '';
    try {
      const time = new Date(monthlyFinanceUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      return `Actualizado ${time}`;
    } catch {
      return 'Actualizado';
    }
  }, [monthlyFinanceUpdatedAt]);

  const fetchSmsBalance = useCallback(async () => {
    if (usingOfflineDemo) {
      setSmsBalance(null);
      setSmsBalanceError('Modo demostración: saldo SMS no disponible sin API.');
      return;
    }
    setLoadingSmsBalance(true);
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/sms-balance`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `Error ${response.status}`);
      }
      setSmsBalance(data);
      setSmsBalanceError(data.success ? '' : (data.error || 'No se pudo consultar saldo SMS'));
      if (smsBalanceManualTriggerRef.current) {
        toast.success('Saldo SMS actualizado.', 'admin-sms-balance');
      }
    } catch (error) {
      setSmsBalance(null);
      const msg = friendlyFetchError(error, 'No se pudo cargar saldo SMS');
      setSmsBalanceError(msg);
      if (smsBalanceManualTriggerRef.current) {
        toast.error(msg, 'admin-sms-balance');
      }
    } finally {
      setLoadingSmsBalance(false);
      smsBalanceManualTriggerRef.current = false;
    }
  }, [usingOfflineDemo, toast]);

  const downloadPlanillaPagos = async () => {
    try {
      const url = `${BACKEND_URL}/api/admin/reports/payments-planilla?format=csv&only_approved=1`;
      const res = await fetchWithAuth(url);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `maqgo_planilla_pagos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
      toast.error(friendlyFetchError(e, 'Error al descargar planilla'), 'admin-planilla');
    }
  };

  const parseEmailsInput = useCallback((raw) => {
    return String(raw || '')
      .replace(/;/g, ',')
      .split(/[\s,]+/g)
      .map((t) => t.trim())
      .filter(Boolean);
  }, []);

  const loadReportSubscriptions = useCallback(async () => {
    if (usingOfflineDemo) return;
    setReportSubsLoading(true);
    try {
      const DEFAULT_REPORT_EMAIL = 'tomas@maqgo.cl';
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/subscriptions`, { method: 'GET' }, 12000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Error ${res.status}`);
      }
      const weekly = Array.isArray(data.weekly_emails) ? data.weekly_emails : [];
      const monthly = Array.isArray(data.monthly_emails) ? data.monthly_emails : [];
      setWeeklyReportEmailsText((weekly.length ? weekly : [DEFAULT_REPORT_EMAIL]).join('\n'));
      setMonthlyReportEmailsText((monthly.length ? monthly : [DEFAULT_REPORT_EMAIL]).join('\n'));
      setReportSubsMeta({
        updatedAt: data.updated_at || '',
        source: data.source || null,
      });
    } catch (e) {
      toast.error(friendlyFetchError(e, 'No se pudieron cargar los destinatarios'), 'admin-report-subs');
    } finally {
      setReportSubsLoading(false);
    }
  }, [usingOfflineDemo, toast]);

  const openReportSubscriptions = useCallback(() => {
    if (usingOfflineDemo) {
      toast.warning('Sin conexión al servidor: no se puede editar destinatarios.');
      return;
    }
    setShowReportSubscriptions(true);
    loadReportSubscriptions();
  }, [usingOfflineDemo, loadReportSubscriptions, toast]);

  useEffect(() => {
    try {
      const shouldOpen = localStorage.getItem('maqgo_open_report_subscriptions') === '1';
      if (!shouldOpen) return;
      localStorage.removeItem('maqgo_open_report_subscriptions');
      openReportSubscriptions();
    } catch {
      void 0;
    }
  }, [openReportSubscriptions]);

  useEffect(() => {
    if (usingOfflineDemo) return;
    if (actionsLocked) return;
    if (reportSubsLoaded) return;
    if (reportSubsLoading) return;
    setReportSubsLoaded(true);
    loadReportSubscriptions();
  }, [actionsLocked, loadReportSubscriptions, reportSubsLoaded, reportSubsLoading, usingOfflineDemo]);

  const closeReportSubscriptions = useCallback(() => {
    setShowReportSubscriptions(false);
  }, []);

  const saveReportSubscriptions = useCallback(async () => {
    if (usingOfflineDemo) return;
    setReportSubsLoading(true);
    try {
      const weekly = parseEmailsInput(weeklyReportEmailsText);
      const monthly = parseEmailsInput(monthlyReportEmailsText);
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/reports/subscriptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekly_emails: weekly, monthly_emails: monthly }),
        },
        12000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Error ${res.status}`);
      }
      setWeeklyReportEmailsText((data.weekly_emails || []).join('\n'));
      setMonthlyReportEmailsText((data.monthly_emails || []).join('\n'));
      setReportSubsMeta({ updatedAt: data.updated_at || '', source: { weekly: 'db', monthly: 'db' } });
      toast.success('Destinatarios guardados.', 'admin-report-subs');
    } catch (e) {
      toast.error(friendlyFetchError(e, 'No se pudieron guardar los destinatarios'), 'admin-report-subs');
    } finally {
      setReportSubsLoading(false);
    }
  }, [usingOfflineDemo, monthlyReportEmailsText, parseEmailsInput, toast, weeklyReportEmailsText]);

  const sendWeeklyReportTestEmail = useCallback(async () => {
    if (usingOfflineDemo) return;
    const list = parseEmailsInput(weeklyReportEmailsText);
    if (!list.length) {
      toast.error('Falta email para enviar prueba.', 'admin-report-test');
      return;
    }
    setReportTestSending('weekly');
    try {
      const url = `${BACKEND_URL}/api/admin/reports/weekly/send-email?email=${encodeURIComponent(list.join(','))}&weeks_ago=1&dry_run=false&async_send=false`;
      const res = await fetchWithAuth(url, { method: 'POST' }, 60000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      const sentTo = (data.to || []).join(', ') || list.join(', ');
      const meta = data.provider ? ` (${data.provider}${data.provider_id ? `:${data.provider_id}` : ''})` : '';
      toast.success(`Prueba semanal enviada a: ${sentTo}${meta}`, 'admin-report-test');
    } catch (e) {
      toast.error(friendlyFetchError(e, 'No se pudo enviar prueba semanal'), 'admin-report-test');
    } finally {
      setReportTestSending('');
    }
  }, [parseEmailsInput, usingOfflineDemo, weeklyReportEmailsText, toast]);

  const sendMonthlyReportTestEmail = useCallback(async () => {
    if (usingOfflineDemo) return;
    const list = parseEmailsInput(monthlyReportEmailsText);
    if (!list.length) {
      toast.error('Falta email para enviar prueba.', 'admin-report-test');
      return;
    }
    setReportTestSending('monthly');
    try {
      const url = `${BACKEND_URL}/api/admin/reports/monthly/send-email?email=${encodeURIComponent(list.join(','))}&months_ago=1&dry_run=false&async_send=false`;
      const res = await fetchWithAuth(url, { method: 'POST' }, 60000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      const sentTo = (data.to || []).join(', ') || list.join(', ');
      const meta = data.provider ? ` (${data.provider}${data.provider_id ? `:${data.provider_id}` : ''})` : '';
      toast.success(`Prueba mensual enviada a: ${sentTo}${meta}`, 'admin-report-test');
    } catch (e) {
      toast.error(friendlyFetchError(e, 'No se pudo enviar prueba mensual'), 'admin-report-test');
    } finally {
      setReportTestSending('');
    }
  }, [monthlyReportEmailsText, parseEmailsInput, toast, usingOfflineDemo]);

  useEffect(() => {
    fetchMonthlyFinance();
  }, [fetchMonthlyFinance]);

  useEffect(() => {
    fetchSmsBalance();
  }, [fetchSmsBalance]);

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const maxPage = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const rangeStart = listTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = listTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + services.length;


  // Conteo de eventos urgentes para campana:
  // - Pagos vencidos sin factura cliente (maqgo_to_invoice_overdue)
  // - Reclamos / disputas (disputed)
  // - Reservas donde MAQGO debe facturar al cliente (maqgo_to_invoice)
  // - Facturas subidas pero aún por pagar (invoiced)
  // - Saldo SMS bajo (is_low_balance desde API admin/sms-balance)
  const urgentFromStats =
    (stats.maqgo_to_invoice_overdue || 0) +
    (stats.disputed || 0) +
    (stats.maqgo_to_invoice || 0) +
    (stats.invoiced || 0);
  const urgentFromSms = smsBalance?.is_low_balance ? 1 : 0;
  const urgentCount = urgentFromStats + urgentFromSms;
  const urgentItems = [
    {
      key: 'maqgo_to_invoice_overdue',
      count: stats.maqgo_to_invoice_overdue || 0,
      title: 'Pagos vencidos sin factura al cliente',
      hint: 'Meses anteriores: riesgo de pérdida de caja.',
    },
    {
      key: 'disputed',
      count: stats.disputed || 0,
      title: 'Reclamos por resolver',
      hint: 'Servicios en disputa con cliente/proveedor.',
    },
    {
      key: 'maqgo_to_invoice',
      count: stats.maqgo_to_invoice || 0,
      title: 'MAQGO debe facturar al cliente',
      hint: 'Dentro del mes: emitir factura MAQGO para cobrar.',
    },
    {
      key: 'invoiced',
      count: stats.invoiced || 0,
      title: 'Facturas subidas por pagar',
      hint: 'Proveedor subió factura: revisar y marcar como pagado.',
    },
    {
      key: 'sms_low_balance',
      count: smsBalance?.is_low_balance ? 1 : 0,
      title: 'Saldo SMS bajo',
      hint: smsBalance?.provider ? `${smsBalance.provider}: ${smsBalance.remaining ?? '-'} restante` : 'Revisar saldo SMS en el panel.',
    },
  ].filter((it) => (it.count || 0) > 0);

  const fetchWeeklyReportGuarded = async (weeksAgo = 0) => {
    if (actionsLocked) {
      toast.warning('Sin conexión al servidor: no se puede cargar el informe.');
      return;
    }
    return fetchWeeklyReport(weeksAgo);
  };

  const downloadWeeklyPdfGuarded = async (weeksAgo = 1) => {
    if (actionsLocked) {
      toast.warning('Sin conexión al servidor: no se puede descargar el PDF.');
      return;
    }
    try {
      const url = `${BACKEND_URL}/api/admin/reports/weekly?weeks_ago=${weeksAgo}&format=pdf`;
      const res = await fetchWithAuth(url, {}, 30000);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = weeksAgo === 1 ? 'maqgo_weekly_report_semana_anterior.pdf' : 'maqgo_weekly_report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error(error);
      toast.error(friendlyFetchError(error, 'No se pudo descargar el PDF semanal'), 'admin-weekly-pdf');
    }
  };

  const downloadPlanillaGuarded = async () => {
    if (actionsLocked) {
      toast.warning('Sin conexión al servidor: no hay planilla para descargar.');
      return;
    }
    return downloadPlanillaPagos();
  };

  return (
    <div className="maqgo-admin-page" style={{ 
      minHeight: '100dvh', 
      background: ADMIN_THEME.appBg,
      color: '#fff',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Header */}
      <div className="maqgo-admin-topbar" style={{
        background: ADMIN_THEME.panelBg,
        padding: '20px 24px',
        borderBottom: `1px solid ${ADMIN_THEME.border}`
      }}>
        <div style={{ 
          maxWidth: 1400, 
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/welcome', { replace: false })}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'transparent',
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Volver a portada"
              title="Volver a portada"
            >
              <BackArrowIcon size={18} style={{ display: 'block' }} />
            </button>
            <MaqgoLogo size="small" style={{ margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Campana de alertas urgentes */}
            <button
              type="button"
              aria-label={urgentCount > 0 ? `Tienes ${urgentCount} alertas urgentes` : 'Sin alertas urgentes'}
              onClick={() => {
                if (urgentCount > 0) setShowUrgentModal(true);
              }}
              disabled={urgentCount === 0}
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: '999px',
                border: urgentCount > 0 ? '1px solid rgba(229,115,115,0.6)' : '1px solid rgba(255,255,255,0.2)',
                background: urgentCount > 0 ? 'rgba(229,115,115,0.14)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: urgentCount > 0 ? 'pointer' : 'default',
                opacity: urgentCount > 0 ? 1 : 0.6,
              }}
            >
              {/* Ícono campana */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3C9.79086 3 8 4.79086 8 7V8.2C8 9.09411 7.70361 9.96449 7.1577 10.7L6.44721 11.6524C5.53397 12.872 6.4022 14.6 7.92462 14.6H16.0754C17.5978 14.6 18.466 12.872 17.5528 11.6524L16.8423 10.7C16.2964 9.96449 16 9.09411 16 8.2V7C16 4.79086 14.2091 3 12 3Z"
                  stroke={urgentCount > 0 ? '#E57373' : '#FFFFFF'}
                  strokeWidth="1.6"
                />
                <path
                  d="M10 16C10.1709 17.1652 10.9882 18 12 18C13.0118 18 13.8291 17.1652 14 16"
                  stroke={urgentCount > 0 ? '#E57373' : '#FFFFFF'}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {urgentCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: '#E57373',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}
                >
                  {urgentCount > 9 ? '9+' : urgentCount}
                </span>
              )}
            </button>
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: 4,
                borderRadius: 999,
                border: `1px solid ${ADMIN_THEME.border}`,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <button
                type="button"
                onClick={() => setAdminArea('today')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                    background: adminArea === 'today' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: adminArea === 'today' ? '#fff' : 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setAdminArea('system')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                    background: adminArea === 'system' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: adminArea === 'system' ? '#fff' : 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Operación
              </button>
                <button
                  type="button"
                  onClick={() => setAdminArea('platform')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: 'none',
                    background: adminArea === 'platform' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: adminArea === 'platform' ? '#fff' : 'rgba(255,255,255,0.75)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Plataforma
                </button>
              <button
                type="button"
                onClick={() => setAdminArea('access')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: adminArea === 'access' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: adminArea === 'access' ? '#fff' : 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Acceso
              </button>
            </div>
            <button
              type="button"
              disabled={actionsLocked}
              title={actionsLocked ? 'Requiere conexión al API' : undefined}
              onClick={() => !actionsLocked && setAdminArea('money')}
              style={{
                padding: '8px 16px',
                background: adminArea === 'money' ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${adminArea === 'money' ? ADMIN_THEME.borderStrong : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 8,
                color: adminArea === 'money' ? '#fff' : 'rgba(255,255,255,0.85)',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 800,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              Facturación y pagos
            </button>
            <button
              type="button"
              disabled={actionsLocked}
              title={actionsLocked ? 'Requiere conexión al API' : undefined}
              onClick={() => !actionsLocked && navigate('/admin/users')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              Usuarios
            </button>
            <button
              type="button"
              disabled={actionsLocked}
              title={actionsLocked ? 'Requiere conexión al API' : undefined}
              onClick={() => !actionsLocked && navigate('/admin/pricing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              Precios
            </button>
            <button
              type="button"
              disabled={actionsLocked}
              title={actionsLocked ? 'Requiere conexión al API' : 'Inversión semanal por canal, audiencia y CAC'}
              onClick={() => !actionsLocked && navigate('/admin/marketing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(126, 184, 212, 0.45)',
                borderRadius: 8,
                color: ADMIN_PALETTE.info,
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              Marketing & CAC
            </button>
            <button
              type="button"
              disabled={actionsLocked}
              title={actionsLocked ? 'Requiere conexión al API' : 'Cerebro comercial MAQGO'}
              onClick={() => !actionsLocked && navigate('/admin/growth-ai')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(236, 104, 25, 0.45)',
                borderRadius: 8,
                color: ADMIN_PALETTE.brand,
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              Growth AI
            </button>
            <button
              type="button"
              onClick={downloadPlanillaGuarded}
              disabled={actionsLocked}
              title={actionsLocked ? 'Sin conexión al servidor' : undefined}
              style={{
                padding: '8px 16px',
                background: stats.invoiced > 0 ? 'rgba(236, 104, 25, 0.22)' : 'transparent',
                border: `1px solid ${stats.invoiced > 0 ? 'rgba(236, 104, 25, 0.55)' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 8,
                color: stats.invoiced > 0 ? '#fff' : 'rgba(255,255,255,0.8)',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: actionsLocked ? 0.45 : 1,
              }}
            >
              📥 Planilla pagos
            </button>
            <button
              type="button"
              id="admin-operacion"
              onClick={() => fetchWeeklyReportGuarded(0)}
              disabled={loadingReport || actionsLocked}
              style={{
                padding: '8px 16px',
                background: '#EC6819',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: loadingReport || actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: actionsLocked ? 0.45 : 1,
              }}
              title="Informe semanal de operación (semana actual)"
            >
              {loadingReport ? 'Cargando...' : '📋 Operación (semana actual)'}
            </button>
            <button
              type="button"
              id="admin-operacion-prev-week"
              onClick={() => fetchWeeklyReportGuarded(1)}
              disabled={loadingReport || actionsLocked}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                cursor: loadingReport || actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: actionsLocked ? 0.45 : 1,
              }}
              title="Informe listo para imprimir los lunes a las 10: semana anterior completa"
            >
              {loadingReport ? 'Cargando...' : '🖨 Weekly report (semana anterior)'}
            </button>
            <button
              type="button"
              onClick={() => downloadWeeklyPdfGuarded(1)}
              disabled={actionsLocked}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(129, 199, 132, 0.5)',
                borderRadius: 8,
                color: '#81C784',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: actionsLocked ? 0.45 : 1,
              }}
              title="Descargar informe semanal en PDF (semana anterior, listo para imprimir)"
            >
              🖨 PDF semana anterior
            </button>
            <button
              type="button"
              onClick={openReportSubscriptions}
              disabled={actionsLocked}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                cursor: actionsLocked ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: actionsLocked ? 0.45 : 1,
              }}
              title={actionsLocked ? 'Sin conexión al servidor' : 'Configurar destinatarios de reportes semanales y mensuales'}
            >
              📧 Destinatarios
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={() => navigate('/welcome?preview=1')}
              aria-label="Vista previa de la portada pública MAQGO (sin CTAs de mercado)"
            >
              Ver portada pública
            </button>
            <button
              onClick={() => {
                clearLocalSession();
                navigate('/welcome', { replace: true });
              }}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: `1px solid rgba(229, 115, 115, 0.45)`,
                borderRadius: 8,
                color: ADMIN_PALETTE.danger,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 1400, margin: '6px auto 0' }}>
          <div className="maqgo-admin-subtitle" style={{ color: ADMIN_THEME.textMuted }}>
            Panel interno: operación, reservas y facturación.
          </div>
          {usingOfflineDemo && (
            <p
              style={{
                color: '#E8A34B',
                fontSize: 12,
                fontWeight: 700,
                margin: '8px 0 0',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Datos de demostración — no operativo
            </p>
          )}
        </div>
      </div>

      {showUrgentModal && (
        <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
          <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 620px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>Alertas urgentes</h3>
              <button
                type="button"
                onClick={() => setShowUrgentModal(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: `1px solid ${ADMIN_THEME.borderStrong}`,
                  color: 'rgba(255,255,255,0.9)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cerrar
              </button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {urgentItems.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 12, background: ADMIN_THEME.panelBgSoft, border: `1px solid ${ADMIN_THEME.border}` }}>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>Sin alertas</div>
                  <div style={{ fontSize: 12, color: ADMIN_THEME.textMuted, marginTop: 4 }}>No hay pendientes urgentes en este momento.</div>
                </div>
              ) : (
                urgentItems.map((it) => (
                  <div
                    key={it.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: 14,
                      borderRadius: 12,
                      background: ADMIN_THEME.panelBgSoft,
                      border: `1px solid ${ADMIN_THEME.border}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 26,
                            height: 26,
                            padding: '0 8px',
                            borderRadius: 999,
                            background: 'rgba(229,115,115,0.2)',
                            border: '1px solid rgba(229,115,115,0.55)',
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {it.count}
                        </span>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.title}
                        </div>
                      </div>
                      {it.hint && <div style={{ marginTop: 6, fontSize: 12, color: ADMIN_THEME.textMuted }}>{it.hint}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {it.key !== 'sms_low_balance' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPage(1);
                            setFilter(it.key);
                            setShowUrgentModal(false);
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: ADMIN_PALETTE.brand,
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 800,
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Ver lista
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            smsBalanceManualTriggerRef.current = true;
                            fetchSmsBalance();
                          }}
                          disabled={loadingSmsBalance || actionsLocked}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.08)',
                            border: `1px solid ${ADMIN_THEME.borderStrong}`,
                            color: '#fff',
                            cursor: loadingSmsBalance || actionsLocked ? 'default' : 'pointer',
                            opacity: loadingSmsBalance || actionsLocked ? 0.6 : 1,
                            fontWeight: 800,
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {loadingSmsBalance ? 'Actualizando…' : 'Actualizar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {adminArea === 'money' && (
          <div
            style={{
              marginBottom: 20,
              padding: '16px 18px',
              borderRadius: 14,
              background: ADMIN_THEME.panelBg,
              border: `1px solid ${ADMIN_THEME.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 260 }}>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.4 }}>Destinatarios de reportes</div>
                <div style={{ color: ADMIN_THEME.textMuted, fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                  <div><span style={{ color: 'rgba(255,255,255,0.82)' }}>Semanal:</span> {parseEmailsInput(weeklyReportEmailsText).join(', ') || '—'}</div>
                  <div><span style={{ color: 'rgba(255,255,255,0.82)' }}>Mensual:</span> {parseEmailsInput(monthlyReportEmailsText).join(', ') || '—'}</div>
                  {reportSubsMeta?.updatedAt ? (
                    <div style={{ marginTop: 6 }}>
                      Última actualización: {String(reportSubsMeta.updatedAt).slice(0, 19)}
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={openReportSubscriptions}
                  disabled={actionsLocked || usingOfflineDemo}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: `1px solid ${ADMIN_THEME.borderStrong}`,
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || usingOfflineDemo ? 'not-allowed' : 'pointer',
                    opacity: actionsLocked || usingOfflineDemo ? 0.6 : 1,
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={sendWeeklyReportTestEmail}
                  disabled={actionsLocked || usingOfflineDemo || reportTestSending === 'weekly'}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid rgba(236, 104, 25, 0.55)',
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || usingOfflineDemo || reportTestSending === 'weekly' ? 'not-allowed' : 'pointer',
                    opacity: actionsLocked || usingOfflineDemo ? 0.6 : 1,
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reportTestSending === 'weekly' ? 'Enviando…' : 'Prueba semanal'}
                </button>
                <button
                  type="button"
                  onClick={sendMonthlyReportTestEmail}
                  disabled={actionsLocked || usingOfflineDemo || reportTestSending === 'monthly'}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid rgba(236, 104, 25, 0.55)',
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || usingOfflineDemo || reportTestSending === 'monthly' ? 'not-allowed' : 'pointer',
                    opacity: actionsLocked || usingOfflineDemo ? 0.6 : 1,
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reportTestSending === 'monthly' ? 'Enviando…' : 'Prueba mensual'}
                </button>
              </div>
            </div>
          </div>
        )}

        {adminArea === 'today' && (
        <div
          style={{
            marginBottom: 20,
            padding: '16px 18px',
            borderRadius: 14,
            background: ADMIN_THEME.panelBg,
            border: `1px solid ${ADMIN_THEME.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.4 }}>
                Solicitudes en vivo (service_requests)
              </div>
              <div style={{ color: ADMIN_THEME.textMuted, fontSize: 12, marginTop: 4 }}>
                {liveRequestsUpdatedAt ? `Actualizado: ${liveRequestsUpdatedAt.toLocaleTimeString('es-CL')}` : 'Cargando…'}
              </div>
            </div>
            <button
              type="button"
              onClick={fetchLiveRequests}
              disabled={liveRequestsLoading}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                borderRadius: 10,
                color: '#fff',
                cursor: liveRequestsLoading ? 'default' : 'pointer',
                opacity: liveRequestsLoading ? 0.6 : 1,
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
            >
              {liveRequestsLoading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {liveRequestsError && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(229,115,115,0.12)',
                border: '1px solid rgba(229,115,115,0.35)',
                color: 'rgba(255,255,255,0.95)',
                fontSize: 13,
              }}
            >
              {liveRequestsError}
            </div>
          )}

          {!liveRequestsLoading && !liveRequestsError && (!Array.isArray(liveRequests) || liveRequests.length === 0) && (
            <div style={{ marginTop: 12, color: ADMIN_THEME.textMuted, fontSize: 13 }}>
              No hay solicitudes activas (matching / offer_sent / confirmed / in_progress).
            </div>
          )}

          {Array.isArray(liveRequests) && liveRequests.length > 0 && (
            <div style={{ marginTop: 14, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.8)' }}>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Estado</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Tipo</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Proveedor</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Pago</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Origen/ETA</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Oferta</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {liveRequests.slice(0, 200).map((r) => {
                    const statusTxt = String(r?.status || '');
                    const reservation = String(r?.reservationType || '');
                    const provider = String(r?.providerId || r?.currentOfferId || '');
                    const acceptedRole = String(r?.acceptedByRole || '');
                    const paymentStatus = String(r?.paymentStatus || '');
                    const pe = typeof r?.providerEarnings === 'number' ? r.providerEarnings : null;
                    const total = typeof r?.totalAmount === 'number' ? r.totalAmount : null;
                    const eta = r?.etaCommitMinutes;
                    const windowMin = r?.urgencyWindowMinutes;
                    const hasDeparture =
                      r?.confirmedDepartureLocation && typeof r.confirmedDepartureLocation === 'object'
                        ? Boolean(r.confirmedDepartureLocation.lat != null && r.confirmedDepartureLocation.lng != null)
                        : false;
                    const exp = r?.offerExpiresAt ? new Date(String(r.offerExpiresAt).replace('Z', '+00:00')) : null;
                    const remainingSec = exp ? Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)) : null;
                    const money = (n) =>
                      typeof n === 'number' ? new Intl.NumberFormat('es-CL').format(Math.round(n)) : '—';
                    return (
                      <tr key={String(r?.id || provider + statusTxt)} style={{ borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 800 }}>{statusTxt || '—'}</div>
                          {acceptedRole && (
                            <div style={{ color: ADMIN_THEME.textMuted, marginTop: 2 }}>accept: {acceptedRole}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          <div>{reservation || '—'}</div>
                          {r?.urgencyType ? (
                            <div style={{ color: ADMIN_THEME.textMuted, marginTop: 2 }}>{String(r.urgencyType)}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          <div style={{ fontFamily: 'monospace' }}>{provider ? provider.slice(0, 10) : '—'}</div>
                          {r?.currentOfferId && (
                            <div style={{ color: ADMIN_THEME.textMuted, marginTop: 2 }}>
                              offer: {String(r.currentOfferId).slice(0, 10)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          <div>Gana: ${money(pe)}</div>
                          <div style={{ color: ADMIN_THEME.textMuted, marginTop: 2 }}>
                            total: ${money(total)} · {paymentStatus || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          <div>{hasDeparture ? 'origen ✓' : 'origen —'}</div>
                          <div style={{ color: ADMIN_THEME.textMuted, marginTop: 2 }}>
                            ETA: {typeof eta === 'number' ? `${eta}m` : '—'}
                            {typeof windowMin === 'number' ? ` / win ${windowMin}m` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                          {statusTxt === 'offer_sent' && remainingSec != null ? (
                            <div style={{ fontWeight: 800 }}>{remainingSec}s</div>
                          ) : (
                            <div style={{ color: ADMIN_THEME.textMuted }}>—</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 6px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {statusTxt === 'offer_sent' && (
                            <button
                              type="button"
                              onClick={() => runLiveRequestAction(String(r?.id || ''), 'expire')}
                              disabled={actionsLocked}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(217,161,90,0.15)',
                                border: '1px solid rgba(217,161,90,0.35)',
                                borderRadius: 10,
                                color: '#fff',
                                cursor: actionsLocked ? 'default' : 'pointer',
                                marginRight: 8,
                                fontSize: 12,
                              }}
                            >
                              Expirar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => runLiveRequestAction(String(r?.id || ''), 'retry')}
                            disabled={actionsLocked}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(126,184,212,0.12)',
                              border: '1px solid rgba(126,184,212,0.32)',
                              borderRadius: 10,
                              color: '#fff',
                              cursor: actionsLocked ? 'default' : 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Re-match
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Bloque: Diagnóstico de conexión / demo */}
        {usingOfflineDemo && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(232, 163, 75, 0.15)',
              border: '1px solid rgba(232, 163, 75, 0.45)',
              color: 'rgba(255,255,255,0.95)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#E8A34B', letterSpacing: 0.5 }}>
              DATOS DE DEMOSTRACIÓN
            </p>
            <p style={{ margin: '0 0 10px' }}>
              Sin conexión al listado admin o modo sin API. Las filas y métricas son de ejemplo; no reflejan producción.
              API configurado:{' '}
              <code style={{ color: '#7EB8D4' }}>{maskBackendHost(BACKEND_URL)}</code>.
            </p>
            {healthSnapshot?.ok ? (
              <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.85)' }}>
                <strong>/healthz responde</strong> ({healthSnapshot.latencyMs != null ? `${healthSnapshot.latencyMs} ms` : 'OK'}
                ). El fallo está en rutas autenticadas o CORS del listado — revisa token,{' '}
                <code style={{ color: '#7EB8D4' }}>CORS_ORIGINS</code> y despliegue del backend.
              </p>
            ) : healthSnapshot ? (
              <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.85)' }}>
                <strong>/healthz no OK</strong>
                {healthSnapshot.error ? ` (${healthSnapshot.error})` : ''}. Revisa DNS (sin NXDOMAIN),{' '}
                <code style={{ color: '#7EB8D4' }}>REACT_APP_BACKEND_URL</code> en Vercel y redeploy del frontend tras
                cambiar env.
              </p>
            ) : (
              <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                Comprobando salud pública del backend…
              </p>
            )}
            <button
              type="button"
              className="maqgo-btn-primary"
              onClick={retryConnection}
              disabled={loading}
              style={{ padding: '10px 18px', fontWeight: 600, marginTop: 4 }}
            >
              {loading ? 'Reintentando…' : 'Reintentar conexión'}
            </button>
          </div>
        )}

        {listHttpError && !usingOfflineDemo && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(229, 115, 115, 0.12)',
              border: '1px solid rgba(229, 115, 115, 0.45)',
              color: 'rgba(255,255,255,0.95)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: '#E57373' }}>
              Error al cargar el panel{listHttpError.status != null ? ` (${listHttpError.status})` : ''}
            </strong>
            <p style={{ margin: '8px 0 12px' }}>{listHttpError.message}</p>
            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={retryConnection}
              disabled={loading}
              style={{ padding: '10px 18px' }}
            >
              {loading ? 'Reintentando…' : 'Reintentar conexión'}
            </button>
          </div>
        )}

        {adminArea === 'today' && (
          <>
            <h2
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 700,
                margin: '0 0 8px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Qué tengo que hacer hoy
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                margin: '0 0 12px',
              }}
            >
              Mira primero las reservas con acción pendiente; después puedes revisar métricas y salud del sistema.
            </p>

            {!usingOfflineDemo && (
              (stats.maqgo_to_invoice_overdue || 0) > 0 ||
              stats.invoiced > 0 ||
              stats.pending_review > 0 ||
              (stats.maqgo_to_invoice || 0) > 0
            ) && (
              <div
                onClick={() => {
                  setPage(1);
                  setFilter(
                    (stats.maqgo_to_invoice_overdue || 0) > 0
                      ? 'maqgo_to_invoice_overdue'
                      : stats.invoiced > 0
                        ? 'invoiced'
                        : (stats.maqgo_to_invoice || 0) > 0
                          ? 'maqgo_to_invoice'
                          : 'pending_review'
                  );
                }}
                style={{
                  background: (stats.maqgo_to_invoice_overdue || 0) > 0
                    ? 'linear-gradient(135deg, rgba(229, 115, 115, 0.18) 0%, rgba(229, 115, 115, 0.05) 100%)'
                    : stats.invoiced > 0
                      ? 'linear-gradient(135deg, rgba(236, 104, 25, 0.18) 0%, rgba(236, 104, 25, 0.05) 100%)'
                      : (stats.maqgo_to_invoice || 0) > 0
                        ? 'linear-gradient(135deg, rgba(126, 184, 212, 0.16) 0%, rgba(126, 184, 212, 0.05) 100%)'
                        : 'linear-gradient(135deg, rgba(232, 163, 75, 0.18) 0%, rgba(232, 163, 75, 0.05) 100%)',
                  border: `1px solid ${
                    (stats.maqgo_to_invoice_overdue || 0) > 0
                      ? 'rgba(229, 115, 115, 0.45)'
                      : stats.invoiced > 0
                        ? 'rgba(236, 104, 25, 0.4)'
                        : (stats.maqgo_to_invoice || 0) > 0
                          ? 'rgba(126, 184, 212, 0.4)'
                          : 'rgba(232, 163, 75, 0.4)'
                  }`,
                  borderRadius: 12,
                  padding: '14px 20px',
                  marginBottom: 24,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <span style={{ fontSize: 28 }}>
                  {(stats.maqgo_to_invoice_overdue || 0) > 0 ? '🚨' : stats.invoiced > 0 ? '📄' : (stats.maqgo_to_invoice || 0) > 0 ? '📤' : '⏳'}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>
                    {(stats.maqgo_to_invoice_overdue || 0) > 0
                      ? `ALERTA: ${stats.maqgo_to_invoice_overdue} pago(s) de meses anteriores sin factura cliente MAQGO`
                      : stats.invoiced > 0
                        ? `${stats.invoiced} factura(s) subida(s) · Revisar y marcar como pagado`
                        : (stats.maqgo_to_invoice || 0) > 0
                          ? `MAQGO debe facturar al cliente: ${stats.maqgo_to_invoice} reserva(s) (dentro del mes)`
                          : `${stats.pending_review} reserva(s) por aprobar`
                    }
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.75)', margin: '4px 0 0', fontSize: 12 }}>
                    Toca para ir directamente
                  </p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>→</span>
              </div>
            )}

            {!usingOfflineDemo && !loading && (
              (stats.maqgo_to_invoice_overdue || 0) === 0 &&
              (stats.invoiced || 0) === 0 &&
              (stats.pending_review || 0) === 0 &&
              (stats.maqgo_to_invoice || 0) === 0 &&
              (stats.disputed || 0) === 0
            ) && (
              <div
                style={{
                  background: ADMIN_THEME.panelBg,
                  borderRadius: 12,
                  padding: '14px 18px',
                  border: `1px solid ${ADMIN_THEME.border}`,
                  marginBottom: 24,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>
                  No hay acciones pendientes
                </div>
                <div style={{ fontSize: 12, color: ADMIN_THEME.textMuted }}>
                  {services?.length ? `${services.length} reservas cargadas` : 'Sin reservas en la vista actual'}
                </div>
              </div>
            )}
          </>
        )}

        {adminArea === 'money' && (
          <>
            <h2
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 700,
                margin: '8px 0 8px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Facturación y pagos
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                margin: '0 0 12px',
              }}
            >
              Ventas, comisiones, IVA estimado, planilla de pagos y saldo de SMS.
            </p>

        <div style={{ 
          background: ADMIN_THEME.panelBg, 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 24,
          border: `1px solid ${ADMIN_THEME.border}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <h2 style={{ 
              color: '#EC6819', 
              fontSize: 16, 
              fontWeight: 700, 
              margin: 0,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              💰 Métricas Financieras MAQGO <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 400 }}>(Neto sin IVA)</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={handleMonthlyFinanceClick}
                disabled={loadingMonthlyFinance || actionsLocked}
                title={actionsLocked ? 'Requiere conexión al API' : 'Actualizar IVA y margen mensual'}
                style={{ opacity: loadingMonthlyFinance || actionsLocked ? 0.6 : 1 }}
              >
                {loadingMonthlyFinance ? 'Actualizando...' : 'IVA y margen (mes)'}
              </button>
              {monthlyFinanceUpdatedAt ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                  {monthlyFinanceUpdatedLabel()}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                background: smsBalance?.is_low_balance
                  ? 'rgba(229, 115, 115, 0.14)'
                  : 'rgba(126, 184, 212, 0.12)',
                border: smsBalance?.is_low_balance
                  ? '1px solid rgba(229, 115, 115, 0.4)'
                  : '1px solid rgba(126, 184, 212, 0.35)',
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>
                  Saldo SMS (LabsMobile)
                </p>
                <p style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {smsBalance?.credits != null ? `${Number(smsBalance.credits).toFixed(2)} créditos` : '—'}
                </p>
                <p style={{ margin: '4px 0 0', color: smsBalance?.is_low_balance ? ADMIN_PALETTE.danger : 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                  Umbral alerta: {smsBalance?.low_balance_threshold ?? '300'} créditos
                  {smsBalance?.is_low_balance ? ' · RECARGAR HOY' : ''}
                </p>
                {smsBalanceError && (
                  <p style={{ margin: '6px 0 0', color: '#E8A34B', fontSize: 12 }}>{smsBalanceError}</p>
                )}
              </div>
              <button
                type="button"
                className="maqgo-btn-secondary"
                onClick={() => {
                  smsBalanceManualTriggerRef.current = true;
                  fetchSmsBalance();
                }}
                disabled={loadingSmsBalance || actionsLocked}
                title={actionsLocked ? 'Requiere conexión al API' : 'Actualizar saldo de créditos SMS'}
                style={{ opacity: loadingSmsBalance || actionsLocked ? 0.6 : 1 }}
              >
                {loadingSmsBalance ? 'Actualizando...' : 'Actualizar saldo SMS'}
              </button>
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: 16 
          }}>
            {/* Ventas Totales Netas */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Ventas Netas
              </p>
              <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.totalNet)}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: '4px 0 0' }}>
                Bruto: {formatPrice(finances.totalGross)}
              </p>
            </div>

            {/* Comisión Cliente */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Comisión Cliente
              </p>
              <p style={{ color: ADMIN_PALETTE.info, fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.clientCommission)}
              </p>
            </div>

            {/* Comisión Proveedor */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Comisión Proveedor
              </p>
              <p style={{ color: ADMIN_PALETTE.warning, fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.providerCommission)}
              </p>
            </div>

            {/* Comisión Total MAQGO */}
            <div style={{ background: 'linear-gradient(135deg, #EC6819 0%, #D4550C 100%)', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Ganancia MAQGO
              </p>
              <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.totalCommission)}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#90BDD3', fontSize: 13, margin: '0 0 10px', fontWeight: 700 }}>
              Conciliación tributaria y margen mensual
            </h3>
            {monthlyFinanceError ? (
              <p style={{ margin: 0, color: '#E8A34B', fontSize: 12, lineHeight: 1.5 }}>{monthlyFinanceError}</p>
            ) : monthlyFinance ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                      IVA débito
                    </p>
                    <p style={{ color: '#fff', fontSize: 21, margin: 0, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(monthlyFinance.iva?.debito)}
                    </p>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                      IVA crédito estimado
                    </p>
                    <p style={{ color: ADMIN_PALETTE.info, fontSize: 21, margin: 0, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(monthlyFinance.iva?.credito_estimado)}
                    </p>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, rgba(232, 163, 75, 0.18) 0%, rgba(232, 163, 75, 0.08) 100%)', borderRadius: 10, padding: 12, border: '1px solid rgba(232, 163, 75, 0.35)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                      IVA neto a pagar (estimado)
                    </p>
                    <p style={{ color: '#E8A34B', fontSize: 22, margin: 0, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(monthlyFinance.iva?.neto_a_pagar_estimado)}
                    </p>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase' }}>
                      Margen contribución
                    </p>
                    <p style={{ color: ADMIN_PALETTE.success, fontSize: 21, margin: 0, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(monthlyFinance.contribution?.margin)}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '4px 0 0' }}>
                      {monthlyFinance.contribution?.margin_pct ?? 0}% sobre venta neta del mes
                    </p>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
                  {monthlyFinance.iva?.warning}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                Cargando conciliación mensual...
              </p>
            )}
          </div>

          {/* Contadores de servicios */}
          <div style={{ 
            display: 'flex', 
            gap: 24, 
            marginTop: 16, 
            paddingTop: 16, 
            borderTop: '1px solid rgba(255,255,255,0.1)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: ADMIN_PALETTE.success, fontSize: 18 }}>✓</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Completados: <strong style={{ color: ADMIN_PALETTE.success }}>{finances.completed}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: ADMIN_PALETTE.danger, fontSize: 18 }}>✕</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Cancelados: <strong style={{ color: ADMIN_PALETTE.danger }}>{finances.cancelled}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: ADMIN_PALETTE.warning, fontSize: 18 }}>⚠</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Reclamos: <strong style={{ color: ADMIN_PALETTE.warning }}>{finances.disputed}</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: 16, 
          marginBottom: 24 
        }}>
          {[
            { key: 'pending_review', label: 'En Revisión', icon: '⏳' },
            { key: 'approved', label: 'Aprobados', icon: '✓' },
            { key: 'invoiced', label: 'Por Pagar', icon: '📄' },
            { key: 'paid', label: 'Pagados', icon: '💰' },
            { key: 'maqgo_to_invoice', label: 'MAQGO → Facturar Cliente', icon: '📤' },
            { key: 'maqgo_to_invoice_overdue', label: 'MAQGO Facturación Vencida', icon: '🚨' },
            { key: 'disputed', label: 'En Disputa', icon: '!' }
          ].map(item => {
            const config =
              STATUS_CONFIG[item.key] ||
              (item.key === 'maqgo_to_invoice'
                ? { color: ADMIN_PALETTE.info, bg: 'rgba(126, 184, 212, 0.12)' }
                : item.key === 'maqgo_to_invoice_overdue'
                  ? { color: ADMIN_PALETTE.danger, bg: 'rgba(229, 115, 115, 0.14)' }
                  : STATUS_CONFIG.disputed);
            return (
              <div
                key={item.key}
                onClick={() => {
                  setPage(1);
                  setFilter(item.key);
                }}
                style={{
                  background: filter === item.key ? config.bg : '#2A2A2A',
                  border: filter === item.key ? `2px solid ${config.color}` : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{item.label}</span>
                </div>
                <p style={{ 
                  color: config.color, 
                  fontSize: 32, 
                  fontWeight: 700, 
                  margin: 0,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {item.key === 'maqgo_to_invoice'
                    ? (stats.maqgo_to_invoice || 0)
                    : item.key === 'maqgo_to_invoice_overdue'
                      ? (stats.maqgo_to_invoice_overdue || 0)
                      : (stats[item.key] || 0)}
                </p>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setFilter('all');
            }}
            style={{
              padding: '8px 16px',
              background: filter === 'all' ? '#EC6819' : 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 20,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            Ver todos ({stats.total || 0})
          </button>
        </div>

        <div style={{
          background: ADMIN_THEME.panelBg,
          borderRadius: 12,
          overflow: 'hidden',
          border: `1px solid ${ADMIN_THEME.border}`
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.3)', borderTopColor: 'var(--maqgo-orange)', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>Cargando reservas...</p>
            </div>
          ) : services.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 40, margin: '0 0 12px' }}>📋</p>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, margin: 0 }}>
                {filter === 'all' 
                  ? 'No hay reservas registradas aún' 
                  : filter === 'maqgo_to_invoice' 
                    ? 'No hay reservas pendientes de facturar al cliente' 
                    : filter === 'maqgo_to_invoice_overdue'
                      ? 'No hay pagos vencidos pendientes de facturar al cliente'
                    : `No hay reservas "${STATUS_CONFIG[filter]?.label || filter}"`}
              </p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 120px 120px 150px',
                gap: 16,
                padding: '14px 20px',
                background: '#1a1a1a',
                fontSize: 12,
                color: 'rgba(255,255,255,0.95)',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                <span>Cliente / Maquinaria</span>
                <span>Fecha</span>
                <span>Monto</span>
                <span>Factura</span>
                <span>Estado</span>
                <span>Acciones</span>
              </div>

              {services.map((service, index) => {
              const status = STATUS_CONFIG[service.status];
              return (
                <div 
                  key={service._id ?? `row-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 120px 120px 150px',
                    gap: 16,
                    padding: '16px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>
                      {service.client_name}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                      {service.machinery_type} · {isPerTripMachineryType(service.machinery_type) ? 'viaje' : `${service.hours}h`}
                    </p>
                  </div>

                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                    {formatDate(service.created_at)}
                  </span>

                  <div>
                    <span style={{ 
                      color: ADMIN_PALETTE.success, 
                      fontSize: 15, 
                      fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {formatPrice(service.paid_without_invoice ? service.amount_paid_to_provider : service.net_total)}
                    </span>
                    {service.paid_without_invoice && (
                      <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)' }} title={`Retención IVA: ${formatPrice(service.retention_amount)}`}>
                        sin factura (−{formatPrice(service.retention_amount)})
                      </span>
                    )}
                  </div>

                  <div>
                    {service.invoice_number || (service.status === 'invoiced' && service.invoiceFilename) ? (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => !actionsLocked && viewInvoice(service)}
                        style={{
                          background: 'rgba(236, 104, 25, 0.18)',
                          border: '1px solid rgba(236, 104, 25, 0.35)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          color: ADMIN_PALETTE.brand,
                          fontSize: 12,
                          cursor: actionsLocked ? 'not-allowed' : 'pointer',
                          opacity: actionsLocked ? 0.45 : 1,
                        }}
                      >
                        {service.invoice_number ? `#${service.invoice_number}` : '📎 Ver archivo'}
                      </button>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>-</span>
                    )}
                  </div>

                  <span style={{
                    background: status.bg,
                    color: status.color,
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    {status.label}
                  </span>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {service.status === 'invoiced' && (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => !actionsLocked && viewInvoice(service)}
                        style={{
                          background: ADMIN_PALETTE.success,
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: actionsLocked ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: actionsLocked ? 0.45 : 1,
                        }}
                      >
                        Revisar y pagar
                      </button>
                    )}
                    {service.status === 'paid' && service.maqgo_client_invoice_pending !== false && (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => markClientInvoiced(service._id)}
                        style={{
                          background: ADMIN_PALETTE.info,
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: actionsLocked ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: actionsLocked ? 0.45 : 1,
                        }}
                      >
                        ✓ Cliente facturado
                      </button>
                    )}
                    {service.status === 'pending_review' && (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => updateStatus(service._id, 'disputed')}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${ADMIN_PALETTE.danger}`,
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: ADMIN_PALETTE.danger,
                          fontSize: 12,
                          cursor: actionsLocked ? 'not-allowed' : 'pointer',
                          opacity: actionsLocked ? 0.45 : 1,
                        }}
                      >
                        Disputar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

              {listTotal > 0 && (
                <div
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: '14px 20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: '#252525'
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                    Mostrando <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> de <strong>{listTotal}</strong>
                    {filter !== 'all' && (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 8 }}>
                        (filtro activo)
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      className="maqgo-btn-secondary"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      style={{ opacity: page <= 1 ? 0.45 : 1, padding: '8px 14px', fontSize: 13 }}
                    >
                      Anterior
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                      Página {page} / {maxPage}
                    </span>
                    <button
                      type="button"
                      className="maqgo-btn-secondary"
                      disabled={page >= maxPage || listTotal === 0}
                      onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                      style={{ opacity: page >= maxPage ? 0.45 : 1, padding: '8px 14px', fontSize: 13 }}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
          </>
        )}

        {adminArea === 'system' && (
          <>
            <h2
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 700,
                margin: '24px 0 8px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Operación (colas del pipeline)
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                margin: '0 0 10px',
              }}
            >
              Colas e indicadores del flujo operativo: revisión → facturación → pago. Para montos y conciliación, usa «Facturación y pagos».
            </p>

            <SystemHealthPanel stats={stats} finances={finances} isDemoData={usingOfflineDemo} theme={ADMIN_THEME} />

        {(sla || weekComparison) && (
          <div style={{
            background: ADMIN_THEME.panelBg,
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            border: `1px solid ${ADMIN_THEME.borderStrong}`
          }}>
            <h2 style={{
              color: '#90BDD3',
              fontSize: 15,
              fontWeight: 700,
              margin: '0 0 14px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              ⏱ Colas y ritmo (tiempo real)
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.45 }}>
              Tiempos del flujo operativo (revisión → facturación → pago). Útil para anticipar cuellos antes de que exploten las colas.
            </p>
            {sla && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: weekComparison ? 16 : 0
              }}>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase' }}>Revisión MAQGO</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.revision_horas_promedio ?? '—'} h <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>prom.</span>
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '6px 0 0' }}>
                    Máx {sla.revision_horas_max ?? '—'} h · {sla.en_revision ?? 0} en cola
                  </p>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase' }}>Aprobado → factura prov.</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.aprobado_sin_factura_h_promedio ?? '—'} h
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '6px 0 0' }}>
                    {sla.aprobado_sin_facturar ?? 0} servicio(s)
                  </p>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase' }}>Facturado → pago</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.facturado_sin_pago_h_promedio ?? '—'} h
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '6px 0 0' }}>
                    {sla.facturados_sin_pago ?? 0} servicio(s)
                  </p>
                </div>
              </div>
            )}
            {weekComparison && (
              <div style={{
                paddingTop: 14,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12
              }}>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase' }}>Servicios creados (sem. vs ant.)</p>
                  <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
                    {weekComparison.creados_esta_semana ?? '—'} <span style={{ color: 'rgba(255,255,255,0.45)' }}>vs</span> {weekComparison.creados_semana_anterior ?? '—'}
                  </p>
                  <p style={{
                    color: (weekComparison.delta_creados || 0) >= 0 ? '#81C784' : '#E57373',
                    fontSize: 13,
                    margin: '6px 0 0',
                    fontWeight: 600
                  }}>
                    Δ {weekComparison.delta_creados || 0}
                  </p>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase' }}>Pagados cerrados (paid_at en semana)</p>
                  <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
                    {weekComparison.pagados_esta_semana ?? '—'} <span style={{ color: 'rgba(255,255,255,0.45)' }}>vs</span> {weekComparison.pagados_semana_anterior ?? '—'}
                  </p>
                  <p style={{
                    color: (weekComparison.delta_pagados || 0) >= 0 ? '#81C784' : '#E57373',
                    fontSize: 13,
                    margin: '6px 0 0',
                    fontWeight: 600
                  }}>
                    Δ {weekComparison.delta_pagados || 0}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

          </>
        )}

        {adminArea === 'access' && (
          <>
            <h2
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 700,
                margin: '24px 0 8px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Acceso (bloqueos y tickets)
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 10px' }}>
              Bandeja operacional de ingresos bloqueados/sospechosos y solicitudes de revisión. Se genera solo cuando el sistema bloquea el acceso.
            </p>

            <div
              style={{
                background: ADMIN_THEME.panelBg,
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
                border: `1px solid ${ADMIN_THEME.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Tickets abiertos</div>
                <button
                  type="button"
                  onClick={fetchAccessTickets}
                  disabled={actionsLocked || accessTicketsLoading}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: `1px solid ${ADMIN_THEME.borderStrong}`,
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || accessTicketsLoading ? 'default' : 'pointer',
                    opacity: actionsLocked || accessTicketsLoading ? 0.6 : 1,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {accessTicketsLoading ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              {accessTicketsError ? (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(229,115,115,0.12)',
                    border: '1px solid rgba(229,115,115,0.35)',
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 13,
                  }}
                >
                  {accessTicketsError}
                </div>
              ) : null}

              {!accessTicketsLoading && Array.isArray(accessTickets) && accessTickets.length === 0 ? (
                <div style={{ marginTop: 12, color: ADMIN_THEME.textMuted, fontSize: 13 }}>
                  No hay tickets abiertos.
                </div>
              ) : null}

              {!accessTicketsLoading && Array.isArray(accessTickets) && accessTickets.length > 0 ? (
                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)' }}>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Fecha</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Motivo</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Teléfono</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Rol</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accessTickets.slice(0, 200).map((t) => (
                        <tr key={String(t?.id)} style={{ borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>
                            {t?.created_at ? new Date(String(t.created_at)).toLocaleString('es-CL') : '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>
                            {t?.reason || '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>
                            {t?.phone9 ? `9${String(t.phone9).slice(-8)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>
                            {t?.requested_role || '—'}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await fetchWithAuth(
                                    `${BACKEND_URL}/api/support/tickets/${encodeURIComponent(t.id)}`,
                                    {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ status: 'resolved', resolution: '' }),
                                    },
                                    15000
                                  );
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data?.detail || `No se pudo resolver (${res.status})`);
                                  toast.success('Ticket resuelto.');
                                  fetchAccessTickets();
                                } catch (e) {
                                  toast.error(friendlyFetchError(e, 'No se pudo resolver el ticket.'));
                                }
                              }}
                              style={{
                                padding: '8px 10px',
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                borderRadius: 10,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Resolver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div
              style={{
                background: ADMIN_THEME.panelBg,
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
                border: `1px solid ${ADMIN_THEME.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Teléfonos bloqueados</div>
                <button
                  type="button"
                  onClick={fetchBlockedPhones}
                  disabled={actionsLocked || blockedPhonesLoading}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: `1px solid ${ADMIN_THEME.borderStrong}`,
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || blockedPhonesLoading ? 'default' : 'pointer',
                    opacity: actionsLocked || blockedPhonesLoading ? 0.6 : 1,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {blockedPhonesLoading ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="maqgo-input"
                  placeholder="Celular (9 dígitos)"
                  value={blockPhone9}
                  onChange={(e) => setBlockPhone9(e.target.value)}
                  style={{ flex: '1 1 220px' }}
                />
                <input
                  className="maqgo-input"
                  placeholder="Motivo (ej: fraude)"
                  value={blockPhoneReason}
                  onChange={(e) => setBlockPhoneReason(e.target.value)}
                  style={{ flex: '2 1 260px' }}
                />
                <button
                  type="button"
                  disabled={actionsLocked || blockingPhone}
                  onClick={async () => {
                    if (actionsLocked) return;
                    const p9 = String(blockPhone9 || '').replace(/\D/g, '').slice(-9);
                    if (!/^9\d{8}$/.test(p9)) {
                      toast.error('Celular inválido.');
                      return;
                    }
                    const reason = String(blockPhoneReason || '').trim();
                    if (!reason) {
                      toast.error('Motivo requerido.');
                      return;
                    }
                    setBlockingPhone(true);
                    try {
                      const res = await fetchWithAuth(
                        `${BACKEND_URL}/api/support/blocked-phones`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ phone9: p9, reason }),
                        },
                        15000
                      );
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data?.detail || `No se pudo bloquear (${res.status})`);
                      toast.success('Teléfono bloqueado.');
                      setBlockPhone9('');
                      fetchBlockedPhones();
                    } catch (e) {
                      toast.error(friendlyFetchError(e, 'No se pudo bloquear el teléfono.'));
                    } finally {
                      setBlockingPhone(false);
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    background: ADMIN_PALETTE.danger,
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    cursor: actionsLocked || blockingPhone ? 'default' : 'pointer',
                    opacity: actionsLocked || blockingPhone ? 0.6 : 1,
                    fontSize: 13,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {blockingPhone ? 'Bloqueando…' : 'Bloquear'}
                </button>
              </div>

              {blockedPhonesError ? (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(229,115,115,0.12)',
                    border: '1px solid rgba(229,115,115,0.35)',
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 13,
                  }}
                >
                  {blockedPhonesError}
                </div>
              ) : null}

              {!blockedPhonesLoading && Array.isArray(blockedPhones) && blockedPhones.length === 0 ? (
                <div style={{ marginTop: 12, color: ADMIN_THEME.textMuted, fontSize: 13 }}>
                  No hay teléfonos bloqueados.
                </div>
              ) : null}

              {!blockedPhonesLoading && Array.isArray(blockedPhones) && blockedPhones.length > 0 ? (
                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)' }}>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Teléfono</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Motivo</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Actualizado</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedPhones.slice(0, 200).map((b) => (
                        <tr key={String(b?.id)} style={{ borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>
                            {b?.phone9 ? `9${String(b.phone9).slice(-8)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>
                            {b?.reason || '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: ADMIN_THEME.textMuted }}>
                            {b?.updated_at ? new Date(String(b.updated_at)).toLocaleString('es-CL') : '—'}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await fetchWithAuth(
                                    `${BACKEND_URL}/api/support/blocked-phones/${encodeURIComponent(b.phone9)}`,
                                    { method: 'DELETE' },
                                    15000
                                  );
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data?.detail || `No se pudo desbloquear (${res.status})`);
                                  toast.success('Teléfono desbloqueado.');
                                  fetchBlockedPhones();
                                } catch (e) {
                                  toast.error(friendlyFetchError(e, 'No se pudo desbloquear el teléfono.'));
                                }
                              }}
                              style={{
                                padding: '8px 10px',
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                borderRadius: 10,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Desbloquear
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        )}

        {adminArea === 'platform' && (
          <>
            <h2
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 700,
                margin: '24px 0 8px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Plataforma (tenancy + integraciones)
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 10px' }}>
              Vista operacional para monitorear integraciones (telemetría) y salud de datos. Sin acciones destructivas.
            </p>

            <div
              style={{
                background: ADMIN_THEME.panelBg,
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
                border: `1px solid ${ADMIN_THEME.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>
                    Integraciones
                  </h3>
                  <p style={{ margin: '6px 0 0', color: ADMIN_THEME.textMuted, fontSize: 12 }}>
                    {adminMachinesUpdatedAt ? `Actualizado: ${adminMachinesUpdatedAt.toLocaleTimeString('es-CL')}` : '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={fetchAdminMachines}
                    disabled={actionsLocked || adminMachinesLoading}
                    style={{
                      padding: '8px 12px',
                      background: 'transparent',
                      border: `1px solid ${ADMIN_THEME.borderStrong}`,
                      borderRadius: 10,
                      color: '#fff',
                      cursor: actionsLocked || adminMachinesLoading ? 'default' : 'pointer',
                      opacity: actionsLocked || adminMachinesLoading ? 0.6 : 1,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {adminMachinesLoading ? 'Actualizando…' : 'Actualizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIntegrationDetails((v) => !v)}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${ADMIN_THEME.border}`,
                      borderRadius: 10,
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {showIntegrationDetails ? 'Ocultar detalle' : 'Ver detalle'}
                  </button>
                </div>
              </div>

              {actionsLocked && (
                <div style={{ marginTop: 12, color: ADMIN_THEME.textMuted, fontSize: 13 }}>
                  Sin conexión al API: no se puede cargar inventario admin.
                </div>
              )}
              {adminMachinesError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(229,115,115,0.12)',
                    border: '1px solid rgba(229,115,115,0.35)',
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 13,
                  }}
                >
                  {adminMachinesError}
                </div>
              )}

              {!adminMachinesLoading && Array.isArray(adminMachines) && (
                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)' }}>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Integración</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Conectadas</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>OK &lt;= 24h</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Stale &gt; 72h</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Nunca sync</th>
                        <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Última sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                        <td style={{ padding: '10px 10px', fontWeight: 800 }}>Komatsu</td>
                        <td style={{ padding: '10px 10px' }}>{integrations.komatsu.total}</td>
                        <td style={{ padding: '10px 10px' }}>{integrations.komatsu.ok24h}</td>
                        <td style={{ padding: '10px 10px' }}>{integrations.komatsu.stale72h}</td>
                        <td style={{ padding: '10px 10px' }}>{integrations.komatsu.never}</td>
                        <td style={{ padding: '10px 10px', color: ADMIN_THEME.textMuted }}>
                          {integrations.komatsu.newest ? integrations.komatsu.newest.toLocaleString('es-CL') : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {showIntegrationDetails && !adminMachinesLoading && Array.isArray(adminMachines) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
                    Komatsu — máquinas conectadas
                  </div>
                  {integrations.komatsu.machines.length === 0 ? (
                    <div style={{ color: ADMIN_THEME.textMuted, fontSize: 13 }}>No hay máquinas Komatsu conectadas.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)' }}>
                            <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Empresa</th>
                            <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Máquina</th>
                            <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Última sync</th>
                            <th style={{ padding: '10px 10px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {integrations.komatsu.machines.slice(0, 200).map((m) => {
                            const state =
                              !m.lastSyncAt ? { label: 'SIN_SYNC', color: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.08)', border: ADMIN_THEME.borderStrong } :
                              m.isOk24h ? { label: 'OK', color: '#81C784', bg: 'rgba(102, 187, 106, 0.12)', border: 'rgba(102, 187, 106, 0.35)' } :
                              m.isStale72h ? { label: 'STALE', color: '#E8A34B', bg: 'rgba(232, 163, 75, 0.12)', border: 'rgba(232, 163, 75, 0.35)' } :
                              { label: 'LENTO', color: 'rgba(255,255,255,0.8)', bg: 'rgba(255,255,255,0.08)', border: ADMIN_THEME.borderStrong };
                            return (
                              <tr key={String(m.id)} style={{ borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                                <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>{m.providerName}</td>
                                <td style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.9)' }}>
                                  {m.licensePlate} · {m.machineryType}
                                </td>
                                <td style={{ padding: '10px 10px', color: ADMIN_THEME.textMuted }}>
                                  {m.lastSyncAt ? m.lastSyncAt.toLocaleString('es-CL') : '—'}
                                </td>
                                <td style={{ padding: '10px 10px' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '6px 10px',
                                      borderRadius: 999,
                                      background: state.bg,
                                      border: `1px solid ${state.border}`,
                                      color: state.color,
                                      fontWeight: 800,
                                      fontSize: 12,
                                      fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    {state.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal de factura */}
      {showInvoiceModal && selectedService && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: ADMIN_THEME.panelBg,
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: `1px solid ${ADMIN_THEME.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: '#fff', margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                {selectedService.invoice_number
                  ? `Factura #${selectedService.invoice_number}`
                  : selectedService.invoiceFilename
                    ? `Factura (${selectedService.invoiceFilename})`
                    : 'Revisar factura'}
              </h3>
              <button
                type="button"
                onClick={closeInvoiceModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: 24,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, lineHeight: 1.8 }}>
              <p><strong>Cliente:</strong> {selectedService.client_name}</p>
              <p><strong>Maquinaria:</strong> {selectedService.machinery_type}</p>
              <p><strong>{isPerTripMachineryType(selectedService.machinery_type) ? 'Tipo' : 'Horas'}:</strong> {isPerTripMachineryType(selectedService.machinery_type) ? 'Valor viaje' : selectedService.hours}</p>
              <p><strong>Monto a pagar:</strong> {formatPrice(selectedService.net_total)}</p>
              <p><strong>Monto factura proveedor (esperado):</strong> {formatPrice(selectedService.provider_invoice_expected_total_clp ?? selectedService.net_total)}</p>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Monto factura proveedor (confirmado, CLP)
              </label>
              <input
                value={providerInvoiceConfirmed}
                onChange={(e) => setProviderInvoiceConfirmed(e.target.value)}
                disabled={actionsLocked}
                inputMode="numeric"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  outline: 'none',
                }}
                placeholder="Ej: 119000"
              />
              <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                Este monto debe calzar con la factura del proveedor para habilitar pago.
              </div>
            </div>

            {invoiceModalLoading && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 16 }}>Cargando archivo de factura…</p>
            )}
            {!invoiceModalLoading && invoiceModalHint && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background: 'rgba(232, 163, 75, 0.12)',
                  border: '1px solid rgba(232, 163, 75, 0.35)',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {invoiceModalHint}
              </div>
            )}
            {!invoiceModalLoading && invoiceModalSrc && (
              <div style={{ marginTop: 16 }}>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 8 }}>
                  {isPdfDataUrl(invoiceModalSrc) ? 'Documento PDF' : 'Imagen de factura'}
                </p>
                {isPdfDataUrl(invoiceModalSrc) ? (
                  <>
                    <embed
                      title="Vista previa factura PDF"
                      src={invoiceModalSrc}
                      type="application/pdf"
                      style={{ width: '100%', height: 420, borderRadius: 8, border: 'none' }}
                    />
                    <a
                      href={invoiceModalSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        marginTop: 8,
                        color: ADMIN_PALETTE.info,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Abrir PDF en nueva pestaña
                    </a>
                  </>
                ) : (
                  <img src={invoiceModalSrc} alt="Factura" style={{ width: '100%', borderRadius: 8 }} />
                )}
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  onClick={downloadInvoiceFile}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  Descargar archivo
                </button>
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {selectedService.status === 'invoiced' && (
                <button
                  type="button"
                  disabled={actionsLocked}
                  onClick={async () => {
                    const confirmed = Number(String(providerInvoiceConfirmed || '').replace(/[^\d.]/g, ''));
                    const approved = selectedService.provider_invoice_approved === true
                      ? true
                      : await approveProviderInvoice(selectedService._id, confirmed);
                    if (!approved) return;
                    const ok = await updateStatus(selectedService._id, 'paid');
                    if (ok) closeInvoiceModal();
                  }}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: 12,
                    background: ADMIN_PALETTE.success,
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontWeight: 600,
                    cursor: actionsLocked ? 'not-allowed' : 'pointer',
                    opacity: actionsLocked ? 0.45 : 1,
                  }}
                >
                  ✓ Aprobar y Marcar Pagado
                </button>
              )}
              <button
                type="button"
                onClick={closeInvoiceModal}
                style={{
                  flex: 1,
                  minWidth: 120,
                  padding: 12,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportSubscriptions && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: ADMIN_THEME.panelBg,
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 520,
              border: `1px solid ${ADMIN_THEME.border}`,
            }}
            role="dialog"
            aria-label="Destinatarios reportes"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: '#fff', margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                📧 Destinatarios de reportes
              </h3>
              <button
                type="button"
                onClick={closeReportSubscriptions}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.45 }}>
              Ingresa uno o más correos separados por coma o salto de línea.
              {reportSubsMeta?.updatedAt ? ` Última actualización: ${String(reportSubsMeta.updatedAt).slice(0, 19)}` : ''}
            </p>

            <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.82)', marginBottom: 8 }}>
              Reporte semanal
              <textarea
                value={weeklyReportEmailsText}
                onChange={(e) => setWeeklyReportEmailsText(e.target.value)}
                placeholder="ej: tomas@maqgo.cl, finanzas@maqgo.cl"
                rows={3}
                disabled={reportSubsLoading || actionsLocked}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </label>

            <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.82)', marginBottom: 8 }}>
              Reporte mensual
              <textarea
                value={monthlyReportEmailsText}
                onChange={(e) => setMonthlyReportEmailsText(e.target.value)}
                placeholder="ej: contabilidad@maqgo.cl"
                rows={2}
                disabled={reportSubsLoading || actionsLocked}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                onClick={saveReportSubscriptions}
                disabled={reportSubsLoading || actionsLocked}
                className="maqgo-btn-primary"
                style={{ flex: 1, opacity: reportSubsLoading || actionsLocked ? 0.6 : 1 }}
              >
                {reportSubsLoading ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={closeReportSubscriptions}
                className="maqgo-btn-secondary"
                style={{ flex: 1 }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button
                type="button"
                onClick={sendWeeklyReportTestEmail}
                disabled={reportSubsLoading || actionsLocked || reportTestSending === 'weekly'}
                className="maqgo-btn-secondary"
                style={{ flex: 1, opacity: reportSubsLoading || actionsLocked ? 0.6 : 1 }}
              >
                {reportTestSending === 'weekly' ? 'Enviando…' : 'Enviar prueba semanal'}
              </button>
              <button
                type="button"
                onClick={sendMonthlyReportTestEmail}
                disabled={reportSubsLoading || actionsLocked || reportTestSending === 'monthly'}
                className="maqgo-btn-secondary"
                style={{ flex: 1, opacity: reportSubsLoading || actionsLocked ? 0.6 : 1 }}
              >
                {reportTestSending === 'monthly' ? 'Enviando…' : 'Enviar prueba mensual'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Informe Operativo Semanal */}
      {showWeeklyReport && weeklyReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: ADMIN_THEME.panelBg,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 700,
            maxHeight: '90vh',
            overflow: 'auto',
            border: `1px solid ${ADMIN_THEME.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: '#EC6819', fontFamily: "'Space Grotesk', sans-serif" }}>
                📊 Informe Operativo Semanal
              </h2>
              <button
                onClick={() => setShowWeeklyReport(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 20 }}>
              {weeklyReport.periodo?.semana}
            </p>

            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
              Pipeline facturación: servicios creados en la semana y cierre de pagos con <code style={{ color: '#90BDD3' }}>paid_at</code> en la ventana.
            </p>

            {/* Resumen pipeline facturación */}
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3 style={{ color: '#fff', fontSize: 14, margin: '0 0 12px', fontWeight: 600 }}>
                SERVICIOS CREADOS EN LA SEMANA (por estado)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Total creados</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.total_servicios_creados_semana ?? weeklyReport.resumen?.total_solicitudes}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Tiempo promedio revisión → aprobado</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.tiempo_promedio_revision_h ?? '—'} h ({weeklyReport.resumen?.tiempo_promedio_revision_min ?? weeklyReport.resumen?.tiempo_promedio_confirmacion_min} min)</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Pagados cerrados (paid_at en semana)</td>
                    <td style={{ color: '#4CAF50', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.servicios_pagados_cerrados_semana ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>GMV pagado (CLP)</td>
                    <td style={{ color: '#EC6819', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.gmv_pagado_semana_clp != null ? formatPrice(weeklyReport.resumen.gmv_pagado_semana_clp) : '—'}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '10px 0 6px' }}>Tasa cancelación (sobre creados)</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.tasa_cancelacion}</td>
                  </tr>
                </tbody>
              </table>
              {weeklyReport.resumen?.por_estado && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 8px' }}>Desglose</p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 1.6 }}>
                    {Object.entries(weeklyReport.resumen.por_estado).map(([k, v]) => (
                      <li key={k}>
                        {(weeklyReport.resumen.etiquetas_estado && weeklyReport.resumen.etiquetas_estado[k]) || k}: <strong>{v}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {weeklyReport.resumen?.top_maquinaria && weeklyReport.resumen.top_maquinaria.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 8px' }}>Top maquinaria (creados esta semana)</p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.88)', fontSize: 12 }}>
                    {weeklyReport.resumen.top_maquinaria.map((row, idx) => (
                      <li key={idx}>{row.tipo}: {row.n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Alertas */}
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ color: '#fff', fontSize: 14, margin: '0 0 12px', fontWeight: 600 }}>
                ALERTAS
              </h3>
              {weeklyReport.alertas?.map((alerta, idx) => (
                <div key={idx} style={{ 
                  padding: '12px', 
                  background: alerta.tipo === 'SIN_ALERTAS' ? 'rgba(76,175,80,0.1)' : 'rgba(255,167,38,0.1)', 
                  borderRadius: 8,
                  marginBottom: 8
                }}>
                  <p style={{ 
                    color: alerta.tipo === 'SIN_ALERTAS' ? '#4CAF50' : '#FFA726', 
                    margin: 0, 
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    {alerta.mensaje}
                  </p>
                  {alerta.detalle && alerta.detalle.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                      {alerta.detalle.slice(0, 5).map((d, i) => (
                        <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>
                          {typeof d === 'object' ? JSON.stringify(d) : d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => fetchWeeklyReportGuarded(1)}
                style={{
                  flex: 1,
                  padding: 12,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <BackArrowIcon size={20} />
                  Semana anterior
                </span>
              </button>
              <button
                onClick={() => setShowWeeklyReport(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>

            {/* Nota al pie */}
            <p style={{ 
              color: 'rgba(255,255,255,0.5)', 
              fontSize: 13, 
              margin: 0,
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              Informe alineado al pipeline de facturación MAQGO (post-servicio). Matching en vivo se mide en otros informes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
