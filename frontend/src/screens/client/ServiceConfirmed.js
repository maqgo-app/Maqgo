import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MAQGO } from '../../styles/theme';
import { calculatePriceBreakdown, formatCLP } from '../../utils/commissions';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Servicio Confirmado
 * Diseño industrial MAQGO
 */
function ServiceConfirmed() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          const response = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          setService(response.data);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };
    loadService();
  }, []);

  const basePrice = service?.totalAmount || 150000;
  const breakdown = calculatePriceBreakdown(basePrice);

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      {/* Contenido */}
      <div style={styles.content}>
        {/* Icono de éxito */}
        <div style={styles.successIcon}>
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="#90BDD3" strokeWidth="3"/>
            <path d="M18 30L26 38L42 22" stroke="#90BDD3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={styles.title}>¡Servicio Confirmado!</h1>
        <p style={styles.subtitle}>Un operador ha aceptado tu solicitud</p>

        {/* Tarjeta de detalles */}
        <div style={styles.card}>
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Estado</span>
            <span style={styles.statusBadge}>EN CURSO</span>
          </div>
          
          {service && (
            <>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>ID Servicio</span>
                <span style={styles.cardValue}>{service.id?.substring(0, 8) || '...'}</span>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>Maquinaria</span>
                <span style={styles.cardValue}>{service.machineryType || 'Retroexcavadora'}</span>
              </div>
            </>
          )}
        </div>

        {/* Desglose de costos */}
        <div style={styles.breakdownCard}>
          <h3 style={styles.breakdownTitle}>Resumen de Costos</h3>
          
          <div style={styles.breakdownRow}>
            <span>Valor del servicio</span>
            <span>{formatCLP(breakdown.client.serviceValue)}</span>
          </div>
          <div style={styles.breakdownRow}>
            <span>{breakdown.client.commissionLabel}</span>
            <span>{formatCLP(breakdown.client.commission)}</span>
          </div>
          <div style={styles.breakdownRow}>
            <span>{breakdown.client.ivaLabel}</span>
            <span>{formatCLP(breakdown.client.iva)}</span>
          </div>
          <div style={styles.breakdownTotal}>
            <span>{breakdown.client.totalLabel}</span>
            <span style={styles.totalAmount}>{formatCLP(breakdown.client.total)}</span>
          </div>
        </div>
      </div>

      {/* Botón */}
      <div style={styles.footer}>
        <button 
          style={styles.button}
          onClick={() => navigate('/client/in-progress')}
          data-testid="go-to-progress-btn"
        >
          VER SERVICIO EN CURSO
        </button>
      </div>
    </div>
  );
}

const styles = {
  screen: {
    minHeight: '100vh',
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
    background: MAQGO.colors.bgLight,
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  title: {
    color: MAQGO.colors.black,
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: MAQGO.colors.grayDark,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  card: {
    width: '100%',
    background: MAQGO.colors.white,
    borderRadius: MAQGO.radius.lg,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 14,
    borderBottom: '1px solid #eee',
  },
  cardLabel: {
    color: MAQGO.colors.grayDark,
    fontSize: 14,
  },
  cardValue: {
    color: MAQGO.colors.black,
    fontSize: 15,
    fontWeight: 600,
  },
  statusBadge: {
    background: '#90BDD3',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    padding: '6px 12px',
    borderRadius: 20,
    letterSpacing: 1,
  },
  breakdownCard: {
    width: '100%',
    background: MAQGO.colors.white,
    borderRadius: MAQGO.radius.lg,
    padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  breakdownTitle: {
    color: MAQGO.colors.black,
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #eee',
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    color: MAQGO.colors.grayDark,
    fontSize: 14,
    paddingBottom: 10,
  },
  breakdownTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 14,
    marginTop: 10,
    borderTop: '2px solid #eee',
    color: MAQGO.colors.black,
    fontSize: 16,
    fontWeight: 700,
  },
  totalAmount: {
    color: MAQGO.colors.orange,
    fontSize: 22,
    fontWeight: 700,
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

export default ServiceConfirmed;
