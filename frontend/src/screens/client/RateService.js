import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getObjectFirst } from '../../utils/safeStorage';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Evaluación de Servicio
 * Diseño industrial MAQGO
 */
function RateService() {
  const navigate = useNavigate();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (stars === 0) {
      setError('Por favor selecciona una calificación');
      return;
    }
    setError('');
    
    setLoading(true);
    try {
      const serviceId = localStorage.getItem('currentServiceId');
      const userId = localStorage.getItem('userId');
      const provider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
      const providerId = provider?.id != null ? String(provider.id) : null;

      await axios.post(`${BACKEND_URL}/api/ratings`, {
        serviceId,
        fromUserId: userId,
        toUserId: providerId || 'provider_id',
        stars,
        comment
      });
      
      navigate('/client/summary');
    } catch (error) {
      console.error('Error:', error);
      // Continuar de todos modos para demo
      navigate('/client/summary');
    }
    setLoading(false);
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      {/* Contenido */}
      <div style={styles.content}>
        <h1 style={styles.title}>¿Cómo fue tu experiencia?</h1>
        <p style={styles.subtitle}>Tu opinión nos ayuda a mejorar</p>

        {/* Estrellas */}
        <div style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              style={styles.starBtn}
              onClick={() => {
                setStars(star);
                setError(''); // Limpiar error al seleccionar
              }}
              data-testid={`star-${star}`}
            >
              <span style={{...styles.star, color: stars >= star ? MAQGO.colors.orange : '#ddd'}}>
                ★
              </span>
            </button>
          ))}
        </div>
        
        {/* Mensaje de error */}
        {error && (
          <div style={{
            background: '#FFEBEE',
            border: '1px solid #EF5350',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ color: '#EF5350', fontSize: 18 }}>⚠️</span>
            <span style={{ color: '#C62828', fontSize: 14 }}>{error}</span>
          </div>
        )}

        {/* Comentario */}
        <div style={styles.field}>
          <label style={styles.label}>Comentario (Opcional)</label>
          <textarea 
            style={styles.textarea}
            placeholder="Cuéntanos sobre tu experiencia..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows="4"
            data-testid="comment-textarea"
          />
        </div>
      </div>

      {/* Botón */}
      <div style={styles.footer}>
        <button 
          type="button"
          style={{...styles.button, opacity: stars > 0 && !loading ? 1 : 0.5}}
          onClick={handleSubmit}
          disabled={stars === 0 || loading}
          aria-busy={loading}
          aria-label={loading ? 'Enviando evaluación' : 'Enviar evaluación'}
          data-testid="submit-rating-btn"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Enviando...
            </span>
          ) : (
            'ENVIAR EVALUACIÓN'
          )}
        </button>
      </div>
      </div>
    </div>
  );
}

const styles = {
  screen: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: MAQGO.colors.bgDarker,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoSmall: { width: 50, height: 'auto' },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    background: MAQGO.colors.bgLight,
    padding: '50px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    color: MAQGO.colors.black,
    fontSize: 26,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: MAQGO.colors.grayDark,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  starsContainer: {
    display: 'flex',
    gap: 12,
    marginBottom: 40,
  },
  starBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  star: {
    fontSize: 48,
    transition: 'color 0.2s',
  },
  field: {
    width: '100%',
  },
  label: {
    display: 'block',
    color: MAQGO.colors.grayDark,
    fontSize: 14,
    marginBottom: 10,
  },
  textarea: {
    width: '100%',
    background: MAQGO.colors.white,
    border: '2px solid #eee',
    borderRadius: MAQGO.radius.lg,
    padding: 18,
    fontSize: 16,
    color: MAQGO.colors.black,
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'none',
    fontFamily: 'inherit',
  },
  footer: {
    background: MAQGO.colors.bgLight,
    padding: '20px 24px 30px',
  },
  button: {
    width: '100%',
    padding: 18,
    background: MAQGO.colors.orange,
    border: 'none',
    borderRadius: MAQGO.radius.lg,
    color: MAQGO.colors.white,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
  },
};

export default RateService;
