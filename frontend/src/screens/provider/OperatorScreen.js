import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useBackRoute } from '../../hooks/useBackRoute';

/**
 * Pantalla de Agregar Operador
 */
function OperatorScreen() {
  const navigate = useNavigate();
  const { back } = useBackRoute('provider', '/provider/home');
  const [isOperator, setIsOperator] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', licencia: '' });

  const handleFinish = () => {
    const data = isOperator ? 'self' : { ...form, name: `${form.nombre} ${form.apellido}`.trim() };
    localStorage.setItem('operatorData', JSON.stringify(data));
    navigate('/provider/availability');
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={back} aria-label="Volver">
          <BackArrowIcon style={{ color: '#fff' }} />
        </button>
        <div style={styles.headerCenter}>
          <MaqgoLogo size="small" />
        </div>
        
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
            
          </button>
        </div>

        {!isOperator && (
          <>
            <input
              style={styles.input}
              placeholder="Nombre"
              value={form.nombre}
              onChange={e => setForm({...form, nombre: e.target.value})}
            />
            <input
              style={styles.input}
              placeholder="Apellido"
              value={form.apellido}
              onChange={e => setForm({...form, apellido: e.target.value})}
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
        <button type="button" style={styles.button} onClick={handleFinish}>
          Finalizar registro
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
  content: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' },
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
