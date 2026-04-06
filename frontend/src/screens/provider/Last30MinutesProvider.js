import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { playTimerWarningSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

function Last30MinutesProvider() {
  const navigate = useNavigate();
  const [remainingTime, setRemainingTime] = useState(30 * 60); // 30 minutos en segundos
  const [showExtendOption, setShowExtendOption] = useState(false);

  useEffect(() => {
    unlockAudio();
    playTimerWarningSound();
    vibrate('alert');
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/provider/service-finished');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFinishEarly = () => {
    navigate('/provider/service-finished');
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{
          padding: 'var(--maqgo-screen-padding-top) 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100%',
        }}
      >
      {/* Header */}
      <div className="maqgo-header">
        <svg width="40" height="40" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="30" r="28" stroke="#ff8c42" strokeWidth="2" fill="none"/>
          <path d="M30 12L33 20H27L30 12Z" fill="#ff8c42"/>
          <circle cx="30" cy="30" r="8" stroke="#ff8c42" strokeWidth="2" fill="none"/>
          <circle cx="30" cy="30" r="3" fill="#ff8c42"/>
        </svg>
        <h1 className="app-title">MAQGO</h1>
      </div>

      <div className="content" style={{ justifyContent: 'flex-start', paddingTop: '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Alerta de tiempo */}
        <div className="warning-alert">
          <div className="warning-icon">⚠️</div>
          <div className="warning-content">
            <span className="warning-title">¡Últimos 30 minutos!</span>
            <span className="warning-subtitle">El servicio está por finalizar</span>
          </div>
        </div>

        {/* Countdown grande */}
        <div className="countdown-container">
          <div className="countdown-ring">
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle
                cx="110"
                cy="110"
                r="100"
                fill="none"
                stroke="rgba(255, 193, 7, 0.2)"
                strokeWidth="10"
              />
              <circle
                cx="110"
                cy="110"
                r="100"
                fill="none"
                stroke="#ffc107"
                strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 100}`}
                strokeDashoffset={`${2 * Math.PI * 100 * (1 - remainingTime / (30 * 60))}`}
                transform="rotate(-90 110 110)"
                strokeLinecap="round"
              />
            </svg>
            <div className="countdown-content">
              <span className="countdown-label">Tiempo restante</span>
              <span className="countdown-value">{formatTime(remainingTime)}</span>
              <span className="countdown-unit">minutos</span>
            </div>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="quick-actions">
          <h3 className="actions-title">Acciones disponibles</h3>
          
          <button 
            className="action-btn extend"
            onClick={() => setShowExtendOption(true)}
          >
            <span className="action-icon">➕</span>
            <span className="action-text">Solicitar extensión de tiempo</span>
          </button>

          <button 
            className="action-btn finish"
            onClick={handleFinishEarly}
          >
            <span className="action-icon">✓</span>
            <span className="action-text">Finalizar servicio ahora</span>
          </button>
        </div>

        {/* Modal de extensión */}
        {showExtendOption && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Solicitar Extensión</h3>
              <p>¿Necesitas más tiempo para completar el trabajo?</p>
              <p className="modal-note">
                El cliente será notificado y deberá aprobar el cargo adicional.
              </p>
              <div className="modal-buttons">
                <button onClick={() => setShowExtendOption(false)} className="modal-btn cancel">
                  Cancelar
                </button>
                <button className="modal-btn confirm">
                  Solicitar +1 hora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recordatorio */}
        <div className="info-card">
          <span className="info-icon">ℹ️</span>
          <span className="info-text">
            El servicio finalizará automáticamente cuando el tiempo llegue a cero. 
            Se registrará la ubicación GPS final.
          </span>
        </div>
      </div>
      </div>

      <style>{`
        .maqgo-header {
          text-align: center;
          padding: 15px 0;
        }
        .app-title {
          font-size: 24px;
          font-weight: bold;
          color: #fff;
          margin: 8px 0 0;
          letter-spacing: 2px;
        }
        .warning-alert {
          background: rgba(255, 193, 7, 0.2);
          border: 2px solid #ffc107;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          animation: pulse-border 2s infinite;
        }
        @keyframes pulse-border {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .warning-icon {
          font-size: 36px;
        }
        .warning-content {
          display: flex;
          flex-direction: column;
        }
        .warning-title {
          color: #ffc107;
          font-size: 20px;
          font-weight: bold;
        }
        .warning-subtitle {
          color: #aaa;
          font-size: 14px;
        }
        .countdown-container {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }
        .countdown-ring {
          position: relative;
          width: 220px;
          height: 220px;
        }
        .countdown-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .countdown-label {
          display: block;
          color: #888;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .countdown-value {
          display: block;
          color: #ffc107;
          font-size: 48px;
          font-weight: bold;
        }
        .countdown-unit {
          display: block;
          color: #666;
          font-size: 14px;
        }
        .quick-actions {
          margin-bottom: 20px;
        }
        .actions-title {
          color: #fff;
          font-size: 16px;
          margin-bottom: 12px;
        }
        .action-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          margin-bottom: 12px;
          transition: all 0.3s ease;
        }
        .action-btn.extend {
          background: rgba(144, 189, 211, 0.15);
          border: 1px solid rgba(144, 189, 211, 0.3);
        }
        .action-btn.extend:hover {
          background: rgba(144, 189, 211, 0.25);
        }
        .action-btn.extend .action-icon,
        .action-btn.extend .action-text {
          color: #90BDD3;
        }
        .action-btn.finish {
          background: rgba(255, 140, 66, 0.15);
          border: 1px solid rgba(255, 140, 66, 0.3);
        }
        .action-btn.finish:hover {
          background: rgba(255, 140, 66, 0.25);
        }
        .action-btn.finish .action-icon,
        .action-btn.finish .action-text {
          color: #ff8c42;
        }
        .action-icon {
          font-size: 20px;
        }
        .action-text {
          font-size: 16px;
          font-weight: 500;
        }
        .info-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: rgba(45, 45, 45, 0.8);
          border-radius: 12px;
          padding: 16px;
          margin-top: auto;
        }
        .info-icon {
          font-size: 20px;
        }
        .info-text {
          color: #888;
          font-size: 13px;
          line-height: 1.5;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal-content {
          background: #2d2d2d;
          border-radius: 16px;
          padding: 24px;
          max-width: 340px;
          width: 90%;
        }
        .modal-content h3 {
          color: #fff;
          margin-bottom: 12px;
        }
        .modal-content p {
          color: #aaa;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .modal-note {
          color: #ffc107 !important;
          font-size: 13px !important;
        }
        .modal-buttons {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        .modal-btn {
          flex: 1;
          padding: 12px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }
        .modal-btn.cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .modal-btn.confirm {
          background: #90BDD3;
          color: white;
        }
      `}</style>
    </div>
  );
}

export default Last30MinutesProvider;