import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playTimerWarningSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

function Last30Minutes() {
  const navigate = useNavigate();

  useEffect(() => {
    unlockAudio();
    playTimerWarningSound();
    vibrate('alert');
  }, []);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen">
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <MaqgoLogo size="small" />
        </div>
      
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>⏰</div>
            <h2 style={{ color: '#EC6819', marginBottom: '15px', fontSize: 24, fontWeight: 700 }}>Últimos 30 Minutos</h2>
            <p style={{ color: 'rgba(255,255,255,0.95)' }}>El servicio finalizará pronto automáticamente</p>
          </div>
          
          <div style={{ 
            background: '#363636', 
            borderRadius: 14, 
            padding: 24, 
            width: '100%',
            marginBottom: 20 
          }}>
            <p style={{ color: '#fff', textAlign: 'center', margin: 0 }}>
              El servicio se cerrará automáticamente al cumplir la jornada contratada.
            </p>
          </div>
        </div>
        
        <button 
          className="maqgo-btn-primary"
          onClick={() => navigate('/client/in-progress')}
          data-testid="back-to-progress-btn"
        >
          Volver a Servicio
        </button>
      </div>
    </div>
  );
}

export default Last30Minutes;