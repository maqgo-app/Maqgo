import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import ServiceProgress from '../../components/ServiceProgress';
import ServiceVoucher from '../../components/ServiceVoucher';
import { ProviderNavigation } from '../../components/BottomNavigation';
import { downloadVoucherPDF } from '../../utils/voucherPdf';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { MACHINERY_NAMES } from '../../utils/machineryNames';

/** Solo si falla la API: evita pantalla vacía en demo; siempre con banner explícito. */
function buildDemoServices() {
  return [
    { id: 'demo_srv_001', transactionId: 'MQ-12345678', status: 'approved', date: new Date().toISOString(), machineryType: 'Retroexcavadora', machinery_type: 'retroexcavadora', hours: 4, operatorName: 'Juan Pérez', operatorRut: '18.765.432-1', serviceAmount: 180000, bonusAmount: 36000, transportAmount: 25000 },
    { id: 'demo_srv_002', transactionId: 'MQ-12345679', status: 'pending_review', date: new Date(Date.now() - 86400000).toISOString(), machineryType: 'Camión Aljibe', machinery_type: 'camion_aljibe', hours: 1, operatorName: 'María González', operatorRut: '16.234.567-2', serviceAmount: 260000, bonusAmount: 26000, transportAmount: 0 },
    { id: 'demo_srv_003', transactionId: 'MQ-12345680', status: 'invoiced', date: new Date(Date.now() - 172800000).toISOString(), machineryType: 'Excavadora', machinery_type: 'excavadora', hours: 6, operatorName: 'Pedro López', operatorRut: '14.111.222-3', serviceAmount: 660000, bonusAmount: 99000, transportAmount: 35000 },
    { id: 'demo_srv_004', transactionId: 'MQ-12345681', status: 'paid', date: new Date(Date.now() - 604800000).toISOString(), machineryType: 'Minicargador', machinery_type: 'minicargador', hours: 8, operatorName: 'Juan Pérez', operatorRut: '18.765.432-1', serviceAmount: 500000, bonusAmount: 50000, transportAmount: 20000 },
  ];
}

function mapApiServiceToDashboard(s) {
  const serviceAmount = Number(s.service_amount ?? 0) || 0;
  const bonusAmount = Number(s.bonus_amount ?? s.immediate_bonus ?? 0) || 0;
  const transportAmount = Number(s.transport_amount ?? 0) || 0;
  const id = String(s._id ?? s.id ?? '');
  return {
    id,
    transactionId: s.transaction_id || s.order_number || (id ? `MQ-${id.slice(-8)}` : ''),
    status: s.status || 'pending_review',
    date: s.created_at || s.date || new Date().toISOString(),
    machineryType: MACHINERY_NAMES[s.machinery_type] || s.machinery_type || 'Servicio',
    machinery_type: s.machinery_type,
    hours: s.hours ?? 0,
    operatorName: s.operator_name || s.operatorName || '—',
    operatorRut: s.operator_rut || '',
    serviceAmount,
    bonusAmount,
    transportAmount,
  };
}

function computeTotals(list) {
  let pending = 0;
  let toInvoice = 0;
  let paid = 0;
  list.forEach((s) => {
    const gross = (s.serviceAmount || 0) + (s.bonusAmount || 0) + (s.transportAmount || 0);
    const total = gross * 1.19;
    const commission = gross * 0.1 * 1.19;
    const net = total - commission;
    if (s.status === 'pending_review') pending += net;
    else if (s.status === 'approved' || s.status === 'invoiced') toInvoice += net;
    else if (s.status === 'paid') paid += net;
  });
  return { pending: Math.round(pending), toInvoice: Math.round(toInvoice), paid: Math.round(paid) };
}

/**
 * Cobros / dashboard proveedor (titular/gerente).
 * Datos reales: GET /api/services/provider/:id. Operador: redirige a su home.
 */
