import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import BACKEND_URL from '../../utils/api';

function RateClient() {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Por favor selecciona una calificación');
      return;
    }
    setError('');

    setSubmitting(true);
    try {
      const serviceId = localStorage.getItem('currentServiceId');
      await axios.post(`${BACKEND_URL}/api/ratings`, {
        serviceId,
        stars: rating,
        comment,
        fromRole: 'provider'
      });
      setSubmitted(true);
      setTimeout(() => {
        localStorage.removeItem('currentServiceId');
        navigate('/provider/availability');
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      setError('Error al enviar calificación. Intenta nuevamente.');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div
          className="maqgo-screen maqgo-screen--scroll"
          style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}
        >
        <div className="maqgo-header">
          <h1 className="app-title">MAQGO</h1>
        </div>
        <div className="content">
          <div className="success-animation">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="38" stroke="#90BDD3" strokeWidth="4" fill="none"/>
              <path d="M24 40L35 51L56 30" stroke="#90BDD3" strokeWidth="4" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 style={{ color: '#90BDD3', textAlign: 'center' }}>¡Gracias por tu evaluación!</h2>
          <p style={{ color: '#888', textAlign: 'center' }}>Redirigiendo...</p>
        </div>
        </div>
        <style>{`
          .maqgo-header { text-align: center; padding: 30px 0; }
          .app-title { font-size: 28px; font-weight: bold; color: #fff; letter-spacing: 2px; }
          .success-animation { display: flex; justify-content: center; margin-bottom: 24px; animation: scaleIn 0.5s ease-out; }
          @keyframes scaleIn { 0% { transform: scale(0); } 100% { transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}
      >
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

      <div className="content" style={{ justifyContent: 'flex-start', paddingTop: '20px' }}>
        <h2 className="rate-title">Califica al Cliente</h2>
        <p className="rate-subtitle">Tu opinión nos ayuda a mejorar la comunidad MAQGO</p>

        {/* Cliente info */}
        <div className="client-card">
          <div className="client-avatar">
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="28" fill="rgba(255, 140, 66, 0.2)" stroke="#ff8c42" strokeWidth="2"/>
              <circle cx="30" cy="22" r="10" fill="#ff8c42"/>
              <path d="M12 52c0-10 8-14 18-14s18 4 18 14" fill="#ff8c42"/>
            </svg>
          </div>
          <div className="client-info">
            <span className="client-name">Cliente MAQGO</span>
            <span className="client-service">Servicio completado</span>
          </div>
        </div>

        {/* Estrellas */}
        <div className="rating-section">
          <p className="rating-label">¿Cómo fue tu experiencia?</p>
          <div className="stars-container">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`star-btn ${star <= (hoveredRating || rating) ? 'active' : ''}`}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => {
                  setRating(star);
                  setError(''); // Limpiar error al seleccionar
                }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill={star <= (hoveredRating || rating) ? '#ffd700' : 'none'} stroke={star <= (hoveredRating || rating) ? '#ffd700' : '#666'} strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            ))}
          </div>
          <p className="rating-text">
            {rating === 0 ? 'Toca las estrellas para calificar' :
             rating === 1 ? 'Muy malo' :
             rating === 2 ? 'Malo' :
             rating === 3 ? 'Regular' :
             rating === 4 ? 'Bueno' : 'Excelente'}
          </p>
        </div>
        
        {/* Mensaje de error */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #EF4444',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ color: '#EF4444', fontSize: 18 }}>⚠️</span>
            <span style={{ color: '#EF4444', fontSize: 14 }}>{error}</span>
          </div>
        )}

        {/* Comentario */}
        <div className="comment-section">
          <label className="comment-label">Comentario (opcional)</label>
          <textarea
            className="comment-input"
            placeholder="Cuéntanos más sobre tu experiencia..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
        </div>

        {/* Botón enviar */}
        <button 
          type="button"
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          aria-busy={submitting}
          aria-label={submitting ? 'Enviando evaluación' : 'Enviar evaluación'}
        >
          {submitting ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Enviando...
            </span>
          ) : (
            'Enviar Evaluación'
          )}
        </button>

        <button 
          type="button"
          className="btn-skip"
          onClick={() => navigate('/provider/availability')}
        >
          Omitir por ahora
        </button>
      </div>
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
        .rate-title {
          color: #fff;
          font-size: 24px;
          text-align: center;
          margin-bottom: 8px;
        }
        .rate-subtitle {
          color: #888;
          font-size: 14px;
          text-align: center;
          margin-bottom: 24px;
        }
        .client-card {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(45, 45, 45, 0.8);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .client-info {
          display: flex;
          flex-direction: column;
        }
        .client-name {
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        }
        .client-service {
          color: #90BDD3;
          font-size: 14px;
        }
        .rating-section {
          text-align: center;
          margin-bottom: 24px;
        }
        .rating-label {
          color: #aaa;
          font-size: 16px;
          margin-bottom: 16px;
        }
        .stars-container {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .star-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          transition: transform 0.2s ease;
        }
        .star-btn:hover {
          transform: scale(1.2);
        }
        .star-btn.active {
          animation: pop 0.3s ease;
        }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .rating-text {
          color: #ffd700;
          font-size: 18px;
          font-weight: 600;
          height: 24px;
        }
        .comment-section {
          margin-bottom: 24px;
        }
        .comment-label {
          display: block;
          color: #aaa;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .comment-input {
          width: 100%;
          background: rgba(45, 45, 45, 0.8);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 12px;
          padding: 16px;
          color: #fff;
          font-size: 16px;
          resize: none;
          font-family: inherit;
        }
        .comment-input:focus {
          outline: none;
          border-color: #ff8c42;
        }
        .comment-input::placeholder {
          color: #666;
        }
        .btn-skip {
          background: transparent;
          color: #888;
          border: none;
          padding: 14px;
          font-size: 14px;
          cursor: pointer;
          width: 100%;
          margin-top: 12px;
        }
        .btn-skip:hover {
          color: #fff;
        }
      `}</style>
    </div>
  );
}

export default RateClient;