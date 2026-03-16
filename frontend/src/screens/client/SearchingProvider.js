import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';

/**
 * Pantalla Buscando Operador
 * Diseño EXACTO de 7.7.b.png
 */
function SearchingProvider() {
  const navigate = useNavigate();

  const handleCancel = () => {
    navigate('/client/home');
  };

  return (
    <div style={styles.screen}>
      {/* Header oscuro */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      {/* Contenido claro */}
      <div style={styles.content}>
        <h1 style={styles.title}>
          Estamos buscando el mejor operador disponible...
        </h1>

        {/* Icono de reloj */}
        <div style={styles.iconContainer}>
          <div style={styles.clockIcon}>
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="28" stroke="#fff" strokeWidth="3" fill="none"/>
              <path d="M30 15V30L40 40" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <p style={styles.waiting}>Esperando confirmación...</p>
      </div>

      {/* Botón cancelar */}
      <div style={styles.footer}>
        <button style={styles.cancelBtn} onClick={handleCancel}>
          CANCELAR SOLICITUD
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
  logoSmall: {
    width: 50,
    height: 'auto',
  },
  content: {
    flex: 1,
    background: MAQGO.colors.bgLight,
    padding: '60px 28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    color: MAQGO.colors.black,
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    marginBottom: 60,
  },
  iconContainer: {
    marginBottom: 30,
  },
  clockIcon: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: MAQGO.colors.orange,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: {
    color: MAQGO.colors.grayDark,
    fontSize: 18,
    fontStyle: 'italic',
  },
  footer: {
    background: MAQGO.colors.bgLight,
    padding: '20px 28px 40px',
  },
  cancelBtn: {
    width: '100%',
    padding: '18px',
    background: MAQGO.colors.orange,
    border: 'none',
    borderRadius: MAQGO.radius.full,
    color: MAQGO.colors.white,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
  },
};

export default SearchingProvider;
