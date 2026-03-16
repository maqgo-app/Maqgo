import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playServiceCompletedSound } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

/**
 * Pantalla: Servicio Completado (OPERADOR)
 * 
 * Flujo simplificado:
 * 1. Muestra "¡Buen trabajo!" con animación
 * 2. Califica al cliente (1-5 estrellas + comentario)
 * 3. Muestra estadísticas motivadoras
 * 4. Auto-redirect a Home en 5 segundos o click
 */
function OperatorServiceCompletedScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState('congrats'); // 'congrats' | 'rating' | 'stats'
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [stats, setStats] = useState({
    todayServices: 1,
    monthServices: 12,
    totalHours: 48,
    rating: 4.8
  });
  const [countdown, setCountdown] = useState(5);
  const [serviceData, setServiceData] = useState({});

  useEffect(() => {
    // Cargar datos del servicio
    const savedService = getObject('activeService', {});
    const savedRequest = getObject('incomingRequest', {});
    
    const machineryType = savedService.machinery_type || savedRequest.machineryId || 'retroexcavadora';
    const hours = savedService.hours || savedRequest.hours || 4;
    
    setServiceData({
      ...savedService,
      ...savedRequest,
      machinery_type: machineryType,
      hours: hours
    });
    
    // Reproducir sonido de celebración
    playServiceCompletedSound();
    vibrate('finished');
    
    // Cargar stats del operador
    loadStats();
    
    // Avanzar a rating después de 2 segundos
    const timer = setTimeout(() => setStep('rating'), 2000);
    return () => clearTimeout(timer);
  }, []);

  const loadStats = async () => {
    try {
      const operatorId = localStorage.getItem('userId');
      const response = await axios.get(`${BACKEND_URL}/api/operators/stats/${operatorId}`);
      if (response.data) {
        setStats({
          todayServices: response.data.services_today || 1,
          monthServices: response.data.services_this_month || 12,
          totalHours: response.data.total_hours || 48,
          rating: response.data.rating || 4.8
        });
      }
    } catch (e) {
      console.log('Using demo stats');
    }
  };

  const submitRating = async () => {
    try {
      const serviceId = serviceData.id || localStorage.getItem('activeServiceId');
      const operatorId = localStorage.getItem('userId');
      
      if (rating > 0) {
        await axios.post(`${BACKEND_URL}/api/ratings`, {
          service_id: serviceId,
          from_id: operatorId,
          from_type: 'provider',
          to_id: serviceData.client_id,
          to_type: 'client',
          rating: rating,
          comment: comment
        });
      }
    } catch (e) {
      console.error('Error submitting rating:', e);
    }
    
    setStep('stats');
  };

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

  const formatCurrency = (amount) => {
    return `$${amount?.toLocaleString('es-CL') || '0'}`;
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', padding: 24 }}>
        
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
                {MACHINERY_NAMES[serviceData.machinery_type] || 'Maquinaria'} · {MACHINERY_PER_TRIP.includes(serviceData.machinery_type || '') ? 'Valor viaje' : `${serviceData.hours || 4}h`}
              </p>
            </div>
          </div>
        )}

        {/* PASO 2: Calificar al Cliente */}
        {step === 'rating' && (
          <div style={{ textAlign: 'center', maxWidth: 340, margin: '0 auto' }}>
            <h2 style={{ 
              color: '#fff', 
              fontSize: 22, 
              fontWeight: 600, 
              margin: '0 0 8px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              Dale nota
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, margin: '0 0 30px' }}>
              ¿Cómo fue trabajar con este cliente?
            </p>

            {/* Estrellas */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 25 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    transform: rating >= star ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.2s'
                  }}
                  data-testid={`star-${star}`}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill={rating >= star ? '#FFC107' : 'none'}>
                    <path 
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
                      stroke={rating >= star ? '#FFC107' : '#666'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ))}
            </div>

            {/* Comentario opcional */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (opcional)"
              style={{
                width: '100%',
                padding: 14,
                fontSize: 15,
                background: '#2A2A2A',
                border: '1px solid #444',
                borderRadius: 12,
                color: '#fff',
                resize: 'none',
                height: 80,
                marginBottom: 20,
                outline: 'none'
              }}
              data-testid="rating-comment"
            />

            <button
              onClick={submitRating}
              className="maqgo-btn-primary"
              style={{ width: '100%' }}
              data-testid="submit-rating-btn"
            >
              {rating > 0 ? 'Enviar y continuar' : 'Saltar'}
            </button>
          </div>
        )}

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
              
              <div style={{
                background: '#2A2A2A',
                borderRadius: 12,
                padding: 16
              }}>
                <p style={{ color: '#FFC107', fontSize: 28, fontWeight: 700, margin: 0 }}>
                  {stats.rating.toFixed(1)}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
                  Tu rating
                </p>
              </div>
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
