import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playServiceCompletedSound } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';

/**
 * Pantalla: Servicio Completado (OPERADOR)
 * 
 * Flujo simplificado:
 * 1. Muestra "¡Buen trabajo!" con animación
 * 2. Muestra estadísticas
 * 4. Auto-redirect a Home en 5 segundos o click
 */
function OperatorServiceCompletedScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState('congrats'); // 'congrats' | 'stats'
  const [stats, setStats] = useState({
    todayServices: 1,
    monthServices: 12,
    totalHours: 48,
  });
  const [countdown, setCountdown] = useState(5);
  const [serviceData] = useState(() => {
    const savedService = getObject('activeService', {});
    const savedRequest = getObject('incomingRequest', {});
    const machineryType = savedService.machinery_type || savedRequest.machineryId || 'retroexcavadora';
    const hours = savedService.hours || savedRequest.hours || 4;
    return { ...savedService, ...savedRequest, machinery_type: machineryType, hours };
  });

  const loadStats = useCallback(async () => {
    try {
      const operatorId = localStorage.getItem('userId');
      const response = await axios.get(`${BACKEND_URL}/api/operators/stats/${operatorId}`);
      if (response.data) {
        setStats({
          todayServices: response.data.services_today || 1,
          monthServices: response.data.services_this_month || 12,
          totalHours: response.data.total_hours || 48,
        });
      }
    } catch {
      void 0; // stats optional; keep demo defaults
    }
  }, []);

  useEffect(() => {
    // Reproducir sonido de celebración
    playServiceCompletedSound();
    vibrate('finished');
    
    // Cargar stats del operador
    setTimeout(() => {
      loadStats();
    }, 0);
    
    const timer = setTimeout(() => setStep('stats'), 2000);
    return () => clearTimeout(timer);
  }, [loadStats]);

  // Countdown para auto-redirect
  useEffect(() => {
    if (step === 'stats') {
      const timer = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(timer);
            navigate('/operator/home');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, navigate]);

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ justifyContent: 'center', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        
        {/* PASO 1: Felicitaciones */}
        {step === 'congrats' && (
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
            {/* Checkmark animado */}
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 30px',
              boxShadow: '0 8px 32px rgba(76, 175, 80, 0.4)',
              animation: 'pulse 1s ease-in-out infinite'
            }}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                <path 
                  d="M5 13l4 4L19 7" 
                  stroke="#fff" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 style={{ 
              color: '#fff', 
              fontSize: 32, 
              fontWeight: 700, 
              margin: '0 0 10px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              ¡Buen trabajo!
            </h1>
            
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, margin: 0 }}>
              Servicio completado exitosamente
            </p>

            <div style={{ marginTop: 30 }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
                {MACHINERY_NAMES[serviceData.machinery_type] || 'Maquinaria'} · {isPerTripMachineryType(serviceData.machinery_type) ? 'Valor viaje' : `${serviceData.hours || 4}h`}
              </p>
            </div>
          </div>
        )}

        {null}

        {/* PASO 3: Estadísticas */}
        {step === 'stats' && (
          <div style={{ textAlign: 'center', maxWidth: 340, margin: '0 auto' }}>
            <MaqgoLogo size="small" style={{ margin: '0 auto 20px' }} />
            
            <h2 style={{ 
              color: '#fff', 
              fontSize: 20, 
              fontWeight: 600, 
              margin: '0 0 25px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              Tus estadísticas
            </h2>

            {/* Stats Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: 12,
              marginBottom: 30
            }}>
              <div style={{
                background: '#2A2A2A',
                borderRadius: 12,
                padding: 16
              }}>
                <p style={{ color: '#4CAF50', fontSize: 28, fontWeight: 700, margin: 0 }}>
                  {stats.todayServices}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
                  Hoy
                </p>
              </div>
              
              <div style={{
                background: '#2A2A2A',
                borderRadius: 12,
                padding: 16
              }}>
                <p style={{ color: '#90BDD3', fontSize: 28, fontWeight: 700, margin: 0 }}>
                  {stats.monthServices}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
                  Este mes
                </p>
              </div>
              
              <div style={{
                background: '#2A2A2A',
                borderRadius: 12,
                padding: 16
              }}>
                <p style={{ color: '#EC6819', fontSize: 28, fontWeight: 700, margin: 0 }}>
                  {stats.totalHours}h
                </p>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
                  Horas totales
                </p>
              </div>
              
              {null}
            </div>

            {/* Mensaje motivacional */}
            <div style={{
              background: 'rgba(76, 175, 80, 0.1)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20
            }}>
              <p style={{ color: '#4CAF50', fontSize: 14, margin: 0, fontWeight: 500 }}>
                ¡Sigue así! Cada servicio cuenta.
              </p>
            </div>

            {/* Countdown */}
            <button
              onClick={() => navigate('/operator/home')}
              style={{
                width: '100%',
                padding: 16,
                background: '#EC6819',
                border: 'none',
                borderRadius: 30,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              data-testid="go-home-btn"
            >
              Volver al inicio ({countdown}s)
            </button>
          </div>
        )}

        {/* Animación CSS */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default OperatorServiceCompletedScreen;
