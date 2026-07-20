import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../../components/MaqgoLogo';

const THEME = {
  appBg: '#070B12',
  panelBg: '#0F172A',
  panelBgSoft: '#0B1220',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textMuted: 'rgba(255,255,255,0.70)',
  brand: '#EC6819',
  info: '#8FB3C9',
};

function Tab({ to, label }) {
  return (
    <NavLink
      to={to}
      end={to === '.'}
      style={({ isActive }) => ({
        padding: '8px 12px',
        borderRadius: 10,
        border: `1px solid ${isActive ? THEME.borderStrong : THEME.border}`,
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.78)',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      })}
    >
      {label}
    </NavLink>
  );
}

export default function AdminGrowthAIFrame() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: THEME.appBg,
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '18px 18px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <MaqgoLogo size="mini" style={{ minHeight: 44, height: 44 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Growth AI</h1>
              <span style={{ color: THEME.textMuted, fontSize: 12, fontWeight: 700 }}>
                Cerebro comercial MAQGO (always-on)
              </span>
              </div>
              <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.35 }}>
                Equilibrio &gt; actividad · Regímenes · Sistema único · Aprendizaje
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="maqgo-btn-secondary"
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Volver al panel
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 10,
            borderRadius: 16,
            border: `1px solid ${THEME.border}`,
            background: THEME.panelBg,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Tab to="." label="Overview" />
          <Tab to="comunas" label="Comunas" />
          <Tab to="map" label="Mapa" />
          <Tab to="opportunities" label="Oportunidades" />
          <Tab to="discovery" label="Discovery" />
          <Tab to="config" label="Config" />
          <Tab to="audit" label="Auditoría" />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              aria-label="Más secciones"
              defaultValue=""
              onChange={(e) => {
                const v = String(e.target.value || '').trim();
                if (!v) return;
                navigate(v);
                e.target.value = '';
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${THEME.borderStrong}`,
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                outline: 'none',
              }}
            >
              <option value="">Más…</option>
              <option value="/admin/growth-ai/programs">Programas</option>
              <option value="/admin/growth-ai/automations">Automatizaciones</option>
              <option value="/admin/growth-ai/actions">Acciones</option>
              <option value="/admin/growth-ai/contacts">Contactos</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Outlet context={{ THEME }} />
        </div>
      </div>
    </div>
  );
}
