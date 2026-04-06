import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { MaqgoButton } from '../../components/base';
import { useToast } from '../../components/Toast';

function WorkdayConfirmation() {
  const navigate = useNavigate();
  const toast = useToast();
  const [accepted, setAccepted] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = () => {
    if (!accepted) {
      toast.warning('Debes aceptar la jornada para continuar');
      return;
    }
    setIsConfirming(true);
    navigate('/client/billing');
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <MaqgoLogo size="small" />
        </div>
      
        <h1 className="maqgo-h1" style={{ marginBottom: 8 }}>Jornada Diaria</h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 30 }}>8 horas de trabajo + 1 hora de colación</p>
        
        <div style={{ 
          background: '#363636', 
          borderRadius: 14, 
          padding: 24, 
          width: '100%',
          marginBottom: 20,
          textAlign: 'center' 
        }}>
          <h3 style={{ color: '#EC6819', marginBottom: '15px', fontSize: 20 }}>Jornada Estándar</h3>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', marginBottom: '10px' }}>8 horas de trabajo</p>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px', margin: 0 }}>+ 1 hora adicional de colación</p>
        </div>
        
        <div 
          className="maqgo-checkbox-row"
          onClick={() => setAccepted(!accepted)}
          style={{ cursor: 'pointer', marginBottom: 30 }}
        >
          <div className={`maqgo-checkbox ${accepted ? 'checked' : ''}`}>
            {accepted && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L4.5 8.5L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="maqgo-checkbox-label">Acepto la jornada estándar</span>
        </div>
        
        <div className="maqgo-spacer"></div>
        
        <MaqgoButton
          onClick={handleConfirm}
          disabled={!accepted}
          loading={isConfirming}
          style={{ width: '100%' }}
          data-testid="confirm-workday-btn"
        >
          Confirmar Jornada
        </MaqgoButton>
      </div>
    </div>
  );
}

export default WorkdayConfirmation;