import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';

function ServiceSummary() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        const response = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
        setService(response.data);
      } catch (error) {
        console.error('Error:', error);
      }
    };
    loadService();
  }, []);

  const handleNewReservation = () => {
    localStorage.removeItem('currentServiceId');
    navigate('/client/home');
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <MaqgoLogo size="small" />
        </div>
      
        <h2 style={{ color: '#fff', marginBottom: '30px', textAlign: 'center', fontSize: 24, fontWeight: 700 }}>
          Resumen del Servicio
        </h2>
        
        {service && (
          <div style={{ 
            background: '#363636', 
            borderRadius: 14, 
            padding: 24, 
            width: '100%',
            marginBottom: 20 
          }}>
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)' }}>Fecha: </span>
              <span style={{ color: '#fff' }}>{new Date(service.createdAt).toLocaleDateString('es-CL')}</span>
            </div>
            
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)' }}>Maquinaria: </span>
              <span style={{ color: '#fff' }}>{service.machineryType || 'Maquinaria pesada'}</span>
            </div>
            
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)' }}>Horas: </span>
              <span style={{ color: '#fff' }}>8 hrs + 1 hr colación</span>
            </div>
            
            <div style={{ borderTop: '1px solid rgba(255,140,66,0.2)', paddingTop: '15px', marginTop: '15px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)' }}>Total: </span>
              <span style={{ color: '#EC6819', fontSize: '24px', fontWeight: 'bold' }}>${service.totalAmount?.toLocaleString()}</span>
            </div>
          </div>
        )}
        
        <div className="maqgo-spacer"></div>
        
        <button 
          className="maqgo-btn-primary"
          onClick={handleNewReservation}
          data-testid="new-reservation-btn"
        >
          Nuevo arriendo
        </button>
      </div>
    </div>
  );
}

export default ServiceSummary;