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
import MaqgoLogo from '../../components/MaqgoLogo';

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
  const [mode, setMode] = useState('machine');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [search, setSearch] = useState('');

  const formatCapacityRangeLabel = (machineId, configuredCapacityKeys) => {
    const cfg = getMachineryCapacityOptions(machineId);
    if (!cfg) return null;
    const keys = Array.isArray(configuredCapacityKeys) && configuredCapacityKeys.length
      ? configuredCapacityKeys
      : cfg.options || [];
    if (!keys.length) return null;
    const numeric = keys
      .map((k) => {
        const n = Number(k);
        return Number.isFinite(n) ? n : null;
      })
      .filter((n) => n !== null);
    numeric.sort((a, b) => a - b);
    if (numeric.length === 0) return null;
    const unit = cfg.unitDisplay || '';
    if (numeric.length === 1) return `${numeric[0]} ${unit}`.trim();
    const min = numeric[0];
    const max = numeric[numeric.length - 1];
    return `${min}-${max} ${unit}`.trim();
  };

  const goDashboardArea = (area) => {
    const routeByArea = {
      today: '/admin/reservas',
      system: '/admin/matching',
      platform: '/admin/clientes',
      money: '/admin/pagos',
    };
    navigate(routeByArea[area] || '/admin');
  };

  async function fetchPrices() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reference-prices`);
      const data = await res.json();
      const transport = data?.transport && typeof data.transport === 'object' ? data.transport : {};
      const normTransport = {
        ...transport,
        same_comuna: typeof transport.same_comuna === 'object' && transport.same_comuna ? transport.same_comuna : {
          min: transport.min ?? '',
          max: transport.max ?? '',
          default: transport.default ?? ''
        },
        intercomuna: typeof transport.intercomuna === 'object' && transport.intercomuna ? transport.intercomuna : {
          min: transport.min ?? '',
          max: transport.max ?? '',
          default: transport.default ?? ''
        },
        interregional: typeof transport.interregional === 'object' && transport.interregional ? transport.interregional : {
          min: transport.min ?? '',
          max: transport.max ?? '',
          default: transport.default ?? ''
        }
      };
      setPrices({
        per_hour: data?.per_hour || {},
        per_service: data?.per_service || {},
        by_capacity: data?.by_capacity || {},
        transport: normTransport,
      });
    } catch (e) {
      console.error(e);
      setPrices({ per_hour: {}, per_service: {}, by_capacity: {}, transport: {} });
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

  const updateTransportPrice = (segment, field, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) && value !== '') return;
    setPrices(prev => ({
      ...prev,
      transport: {
        ...(prev.transport || {}),
        ...(segment
          ? {
            [segment]: {
              ...((prev.transport || {})[segment] || {}),
              [field]: value === '' ? '' : num,
            },
          }
          : {
            [field]: value === '' ? '' : num,
          }),
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
      const cleanRange = (vals) => {
        if (!vals || typeof vals !== 'object') return null;
        const out = {};
        ['min', 'max', 'default'].forEach((k) => {
          const v = vals[k];
          if (v != null && v !== '') out[k] = Number(v);
        });
        return Object.keys(out).length ? out : null;
      };
      const legacy = cleanRange(prices.transport);
      if (legacy) Object.assign(transport, legacy);
      const same = cleanRange(prices.transport?.same_comuna);
      const inter = cleanRange(prices.transport?.intercomuna);
      const interreg = cleanRange(prices.transport?.interregional);
      if (same) transport.same_comuna = same;
      if (inter) transport.intercomuna = inter;
      if (interreg) transport.interregional = interreg;

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
  const genericHourMachineIds = Object.keys(prices.per_hour || {}).filter((machineId) => !getMachineryCapacityOptions(machineId));
  const transport = prices.transport || {};

  const machineIds = React.useMemo(() => {
    const s = new Set([
      ...Object.keys(prices.per_hour || {}),
      ...Object.keys(prices.per_service || {}),
      ...Object.keys(prices.by_capacity || {}),
    ]);
    const arr = Array.from(s);
    arr.sort((a, b) => String(MACHINE_NAMES[a] || a).localeCompare(String(MACHINE_NAMES[b] || b), 'es'));
    return arr;
  }, [prices]);

  useEffect(() => {
    if (!machineIds.length) return;
    if (selectedMachineId && machineIds.includes(selectedMachineId)) return;
    setSelectedMachineId(machineIds[0]);
  }, [machineIds, selectedMachineId]);

  const filteredMachineIds = React.useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return machineIds;
    return machineIds.filter((id) => {
      const label = String(MACHINE_NAMES[id] || id).toLowerCase();
      return label.includes(q) || String(id).toLowerCase().includes(q);
    });
  }, [machineIds, search]);

  const TransportRangeEditor = ({ title, segmentKey, tone }) => {
    const p = (transport && typeof transport === 'object' ? transport[segmentKey] : null) || {};
    return (
      <div style={{
        border: `1px solid ${ADMIN_THEME.border}`,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 100px 100px 120px',
        gap: 12,
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>{title}</div>
          <div style={{ color: ADMIN_THEME.textMuted, fontSize: 12, lineHeight: 1.35 }}>
            {tone === 'intra' ? 'Dentro de la misma comuna.' : tone === 'inter' ? 'Entre comunas (misma región).' : 'Entre regiones.'}
          </div>
        </div>
        <input
          type="number"
          value={p.min ?? ''}
          onChange={(e) => updateTransportPrice(segmentKey, 'min', e.target.value)}
          placeholder="Mín"
          style={inputStyle}
        />
        <input
          type="number"
          value={p.max ?? ''}
          onChange={(e) => updateTransportPrice(segmentKey, 'max', e.target.value)}
          placeholder="Máx"
          style={inputStyle}
        />
        <input
          type="number"
          value={p.default ?? ''}
          onChange={(e) => updateTransportPrice(segmentKey, 'default', e.target.value)}
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

  return (
    <div className="maqgo-admin-page" style={{ minHeight: '100dvh', background: ADMIN_THEME.appBg, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="maqgo-admin-title">Precios</div>
            <div className="maqgo-admin-subtitle">Base por maquinaria, variantes y referencia de traslado.</div>
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
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 14,
              border: `1px solid ${ADMIN_THEME.border}`,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 12,
              padding: 12,
            }}>
              <div style={{ display: 'flex', gap: 8, padding: 4, borderRadius: 999, border: `1px solid ${ADMIN_THEME.border}`, background: 'rgba(255,255,255,0.03)' }}>
                <button
                  type="button"
                  onClick={() => setMode('machine')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: 'none',
                    background: mode === 'machine' ? 'rgba(236, 104, 25, 0.22)' : 'transparent',
                    color: mode === 'machine' ? '#fff' : 'rgba(255,255,255,0.75)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Vista por maquinaria
                </button>
                <button
                  type="button"
                  onClick={() => setMode('bulk')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: 'none',
                    background: mode === 'bulk' ? 'rgba(236, 104, 25, 0.22)' : 'transparent',
                    color: mode === 'bulk' ? '#fff' : 'rgba(255,255,255,0.75)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Vista masiva
                </button>
              </div>

              {mode === 'machine' ? (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar maquinaria…"
                  style={{
                    ...inputStyle,
                    width: 'min(420px, 100%)',
                    borderRadius: 12,
                    padding: '10px 12px',
                  }}
                />
              ) : null}
            </div>

            {mode === 'machine' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, alignItems: 'start' }}>
                <div style={{
                  position: 'sticky',
                  top: 12,
                  alignSelf: 'start',
                  background: ADMIN_THEME.panelBg,
                  border: `1px solid ${ADMIN_THEME.border}`,
                  borderRadius: 12,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '12px 14px', background: ADMIN_THEME.panelBgSoft, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                    <div style={{ fontSize: 12, color: ADMIN_PALETTE.brand, fontWeight: 800, textTransform: 'uppercase' }}>Maquinarias</div>
                  </div>
                  <div style={{ maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' }}>
                    {filteredMachineIds.map((id) => {
                      const active = id === selectedMachineId;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedMachineId(id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            border: 'none',
                            borderBottom: `1px solid ${ADMIN_THEME.border}`,
                            background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 900, opacity: active ? 1 : 0.9 }}>
                            {MACHINE_NAMES[id] || id}
                          </span>
                          {(function () {
                            const configuredCapacityKeys = Object.keys((prices.by_capacity || {})[id] || {});
                            const rangeLabel = formatCapacityRangeLabel(id, configuredCapacityKeys);
                            if (rangeLabel) {
                              return (
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 800 }}>
                                  {rangeLabel}
                                </span>
                              );
                            }
                            if (getMachineryCapacityOptions(id)) {
                              return (
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
                                  Sin especif.
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{
                    background: ADMIN_THEME.panelBg,
                    borderRadius: 12,
                    border: `1px solid ${ADMIN_THEME.border}`,
                    overflow: 'hidden'
                  }}>
                    <div style={{ padding: '14px 16px', background: ADMIN_THEME.panelBgSoft }}>
                      <div style={{ fontSize: 12, color: ADMIN_PALETTE.brand, fontWeight: 800, textTransform: 'uppercase' }}>Editando</div>
                      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900, color: '#fff' }}>
                        {MACHINE_NAMES[selectedMachineId] || selectedMachineId || '—'}
                      </div>
                    </div>

                    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
                      {selectedMachineId && getMachineryCapacityOptions(selectedMachineId) && (prices.by_capacity || {})[selectedMachineId] ? (
                        <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 900, textTransform: 'uppercase' }}>
                            Precio hora por especificacion
                          </div>
                          <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                            <span>{getMachineryCapacityOptions(selectedMachineId)?.providerLabel || 'Capacidad'}</span>
                            <span>Min</span>
                            <span>Max</span>
                            <span>Sugerido</span>
                          </div>
                          {Object.keys((prices.by_capacity || {})[selectedMachineId] || {}).map((capacityKey) => (
                            <CapacityRow key={`${selectedMachineId}-${capacityKey}`} machineId={selectedMachineId} capacityKey={capacityKey} />
                          ))}
                        </div>
                      ) : null}

                      {selectedMachineId && (!getMachineryCapacityOptions(selectedMachineId) || !(prices.by_capacity || {})[selectedMachineId]) ? (
                        <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 900, textTransform: 'uppercase' }}>
                            Precio hora generico
                          </div>
                          <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                            <span>Maquinaria</span>
                            <span>Min</span>
                            <span>Max</span>
                            <span>Sugerido</span>
                          </div>
                          {(prices.per_hour || {})[selectedMachineId] ? (
                            <PriceRow type="per_hour" machineId={selectedMachineId} />
                          ) : (
                            <div style={{ padding: '12px 16px', color: ADMIN_THEME.textMuted, fontSize: 13 }}>
                              No aplica / no configurado.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {Object.keys(prices.per_service || {}).length > 0 ? (
                        <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 900, textTransform: 'uppercase' }}>
                            Precio servicio por tramo (TIPO B)
                          </div>
                          <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                            <span>Tramo</span>
                            <span>Min</span>
                            <span>Max</span>
                            <span>Sugerido</span>
                          </div>
                          {(prices.per_service || {})[selectedMachineId] ? (
                            <PriceRow type="per_service" machineId={selectedMachineId} />
                          ) : (
                            <div style={{ padding: '12px 16px', color: ADMIN_THEME.textMuted, fontSize: 13 }}>
                              Esta maquinaria no usa precio por servicio.
                            </div>
                          )}
                        </div>
                      ) : null}

                      <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 900, textTransform: 'uppercase' }}>
                          Traslado por tramo
                        </div>
                        <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                          <span>Tramo</span>
                          <span>Min</span>
                          <span>Max</span>
                          <span>Sugerido</span>
                        </div>
                        <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                          <TransportRangeEditor title="Dentro de la comuna" segmentKey="same_comuna" tone="intra" />
                          <TransportRangeEditor title="Entre comunas (misma region)" segmentKey="intercomuna" tone="inter" />
                          <TransportRangeEditor title="Interregional / hasta 150 km" segmentKey="interregional" tone="interreg" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
            {genericHourMachineIds.length > 0 && (
              <div style={{ background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: `1px solid ${ADMIN_THEME.border}` }}>
                <div style={{
                  padding: '14px 16px',
                  background: ADMIN_THEME.panelBgSoft,
                  fontSize: 12,
                  color: ADMIN_PALETTE.brand,
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  Precio hora generico
                </div>
                <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                  Maquinaria sin distincion por capacidad (1 tarifa por hora).
                </div>
                <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                  <span>Maquinaria</span>
                  <span>Min (CLP)</span>
                  <span>Max (CLP)</span>
                  <span>Sugerido</span>
                </div>
                {genericHourMachineIds.map((id) => <PriceRow key={id} type="per_hour" machineId={id} />)}
              </div>
            )}

            {capacityMachineIds.length > 0 && (
              <div style={{ marginTop: genericHourMachineIds.length ? 24 : 0, display: 'grid', gap: 16 }}>
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
                            Precio hora por especificacion
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
                        <span>Min (CLP)</span>
                        <span>Max (CLP)</span>
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

            {Object.keys(prices.per_service || {}).length > 0 ? (
              <div style={{ marginTop: 24, background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}>
                <div style={{
                  padding: '14px 16px',
                  background: ADMIN_THEME.panelBgSoft,
                  fontSize: 12,
                  color: ADMIN_PALETTE.brand,
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  Precio servicio por tramo (TIPO B)
                </div>
                <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                  Maquinaria o vehiculo que cobra por servicio fijo en 3 tramos (no por hora). El traslado va incluido.
                </div>
                <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                  <span>Maquinaria</span>
                  <span>Min (CLP)</span>
                  <span>Max (CLP)</span>
                  <span>Sugerido</span>
                </div>
                {Object.keys(prices.per_service || {}).map((id) => <PriceRow key={id} type="per_service" machineId={id} />)}
              </div>
            ) : null}

            <div style={{ marginTop: 24, background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}>
              <div style={{
                padding: '14px 16px',
                background: ADMIN_THEME.panelBgSoft,
                fontSize: 12,
                color: ADMIN_PALETTE.brand,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                Traslado general
              </div>
              <div style={{ padding: '10px 16px', color: ADMIN_THEME.textMuted, fontSize: 12, borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
                Rango general de traslado. El detalle por 3 tramos (misma comuna / entre comunas / interregional / hasta 150 km) se edita en Vista por maquinaria.
              </div>
              <div style={{ ...headerGridStyle, gridTemplateColumns: '1fr 100px 100px 120px' }}>
                <span>Concepto</span>
                <span>Min (CLP)</span>
                <span>Max (CLP)</span>
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
                  onChange={(e) => updateTransportPrice(null, 'min', e.target.value)}
                  placeholder="Mín"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={transport.max ?? ''}
                  onChange={(e) => updateTransportPrice(null, 'max', e.target.value)}
                  placeholder="Máx"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={transport.default ?? ''}
                  onChange={(e) => updateTransportPrice(null, 'default', e.target.value)}
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
          </>
        )}
      </div>
    </div>
  );
}

export default AdminPricingScreen;
