import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth, clearLocalSession } from '../../utils/api';
import { friendlyFetchError, isDemoServiceId } from '../../utils/fetchErrors';
import { useToast } from '../../components/Toast';
import { isPerTripMachineryType } from '../../utils/machineryNames';
import SystemHealthPanel from '../../components/admin/SystemHealthPanel';

/** Paleta admin unificada: menos acentos competidor entre sí (CTO UX) */
const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#7EB8D4',
  success: '#66BB6A',
  warning: '#E8A34B',
  danger: '#E57373',
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
  const [invoiceModalSrc, setInvoiceModalSrc] = useState('');
  const [invoiceModalLoading, setInvoiceModalLoading] = useState(false);
  const [invoiceModalHint, setInvoiceModalHint] = useState('');

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
      const response = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/all?${qs.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Error al cargar reservas (${response.status})`);
      }
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
        console.warn('admin/all: respuesta sin finances; despliega backend actualizado');
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
      const isNetwork =
        msg === 'Failed to fetch' || error.name === 'TypeError' || msg.includes('NetworkError');
      if (isNetwork) {
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
        setStats({ pending_review: 1, approved: 0, invoiced: 1, paid: 0, disputed: 0, total: 2, maqgo_to_invoice: 0 });
        setListTotal(demoServices.length);
        calculateFinances(demoServices);
        setSla(null);
        setWeekComparison(null);
      } else {
        setUsingOfflineDemo(false);
        setServices([]);
        setStats({});
        setListTotal(0);
        setSla(null);
        setWeekComparison(null);
        calculateFinances([]);
        toast.error(friendlyFetchError(error, 'No se pudieron cargar las reservas'), 'admin-dashboard-load');
      }
    } finally {
      setLoading(false);
    }
  }, [filter, page, calculateFinances, toast]);

  useEffect(() => {
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

  const payWithoutInvoice = async (serviceId) => {
    if (usingOfflineDemo || isDemoServiceId(serviceId)) {
      toast.warning('Sin API o datos demo: esta acción no está disponible.');
      return;
    }
    if (!window.confirm('¿Pagar sin factura? Se retendrá el 19% (IVA) del pago al proveedor. MAQGO factura al cliente.')) return;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}/pay-without-invoice`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error');
      fetchServices();
      toast.success(data.message);
    } catch (error) {
      toast.error(friendlyFetchError(error, 'Error al pagar sin factura'));
    }
  };

  const viewInvoice = (service) => {
    setSelectedService(service);
    setShowInvoiceModal(true);
  };

  const downloadInvoiceFile = () => {
    if (!invoiceModalSrc || !selectedService) return;
    const base = selectedService.invoice_number || selectedService.invoiceFilename || 'factura';
    const safe = String(base).replace(/[^\w.\-]+/g, '_').slice(0, 80);
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
      const response = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/weekly?weeks_ago=${weeksAgo}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Error ${response.status}`);
      }
      setWeeklyReport(data);
      setShowWeeklyReport(true);
    } catch (error) {
      console.error('Error:', error);
      toast.error(friendlyFetchError(error, 'Error al cargar el informe'), 'admin-weekly-report');
    }
    setLoadingReport(false);
  };

  const downloadPlanillaPagos = async () => {
    try {
      const url = `${BACKEND_URL}/api/admin/reports/payments-planilla?format=csv`;
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

  const actionsLocked = usingOfflineDemo;

  const fetchWeeklyReportGuarded = async (weeksAgo = 0) => {
    if (actionsLocked) {
      toast.warning('Sin conexión al servidor: no se puede cargar el informe.');
      return;
    }
    return fetchWeeklyReport(weeksAgo);
  };

  const downloadPlanillaGuarded = async () => {
    if (actionsLocked) {
      toast.warning('Sin conexión al servidor: no hay planilla para descargar.');
      return;
    }
    return downloadPlanillaPagos();
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#1a1a1a', 
      color: '#fff',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        background: '#2A2A2A',
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ 
          maxWidth: 1200, 
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ 
              fontSize: 24, 
              fontWeight: 700, 
              margin: 0,
              fontFamily: "'Space Grotesk', sans-serif",
              color: '#EC6819'
            }}>
              MAQGO Admin
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '4px 0 0' }}>
              Panel interno — reservas y facturación (solo dueño MAQGO)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
              👥 Usuarios
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
              💰 Precios
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
              📈 Marketing & CAC
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
              title="Informe semanal de operación (latencias, cuellos de botella)"
            >
              {loadingReport ? 'Cargando...' : '📋 Operación'}
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
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
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
            <strong style={{ color: '#E8A34B' }}>Sin conexión al servidor.</strong>{' '}
            Estás viendo datos de demostración. Los botones que llaman al API están desactivados hasta que el backend
            responda (revisa <code style={{ color: '#7EB8D4' }}>REACT_APP_BACKEND_URL</code> en Vercel y que Railway esté en línea).
          </div>
        )}

        {/* Alerta: facturas por revisar y pagar */}
        {(stats.invoiced > 0 || stats.pending_review > 0 || (stats.maqgo_to_invoice || 0) > 0) && (
          <div
            onClick={() => {
              setPage(1);
              setFilter(
                stats.invoiced > 0 ? 'invoiced'
                  : (stats.maqgo_to_invoice || 0) > 0 ? 'maqgo_to_invoice'
                    : 'pending_review'
              );
            }}
            style={{
              background: stats.invoiced > 0
                ? 'linear-gradient(135deg, rgba(236, 104, 25, 0.18) 0%, rgba(236, 104, 25, 0.05) 100%)'
                : (stats.maqgo_to_invoice || 0) > 0
                  ? 'linear-gradient(135deg, rgba(126, 184, 212, 0.16) 0%, rgba(126, 184, 212, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(232, 163, 75, 0.18) 0%, rgba(232, 163, 75, 0.05) 100%)',
              border: `1px solid ${stats.invoiced > 0 ? 'rgba(236, 104, 25, 0.4)' : (stats.maqgo_to_invoice || 0) > 0 ? 'rgba(126, 184, 212, 0.4)' : 'rgba(232, 163, 75, 0.4)'}`,
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
              {stats.invoiced > 0 ? '📄' : (stats.maqgo_to_invoice || 0) > 0 ? '📤' : '⏳'}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>
                {stats.invoiced > 0
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

        <SystemHealthPanel stats={stats} finances={finances} />

        {/* MÉTRICAS FINANCIERAS MAQGO */}
        <div style={{ 
          background: '#2A2A2A', 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 24 
        }}>
          <h2 style={{ 
            color: '#EC6819', 
            fontSize: 16, 
            fontWeight: 700, 
            margin: '0 0 16px',
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            💰 Métricas Financieras MAQGO <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 400 }}>(Neto sin IVA)</span>
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: 16 
          }}>
            {/* Ventas Totales Netas */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Ventas Netas
              </p>
              <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.totalNet)}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: '4px 0 0' }}>
                Bruto: {formatPrice(finances.totalGross)}
              </p>
            </div>

            {/* Comisión Cliente */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Comisión Cliente
              </p>
              <p style={{ color: ADMIN_PALETTE.info, fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.clientCommission)}
              </p>
            </div>

            {/* Comisión Proveedor */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Comisión Proveedor
              </p>
              <p style={{ color: ADMIN_PALETTE.warning, fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.providerCommission)}
              </p>
            </div>

            {/* Comisión Total MAQGO */}
            <div style={{ background: 'linear-gradient(135deg, #EC6819 0%, #D4550C 100%)', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Ganancia MAQGO
              </p>
              <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.totalCommission)}
              </p>
            </div>
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

          {/* Acciones Pendientes */}
          <div style={{ 
            marginTop: 16, 
            paddingTop: 16, 
            borderTop: '1px solid rgba(255,255,255,0.1)' 
          }}>
            <h3 style={{ 
              color: '#EC6819', 
              fontSize: 14, 
              fontWeight: 600, 
              margin: '0 0 12px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              📋 Acciones Pendientes
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {stats.pending_review > 0 && (
                <div style={{ 
                  background: 'rgba(255, 167, 38, 0.1)', 
                  border: '1px solid rgba(255, 167, 38, 0.3)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#FFA726'
                }}>
                  {stats.pending_review} reservas por revisar
                </div>
              )}
              {stats.invoiced > 0 && (
                <div style={{ 
                  background: 'rgba(236, 104, 25, 0.12)', 
                  border: '1px solid rgba(236, 104, 25, 0.35)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: ADMIN_PALETTE.brand
                }}>
                  {stats.invoiced} facturas por cobrar
                </div>
              )}
              {(stats.maqgo_to_invoice || 0) > 0 && (
                <div style={{ 
                  background: 'rgba(126, 184, 212, 0.12)', 
                  border: '1px solid rgba(126, 184, 212, 0.35)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: ADMIN_PALETTE.info
                }}>
                  {stats.maqgo_to_invoice} MAQGO debe facturar al cliente
                </div>
              )}
              {stats.disputed > 0 && (
                <div style={{ 
                  background: 'rgba(229, 115, 115, 0.12)', 
                  border: '1px solid rgba(229, 115, 115, 0.35)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: ADMIN_PALETTE.danger
                }}>
                  {stats.disputed} reclamos por resolver
                </div>
              )}
              {(!stats.pending_review && !stats.invoiced && !stats.disputed && !(stats.maqgo_to_invoice || 0)) && (
                <div style={{ 
                  color: 'rgba(255,255,255,0.95)', 
                  fontSize: 12,
                  fontStyle: 'italic'
                }}>
                  ✅ No hay acciones pendientes
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SLA colas + comparativa semana (API admin/all) */}
        {(sla || weekComparison) && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            border: '1px solid rgba(144, 189, 211, 0.25)'
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
              Promedios de espera en el pipeline de facturación. Útil para ver cuellos antes de que exploten las colas.
            </p>
            {sla && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: weekComparison ? 16 : 0
              }}>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase' }}>Revisión MAQGO</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.revision_horas_promedio ?? '—'} h <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>prom.</span>
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '6px 0 0' }}>
                    Máx {sla.revision_horas_max ?? '—'} h · {sla.en_revision ?? 0} en cola
                  </p>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase' }}>Aprobado → factura prov.</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.aprobado_sin_factura_h_promedio ?? '—'} h
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '6px 0 0' }}>
                    {sla.aprobado_sin_facturar ?? 0} servicio(s)
                  </p>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase' }}>Facturado → pago</p>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sla.facturado_sin_pago_h_promedio ?? '—'} h
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '6px 0 0' }}>
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
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase' }}>Servicios creados (sem. vs ant.)</p>
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
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase' }}>Pagados cerrados (paid_at en semana)</p>
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

        {/* Stats Cards - Estados de servicios */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: 16, 
          marginBottom: 24 
        }}>
          {[
            { key: 'pending_review', label: 'En Revisión', icon: '⏳' },
            { key: 'approved', label: 'Aprobados', icon: '✅' },
            { key: 'invoiced', label: 'Por Pagar', icon: '📄' },
            { key: 'paid', label: 'Pagados', icon: '💰' },
            { key: 'maqgo_to_invoice', label: 'MAQGO → Facturar Cliente', icon: '📤' },
            { key: 'disputed', label: 'En Disputa', icon: '⚠️' }
          ].map(item => {
            const config = STATUS_CONFIG[item.key] || (item.key === 'maqgo_to_invoice' 
              ? { color: ADMIN_PALETTE.info, bg: 'rgba(126, 184, 212, 0.12)' } 
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
                  {item.key === 'maqgo_to_invoice' ? (stats.maqgo_to_invoice || 0) : (stats[item.key] || 0)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Filtro "Ver todos" */}
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

        {/* Tabla de servicios */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          overflow: 'hidden'
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
                    : `No hay reservas "${STATUS_CONFIG[filter]?.label || filter}"`}
              </p>
            </div>
          ) : (
            <>
              {/* Header de tabla - solo si hay datos */}
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

              {/* Filas */}
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
                  {/* Cliente / Maquinaria */}
                  <div>
                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>
                      {service.client_name}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                      {service.machinery_type} · {isPerTripMachineryType(service.machinery_type) ? 'viaje' : `${service.hours}h`}
                    </p>
                  </div>

                  {/* Fecha */}
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                    {formatDate(service.created_at)}
                  </span>

                  {/* Monto */}
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
                      <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.5)' }} title={`Retención IVA: ${formatPrice(service.retention_amount)}`}>
                        sin factura (−{formatPrice(service.retention_amount)})
                      </span>
                    )}
                  </div>

                  {/* Factura */}
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

                  {/* Estado */}
                  <span style={{
                    background: status.bg,
                    color: status.color,
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    {status.label}
                  </span>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {service.status === 'approved' && (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => payWithoutInvoice(service._id)}
                        style={{
                          background: 'rgba(255, 152, 0, 0.9)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: actionsLocked ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: actionsLocked ? 0.45 : 1,
                        }}
                        title="Proveedor no subió factura. MAQGO retiene 19% IVA y paga el resto."
                      >
                        Pagar sin factura
                      </button>
                    )}
                    {service.status === 'invoiced' && (
                      <button
                        type="button"
                        disabled={actionsLocked}
                        onClick={() => updateStatus(service._id, 'paid')}
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
                        Marcar Pagado
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
            background: '#2A2A2A',
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
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
            background: '#2A2A2A',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 700,
            maxHeight: '90vh',
            overflow: 'auto'
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
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: '0 0 8px' }}>Desglose</p>
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
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: '0 0 8px' }}>Top maquinaria (creados esta semana)</p>
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
                ⚠️ ALERTAS
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
                ← Semana anterior
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
              fontSize: 11, 
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
