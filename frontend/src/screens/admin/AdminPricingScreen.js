import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { MACHINERY_NAMES as MACHINE_NAMES } from '../../utils/machineryNames';

const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
  danger: '#E57373',
};

const ADMIN_THEME = {
  appBg: '#12151B',
  panelBg: '#1B2028',
  panelBgSoft: '#171B22',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  textMuted: 'rgba(255,255,255,0.72)',
};

function AdminPricingScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [prices, setPrices] = useState({ per_hour: {}, per_service: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchPrices() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reference-prices`);
      const data = await res.json();
      setPrices(data);
    } catch (e) {
      console.error(e);
      setPrices({ per_hour: {}, per_service: {} });
    }
    setLoading(false);
  }

  useEffect(() => {
    setTimeout(() => {
      fetchPrices();
    }, 0);
  }, []);

  const updatePrice = (type, machineId, field, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) && value !== '') return;
    setPrices(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [machineId]: {
          ...(prev[type][machineId] || {}),
          [field]: value === '' ? '' : num
        }
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const perHour = {};
      const perService = {};
      Object.entries(prices.per_hour || {}).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
          const clean = {};
          if (v.min != null && v.min !== '') clean.min = Number(v.min);
          if (v.max != null && v.max !== '') clean.max = Number(v.max);
          if (v.default != null && v.default !== '') clean.default = Number(v.default);
          if (Object.keys(clean).length) perHour[k] = clean;
        }
      });
      Object.entries(prices.per_service || {}).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
          const clean = {};
          if (v.min != null && v.min !== '') clean.min = Number(v.min);
          if (v.max != null && v.max !== '') clean.max = Number(v.max);
          if (v.default != null && v.default !== '') clean.default = Number(v.default);
          if (Object.keys(clean).length) perService[k] = clean;
        }
      });

      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reference-prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ per_hour: perHour, per_service: perService })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Precios guardados correctamente');
      } else {
        toast.error('Error al guardar');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar');
    }
    setSaving(false);
  };

  const PriceRow = ({ type, machineId }) => {
    const p = (prices[type] || {})[machineId] || {};
    return (
      <div
        key={machineId}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 100px 120px',
          gap: 12,
          padding: '12px 16px',
          borderBottom: `1px solid ${ADMIN_THEME.border}`,
          alignItems: 'center'
        }}
      >
        <span style={{ color: '#fff', fontSize: 14 }}>{MACHINE_NAMES[machineId] || machineId}</span>
        <input
          type="number"
          value={p.min ?? ''}
          onChange={(e) => updatePrice(type, machineId, 'min', e.target.value)}
          placeholder="Mín"
          style={{
            padding: '8px 10px',
            background: ADMIN_THEME.panelBgSoft,
            border: `1px solid ${ADMIN_THEME.borderStrong}`,
            borderRadius: 6,
            color: '#fff',
            fontSize: 13
          }}
        />
        <input
          type="number"
          value={p.max ?? ''}
          onChange={(e) => updatePrice(type, machineId, 'max', e.target.value)}
          placeholder="Máx"
          style={{
            padding: '8px 10px',
            background: ADMIN_THEME.panelBgSoft,
            border: `1px solid ${ADMIN_THEME.borderStrong}`,
            borderRadius: 6,
            color: '#fff',
            fontSize: 13
          }}
        />
        <input
          type="number"
          value={p.default ?? ''}
          onChange={(e) => updatePrice(type, machineId, 'default', e.target.value)}
          placeholder="Sugerido"
          style={{
            padding: '8px 10px',
            background: ADMIN_THEME.panelBgSoft,
            border: `1px solid ${ADMIN_THEME.borderStrong}`,
            borderRadius: 6,
            color: ADMIN_PALETTE.brand,
            fontSize: 13,
            fontWeight: 600
          }}
        />
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100dvh', background: ADMIN_THEME.appBg, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: ADMIN_THEME.panelBg,
        padding: '20px 24px',
        borderBottom: `1px solid ${ADMIN_THEME.border}`
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#EC6819', fontFamily: "'Space Grotesk', sans-serif" }}>
              Precios de referencia
            </h1>
            <p style={{ color: ADMIN_THEME.textMuted, fontSize: 13, margin: '4px 0 0' }}>
              Precios sugeridos por maquinaria (se usan al configurar tarifas)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 16px',
                background: ADMIN_PALETTE.brand,
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '14px auto 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: ADMIN_THEME.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Secciones
          </span>
          {[
            { key: 'dashboard', label: 'Reservas', to: '/admin' },
            { key: 'users', label: 'Usuarios', to: '/admin/users' },
            { key: 'pricing', label: 'Precios', to: '/admin/pricing' },
            { key: 'marketing', label: 'Marketing', to: '/admin/marketing' },
          ].map((it) => {
            const active = location.pathname === it.to || (it.to === '/admin' && location.pathname === '/admin');
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => navigate(it.to)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? '1px solid rgba(236, 104, 25, 0.55)' : `1px solid ${ADMIN_THEME.borderStrong}`,
                  background: active ? 'rgba(236, 104, 25, 0.18)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#fff' : 'rgba(255,255,255,0.85)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40 }}>
            <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.25)', borderTopColor: ADMIN_PALETTE.brand, borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Cargando precios...</p>
          </div>
        ) : (
          <>
            <div style={{ background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: `1px solid ${ADMIN_THEME.border}` }}>
              <div style={{
                padding: '14px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 12,
                color: ADMIN_PALETTE.brand,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                Por hora (retroexcavadora, excavadora, bulldozer, etc.)
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 100px 120px',
                gap: 12,
                padding: '12px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 13,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase'
              }}>
                <span>Maquinaria</span>
                <span>Mín (CLP)</span>
                <span>Máx (CLP)</span>
                <span>Sugerido</span>
              </div>
              {Object.keys(prices.per_hour || {}).map(id => <PriceRow key={id} type="per_hour" machineId={id} />)}
            </div>

            <div style={{ background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}>
              <div style={{
                padding: '14px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 12,
                color: ADMIN_PALETTE.brand,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                Por servicio (grúa, camión pluma, aljibe, tolva)
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 100px 120px',
                gap: 12,
                padding: '12px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 13,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase'
              }}>
                <span>Maquinaria</span>
                <span>Mín (CLP)</span>
                <span>Máx (CLP)</span>
                <span>Sugerido</span>
              </div>
              {Object.keys(prices.per_service || {}).map(id => <PriceRow key={id} type="per_service" machineId={id} />)}
            </div>

            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
              Estos valores se muestran como sugerencia cuando un proveedor configura el precio de su maquinaria.
              El campo "Sugerido" es el valor por defecto que aparecerá en el formulario.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminPricingScreen;
