import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from 'lucide-react';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';

function OperatorServiceActiveScreen() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);

  useEffect(() => {
    const load = async () => {
      const sid = String(localStorage.getItem('currentServiceId') || '').trim();
      if (!sid) return;
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/service-requests/${encodeURIComponent(sid)}`);
        const data = await res.json();
        setService(data);
        localStorage.setItem('activeServiceRequest', JSON.stringify(data));
        localStorage.setItem('acceptedRequest', JSON.stringify(data));
      } catch {
        void 0;
      }
    };
    void load();
  }, []);

  const locationText = service?.location?.address || service?.location || 'Por confirmar';

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/operator/home') }}
      header={{
        icon: <Timer size={22} />,
        title: 'Servicio en progreso',
        subtitle: 'Estado actualizado automáticamente.',
        badgeLabel: 'En progreso',
        badgeTone: 'info',
        meta: service?.id ? [{ label: 'ID servicio', value: String(service.id).slice(0, 8) }] : [],
      }}
      primaryTitle="Estado"
      primary={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 1.5 }}>
            Continúa con la ejecución del servicio. Si necesitas volver al detalle, usa el Centro de Avisos.
          </div>
          <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>
            Ubicación: <span style={{ color: '#fff', fontWeight: 800 }}>{locationText}</span>
          </div>
        </div>
      }
      summary={{
        title: 'Resumen',
        machinery: service?.machineryType || 'Por confirmar',
        operatorName: service?.providerOperatorName || 'Operador asignado',
        operatorRut: service?.operatorRut || 'Información no disponible',
        licensePlate: service?.licensePlate || service?.license_plate || '',
        location: locationText,
        duration: '',
      }}
      secondaryActions={[
        {
          key: 'to-avisos',
          label: 'Ir a avisos',
          variant: 'secondary',
          onClick: () => navigate('/operator/avisos'),
        },
        {
          key: 'to-home',
          label: 'Volver al inicio',
          variant: 'primary',
          onClick: () => navigate('/operator/home'),
        },
      ]}
    />
  );
}

export default OperatorServiceActiveScreen;

