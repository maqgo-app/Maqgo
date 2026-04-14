import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useBackRoute } from '../../hooks/useBackRoute';

/**
 * Pantalla de  y Disponibilidad - Proveedor
 */
function TariffsScreen() {
  const navigate = useNavigate();
  const { back } = useBackRoute('provider', '/provider/home');
  const [form, setForm] = useState({
    tarifaHora: '',
    horasMinimas: '9',
    dias: { L: true, M: true, X: true, J: true, V: true, S: false, D: false },
    horarioInicio: '08:00',
    horarioFin: '18:00',
  });

  const toggleDay = (day) => {
    setForm(prev => ({ ...prev, dias: { ...prev.dias, [day]: !prev.dias[day] } }));
  };

  const handleNext = () => {
    localStorage.setItem('tariffsData', JSON.stringify(form));
    navigate('/provider/operator');
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

      {/* Contenido */}
      <div style={styles.content}>
        <h2 style={styles.title}> y disponibilidad</h2>
        <p style={styles.subtitle}>Define cuánto cobras y cuándo estás disponible</p>

        <div style={styles.field}>
          <label style={styles.label}>Tarifa por hora (CLP)</label>
          <input
            style={styles.input}
            type="number"
            placeholder="Ej: 25000"
            value={form.tarifaHora}
            onChange={e => setForm({...form, tarifaHora: e.target.value})}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Días disponibles</label>
          <div style={styles.daysRow}>
            {Object.keys(form.dias).map(day => (
              <button
                key={day}
                style={{...styles.dayBtn, ...(form.dias[day] ? styles.dayBtnActive : {})}}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen */}
        <div style={styles.summary}>
          <span style={styles.summaryLabel}>Tarifa por jornada (9 hrs)</span>
          <span style={styles.summaryValue}>
            ${form.tarifaHora ? (parseInt(form.tarifaHora) * 9).toLocaleString('es-CL') : '0'} CLP
          </span>
        </div>
      </div>

      <div style={styles.footer}>
        <button type="button" style={styles.button} onClick={handleNext}>
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
  logoSmall: { width: 35, height: 'auto' },
  headerTitle: {
    color: MAQGO.colors.white,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 1,
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  title: {
    color: MAQGO.colors.white,
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
  },
  subtitle: {
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    marginBottom: 30,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    display: 'block',
    color: MAQGO.colors.white,
    fontSize: 14,
    marginBottom: 10,
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
  daysRow: {
    display: 'flex',
    gap: 8,
  },
  dayBtn: {
    flex: 1,
    padding: 14,
    background: 'transparent',
    border: `2px solid ${MAQGO.colors.grayLight}`,
    borderRadius: MAQGO.radius.md,
    color: MAQGO.colors.grayLight,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dayBtnActive: {
    background: MAQGO.colors.orange,
    borderColor: MAQGO.colors.orange,
    color: MAQGO.colors.white,
  },
  summary: {
    background: 'rgba(247, 147, 30, 0.15)',
    borderRadius: MAQGO.radius.lg,
    padding: 20,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  summaryLabel: {
    color: MAQGO.colors.grayLight,
    fontSize: 14,
  },
  summaryValue: {
    color: MAQGO.colors.orange,
    fontSize: 22,
    fontWeight: 700,
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
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default TariffsScreen;
