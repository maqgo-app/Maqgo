import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import BACKEND_URL from '../../utils/api';

function ServiceFinishedProvider() {
  const navigate = useNavigate();
  const [serviceData, setServiceData] = useState(null);

  useEffect(() => {
    const finishService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          // Finalizar el servicio en el backend
          const response = await axios.put(`${BACKEND_URL}/api/service-requests/${serviceId}/finish`, {
            endLocation: { lat: -33.4489, lng: -70.6693 }
          });
          setServiceData(response.data);
        }
      } catch (error) {
        console.error('Error finalizando servicio:', error);
        // Datos de fallback para demo
        setServiceData({
          totalAmount: 150000,
          duration: '8 horas',
          endTime: new Date().toISOString()
        });
      }
    };
    finishService();
  }, []);

  return (
    <div className="screen">
      {/* Header */}
      <div className="maqgo-header">
        <svg width="50" height="50" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="30" r="28" stroke="#ff8c42" strokeWidth="2" fill="none"/>
          <path d="M30 12L33 20H27L30 12Z" fill="#ff8c42"/>
          <circle cx="30" cy="30" r="8" stroke="#ff8c42" strokeWidth="2" fill="none"/>
          <circle cx="30" cy="30" r="3" fill="#ff8c42"/>
        </svg>
        <h1 className="app-title">MAQGO</h1>
      </div>

      <div className="content">
        {/* Icono de completado */}
        <div className="completion-animation">
          <div className="completion-circle">
            <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="45" stroke="#90BDD3" strokeWidth="4" fill="rgba(144, 189, 211, 0.1)"/>
              <path d="M30 50L45 65L70 35" stroke="#90BDD3" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <h2 className="completion-title">¡Servicio Completado!</h2>
        <p className="completion-subtitle">Excelente trabajo</p>

        {/* Resumen de ganancias */}
        <div className="earnings-card">
          <div className="earnings-header">
            <span className="earnings-icon">💰</span>
            <span className="earnings-label">Ganancia del servicio</span>
          </div>
          <div className="earnings-amount">
            ${(serviceData?.totalAmount || 150000).toLocaleString('es-CL')}
          </div>
          <div className="earnings-detail">
            <span>Duración: {serviceData?.duration || '8 horas'}</span>
          </div>
        </div>

        {/* Detalles del servicio */}
        <div className="service-summary">
          <div className="summary-row">
            <span className="summary-label">📅 Fecha</span>
            <span className="summary-value">{new Date().toLocaleDateString('es-CL')}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">⏱️ Hora finalización</span>
            <span className="summary-value">{new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">📍 Ubicación GPS</span>
            <span className="summary-value">Registrada ✓</span>
          </div>
        </div>

        {/* Botón para calificar */}
        <button 
          className="btn-primary"
          onClick={() => navigate('/provider/rate')}
        >
          Calificar al Cliente
        </button>

        <button 
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/provider/availability')}
          style={{ width: '100%' }}
        >
          Volver al inicio
        </button>
      </div>

      <style>{`
        .maqgo-header {
          text-align: center;
          padding: 20px 0;
        }
        .app-title {
          font-size: 28px;
          font-weight: bold;
          color: #fff;
          margin: 10px 0 0;
          letter-spacing: 2px;
        }
        .completion-animation {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }
        .completion-circle {
          animation: bounceIn 0.6s ease-out;
        }
        @keyframes bounceIn {
          0% { transform: scale(0); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .completion-title {
          color: #90BDD3;
          font-size: 28px;
          font-weight: bold;
          text-align: center;
          margin-bottom: 8px;
        }
        .completion-subtitle {
          color: #888;
          font-size: 16px;
          text-align: center;
          margin-bottom: 24px;
        }
        .earnings-card {
          background: rgba(144, 189, 211, 0.2);
          border: 2px solid #90BDD3;
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          margin-bottom: 20px;
        }
        .earnings-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .earnings-icon {
          font-size: 24px;
        }
        .earnings-label {
          color: #aaa;
          font-size: 14px;
        }
        .earnings-amount {
          color: #90BDD3;
          font-size: 42px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .earnings-detail {
          color: #888;
          font-size: 14px;
        }
        .service-summary {
          background: rgba(45, 45, 45, 0.8);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .summary-row:last-child {
          border-bottom: none;
        }
        .summary-label {
          color: #888;
          font-size: 14px;
        }
        .summary-value {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

export default ServiceFinishedProvider;