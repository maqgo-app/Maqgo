import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';

import BACKEND_URL from '../../utils/api';
import { getMachineryId } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

// Estados y colores
const STATUS_CONFIG = {
  pending_review: { label: 'En revisión', color: '#FFA726', bg: 'rgba(255, 167, 38, 0.1)' },
  approved: { label: 'Aprobado', color: '#90BDD3', bg: 'rgba(144, 189, 211, 0.1)' },
  invoiced: { label: 'Facturado', color: '#9C27B0', bg: 'rgba(156, 39, 176, 0.1)' },
  paid: { label: 'Pagado', color: '#4CAF50', bg: 'rgba(76, 175, 80, 0.1)' },
  disputed: { label: 'En disputa', color: '#F44336', bg: 'rgba(244, 67, 54, 0.1)' }
};

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

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/all`);
      const data = await response.json();
      const serviceList = data.services || [];
      setServices(serviceList);
      setStats(data.stats || {});
      calculateFinances(serviceList);
    } catch (error) {
      console.error('Error:', error);
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
      setStats({ pending_review: 1, approved: 0, invoiced: 1, paid: 0, disputed: 0, total: 2 });
      calculateFinances(demoServices);
    }
    setLoading(false);
  };

  // Calcular métricas financieras MAQGO (NETO sin IVA = ganancia real)
  const calculateFinances = (serviceList) => {
    let totalGross = 0;
    let totalNet = 0;
    let clientCommNet = 0;
    let providerCommNet = 0;
    let completed = 0;
    let cancelled = 0;
    let disputed = 0;

    serviceList.forEach(s => {
      // Solo contar servicios confirmados
      if (['approved', 'invoiced', 'paid'].includes(s.status)) {
        totalGross += s.gross_total || 0;
        
        // Calcular base sin IVA
        const grossSinIva = (s.gross_total || 0) / 1.19;
        totalNet += grossSinIva;
        
        // Comisión cliente NETA: 10% del subtotal base (sin IVA)
        const subtotalBase = grossSinIva / 1.10;
        clientCommNet += subtotalBase * 0.10;
        
        // Comisión proveedor NETA: service_fee sin IVA
        const serviceFeeNet = (s.service_fee || 0) / 1.19;
        providerCommNet += serviceFeeNet;
      }
      
      // Contadores
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
  };

  const updateStatus = async (serviceId, newStatus) => {
    try {
      await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchServices();
      toast.success(`Estado actualizado a "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
    } catch (error) {
      toast.error('Error actualizando estado');
    }
  };

  const markClientInvoiced = async (serviceId) => {
    try {
      await fetchWithAuth(`${BACKEND_URL}/api/services/admin/${serviceId}/client-invoiced`, {
        method: 'PATCH'
      });
      fetchServices();
      toast.success('Cliente facturado por MAQGO');
    } catch (error) {
      toast.error('Error al marcar cliente facturado');
    }
  };

  const payWithoutInvoice = async (serviceId) => {
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
      toast.error(error.message || 'Error al pagar sin factura');
    }
  };

  const viewInvoice = async (service) => {
    setSelectedService(service);
    setShowInvoiceModal(true);
  };

  const fetchWeeklyReport = async (weeksAgo = 0) => {
    setLoadingReport(true);
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/weekly?weeks_ago=${weeksAgo}`);
      const data = await response.json();
      setWeeklyReport(data);
      setShowWeeklyReport(true);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar el informe');
    }
    setLoadingReport(false);
  };

  const downloadPlanillaPagos = async () => {
    try {
      const url = `${BACKEND_URL}/api/admin/reports/payments-planilla?format=csv`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error('Error al generar planilla');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `maqgo_planilla_pagos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
      toast.error('Error al descargar planilla');
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

  const maqgoToInvoiceServices = services.filter(s => 
    s.status === 'paid' && s.maqgo_client_invoice_pending !== false
  );
  const filteredServices = filter === 'all' 
    ? services 
    : filter === 'maqgo_to_invoice'
      ? maqgoToInvoiceServices
      : services.filter(s => s.status === filter);

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
              Dashboard de reservas y facturación
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => navigate('/admin/users')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              👥 Usuarios
            </button>
            <button
              onClick={() => navigate('/admin/pricing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              💰 Precios
            </button>
            <button
              onClick={downloadPlanillaPagos}
              style={{
                padding: '8px 16px',
                background: stats.invoiced > 0 ? '#9C27B0' : 'transparent',
                border: '1px solid rgba(156, 39, 176, 0.5)',
                borderRadius: 8,
                color: stats.invoiced > 0 ? '#fff' : 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              📥 Planilla pagos
            </button>
            <button
              onClick={() => fetchWeeklyReport(0)}
              disabled={loadingReport}
              style={{
                padding: '8px 16px',
                background: '#EC6819',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {loadingReport ? 'Cargando...' : '📋 Operación'}
            </button>
            <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/')}>
              Volver al inicio
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('userId');
                localStorage.removeItem('userRole');
                localStorage.removeItem('providerRole');
                navigate('/');
              }}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(244,67,54,0.5)',
                borderRadius: 8,
                color: '#F44336',
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
        
        {/* Alerta: facturas por revisar y pagar */}
        {(stats.invoiced > 0 || stats.pending_review > 0 || (stats.maqgo_to_invoice || 0) > 0) && (
          <div
            onClick={() => setFilter(
              stats.invoiced > 0 ? 'invoiced' 
              : (stats.maqgo_to_invoice || 0) > 0 ? 'maqgo_to_invoice' 
              : 'pending_review'
            )}
            style={{
              background: stats.invoiced > 0
                ? 'linear-gradient(135deg, rgba(156, 39, 176, 0.2) 0%, rgba(156, 39, 176, 0.05) 100%)'
                : (stats.maqgo_to_invoice || 0) > 0
                  ? 'linear-gradient(135deg, rgba(0, 188, 212, 0.2) 0%, rgba(0, 188, 212, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 167, 38, 0.2) 0%, rgba(255, 167, 38, 0.05) 100%)',
              border: `1px solid ${stats.invoiced > 0 ? 'rgba(156, 39, 176, 0.4)' : (stats.maqgo_to_invoice || 0) > 0 ? 'rgba(0, 188, 212, 0.4)' : 'rgba(255, 167, 38, 0.4)'}`,
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
              <p style={{ color: '#90BDD3', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatPrice(finances.clientCommission)}
              </p>
            </div>

            {/* Comisión Proveedor */}
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 16 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase' }}>
                Comisión Proveedor
              </p>
              <p style={{ color: '#9C27B0', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
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
              <span style={{ color: '#4CAF50', fontSize: 18 }}>✓</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Completados: <strong style={{ color: '#4CAF50' }}>{finances.completed}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#F44336', fontSize: 18 }}>✕</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Cancelados: <strong style={{ color: '#F44336' }}>{finances.cancelled}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#FFA726', fontSize: 18 }}>⚠</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Reclamos: <strong style={{ color: '#FFA726' }}>{finances.disputed}</strong>
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
                  background: 'rgba(156, 39, 176, 0.1)', 
                  border: '1px solid rgba(156, 39, 176, 0.3)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#9C27B0'
                }}>
                  {stats.invoiced} facturas por cobrar
                </div>
              )}
              {(stats.maqgo_to_invoice || 0) > 0 && (
                <div style={{ 
                  background: 'rgba(0, 188, 212, 0.1)', 
                  border: '1px solid rgba(0, 188, 212, 0.3)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#00ACC1'
                }}>
                  {stats.maqgo_to_invoice} MAQGO debe facturar al cliente
                </div>
              )}
              {stats.disputed > 0 && (
                <div style={{ 
                  background: 'rgba(244, 67, 54, 0.1)', 
                  border: '1px solid rgba(244, 67, 54, 0.3)',
                  borderRadius: 8, 
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#F44336'
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
              ? { color: '#00ACC1', bg: 'rgba(0, 188, 212, 0.1)' } 
              : STATUS_CONFIG.disputed);
            return (
              <div
                key={item.key}
                onClick={() => setFilter(item.key)}
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
            onClick={() => setFilter('all')}
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
          ) : filteredServices.length === 0 ? (
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
              {filteredServices.map((service, index) => {
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
                      {service.machinery_type} · {MACHINERY_PER_TRIP.includes(getMachineryId(service.machinery_type)) ? 'viaje' : `${service.hours}h`}
                    </p>
                  </div>

                  {/* Fecha */}
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                    {formatDate(service.created_at)}
                  </span>

                  {/* Monto */}
                  <div>
                    <span style={{ 
                      color: '#4CAF50', 
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
                    {service.invoice_number ? (
                      <button
                        onClick={() => viewInvoice(service)}
                        style={{
                          background: 'rgba(156, 39, 176, 0.2)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 10px',
                          color: '#9C27B0',
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        #{service.invoice_number}
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
                        onClick={() => payWithoutInvoice(service._id)}
                        style={{
                          background: 'rgba(255, 152, 0, 0.9)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        title="Proveedor no subió factura. MAQGO retiene 19% IVA y paga el resto."
                      >
                        Pagar sin factura
                      </button>
                    )}
                    {service.status === 'invoiced' && (
                      <button
                        onClick={() => updateStatus(service._id, 'paid')}
                        style={{
                          background: '#4CAF50',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Marcar Pagado
                      </button>
                    )}
                    {service.status === 'paid' && service.maqgo_client_invoice_pending !== false && (
                      <button
                        onClick={() => markClientInvoiced(service._id)}
                        style={{
                          background: '#00ACC1',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#fff',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        ✓ Cliente facturado
                      </button>
                    )}
                    {service.status === 'pending_review' && (
                      <button
                        onClick={() => updateStatus(service._id, 'disputed')}
                        style={{
                          background: 'transparent',
                          border: '1px solid #F44336',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#F44336',
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        Disputar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
                Factura #{selectedService.invoice_number}
              </h3>
              <button
                onClick={() => setShowInvoiceModal(false)}
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
              <p><strong>{MACHINERY_PER_TRIP.includes(getMachineryId(selectedService.machinery_type)) ? 'Tipo' : 'Horas'}:</strong> {MACHINERY_PER_TRIP.includes(getMachineryId(selectedService.machinery_type)) ? 'Valor viaje' : selectedService.hours}</p>
              <p><strong>Monto a pagar:</strong> {formatPrice(selectedService.net_total)}</p>
            </div>

            {selectedService.invoice_image && (
              <div style={{ marginTop: 16 }}>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 8 }}>
                  Imagen de factura:
                </p>
                <img 
                  src={selectedService.invoice_image} 
                  alt="Factura"
                  style={{ width: '100%', borderRadius: 8 }}
                />
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              {selectedService.status === 'invoiced' && (
                <button
                  onClick={() => {
                    updateStatus(selectedService._id, 'paid');
                    setShowInvoiceModal(false);
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#4CAF50',
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ✓ Aprobar y Marcar Pagado
                </button>
              )}
              <button
                onClick={() => setShowInvoiceModal(false)}
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

            {/* Resumen de Solicitudes */}
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3 style={{ color: '#fff', fontSize: 14, margin: '0 0 12px', fontWeight: 600 }}>
                RESUMEN DE SOLICITUDES
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Total solicitudes</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.total_solicitudes}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Tiempo promedio confirmación</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.tiempo_promedio_confirmacion_min} min</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Aceptadas</td>
                    <td style={{ color: '#4CAF50', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.solicitudes_aceptadas}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Rechazadas</td>
                    <td style={{ color: '#F44336', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.solicitudes_rechazadas}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Sin respuesta</td>
                    <td style={{ color: '#FFA726', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.solicitudes_sin_respuesta}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Canceladas</td>
                    <td style={{ color: '#9C27B0', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.solicitudes_canceladas}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '10px 0 6px' }}>Tasa de cancelación</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.tasa_cancelacion}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Reservas Inmediatas */}
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3 style={{ color: '#fff', fontSize: 14, margin: '0 0 12px', fontWeight: 600 }}>
                RESERVAS INMEDIATAS (mismo día)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Total reservas inmediatas</td>
                    <td style={{ color: '#fff', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.reservas_inmediatas}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0' }}>Tasa de aceptación</td>
                    <td style={{ color: '#4CAF50', textAlign: 'right', fontWeight: 600 }}>{weeklyReport.resumen?.tasa_aceptacion_inmediatas}</td>
                  </tr>
                </tbody>
              </table>
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
                onClick={() => fetchWeeklyReport(1)}
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
              Este informe refleja el desempeño operativo de la plataforma durante la semana y se utiliza para ajustes de oferta, matching y reglas de operación.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
