import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getMachineryDisplayName, getMachineryId } from '../../utils/machineryNames';
import { getObject, getJSON } from '../../utils/safeStorage';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

/**
 * Pantalla P5 - Servicio en Curso (Proveedor)
 */
function ProviderServiceActiveScreen() {
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);

  useEffect(() => {
    const parsed = getJSON('incomingRequest', null);
    if (parsed) {
      const machineryId = parsed.machinery_type || parsed.machineryType || 'retroexcavadora';
      setRequest({
        ...parsed,
        machinery_type: machineryId,
        machineryType: getMachineryDisplayName(machineryId)
      });
    } else {
      const machineData = getObject('machineData', {});
      const machineryType = machineData.machineryType || 'retroexcavadora';
      
      setRequest({
        machineryType: getMachineryDisplayName(machineryType),
        location: 'Santiago Centro',
        hours: 4,
        clientName: 'Carlos González'
      });
    }
  }, []);

  const handleFinish = () => {
    navigate('/provider/service-finished');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Estado */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
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
              <rect x="8" y="28" width="34" height="12" rx="3" fill="#fff"/>
              <rect x="28" y="18" width="12" height="11" rx="2" fill="#fff"/>
              <path d="M34 14L44 8" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
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
            SERVICIO ACTIVO
          </span>
        </div>

        {/* Info del servicio */}
        <div style={{
          background: '#363636',
          borderRadius: 16,
padding: 24,
        marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #444444' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Maquinaria</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{getMachineryDisplayName(request?.machineryType)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #444444' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Cliente</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{request?.clientName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #444444' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Ubicación</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{request?.location}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{MACHINERY_PER_TRIP.includes(getMachineryId(request?.machinery_type || request?.machineryType)) ? 'Tipo' : 'Horas contratadas'}</span>
            <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>{MACHINERY_PER_TRIP.includes(getMachineryId(request?.machinery_type || request?.machineryType)) ? 'Valor viaje' : `${request?.hours} horas`}</span>
          </div>
        </div>

        <div className="maqgo-spacer"></div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleFinish}
          data-testid="finish-service-btn"
        >
          Finalizar servicio
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

export default ProviderServiceActiveScreen;
