import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';

/**
 * Pantalla de Agregar Operador
 */
function OperatorScreen() {
  const navigate = useNavigate();
  const [isOperator, setIsOperator] = useState(false);
  const [form, setForm] = useState({ nombre: '', telefono: '', licencia: '' });

  const handleFinish = () => {
    localStorage.setItem('operatorData', JSON.stringify(isOperator ? 'self' : form));
    navigate('/provider/availability');
  };

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style={styles.headerCenter}>
          <MaqgoLogo size="small" />
        </div>
        <div style={{width: 24}}></div>
      </div>

      <div style={styles.content}>
        <h2 style={styles.title}>Agregar operador</h2>
        <p style={styles.subtitle}>Datos del operador que manejará la maquinaria</p>

        {/* Toggle */}
        <div style={styles.toggleRow}>
          <span style={styles.toggleLabel}>Yo soy el operador</span>
          <button 
            style={{...styles.toggle, background: isOperator ? MAQGO.colors.orange : '#555'}}
            onClick={() => setIsOperator(!isOperator)}
          >
            <div style={{...styles.toggleKnob, transform: isOperator ? 'translateX(22px)' : 'translateX(2px)'}}></div>
          </button>
        </div>

        {!isOperator && (
          <>
            <input
              style={styles.input}
              placeholder="Nombre completo del operador"
              value={form.nombre}
              onChange={e => setForm({...form, nombre: e.target.value})}
            />
            <input
              style={styles.input}
              placeholder="Celular de contacto"
              type="tel"
              value={form.telefono}
              onChange={e => setForm({...form, telefono: e.target.value})}
            />
            <input
              style={styles.input}
              placeholder="Número de licencia"
              value={form.licencia}
              onChange={e => setForm({...form, licencia: e.target.value})}
            />
          </>
        )}
      </div>

      <div style={styles.footer}>
        <button style={styles.button} onClick={handleFinish}>
          Finalizar registro
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
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: { display: 'flex', alignItems: 'center', gap: 10 },
  logoSmall: { width: 35, height: 'auto' },
  headerTitle: { color: MAQGO.colors.white, fontSize: 20, fontWeight: 800, letterSpacing: 1 },
  backBtn: { background: 'transparent', border: 'none', cursor: 'pointer' },
  content: { flex: 1, padding: '20px 24px' },
  title: { color: MAQGO.colors.white, fontSize: 24, fontWeight: 700, marginBottom: 8 },
  subtitle: { color: MAQGO.colors.grayLight, fontSize: 14, marginBottom: 30 },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    background: '#4a4a4a',
    borderRadius: MAQGO.radius.lg,
    marginBottom: 20,
  },
  toggleLabel: { color: MAQGO.colors.white, fontSize: 16 },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    border: 'none',
    position: 'relative',
    cursor: 'pointer',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    background: MAQGO.colors.white,
    borderRadius: '50%',
    position: 'absolute',
    top: 2,
    transition: 'transform 0.2s',
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
    marginBottom: 14,
  },
  footer: { padding: '20px 24px 30px' },
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
  },
};

export default OperatorScreen;
