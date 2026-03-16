import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';

/**
 * Pantalla de Servicio Aceptado - Proveedor
 * Diseño industrial MAQGO
 * 
 * Texto actualizado: "El cliente fue notificado y el cobro será ejecutado automáticamente"
 */
function ServiceAccepted() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/provider/in-progress');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

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
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="36" stroke="#4CAF50" strokeWidth="4"/>
            <path d="M24 40L35 51L56 29" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={styles.title}>Servicio confirmado</h1>
        <p style={styles.subtitle}>El cliente fue notificado y el cobro será ejecutado automáticamente.</p>

        {/* Info de pago - actualizado */}
        <div style={styles.paymentCard}>
          <span style={styles.paymentIcon}>💳</span>
          <div>
            <span style={styles.paymentTitle}>Cobro automático</span>
            <span style={styles.paymentDesc}>El cliente será cobrado ahora que aceptaste el servicio</span>
          </div>
        </div>

        {/* Próximos pasos */}
        <div style={styles.stepsCard}>
          <h3 style={styles.stepsTitle}>Próximos pasos:</h3>
          
          <div style={styles.stepItem}>
            <span style={styles.stepNumber}>1</span>
            <span style={styles.stepText}>Dirígete a la ubicación indicada</span>
          </div>
          <div style={styles.stepItem}>
            <span style={styles.stepNumber}>2</span>
            <span style={styles.stepText}>Confirma tu llegada con el cliente</span>
          </div>
          <div style={styles.stepItem}>
            <span style={styles.stepNumber}>3</span>
            <span style={styles.stepText}>Inicia el servicio</span>
          </div>
        </div>

        <p style={styles.redirectText}>Redirigiendo en {countdown} segundos...</p>
      </div>

      {/* Botón */}
      <div style={styles.footer}>
        <button 
          style={styles.button}
          onClick={() => navigate('/provider/in-progress')}
        >
          IR AL SERVICIO
        </button>
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
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoSmall: { width: 50, height: 'auto' },
  content: {
    flex: 1,
    padding: '30px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  title: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: MAQGO.colors.grayLight,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  paymentCard: {
    width: '100%',
    background: 'rgba(144, 189, 211, 0.15)',
    border: '1px solid rgba(144, 189, 211, 0.3)',
    borderRadius: MAQGO.radius.lg,
    padding: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  paymentIcon: {
    fontSize: 32,
  },
  paymentTitle: {
    display: 'block',
    color: '#90BDD3',
    fontSize: 16,
    fontWeight: 600,
  },
  paymentDesc: {
    display: 'block',
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    marginTop: 4,
  },
  stepsCard: {
    width: '100%',
    background: 'rgba(45, 45, 45, 0.8)',
    borderRadius: MAQGO.radius.lg,
    padding: 20,
    marginBottom: 20,
  },
  stepsTitle: {
    color: MAQGO.colors.white,
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 16,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: MAQGO.colors.orange,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
  },
  stepText: {
    color: MAQGO.colors.grayLight,
    fontSize: 14,
  },
  redirectText: {
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
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

export default ServiceAccepted;
