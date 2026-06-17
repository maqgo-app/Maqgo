import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { Clock } from 'lucide-react';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

/**
 * Pantalla de Servicio en Progreso
 * Diseño industrial MAQGO
 */
function ServiceInProgress() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const lastErrorLogAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          const response = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          setService(response.data);
          
          if (response.data.status === 'last_30') {
            navigate('/client/last-30');
          } else if (response.data.status === 'finished') {
            navigate('/client/service-finished');
          }
        }
      } catch (error) {
        const now = Date.now();
        if (now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('ServiceInProgress poll error:', error?.message || error);
          }
          lastErrorLogAtRef.current = now;
        }
        throw error;
      }
    };
    
    let cancelled = false;
    let timeoutId = null;

    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;

      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await loadService();
        errorStreakRef.current = 0;
      } catch {
        errorStreakRef.current += 1;
      } finally {
        inFlightRef.current = false;
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * (2 ** errorStreakRef.current)
        );
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  const machineryLabel = getMachineryDisplayName(service?.machineryType || service?.machinery_type || 'retroexcavadora');
  const locationLabel = service?.location?.address || getBookingLocationLineOrEmpty() || 'Por confirmar';

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: <Clock size={22} />,
        title: 'Servicio en curso',
        subtitle: 'Seguimiento del servicio.',
        badgeLabel: 'En progreso',
        badgeTone: 'info',
        meta: [],
      }}
      primaryTitle="Estado"
      primary={<div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>En progreso.</div>}
      summary={{
        title: 'Resumen',
        machinery: machineryLabel,
        operatorName: 'Por confirmar',
        operatorRut: 'Por confirmar',
        licensePlate: 'Por confirmar',
        location: locationLabel,
        duration: '',
      }}
      alerts={[{ tone: 'info', title: 'Cierre', description: 'El servicio se cerrará automáticamente al finalizar la jornada.' }]}
      secondaryActions={[]}
    />
  );
}
export default ServiceInProgress;
