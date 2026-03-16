import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';
import { getObjectFirst } from '../../utils/safeStorage';

/**
 * Pantalla C14 - Servicio en Curso
 */
function ServiceActiveScreen() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId && !serviceId.startsWith('demo')) {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          setService(res.data);
          
          if (res.data.status === 'completed' || res.data.status === 'finished') {
            localStorage.setItem('serviceEndTime', new Date().toISOString());
            navigate('/client/service-finished');
          }
        } else {
          // Demo / fallback: usar datos de localStorage
          const savedProvider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
          setService({
            machineryType: getMachineryDisplayName(localStorage.getItem('selectedMachinery') || 'retroexcavadora'),
            status: 'in_progress',
            providerName: savedProvider.operator_name || savedProvider.providerOperatorName || 'Operador asignado'
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadService();
    const interval = setInterval(loadService, 5000);
    return () => clearInterval(interval);
  }, [navigate]);

  // Demo: Botón para simular fin de servicio
  const handleFinish = () => {
    localStorage.setItem('serviceEndTime', new Date().toISOString());
    navigate('/client/service-finished');
  };

  const providerDisplayName = service?.providerName || (() => {
    const p = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
    return p.operator_name || p.providerOperatorName || 'Operador asignado';
  })();

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Estado */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: '#EC6819',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            position: 'relative'
          }}>
            <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
              <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="3" fill="none"/>
              <path d="M25 12V25L32 32" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            {/* Pulso */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: '3px solid #EC6819',
              animation: 'pulse 2s infinite'
            }}/>
          </div>

          <span style={{
            display: 'inline-block',
            background: '#90BDD3',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            padding: '8px 20px',
            borderRadius: 20,
            letterSpacing: 1
          }}>
            SERVICIO EN CURSO
          </span>
        </div>

        {/* Info del servicio */}
        <div style={{
          background: '#363636',
          borderRadius: 16,
          padding: 24,
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Maquinaria</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {service ? getMachineryDisplayName(service.machineryType) : 'Cargando...'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Operador</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {providerDisplayName}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Estado</span>
            <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>Activo</span>
          </div>
        </div>

        <div className="maqgo-spacer"></div>

        {/* Botón demo para finalizar */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleFinish}
          data-testid="finish-service-btn"
        >
          Finalizar servicio (Demo)
        </button>

        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

export default ServiceActiveScreen;
