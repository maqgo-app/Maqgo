import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MACHINERY_LIST } from '../../components/MachineryIcons';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { playNewRequestSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';

/**
 * Panel del Proveedor
 * Con lista de maquinaria correcta
 */
function ProviderAvailability({ userId: userIdProp }) {
  const navigate = useNavigate();
  const toast = useToast();
  const userId = userIdProp || localStorage.getItem('userId') || localStorage.getItem('ownerId');
  const [isAvailable, setIsAvailable] = useState(false);
  const [selectedMachinery, setSelectedMachinery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [providerName] = useState('Proveedor');

  // Polling para detectar solicitudes pendientes
  useEffect(() => {
    if (isAvailable && userId) {
      const interval = setInterval(async () => {
        try {
          const response = await axios.get(`${BACKEND_URL}/api/service-requests/pending`, {
            params: { providerId: userId }
          });
          if (response.data && response.data.length > 0) {
            const request = response.data[0];
            localStorage.setItem('currentServiceId', request.id);
            localStorage.setItem('pendingRequest', JSON.stringify(request));
            localStorage.setItem('incomingRequest', JSON.stringify(request));
            unlockAudio();
            playNewRequestSound();
            vibrate('newRequest');
            navigate('/provider/request-received');
          }
        } catch (error) {
          // Silenciar errores de polling
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isAvailable, userId, navigate]);

  const handleToggleAvailability = async () => {
    if (!selectedMachinery) {
      toast.warning('Por favor selecciona tu tipo de maquinaria');
      return;
    }
    if (!userId) {
      toast.error('Sesión no encontrada. Cierra sesión y vuelve a entrar.');
      return;
    }

    setLoading(true);
    const newStatus = !isAvailable;
    let location = { lat: -33.4489, lng: -70.6693 };
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (e) {
        console.log('Usando ubicación por defecto (Santiago)');
      }
    }

    // Modo demo: IDs de prueba no existen en backend
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-');
    if (isDemoId) {
      setIsAvailable(newStatus);
      setLoading(false);
      toast.success(newStatus ? 'Disponibilidad activada (modo demo)' : 'Disponibilidad desactivada');
      return;
    }

    try {
      await axios.put(`${BACKEND_URL}/api/users/${userId}/availability`, {
        isAvailable: newStatus,
        machineryType: selectedMachinery,
        location
      }, { timeout: 8000 });
      setIsAvailable(newStatus);
      toast.success(newStatus ? 'Disponibilidad activada' : 'Disponibilidad desactivada');
    } catch (error) {
      const isNetwork = !error.response || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error');
      if (error.response?.status === 404) {
        setIsAvailable(!newStatus);
        toast.error('Tu sesión expiró. Cierra sesión y vuelve a entrar.');
      } else if (isNetwork) {
        setIsAvailable(newStatus);
        toast.success('Sin conexión. Se guardó localmente.');
      } else {
        setIsAvailable(!newStatus);
        toast.error('No se pudo conectar. Intenta de nuevo.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="provider-screen">
      {/* Header */}
      <div className="provider-header">
        <MaqgoLogo size="small" />
        <p className="provider-subtitle">Panel del Proveedor</p>
      </div>

      <div className="provider-content">
        {/* Saludo */}
        <div className="welcome-section">
          <h2>Hola, {providerName}</h2>
          <p>Activa tu disponibilidad para recibir solicitudes</p>
        </div>

        {/* Selección de maquinaria */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">🛠️ Selecciona tu maquinaria</span>
          </div>
          
          <div className="machinery-list">
            {MACHINERY_LIST.slice(0, 6).map(({ id, name, Icon }) => (
              <button 
                key={id}
                className={`machinery-item ${selectedMachinery === id ? 'selected' : ''}`}
                onClick={() => setSelectedMachinery(id)}
              >
                <div className="machinery-icon">
                  <Icon size={32} color={selectedMachinery === id ? '#ff8c42' : '#666'} />
                </div>
                <span className="machinery-name">{name}</span>
                {selectedMachinery === id && (
                  <div className="check-badge">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="8" fill="#ff8c42"/>
                      <path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle de disponibilidad */}
        <div className="availability-card">
          <div className="availability-header">
            <div className="availability-status">
              <div className={`status-indicator ${isAvailable ? 'online' : 'offline'}`}></div>
              <span className="status-text">
                {isAvailable ? 'Disponible' : 'No disponible'}
              </span>
            </div>
            <button 
              className={`toggle-button ${isAvailable ? 'active' : ''}`}
              onClick={handleToggleAvailability}
              disabled={loading || !selectedMachinery}
            >
              {loading ? (
                <span className="button-loading"></span>
              ) : isAvailable ? 'Desactivar' : 'Activar'}
            </button>
          </div>
          
          {isAvailable && (
            <div className="waiting-section">
              <div className="pulse-animation">
                <div className="pulse-ring"></div>
                <div className="pulse-ring delay-1"></div>
                <div className="pulse-ring delay-2"></div>
                <div className="pulse-core"></div>
              </div>
              <p className="waiting-text">Esperando solicitudes...</p>
              <p className="waiting-subtext">Te notificaremos cuando llegue una solicitud</p>
            </div>
          )}
        </div>

        {/* Info de ganancias */}
        <div className="commission-info">
          <div className="commission-header">
            <span>💰 Tus ganancias</span>
          </div>
          <p className="commission-text">
            Recibirás tu ganancia por cada servicio completado.<br/>
            Sube tu factura 24 h después del servicio · Pago en 2 días hábiles tras subirla.
          </p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="nav-item active">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Inicio</span>
        </div>
        <div className="nav-item">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>Reservas</span>
        </div>
        <div className="nav-item">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Perfil</span>
        </div>
      </div>

      <style>{`
        .provider-screen {
          min-height: 100vh;
          background: #0a0a0a;
          display: flex;
          flex-direction: column;
        }

        .provider-header {
          text-align: center;
          padding: 25px 20px 15px;
        }

        .header-logo {
          width: 90px;
          height: auto;
        }

        .provider-subtitle {
          color: #666;
          font-size: 13px;
          margin-top: 6px;
        }

        .provider-content {
          flex: 1;
          padding: 0 20px 100px;
          overflow-y: auto;
        }

        .welcome-section {
          margin-bottom: 24px;
        }

        .welcome-section h2 {
          color: #fff;
          font-size: 22px;
          margin-bottom: 4px;
        }

        .welcome-section p {
          color: #666;
          font-size: 14px;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-header {
          margin-bottom: 14px;
        }

        .section-title {
          color: #fff;
          font-size: 15px;
          font-weight: 600;
        }

        .machinery-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .machinery-item {
          background: #1a1a1a;
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 14px 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .machinery-item:hover {
          background: #222;
        }

        .machinery-item.selected {
          border-color: #ff8c42;
          background: rgba(255, 140, 66, 0.1);
        }

        .machinery-icon {
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
        }

        .machinery-name {
          color: #888;
          font-size: 10px;
          display: block;
          line-height: 1.2;
        }

        .machinery-item.selected .machinery-name {
          color: #ff8c42;
        }

        .check-badge {
          position: absolute;
          top: -5px;
          right: -5px;
        }

        .availability-card {
          background: #1a1a1a;
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 16px;
        }

        .availability-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .availability-status {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #666;
        }

        .status-indicator.online {
          background: #90BDD3;
          animation: pulse-green 2s infinite;
        }

        .status-indicator.offline {
          background: #f44336;
        }

        @keyframes pulse-green {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .status-text {
          color: #fff;
          font-size: 15px;
          font-weight: 600;
        }

        .toggle-button {
          background: #ff8c42;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
          min-width: 90px;
        }

        .toggle-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toggle-button.active {
          background: #f44336;
        }

        .button-loading {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .waiting-section {
          margin-top: 20px;
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid #333;
        }

        .pulse-animation {
          position: relative;
          width: 70px;
          height: 70px;
          margin: 0 auto 14px;
        }

        .pulse-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 50px;
          height: 50px;
          border: 2px solid #90BDD3;
          border-radius: 50%;
          animation: pulse-ring 2s infinite;
        }

        .pulse-ring.delay-1 { animation-delay: 0.5s; }
        .pulse-ring.delay-2 { animation-delay: 1s; }

        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }

        .pulse-core {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          background: #90BDD3;
          border-radius: 50%;
        }

        .waiting-text {
          color: #90BDD3;
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .waiting-subtext {
          color: #666;
          font-size: 12px;
        }

        .commission-info {
          background: rgba(255, 140, 66, 0.1);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 12px;
          padding: 14px;
        }

        .commission-header {
          margin-bottom: 8px;
        }

        .commission-header span {
          color: #ff8c42;
          font-size: 14px;
          font-weight: 600;
        }

        .commission-text {
          color: #888;
          font-size: 13px;
          line-height: 1.5;
          margin: 0;
        }

        .commission-text strong {
          color: #90BDD3;
        }

        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-around;
          padding: 12px 20px 20px;
          background: #0f1a1a;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: #555;
          font-size: 11px;
          cursor: pointer;
        }

        .nav-item.active {
          color: #ff8c42;
        }

        .nav-item svg {
          width: 22px;
          height: 22px;
        }
      `}</style>
    </div>
  );
}

export default ProviderAvailability;
