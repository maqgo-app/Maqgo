import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import { MACHINERY_LIST } from '../../components/MachineryIcons';
import MaqgoLogo from '../../components/MaqgoLogo';

/**
 * Publicar Maquinaria - Proveedor
 */
function PublishMachinery() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ tipo: '', marca: '', modelo: '', ano: '', patente: '' });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleNext = () => {
    localStorage.setItem('machineryData', JSON.stringify(form));
    navigate('/provider/tariffs');
  };

  const isValid = form.tipo && form.marca && form.modelo && form.ano && form.patente;

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <MaqgoLogo size="small" />
      </div>

      <div style={styles.content}>
        <h2 style={styles.title}>Publica tu maquinaria</h2>
        <p style={styles.subtitle}>Ingresa los datos de tu máquina</p>

        <select
          style={styles.select}
          value={form.tipo}
          onChange={e => update('tipo', e.target.value)}
        >
          <option value="">Tipo de maquinaria</option>
          {MACHINERY_LIST.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <input style={styles.input} placeholder="Marca" value={form.marca} onChange={e => update('marca', e.target.value)} />
        <input style={styles.input} placeholder="Modelo" value={form.modelo} onChange={e => update('modelo', e.target.value)} />
        <input style={styles.input} placeholder="Año" type="number" value={form.ano} onChange={e => update('ano', e.target.value)} />
        
        <div style={styles.patenteRow}>
          <input style={styles.patenteInput} placeholder="Patente" value={form.patente} onChange={e => update('patente', e.target.value)} />
          <button style={styles.iconBtn}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={styles.footer}>
        <button 
          style={{...styles.button, opacity: isValid ? 1 : 0.5}}
          onClick={handleNext}
          disabled={!isValid}
        >
          Siguiente
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
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoSmall: { width: 40, height: 'auto' },
  headerTitle: { color: MAQGO.colors.white, fontSize: 22, fontWeight: 800, letterSpacing: 1 },
  content: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' },
  title: { color: MAQGO.colors.white, fontSize: 26, fontWeight: 700, marginBottom: 8 },
  subtitle: { color: MAQGO.colors.grayLight, fontSize: 14, marginBottom: 30 },
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
  select: {
    width: '100%',
    background: MAQGO.colors.bgInput,
    border: 'none',
    borderRadius: MAQGO.radius.lg,
    padding: 18,
    fontSize: 16,
    color: '#807C72',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 14,
    appearance: 'none',
  },
  patenteRow: {
    display: 'flex',
    gap: 12,
  },
  patenteInput: {
    flex: 1,
    background: MAQGO.colors.bgInput,
    border: 'none',
    borderRadius: MAQGO.radius.lg,
    padding: 18,
    fontSize: 16,
    color: MAQGO.colors.black,
    outline: 'none',
  },
  iconBtn: {
    width: 60,
    height: 60,
    background: 'transparent',
    border: `2px solid ${MAQGO.colors.grayLight}`,
    borderRadius: MAQGO.radius.lg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
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

export default PublishMachinery;
