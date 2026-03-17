import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ServiceProgress from '../../components/ServiceProgress';
import ServiceVoucher from '../../components/ServiceVoucher';
import { ProviderNavigation } from '../../components/BottomNavigation';
import { downloadVoucherPDF } from '../../utils/voucherPdf';

/**
 * Dashboard Simplificado del Proveedor
 * - Lista de servicios con estados claros
 * - Voucher con desglose para facturación
 */
function ProviderDashboardSimple() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [totals, setTotals] = useState({ pending: 0, toInvoice: 0, paid: 0 });
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    const mockServices = [
      { id: 'srv_001', transactionId: 'MQ-12345678', status: 'approved', date: new Date().toISOString(), machineryType: 'Retroexcavadora', hours: 4, operatorName: 'Juan Pérez', serviceAmount: 180000, bonusAmount: 36000, transportAmount: 25000 },
      { id: 'srv_002', transactionId: 'MQ-12345679', status: 'pending_review', date: new Date(Date.now() - 86400000).toISOString(), machineryType: 'Camión Aljibe', hours: 1, operatorName: 'María González', serviceAmount: 260000, bonusAmount: 26000, transportAmount: 0 },
      { id: 'srv_003', transactionId: 'MQ-12345680', status: 'invoiced', date: new Date(Date.now() - 172800000).toISOString(), machineryType: 'Excavadora', hours: 6, operatorName: 'Pedro López', serviceAmount: 660000, bonusAmount: 99000, transportAmount: 35000 },
      { id: 'srv_004', transactionId: 'MQ-12345681', status: 'paid', date: new Date(Date.now() - 604800000).toISOString(), machineryType: 'Minicargador', hours: 8, operatorName: 'Juan Pérez', serviceAmount: 500000, bonusAmount: 50000, transportAmount: 20000 },
    ];
    setServices(mockServices);
    let pending = 0, toInvoice = 0, paid = 0;
    mockServices.forEach(s => {
      const total = (s.serviceAmount + s.bonusAmount + s.transportAmount) * 1.19;
      const commission = (s.serviceAmount + s.bonusAmount + s.transportAmount) * 0.10 * 1.19;
      const net = total - commission;
      if (s.status === 'pending_review') pending += net;
      else if (s.status === 'approved') toInvoice += net;
      else if (s.status === 'paid') paid += net;
    });
    setTotals({ pending: Math.round(pending), toInvoice: Math.round(toInvoice), paid: Math.round(paid) });
  }, []);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(price || 0);
  };

  const getServiceTotal = (s) => {
    return (s.serviceAmount || 0) + (s.bonusAmount || 0) + (s.transportAmount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const configs = {
      pending_review: { label: 'Por aprobar', bg: 'rgba(144, 189, 211, 0.15)', color: '#90BDD3' },
      approved: { label: 'Para facturar', bg: 'rgba(236, 104, 25, 0.15)', color: '#EC6819' },
      invoiced: { label: 'En proceso', bg: 'rgba(144, 189, 211, 0.15)', color: '#90BDD3' },
      paid: { label: 'Pagado', bg: 'rgba(76, 175, 80, 0.15)', color: '#4CAF50' }
    };
    return configs[status] || configs.pending_review;
  };

  // Si hay un servicio seleccionado, mostrar el voucher
  if (selectedService) {
    return (
      <div style={{ 
        background: '#18181C', 
        minHeight: '100vh',
        padding: '20px'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          marginBottom: 20
        }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            onClick={() => setSelectedService(null)}
            style={{ width: 'auto' }}
          >
            ← Volver
          </button>
        </div>

        {/* Progreso */}
        <ServiceProgress 
          status={selectedService.status} 
          approvalTime="24h"
        />

        {/* Voucher */}
        <ServiceVoucher 
          service={selectedService}
          onDownload={() => downloadVoucherPDF(selectedService)}
          onUploadInvoice={() => navigate('/provider/upload-invoice', { state: { service: selectedService } })}
        />
      </div>
    );
  }

  return (
    <div style={{ 
      background: '#18181C', 
      minHeight: '100vh',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24
      }}>
        <MaqgoLogo size="small" />
      </div>

      <h1 style={{ 
        color: '#fff', 
        fontSize: 20, 
        fontWeight: 700, 
        margin: '0 0 20px',
        fontFamily: "'Inter', sans-serif"
      }}>
        Mis Cobros
      </h1>

      {/* Filtros - 4 estados incluyendo Todos */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: 6,
        marginBottom: 20
      }}>
        <button 
          onClick={() => setActiveFilter('all')}
          style={{
            background: activeFilter === 'all' ? 'rgba(255,255,255,0.1)' : '#2A2A2A',
            borderRadius: 10,
            padding: '10px 6px',
            textAlign: 'center',
            border: activeFilter === 'all' ? '2px solid rgba(255,255,255,0.5)' : 'none',
            cursor: 'pointer'
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, margin: '0 0 2px', textTransform: 'uppercase' }}>
            Todos
          </p>
          <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>
            {services.length}
          </p>
        </button>

        <button 
          onClick={() => setActiveFilter(activeFilter === 'pending_review' ? 'all' : 'pending_review')}
          style={{
            background: activeFilter === 'pending_review' ? 'rgba(144, 189, 211, 0.2)' : '#2A2A2A',
            borderRadius: 10,
            padding: '10px 6px',
            textAlign: 'center',
            border: activeFilter === 'pending_review' ? '2px solid #90BDD3' : 'none',
            cursor: 'pointer'
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, margin: '0 0 2px', textTransform: 'uppercase' }}>
            Por aprobar
          </p>
          <p style={{ color: '#90BDD3', fontSize: 13, fontWeight: 700, margin: 0 }}>
            {formatPrice(totals.pending)}
          </p>
        </button>
        
        <button 
          onClick={() => setActiveFilter(activeFilter === 'approved' ? 'all' : 'approved')}
          style={{
            background: activeFilter === 'approved' ? 'rgba(236, 104, 25, 0.2)' : '#2A2A2A',
            borderRadius: 10,
            padding: '10px 6px',
            textAlign: 'center',
            border: activeFilter === 'approved' ? '2px solid #EC6819' : '1px solid rgba(236, 104, 25, 0.3)',
            cursor: 'pointer'
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, margin: '0 0 2px', textTransform: 'uppercase' }}>
            Para facturar
          </p>
          <p style={{ color: '#EC6819', fontSize: 13, fontWeight: 700, margin: 0 }}>
            {formatPrice(totals.toInvoice)}
          </p>
        </button>
        
        <button 
          onClick={() => setActiveFilter(activeFilter === 'paid' ? 'all' : 'paid')}
          style={{
            background: activeFilter === 'paid' ? 'rgba(76, 175, 80, 0.2)' : '#2A2A2A',
            borderRadius: 10,
            padding: '10px 6px',
            textAlign: 'center',
            border: activeFilter === 'paid' ? '2px solid #4CAF50' : 'none',
            cursor: 'pointer'
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, margin: '0 0 2px', textTransform: 'uppercase' }}>
            Pagado
          </p>
          <p style={{ color: activeFilter === 'paid' ? '#4CAF50' : '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>
            {formatPrice(totals.paid)}
          </p>
        </button>
      </div>

      {/* Lista de servicios - Filtrada */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 80 }}>
        {services
          .filter(s => activeFilter === 'all' || s.status === activeFilter || (activeFilter === 'approved' && s.status === 'invoiced'))
          .map(service => {
          const badge = getStatusBadge(service.status);
          return (
            <button
              key={service.id}
              onClick={() => setSelectedService(service)}
              style={{
                background: '#1A1A1F',
                border: service.status === 'approved' 
                  ? '1px solid rgba(236, 104, 25, 0.3)' 
                  : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 14,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%'
              }}
            >
              {/* Header del servicio */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: 8
              }}>
                <div>
                  <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>
                    {service.machineryType}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
                    {service.operatorName} · {formatDate(service.date)}
                  </p>
                </div>
                <span style={{
                  background: badge.bg,
                  color: badge.color,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6
                }}>
                  {badge.label}
                </span>
              </div>

              {/* Monto */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center'
              }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                  A facturar:
                </span>
                <span style={{ color: '#EC6819', fontSize: 16, fontWeight: 700 }}>
                  {formatPrice(getServiceTotal(service))}
                </span>
              </div>

              {/* Mini progreso */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 4,
                marginTop: 10
              }}>
                {['pending_review', 'approved', 'invoiced', 'paid'].map((s, i) => {
                  const states = ['pending_review', 'approved', 'invoiced', 'paid'];
                  const currentIdx = states.indexOf(service.status);
                  return (
                    <React.Fragment key={s}>
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: i <= currentIdx ? '#EC6819' : '#444'
                      }} />
                      {i < 3 && (
                        <div style={{
                          flex: 1,
                          height: 2,
                          background: i < currentIdx ? '#EC6819' : '#444'
                        }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Navegación inferior */}
      <ProviderNavigation />
    </div>
  );
}

export default ProviderDashboardSimple;
