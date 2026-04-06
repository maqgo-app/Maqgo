import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ServiceInProgressProvider() {
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [status, setStatus] = useState('en_camino'); // en_camino, trabajando
  const totalDuration = 8 * 60 * 60; // 8 horas en segundos

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => {
        const newTime = prev + 1;
        // Simular transición a últimos 30 minutos
        if (newTime >= (totalDuration - 30 * 60)) {
          navigate('/provider/last-30');
        }
        return newTime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate, totalDuration]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercent = () => {
    return Math.min((elapsedTime / totalDuration) * 100, 100);
  };

  const handleStartWork = () => {
    setStatus('trabajando');
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
        {/* Estado del servicio */}
        <div className="status-badge" data-status={status}>
          
          <span className="status-text">
            {status === 'en_camino' ? 'En camino al sitio' : 'Servicio en progreso'}
          </span>
        </div>

        {/* Timer circular */}
        <div className="timer-container">
          <div className="timer-circle">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="rgba(255, 140, 66, 0.2)"
                strokeWidth="8"
              />
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="#ff8c42"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - getProgressPercent() / 100)}`}
                transform="rotate(-90 100 100)"
                strokeLinecap="round"
              />
            </svg>
            <div className="timer-content">
              <span className="timer-label">Tiempo transcurrido</span>
              <span className="timer-value">{formatTime(elapsedTime)}</span>
              <span className="timer-total">de 8:00:00</span>
            </div>
          </div>
        </div>

        {/* Info del cliente */}
        <div className="client-info-card">
          <div className="info-row">
            <span className="info-icon">👤</span>
            <div className="info-content">
              <span className="info-label">Cliente</span>
              <span className="info-value">Cliente MAQGO</span>
            </div>
          </div>
          <div className="info-row">
            <span className="info-icon">📍</span>
            <div className="info-content">
              <span className="info-label">Ubicación</span>
              <span className="info-value">Santiago, Chile</span>
            </div>
          </div>
        </div>

        {/* Botón de acción */}
        {status === 'en_camino' ? (
          <button type="button" className="maqgo-btn-primary" onClick={handleStartWork}>
            ✓ Confirmar Llegada e Iniciar
          </button>
        ) : (
          <div className="working-indicator">
            
            <span>Trabajo en curso...</span>
          </div>
        )}

        {/* Recordatorio */}
        <div className="reminder-card">
          <span className="reminder-icon">⏰</span>
          <span className="reminder-text">
            Recibirás una notificación cuando queden 30 minutos
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
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 140, 66, 0.15);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 20px;
          padding: 8px 16px;
          margin: 0 auto 20px;
        }
        .status-badge[data-status="trabajando"] {
          background: rgba(144, 189, 211, 0.15);
          border-color: rgba(144, 189, 211, 0.3);
        }
        .status-badge[data-status="trabajando"] .status-dot {
          background: #90BDD3;
        }
        .status-badge[data-status="trabajando"] .status-text {
          color: #90BDD3;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          background: #ff8c42;
          border-radius: 50%;
          animation: blink 1s infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .status-text {
          color: #ff8c42;
          font-weight: 600;
          font-size: 14px;
        }
        .timer-container {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }
        .timer-circle {
          position: relative;
          width: 200px;
          height: 200px;
        }
        .timer-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .timer-label {
          display: block;
          color: #888;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .timer-value {
          display: block;
          color: #fff;
          font-size: 32px;
          font-weight: bold;
        }
        .timer-total {
          display: block;
          color: #666;
          font-size: 14px;
          margin-top: 4px;
        }
        .client-info-card {
          background: rgba(45, 45, 45, 0.8);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .info-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-icon {
          font-size: 24px;
        }
        .info-content {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          color: #888;
          font-size: 12px;
        }
        .info-value {
          color: #fff;
          font-size: 16px;
          font-weight: 500;
        }
        .working-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 20px;
        }
        .working-indicator span {
          color: #90BDD3;
          font-weight: 600;
        }
        .pulse-ring {
          width: 40px;
          height: 40px;
          background: #90BDD3;
          border-radius: 50%;
          animation: pulse-ring 1.5s infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .reminder-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 12px;
          padding: 16px;
          margin-top: auto;
        }
        .reminder-icon {
          font-size: 24px;
        }
        .reminder-text {
          color: #ffc107;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

export default ServiceInProgressProvider;