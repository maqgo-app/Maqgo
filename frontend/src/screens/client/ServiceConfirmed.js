import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { calculatePriceBreakdown, formatCLP } from '../../utils/commissions';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { CheckCircle2 } from 'lucide-react';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Servicio Confirmado
 * Diseño industrial MAQGO
 */
function ServiceConfirmed() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          const response = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          setService(response.data);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };
    loadService();
  }, []);

  const basePrice = service?.totalAmount || 150000;
  const breakdown = calculatePriceBreakdown(basePrice);

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: <CheckCircle2 size={22} />,
        title: 'Servicio confirmado',
        subtitle: 'Revisa el Centro de Avisos para cambios de estado.',
        badgeLabel: 'Confirmado',
        badgeTone: 'success',
        meta: service?.id ? [{ label: 'ID servicio', value: String(service.id).slice(0, 8) }] : [],
      }}
      primaryTitle="Costos"
      primary={
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>Valor del servicio</span>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{formatCLP(breakdown.client.serviceValue)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{breakdown.client.commissionLabel}</span>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{formatCLP(breakdown.client.commission)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{breakdown.client.ivaLabel}</span>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{formatCLP(breakdown.client.iva)}</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>{breakdown.client.totalLabel}</span>
            <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 900 }}>{formatCLP(breakdown.client.total)}</span>
          </div>
        </div>
      }
      summary={{
        title: 'Resumen',
        machinery: service?.machineryType || 'Por confirmar',
        operatorName: 'Por confirmar',
        operatorRut: 'Por confirmar',
        licensePlate: 'Por confirmar',
        location: 'Por confirmar',
        duration: '',
      }}
      alerts={[]}
      secondaryActions={[
        {
          key: 'go-to-progress',
          label: 'Ver servicio en curso',
          variant: 'primary',
          onClick: () => navigate('/client/in-progress'),
          testId: 'go-to-progress-btn',
        }
      ]}
    />
  );
}
export default ServiceConfirmed;