function ProviderDashboardSimple() {
  const navigate = useNavigate();
  const isOperator =
    typeof window !== 'undefined' && localStorage.getItem('providerRole') === 'operator';

  const [services, setServices] = useState([]);
  const [totals, setTotals] = useState({ pending: 0, toInvoice: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /** api | empty | demo */
  const [dataMode, setDataMode] = useState('loading');
  const [selectedService, setSelectedService] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const load = useCallback(async () => {
    if (isOperator) return;
    setLoading(true);
    setError(null);
    const providerId = localStorage.getItem('userId');
    if (!providerId) {
      setServices([]);
      setTotals({ pending: 0, toInvoice: 0, paid: 0 });
      setDataMode('empty');
      setError('Inicia sesión para ver tus cobros.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/services/provider/${providerId}`, {}, 20000);
      if (!res.ok) {
        throw new Error('No se pudieron cargar tus cobros.');
      }
      const data = await res.json();
      const raw = data.services || [];
      const mapped = raw.map(mapApiServiceToDashboard);
      setServices(mapped);
      setTotals(computeTotals(mapped));
      setDataMode(mapped.length === 0 ? 'empty' : 'api');
    } catch (e) {
      const msg = e?.message === 'Tiempo de espera agotado' ? 'La solicitud tardó demasiado. Revisa tu conexión.' : (e?.message || 'No pudimos cargar el listado.');
      setError(msg);
      if (import.meta.env.PROD) {
        setServices([]);
        setTotals({ pending: 0, toInvoice: 0, paid: 0 });
        setDataMode('empty');
      } else {
        const demo = buildDemoServices();
        setServices(demo);
        setTotals(computeTotals(demo));
        setDataMode('demo');
      }
    } finally {
      setLoading(false);
    }
  }, [isOperator]);

  useEffect(() => {
    if (!isOperator) load();
  }, [load, isOperator]);

  const filteredServices = useMemo(
    () =>
      services.filter(
        (s) =>
          activeFilter === 'all' ||
          s.status === activeFilter ||
          (activeFilter === 'approved' && s.status === 'invoiced')
      ),
    [services, activeFilter]
  );

  if (isOperator) {
    return <Navigate to="/operator/home" replace />;
  }

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(price || 0);

  const getServiceTotal = (s) =>
    (s.serviceAmount || 0) + (s.bonusAmount || 0) + (s.transportAmount || 0);

  const formatDate = (date) =>
    new Date(date).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const getStatusBadge = (status) => {
    const configs = {
      pending_review: { label: 'Por aprobar', bg: 'rgba(144, 189, 211, 0.15)', color: '#90BDD3' },
      approved: { label: 'Para facturar', bg: 'rgba(236, 104, 25, 0.15)', color: '#EC6819' },
      invoiced: { label: 'En proceso', bg: 'rgba(144, 189, 211, 0.15)', color: '#90BDD3' },
      paid: { label: 'Pagado', bg: 'rgba(76, 175, 80, 0.15)', color: '#4CAF50' },
    };
    return configs[status] || configs.pending_review;
  };

  if (selectedService) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div
          className="maqgo-screen maqgo-screen--scroll"
          style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={() => setSelectedService(null)}
              style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <BackArrowIcon />
              Volver
            </button>
          </div>

          <ServiceProgress status={selectedService.status} approvalTime="24h" />

          <ServiceVoucher
            service={selectedService}
            onDownload={() => downloadVoucherPDF(selectedService)}
            onUploadInvoice={() =>
              navigate(
                selectedService.id && !String(selectedService.id).startsWith('demo_')
                  ? `/provider/upload-invoice/${encodeURIComponent(selectedService.id)}`
                  : '/provider/upload-invoice',
                { state: { service: selectedService } }
              )
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/provider/profile')}
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

        {dataMode === 'demo' && (
          <div
            role="status"
            style={{
              background: 'rgba(236, 104, 25, 0.12)',
              border: '1px solid rgba(236, 104, 25, 0.45)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#fff', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
              <strong>Vista de ejemplo.</strong> No pudimos cargar tus datos reales{error ? ` (${error})` : ''}.
              Conecta la app o reintenta.
            </p>
            <button
              type="button"
              className="maqgo-btn-primary"
              style={{ marginTop: 10, width: '100%', borderRadius: 20 }}
              onClick={() => load()}
            >
              Reintentar
            </button>
          </div>
        )}

        <h1
          style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 700,
            margin: '0 0 8px',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Mis Cobros
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '0 0 20px', lineHeight: 1.4 }}>
          Resumen de servicios y montos a cobrar (IVA y tarifa MAQGO según tu contrato).
        </p>

        {loading && (
          <p style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', padding: '24px 0' }}>
            Cargando movimientos…
          </p>
        )}

        {!loading && dataMode === 'empty' && !error?.includes('Sesión') && (
          <div
            style={{
              background: '#2A2A2A',
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            <p style={{ color: '#fff', fontSize: 15, margin: '0 0 8px', fontWeight: 600 }}>Aún no hay movimientos</p>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.45 }}>
              Cuando completes servicios, aparecerán aquí para facturación y seguimiento de pago.
            </p>
            <button type="button" className="maqgo-btn-primary" onClick={() => navigate('/provider/profile')}>
              Volver a Mi Empresa
            </button>
          </div>
        )}

        {!loading && error && dataMode === 'empty' && error.includes('Sesión') && (
          <p style={{ color: '#ff6b6b', fontSize: 14, textAlign: 'center' }}>{error}</p>
        )}

        {!loading && services.length > 0 && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                style={{
                  background: activeFilter === 'all' ? 'rgba(255,255,255,0.1)' : '#2A2A2A',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                  border: activeFilter === 'all' ? '2px solid rgba(255,255,255,0.5)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <p
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 8,
                    margin: '0 0 2px',
                    textTransform: 'uppercase',
                  }}
                >
                  Todos
                </p>
                <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>{services.length}</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter(activeFilter === 'pending_review' ? 'all' : 'pending_review')}
                style={{
                  background: activeFilter === 'pending_review' ? 'rgba(144, 189, 211, 0.2)' : '#2A2A2A',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                  border: activeFilter === 'pending_review' ? '2px solid #90BDD3' : 'none',
                  cursor: 'pointer',
                }}
              >
                <p
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 8,
                    margin: '0 0 2px',
                    textTransform: 'uppercase',
                  }}
                >
                  Por aprobar
                </p>
                <p style={{ color: '#90BDD3', fontSize: 13, fontWeight: 700, margin: 0 }}>
                  {formatPrice(totals.pending)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter(activeFilter === 'approved' ? 'all' : 'approved')}
                style={{
                  background: activeFilter === 'approved' ? 'rgba(236, 104, 25, 0.2)' : '#2A2A2A',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                  border:
                    activeFilter === 'approved' ? '2px solid #EC6819' : '1px solid rgba(236, 104, 25, 0.3)',
                  cursor: 'pointer',
                }}
              >
                <p
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 8,
                    margin: '0 0 2px',
                    textTransform: 'uppercase',
                  }}
                >
                  Para facturar
                </p>
                <p style={{ color: '#EC6819', fontSize: 13, fontWeight: 700, margin: 0 }}>
                  {formatPrice(totals.toInvoice)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter(activeFilter === 'paid' ? 'all' : 'paid')}
                style={{
                  background: activeFilter === 'paid' ? 'rgba(76, 175, 80, 0.2)' : '#2A2A2A',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                  border: activeFilter === 'paid' ? '2px solid #4CAF50' : 'none',
                  cursor: 'pointer',
                }}
              >
                <p
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 8,
                    margin: '0 0 2px',
                    textTransform: 'uppercase',
                  }}
                >
                  Pagado
                </p>
                <p
                  style={{
                    color: activeFilter === 'paid' ? '#4CAF50' : '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  {formatPrice(totals.paid)}
                </p>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 80 }}>
              {filteredServices.map((service) => {
                const badge = getStatusBadge(service.status);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedService(service)}
                    style={{
                      background: '#1A1A1F',
                      border:
                        service.status === 'approved'
                          ? '1px solid rgba(236, 104, 25, 0.3)'
                          : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      padding: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>
                          {service.machineryType}
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
                          {service.operatorName} · {formatDate(service.date)}
                        </p>
                      </div>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Monto neto referencial:</span>
                      <span style={{ color: '#EC6819', fontSize: 16, fontWeight: 700 }}>
                        {formatPrice(getServiceTotal(service))}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 10,
                      }}
                    >
                      {['pending_review', 'approved', 'invoiced', 'paid'].map((s, i) => {
                        const states = ['pending_review', 'approved', 'invoiced', 'paid'];
                        const currentIdx = states.indexOf(service.status);
                        return (
                          <React.Fragment key={s}>
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: i <= currentIdx ? '#EC6819' : '#444',
                              }}
                            />
                            {i < 3 && (
                              <div
                                style={{
                                  flex: 1,
                                  height: 2,
                                  background: i < currentIdx ? '#EC6819' : '#444',
                                }}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <ProviderNavigation />
      </div>
    </div>
  );
}

export default ProviderDashboardSimple;
