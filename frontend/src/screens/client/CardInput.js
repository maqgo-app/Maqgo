import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import axios from 'axios';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Método de Pago
 * Diseño industrial MAQGO
 */
function CardInput() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const serviceId = localStorage.getItem('currentServiceId');
      
      await axios.post(`${BACKEND_URL}/api/payments/validate`, {
        serviceId,
        amount: 50,
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv
      }, { timeout: 8000 });
      
      navigate('/client/searching');
    } catch (error) {
      // Continuar al flujo de búsqueda de todos modos (demo)
      navigate('/client/searching');
    } finally {
      setLoading(false);
    }
  };

  const isValid = cardNumber.length >= 15 && expiryMonth && expiryYear && cvv.length >= 3;

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(backRoute || -1)} aria-label="Volver">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style={styles.headerCenter}>
          <MaqgoLogo size="small" />
        </div>
        <div style={{width: 24}}></div>
      </div>

      {/* Contenido */}
      <div style={styles.content}>
        <h1 className="maqgo-h1" style={{ ...styles.title, marginBottom: 8 }}>Método de Pago</h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 16 }}>Valida tu tarjeta para reservar</p>
        
        <div style={styles.alertBox}>
          <span style={styles.alertIcon}>ℹ️</span>
          <span style={styles.alertText}>
            Se cobrará $50 CLP para validar tu tarjeta. El cobro real se realizará cuando un operador acepte tu solicitud.
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Número de Tarjeta</label>
            <input 
              style={styles.input}
              type="text" 
              placeholder="1234 5678 9012 3456"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
              maxLength="16"
              data-testid="card-number-input"
            />
          </div>
          
          <div style={styles.row}>
            <div style={{...styles.field, flex: 1}}>
              <label style={styles.label}>Mes</label>
              <input 
                style={styles.input}
                type="text" 
                placeholder="MM"
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, ''))}
                maxLength="2"
                data-testid="card-month-input"
              />
            </div>
            
            <div style={{...styles.field, flex: 1}}>
              <label style={styles.label}>Año</label>
              <input 
                style={styles.input}
                type="text" 
                placeholder="AA"
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, ''))}
                maxLength="2"
                data-testid="card-year-input"
              />
            </div>
            
            <div style={{...styles.field, flex: 1}}>
              <label style={styles.label}>CVC</label>
              <input 
                style={styles.input}
                type="text" 
                placeholder="123"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                maxLength="4"
                data-testid="card-cvv-input"
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            style={{...styles.button, opacity: isValid && !loading ? 1 : 0.5}}
            disabled={!isValid || loading}
            aria-busy={loading}
            aria-label={loading ? 'Validando tarjeta' : 'Continuar'}
            data-testid="submit-card-btn"
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
                Validando...
              </span>
            ) : (
              'Continuar'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  screen: {
    minHeight: '100vh',
    background: MAQGO.colors.bgDark,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoSmall: { width: 50, height: 'auto' },
  backBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    padding: '20px 24px',
  },
  title: {
    color: MAQGO.colors.white,
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 20,
  },
  alertBox: {
    background: 'rgba(247, 147, 30, 0.15)',
    border: `1px solid ${MAQGO.colors.orange}`,
    borderRadius: MAQGO.radius.md,
    padding: 16,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 30,
  },
  alertIcon: {
    fontSize: 20,
  },
  alertText: {
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    lineHeight: 1.5,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    background: MAQGO.colors.bgInput,
    border: 'none',
    borderRadius: MAQGO.radius.lg,
    padding: 18,
    fontSize: 16,
    color: MAQGO.colors.black,
    outline: 'none',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  button: {
    width: '100%',
    padding: 18,
    background: MAQGO.colors.orange,
    border: 'none',
    borderRadius: MAQGO.radius.lg,
    color: MAQGO.colors.white,
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 20,
  },
};

export default CardInput;
