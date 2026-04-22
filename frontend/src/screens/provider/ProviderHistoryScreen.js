import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { HistoryListSkeleton } from '../../components/ListSkeleton';

import BACKEND_URL from '../../utils/api';

import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

function ProviderHistoryScreen() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  /** true solo si se muestran filas de ejemplo por fallo de red/API */
  const [usingDemoFallback, setUsingDemoFallback] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'paid'

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    setFetchError(null);
    const providerId = localStorage.getItem('providerId') || localStorage.getItem('userId');
    if (!providerId) {
      setServices([]);
      setUsingDemoFallback(false);
      setFetchError('Inicia sesión para ver tu historial.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/provider/${providerId}`, {}, 20000);
      if (!res.ok) {
        throw new Error('No se pudo cargar el historial.');
      }
      const data = await res.json();
      setServices(data.services || []);
      setUsingDemoFallback(false);
    } catch {
      if (import.meta.env.PROD) {
        setFetchError('No se pudo cargar tu historial. Revisa tu conexión e intenta nuevamente.');
        setUsingDemoFallback(false);
        setServices([]);
      } else {
        setFetchError('Mostrando datos de ejemplo hasta reconectar.');
        setUsingDemoFallback(true);
        setServices([
          {
            _id: 'demo-1',
            transaction_id: 'MQ-12345678',
            status: 'approved',
            machinery_type: 'retroexcavadora',
            hours: 4,
            location: 'Santiago Centro',
            net_total: 258111,
            service_amount: 180000,
            bonus_amount: 36000,
            transport_amount: 25000,
            client_billing: { billingType: 'empresa', rut: '76.123.456-7', razonSocial: 'Constructora Demo SpA', giro: 'Construcción', direccion: 'Av. Providencia 1234' },
            created_at: new Date().toISOString(),
            needs_invoice: true
          },
          {
            _id: 'demo-2',
            status: 'pending_review',
            machinery_type: 'camion_aljibe',
            hours: 0,
            location: 'Las Condes',
            net_total: 306306,
            created_at: new Date(Date.now() - 3600000).toISOString(),
            approval_time: 4,
            needs_invoice: false
          },
          {
            _id: 'demo-3',
            status: 'paid',
            machinery_type: 'excavadora',
            hours: 8,
            location: 'Providencia',
            net_total: 450000,
            created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            paid_at: new Date(Date.now() - 86400000).toISOString()
          },
          {
            _id: 'demo-4',
            status: 'paid',
            machinery_type: 'minicargador',
            hours: 6,
            location: 'Ñuñoa',
            net_total: 320000,
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            paid_at: new Date(Date.now() - 86400000 * 2).toISOString()
          }
        ]);
      }
    } finally {
      setLoading(false);
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
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Convertir servicio API a formato voucher (desglose) para upload-invoice
  const serviceToVoucher = (s) => {
    const serviceAmount = s.service_amount ?? Math.round((s.net_total || 0) / 1.071 * 0.75);
    const bonusAmount = s.bonus_amount ?? Math.round((s.net_total || 0) / 1.071 * 0.15);
    const transportAmount = s.transport_amount ?? Math.round((s.net_total || 0) / 1.071 * 0.10);
    return {
      id: s._id,
      transactionId: s.transaction_id || s.order_number || (s._id ? `MQ-${String(s._id).slice(-8)}` : null),
      machineryType: MACHINERY_NAMES[s.machinery_type] || s.machinery_type,
      machinery_type: s.machinery_type,
      hours: s.hours || 0,
      serviceAmount,
      bonusAmount,
      transportAmount,
      net_total: s.net_total,
      date: s.created_at
    };
  };

  // Separar servicios
  const pendingServices = services.filter(s => ['pending_review', 'approved', 'invoiced'].includes(s.status));
  const paidServices = services.filter(s => s.status === 'paid');
  
  // Ordenar pendientes: primero los que requieren acción (approved), luego pending_review
  const sortedPending = [...pendingServices].sort((a, b) => {
    const order = { approved: 0, pending_review: 1, invoiced: 2 };
    return (order[a.status] || 3) - (order[b.status] || 3);
  });

  // Calcular totales
  const pendingTotal = pendingServices.reduce((sum, s) => sum + (s.net_total || 0), 0);
  const paidTotal = paidServices.reduce((sum, s) => sum + (s.net_total || 0), 0);

  // Agrupar por estado para mostrar
  const toInvoice = sortedPending.filter(s => s.status === 'approved');
  const inReview = sortedPending.filter(s => s.status === 'pending_review');
  const processing = sortedPending.filter(s => s.status === 'invoiced');

  const renderServiceCard = (service, showAction = false) => {
    const needsInvoice = service.needs_invoice !== false;
    
    return (
      <div 
        key={service._id}
        onClick={() => {
          if (service.status === 'approved' && needsInvoice) {
            navigate(`/provider/upload-invoice/${service._id}`, { 
              state: { service: serviceToVoucher(service) } 
            });
          }
        }}
        style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          cursor: service.status === 'approved' && needsInvoice ? 'pointer' : 'default'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
              {MACHINERY_NAMES[service.machinery_type] || service.machinery_type}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
              {isPerTripMachineryType(service.machinery_type || service.machineryType) ? 'Valor viaje · ' : (service.hours > 0 ? `${service.hours}h · ` : '')}{service.location} · {formatDate(service.created_at)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ 
              color: service.status === 'paid' ? '#4CAF50' : '#90BDD3', 
              fontSize: 16, 
              fontWeight: 700, 
              margin: 0 
            }}>
              {formatPrice(service.net_total)}
            </p>
          </div>
        </div>
        
        {/* Acción si es para facturar */}
        {showAction && service.status === 'approved' && needsInvoice && (
          <button style={{
            width: '100%',
            marginTop: 12,
            padding: '10px',
            background: '#EC6819',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Subir factura
          </button>
        )}
        
        {/* Info si está en revisión */}
        {service.status === 'pending_review' && (
          <p style={{ 
            color: 'rgba(255,255,255,0.6)', 
            fontSize: 13, 
            margin: '8px 0 0',
            textAlign: 'center'
          }}>
            ⏳ Aprobación automática en {service.approval_time || 24}h
          </p>
        )}

        {/* Info si no necesita factura */}
        {service.status === 'approved' && !needsInvoice && (
          <p style={{ 
            color: '#4CAF50', 
            fontSize: 13, 
            margin: '8px 0 0',
            textAlign: 'center'
          }}>
            ✓ Pago en proceso · No requiere factura
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{ padding: 24, paddingBottom: 100 }}
      >
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button 
            onClick={() => navigate(getProviderLandingPath())}
            style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
            aria-label="Volver al inicio"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <h1 className="maqgo-h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>
            Mis Cobros
          </h1>
          <div style={{ width: 40 }}></div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: -8, marginBottom: 20 }}>
          Pendientes por facturar y pagos recibidos
        </p>

        {fetchError && !loading && (
          <div
            role="status"
            style={{
              background: usingDemoFallback ? 'rgba(236, 104, 25, 0.12)' : 'rgba(255, 107, 107, 0.12)',
              border: usingDemoFallback ? '1px solid rgba(236, 104, 25, 0.4)' : '1px solid rgba(255, 107, 107, 0.35)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#fff', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
              {usingDemoFallback ? <><strong>Vista de ejemplo.</strong> {fetchError}</> : fetchError}
            </p>
            {usingDemoFallback && (
              <button
                type="button"
                className="maqgo-btn-primary"
                style={{ marginTop: 10, width: '100%', borderRadius: 20 }}
                onClick={() => fetchServices()}
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        {/* TABS PRINCIPALES */}
        <div style={{ 
          display: 'flex', 
          background: '#2A2A2A', 
          borderRadius: 12, 
          padding: 4,
          marginBottom: 20
        }}>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              flex: 1,
              padding: '12px 8px',
              borderRadius: 10,
              border: 'none',
              background: activeTab === 'pending' ? '#EC6819' : 'transparent',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <div>Pendiente</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{formatPrice(pendingTotal)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>({pendingServices.length})</div>
          </button>
          
          <button
            onClick={() => setActiveTab('paid')}
            style={{
              flex: 1,
              padding: '12px 8px',
              borderRadius: 10,
              border: 'none',
              background: activeTab === 'paid' ? '#4CAF50' : 'transparent',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <div>Pagado</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{formatPrice(paidTotal)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>({paidServices.length})</div>
          </button>
        </div>

        {/* CONTENIDO SEGÚN TAB */}
        {loading ? (
          <div style={{ paddingTop: 24 }}>
            <HistoryListSkeleton count={5} />
          </div>
        ) : activeTab === 'pending' ? (
          /* TAB PENDIENTE - Agrupado por sub-estado */
          <div>
            {/* Para facturar - Requiere acción */}
            {toInvoice.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  marginBottom: 10 
                }}>
                  <span style={{ 
                    background: '#EC6819', 
                    color: '#fff', 
                    fontSize: 12, 
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: 4
                  }}>
                    ACCIÓN REQUERIDA
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    Para facturar ({toInvoice.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {toInvoice.map(s => renderServiceCard(s, true))}
                </div>
              </div>
            )}

            {/* En revisión */}
            {inReview.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ 
                  color: 'rgba(255,255,255,0.7)', 
                  fontSize: 12, 
                  marginBottom: 10 
                }}>
                  ⏳ En revisión ({inReview.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {inReview.map(s => renderServiceCard(s))}
                </div>
              </div>
            )}

            {/* Procesando pago */}
            {processing.length > 0 && (
              <div>
                <p style={{ 
                  color: 'rgba(255,255,255,0.7)', 
                  fontSize: 12, 
                  marginBottom: 10 
                }}>
                  💳 Procesando pago ({processing.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {processing.map(s => renderServiceCard(s))}
                </div>
              </div>
            )}

            {pendingServices.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 8 }}>
                  No hay cobros pendientes
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 20 }}>
                  Los servicios que completes aparecerán aquí para facturar y cobrar.
                </p>
                <button type="button" className="maqgo-btn-secondary" onClick={() => navigate(getProviderLandingPath())} style={{ maxWidth: 280, margin: '0 auto' }}>
                  Volver al inicio
                </button>
              </div>
            )}
          </div>
        ) : (
          /* TAB PAGADOS */
          <div>
            {paidServices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {paidServices.map(s => renderServiceCard(s))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 8 }}>
                  Aún no tienes pagos recibidos
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 20 }}>
                  Tras subir la factura, el pago se refleja aquí en 2 días hábiles.
                </p>
                <button type="button" className="maqgo-btn-secondary" onClick={() => navigate(getProviderLandingPath())} style={{ maxWidth: 280, margin: '0 auto' }}>
                  Volver al inicio
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default ProviderHistoryScreen;
