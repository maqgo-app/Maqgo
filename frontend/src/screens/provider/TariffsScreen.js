import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO } from '../../styles/theme';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';

/**
 * Pantalla de Tarifas y Disponibilidad - Proveedor
 */
function TariffsScreen() {
  const navigate = useNavigate();
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
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{ padding: 'var(--maqgo-screen-padding-top) 24px 140px' }}
      >
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate(-1)} aria-label="Volver">
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={styles.headerCenter}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }} />
        </div>

        <h2 style={styles.title}>Tarifas y disponibilidad</h2>
        <p style={styles.subtitle}>Define cuánto cobras y cuándo estás disponible</p>

        <div style={styles.field}>
          <label style={styles.label}>Tarifa por hora (CLP)</label>
          <input
            style={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="Ej: 25000"
            value={form.tarifaHora}
            onChange={(e) => setForm({ ...form, tarifaHora: e.target.value })}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Días disponibles</label>
          <div style={styles.daysRow}>
            {Object.keys(form.dias).map((day) => (
              <button
                key={day}
                type="button"
                style={{ ...styles.dayBtn, ...(form.dias[day] ? styles.dayBtnActive : {}) }}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.summary}>
          <span style={styles.summaryLabel}>Tarifa por jornada (9 hrs)</span>
          <span style={styles.summaryValue}>
            ${form.tarifaHora ? (parseInt(form.tarifaHora, 10) * 9).toLocaleString('es-CL') : '0'} CLP
          </span>
        </div>

        <div className="maqgo-fixed-bottom-bar">
          <button type="button" className="maqgo-btn-primary" onClick={handleNext}>
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    padding: '0 0 12px',
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
    flexWrap: 'wrap',
  },
  dayBtn: {
    flex: '1 1 60px',
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
};

export default TariffsScreen;
