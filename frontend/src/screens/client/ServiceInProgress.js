import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getMachineryDisplayName } from '../../utils/machineryNames';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de Servicio en Progreso
 * Diseño industrial MAQGO
 */
function ServiceInProgress() {
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const lastErrorLogAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);

  useEffect(() => {
    const loadService = async () => {
      try {
        const serviceId = localStorage.getItem('currentServiceId');
        if (serviceId) {
          const response = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          setService(response.data);
          
          if (response.data.status === 'last_30') {
            navigate('/client/last-30');
          } else if (response.data.status === 'finished') {
            navigate('/client/service-finished');
          }
        }
      } catch (error) {
        const now = Date.now();
        if (now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('ServiceInProgress poll error:', error?.message || error);
          }
          lastErrorLogAtRef.current = now;
        }
        throw error;
      }
    };
    
    let cancelled = false;
    let timeoutId = null;

    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;

      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await loadService();
        errorStreakRef.current = 0;
      } catch {
        errorStreakRef.current += 1;
      } finally {
        inFlightRef.current = false;
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * (2 ** errorStreakRef.current)
        );
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      {/* Contenido */}
      <div style={styles.content}>
        {/* Icono activo */}
        <div style={styles.activeIcon}>
          
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
            <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="3"/>
            <path d="M25 12V25L32 32" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 style={styles.title}>Servicio en Curso</h1>
        <span style={styles.statusBadge}>ACTIVO</span>

        {/* Tarjeta de detalles */}
        <div style={styles.card}>
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Maquinaria</span>
            <span style={styles.cardValue}>{getMachineryDisplayName(service?.machineryType || service?.machinery_type || 'retroexcavadora')}</span>
          </div>
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Ubicación</span>
            <span style={styles.cardValue}>{service?.location?.address || 'Santiago, Chile'}</span>
          </div>
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Estado</span>
            <span style={{...styles.cardValue, color: MAQGO.colors.orange}}>En progreso</span>
          </div>
        </div>

        <div style={styles.infoBox}>
          <span style={styles.infoIcon}>ℹ️</span>
          <span style={styles.infoText}>
            El servicio se cerrará automáticamente al finalizar la jornada
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1); opacity: 0.5; }
        }
      `}</style>
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
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  activeIcon: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: MAQGO.colors.orange,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: MAQGO.colors.orange,
    animation: 'pulse 2s infinite',
  },
  title: {
    color: MAQGO.colors.black,
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    background: '#90BDD3',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 20px',
    borderRadius: 20,
    letterSpacing: 1,
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
  infoBox: {
    width: '100%',
    background: 'rgba(247, 147, 30, 0.1)',
    border: `1px solid ${MAQGO.colors.orange}`,
    borderRadius: MAQGO.radius.md,
    padding: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    color: MAQGO.colors.grayDark,
    fontSize: 14,
    lineHeight: 1.4,
  },
};

export default ServiceInProgress;
