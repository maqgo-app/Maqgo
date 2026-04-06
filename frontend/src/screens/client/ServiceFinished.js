import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';

/**
 * Pantalla de Servicio Finalizado
 * Diseño industrial MAQGO
 */
function ServiceFinished() {
  const navigate = useNavigate();

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      {/* Contenido */}
      <div style={styles.content}>
        {/* Icono de éxito */}
        <div style={styles.successIcon}>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none">
            <circle cx="35" cy="35" r="32" stroke="#90BDD3" strokeWidth="4"/>
            <path d="M22 35L31 44L48 27" stroke="#90BDD3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={styles.title}>Servicio Finalizado</h1>
        <p style={styles.subtitle}>El servicio se ha completado automáticamente</p>

        {/* Tarjeta de información */}
        <div style={styles.card}>
          <p style={styles.cardText}>
            La geolocalización ha sido registrada y el servicio cerrado correctamente.
          </p>
          <div style={styles.checkItem}>
            <span style={styles.checkIcon}>✓</span>
            <span style={styles.checkText}>Jornada completada</span>
          </div>
          <div style={styles.checkItem}>
            <span style={styles.checkIcon}>✓</span>
            <span style={styles.checkText}>Pago procesado</span>
          </div>
          <div style={styles.checkItem}>
            <span style={styles.checkIcon}>✓</span>
            <span style={styles.checkText}>Registro guardado</span>
          </div>
        </div>
      </div>

      {/* Botón */}
      <div style={styles.footer}>
        <button 
          type="button"
          style={styles.button}
          onClick={() => navigate('/client/rate')}
          data-testid="go-to-rate-btn"
        >
          EVALUAR SERVICIO
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
    padding: 24,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  cardText: {
    color: MAQGO.colors.grayDark,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 1.5,
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTop: '1px solid #eee',
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#90BDD3',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkText: {
    color: MAQGO.colors.black,
    fontSize: 15,
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

export default ServiceFinished;
