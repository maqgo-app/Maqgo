import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';
import {
  MACHINERY_NAMES as MACHINE_NAMES,
  getMachineryCapacityOptions,
  formatMachineryCapacityChipLabel,
} from '../../utils/machineryNames';
import { BackArrowIcon } from '../../components/BackArrowIcon';

const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
  danger: '#E57373',
};

const ADMIN_THEME = {
  appBg: '#070B12',
  panelBg: '#0F172A',
  panelBgSoft: '#0B1220',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textMuted: 'rgba(255,255,255,0.70)',
};

function AdminPricingScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [prices, setPrices] = useState({ per_hour: {}, per_service: {}, by_capacity: {}, transport: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const goDashboardArea = (area) => {
    try {
      localStorage.setItem('maqgo_admin_area', area);
    } catch {
      void 0;
    }
    navigate('/admin');
  };

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

  const updateCapacityPrice = (machineId, capacityKey, field, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) && value !== '') return;
    setPrices(prev => ({
      ...prev,
      by_capacity: {
        ...(prev.by_capacity || {}),
        [machineId]: {
          ...((prev.by_capacity || {})[machineId] || {}),
          [capacityKey]: {
            ...(((prev.by_capacity || {})[machineId] || {})[capacityKey] || {}),
            [field]: value === '' ? '' : num,
          },
        },
      },
    }));
  };

  const updateTransportPrice = (field, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) && value !== '') return;
    setPrices(prev => ({
      ...prev,
      transport: {
        ...(prev.transport || {}),
        [field]: value === '' ? '' : num,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const perHour = {};
      const perService = {};
      const byCapacity = {};
      const transport = {};
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
      Object.entries(prices.by_capacity || {}).forEach(([machineId, variants]) => {
        if (!variants || typeof variants !== 'object') return;
        const cleanVariants = {};
        Object.entries(variants).forEach(([capacityKey, vals]) => {
          if (!vals || typeof vals !== 'object') return;
          const clean = {};
          if (vals.min != null && vals.min !== '') clean.min = Number(vals.min);
          if (vals.max != null && vals.max !== '') clean.max = Number(vals.max);
          if (vals.default != null && vals.default !== '') clean.default = Number(vals.default);
          if (Object.keys(clean).length) cleanVariants[capacityKey] = clean;
        });
        if (Object.keys(cleanVariants).length) byCapacity[machineId] = cleanVariants;
      });
      ['min', 'max', 'default'].forEach((field) => {
        const value = prices.transport?.[field];
        if (value != null && value !== '') transport[field] = Number(value);
      });

      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reference-prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ per_hour: perHour, per_service: perService, by_capacity: byCapacity, transport })
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

  const inputStyle = {
    padding: '8px 10px',
    background: ADMIN_THEME.panelBgSoft,
    border: `1px solid ${ADMIN_THEME.borderStrong}`,
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
  };

  const headerGridStyle = {
    display: 'grid',
    gap: 12,
    padding: '12px 16px',
    background: ADMIN_THEME.panelBgSoft,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase'
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
          style={inputStyle}
        />
        <input
          type="number"
          value={p.max ?? ''}
          onChange={(e) => updatePrice(type, machineId, 'max', e.target.value)}
          placeholder="Máx"
          style={inputStyle}
        />
        <input
          type="number"
          value={p.default ?? ''}
          onChange={(e) => updatePrice(type, machineId, 'default', e.target.value)}
          placeholder="Sugerido"
          style={{
            ...inputStyle,
            color: ADMIN_PALETTE.brand,
            fontWeight: 600
          }}
        />
      </div>
    );
  };

  const CapacityRow = ({ machineId, capacityKey }) => {
    const p = ((prices.by_capacity || {})[machineId] || {})[capacityKey] || {};
    const numericKey = Number(capacityKey);
    const capacityLabel = Number.isFinite(numericKey)
      ? formatMachineryCapacityChipLabel(machineId, numericKey)
      : capacityKey;
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 100px 120px',
          gap: 12,
          padding: '12px 16px',
          borderBottom: `1px solid ${ADMIN_THEME.border}`,
          alignItems: 'center'
        }}
      >
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{capacityLabel}</span>
        <input
          type="number"
          value={p.min ?? ''}
          onChange={(e) => updateCapacityPrice(machineId, capacityKey, 'min', e.target.value)}
          placeholder="Mín"
          style={inputStyle}
        />
        <input
          type="number"
          value={p.max ?? ''}
          onChange={(e) => updateCapacityPrice(machineId, capacityKey, 'max', e.target.value)}
          placeholder="Máx"
          style={inputStyle}
        />
        <input
          type="number"
          value={p.default ?? ''}
          onChange={(e) => updateCapacityPrice(machineId, capacityKey, 'default', e.target.value)}
          placeholder="Sugerido"
          style={{
            ...inputStyle,
            color: ADMIN_PALETTE.brand,
            fontWeight: 600,
          }}
        />
      </div>
    );
  };

  const capacityMachineIds = Object.keys(prices.by_capacity || {}).filter((machineId) => getMachineryCapacityOptions(machineId));
  const transport = prices.transport || {};

  return (
    <div className="maqgo-admin-page" style={{ minHeight: '100dvh', background: ADMIN_THEME.appBg, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div className="maqgo-admin-topbar" style={{ background: ADMIN_THEME.panelBg, padding: '20px 24px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/welcome', { replace: false })}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'transparent',
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Volver a portada"
              title="Volver a portada"
            >
              <BackArrowIcon size={18} style={{ display: 'block' }} />
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'Space Grotesk', sans-serif", color: '#EC6819' }}>
              MAQGO Admin
            </h1>
          </div>
          <div style={{ flex: 1, minWidth: 260 }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              aria-label="Sin alertas urgentes"
              disabled
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                opacity: 0.6,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3C9.79086 3 8 4.79086 8 7V8.2C8 9.09411 7.70361 9.96449 7.1577 10.7L6.44721 11.6524C5.53397 12.872 6.4022 14.6 7.92462 14.6H16.0754C17.5978 14.6 18.466 12.872 17.5528 11.6524L16.8423 10.7C16.2964 9.96449 16 9.09411 16 8.2V7C16 4.79086 14.2091 3 12 3Z"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                />
                <path
                  d="M10 16C10.1709 17.1652 10.9882 18 12 18C13.0118 18 13.8291 17.1652 14 16"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 999, border: `1px solid ${ADMIN_THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <button
                type="button"
                onClick={() => goDashboardArea('today')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => goDashboardArea('system')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Operación
              </button>
              <button
                type="button"
                onClick={() => goDashboardArea('platform')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Plataforma
              </button>
            </div>
            <button
              type="button"
              onClick={() => goDashboardArea('money')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Facturación y pagos
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Usuarios
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/pricing')}
              style={{
                padding: '8px 16px',
                background: 'rgba(236, 104, 25, 0.22)',
                border: '1px solid rgba(236, 104, 25, 0.55)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Precios
            </button>
            <button
              type="button"
              title="Inversión semanal por canal, audiencia y CAC"
              onClick={() => navigate('/admin/marketing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(126, 184, 212, 0.45)',
                borderRadius: 8,
                color: ADMIN_PALETTE.info,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Marketing & CAC
            </button>
            <button
              type="button"
              onClick={() => goDashboardArea('money')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Planilla pagos
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Precios de referencia</h2>
            <p style={{ color: ADMIN_THEME.textMuted, fontSize: 13, margin: '6px 0 0' }}>
              Define precio base por maquinaria, variantes por capacidad y referencia de traslado.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 16px',
              background: ADMIN_PALETTE.brand,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 800,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
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
                Precio base por hora
              </div>
              <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                Piso general por tipo. Si la maquinaria distingue capacidad, ajusta también su bloque específico más abajo.
              </div>
              <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
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
                Precio base por servicio
              </div>
              <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                Precio general por viaje o servicio. Si el equipo cambia mucho por capacidad, usa además el detalle por capacidad.
              </div>
              <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                <span>Maquinaria</span>
                <span>Mín (CLP)</span>
                <span>Máx (CLP)</span>
                <span>Sugerido</span>
              </div>
              {Object.keys(prices.per_service || {}).map(id => <PriceRow key={id} type="per_service" machineId={id} />)}
            </div>

            {capacityMachineIds.length > 0 && (
              <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
                {capacityMachineIds.map((machineId) => {
                  const capacityConfig = getMachineryCapacityOptions(machineId);
                  const capacityKeys = Object.keys((prices.by_capacity || {})[machineId] || {});
                  return (
                    <div
                      key={machineId}
                      style={{ background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}
                    >
                      <div style={{
                        padding: '14px 16px',
                        background: ADMIN_THEME.panelBgSoft,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: ADMIN_PALETTE.brand, textTransform: 'uppercase' }}>
                            Referencia por capacidad
                          </div>
                          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                            {MACHINE_NAMES[machineId] || machineId}
                          </div>
                        </div>
                        <div style={{ color: ADMIN_THEME.textMuted, fontSize: 12 }}>
                          {capacityConfig?.providerLabel || 'Capacidad'}
                        </div>
                      </div>
                      <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                        <span>{capacityConfig?.providerLabel || 'Capacidad'}</span>
                        <span>Mín (CLP)</span>
                        <span>Máx (CLP)</span>
                        <span>Sugerido</span>
                      </div>
                      {capacityKeys.map((capacityKey) => (
                        <CapacityRow key={`${machineId}-${capacityKey}`} machineId={machineId} capacityKey={capacityKey} />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 24, background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}>
              <div style={{
                padding: '14px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 12,
                color: ADMIN_PALETTE.brand,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                Traslado referencial
              </div>
              <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                Rango sugerido para maquinaria que requiere traslado. El proveedor verá este rango como referencia al configurar su equipo.
              </div>
              <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                <span>Concepto</span>
                <span>Mín (CLP)</span>
                <span>Máx (CLP)</span>
                <span>Sugerido</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 100px 120px',
                  gap: 12,
                  padding: '12px 16px',
                  alignItems: 'center'
                }}
              >
                <span style={{ color: '#fff', fontSize: 14 }}>Costo de traslado</span>
                <input
                  type="number"
                  value={transport.min ?? ''}
                  onChange={(e) => updateTransportPrice('min', e.target.value)}
                  placeholder="Mín"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={transport.max ?? ''}
                  onChange={(e) => updateTransportPrice('max', e.target.value)}
                  placeholder="Máx"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={transport.default ?? ''}
                  onChange={(e) => updateTransportPrice('default', e.target.value)}
                  placeholder="Sugerido"
                  style={{
                    ...inputStyle,
                    color: ADMIN_PALETTE.brand,
                    fontWeight: 600,
                  }}
                />
              </div>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
              El proveedor usa estos valores como referencia al publicar su maquinaria. "Sugerido" es el valor precargado; "mín" y "máx" delimitan el rango esperado para esta maquinaria.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminPricingScreen;
