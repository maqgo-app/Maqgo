import React, { useEffect, useMemo, useState } from 'react';

function toneToBadge(tone, themeBorder) {
  if (tone === 'green') return { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' };
  if (tone === 'amber') return { fg: '#FFE3B8', bg: 'rgba(217,161,90,0.14)', br: 'rgba(217,161,90,0.28)' };
  if (tone === 'red') return { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' };
  return { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: themeBorder || 'rgba(255,255,255,0.14)' };
}

function Pill({ theme, label, tone }) {
  const cfg = toneToBadge(tone, theme?.border);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '5px 10px',
        borderRadius: 999,
        border: `1px solid ${cfg.br}`,
        background: cfg.bg,
        color: cfg.fg,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function ComunaDrawer({ open, theme, item, busy, onClose, onOpenNode, onSetStage, onApproveGoLiveBulk }) {
  const [stageTarget, setStageTarget] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [selected, setSelected] = useState({});

  const machineKeys = useMemo(() => {
    if (!item) return [];
    const all = Array.isArray(item?.ready_not_live_all) ? item.ready_not_live_all : [];
    return all.slice(0, 40);
  }, [item]);

  useEffect(() => {
    if (!open) return;
    setStageTarget('');
    setStageReason('');
    setBulkReason('');
    const next = {};
    for (const k of machineKeys) next[k] = true;
    setSelected(next);
  }, [open, machineKeys]);

  const selectedKeys = useMemo(() => {
    return machineKeys.filter((k) => Boolean(selected?.[k]));
  }, [machineKeys, selected]);

  if (!open) return null;

  const comunaName = item?.name || item?.comuna || 'Comuna';
  const stage = String(item?.stage || '').trim().toLowerCase() || 'captando';
  const signal = item?.comuna_signal || {};
  const readyNotLive = Number(item?.ready_machines?.not_live || 0) || 0;
  const live = Number(item?.live_machines?.total || 0) || 0;
  const minSupply = Number(item?.min_supply_per_machine || 0) || 0;

  return (
    <div
      className="maqgo-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}
    >
      <div
        style={{
          width: 'min(92vw, 520px)',
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.panelBg,
          padding: 16,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>{comunaName}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
              {(item?.region ? `${item.region} · ` : '') + (item?.comuna || '')}
            </div>
          </div>
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 12 }} onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill theme={theme} label={signal?.label || '—'} tone={signal?.tone || 'neutral'} />
          <Pill theme={theme} label={`Etapa: ${stage.replace('_', ' ')}`} tone={stage === 'abierta' ? 'green' : stage === 'por_abrir' ? 'amber' : stage === 'pausada' ? 'red' : 'neutral'} />
          <Pill theme={theme} label={`LISTA ${readyNotLive}`} tone={readyNotLive ? 'amber' : 'neutral'} />
          <Pill theme={theme} label={`LIVE ${live}`} tone={live ? 'green' : 'neutral'} />
          {minSupply ? <Pill theme={theme} label={`Mínimo ${minSupply}`} tone="neutral" /> : null}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
            disabled={busy || selectedKeys.length === 0}
            onClick={() => {
              if (!String(bulkReason || '').trim()) return;
              onApproveGoLiveBulk({ machine_keys: selectedKeys, reason: bulkReason });
            }}
          >
            Aprobar LISTAS ({selectedKeys.length})
          </button>
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }} onClick={onOpenNode}>
            Ver nodo
          </button>
        </div>

        <div style={{ marginTop: 14, borderTop: `1px solid ${theme.border}`, paddingTop: 14, display: 'grid', gap: 12 }}>
          <details style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, background: theme.panelBgSoft }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>GO LIVE</summary>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>
                Selecciona maquinarias LISTA para pasar a LIVE.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                  onClick={() => {
                    const next = {};
                    for (const k of machineKeys) next[k] = true;
                    setSelected(next);
                  }}
                >
                  Todo
                </button>
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                  onClick={() => setSelected({})}
                >
                  Limpiar
                </button>
                <Pill theme={theme} label={`Seleccionadas ${selectedKeys.length}/${machineKeys.length}`} tone="neutral" />
              </div>

              <div
                style={{
                  border: `1px solid ${theme.border}`,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 12,
                  padding: 10,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {machineKeys.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>No hay maquinarias LISTA.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {machineKeys.map((k) => (
                      <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected?.[k])}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [k]: e.target.checked }))}
                        />
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{k}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Motivo:</div>
              <textarea
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Motivo (obligatorio)…"
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: `1px solid ${theme.borderStrong}`,
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: 12,
                  outline: 'none',
                  fontSize: 13,
                  lineHeight: 1.45,
                  resize: 'vertical',
                }}
              />
            </div>
          </details>

          <details style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, background: theme.panelBgSoft }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>Etapa</summary>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { k: 'captando', label: 'Captando', tone: 'neutral' },
                  { k: 'por_abrir', label: 'Por abrir', tone: 'amber' },
                  { k: 'abierta', label: 'Abierta', tone: 'green' },
                  { k: 'pausada', label: 'Pausada', tone: 'red' },
                ].map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }}
                    onClick={() => setStageTarget(opt.k)}
                    disabled={busy}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {stageTarget ? (
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: 900 }}>
                    Cambiar a: {stageTarget.replace('_', ' ')}
                  </div>
                  <textarea
                    value={stageReason}
                    onChange={(e) => setStageReason(e.target.value)}
                    placeholder="Motivo (obligatorio)…"
                    rows={3}
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: `1px solid ${theme.borderStrong}`,
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      padding: 12,
                      outline: 'none',
                      fontSize: 13,
                      lineHeight: 1.45,
                      resize: 'vertical',
                      marginTop: 8,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      className="maqgo-btn-secondary"
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
                      onClick={() => {
                        setStageTarget('');
                        setStageReason('');
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="maqgo-btn-primary"
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                      disabled={busy || !String(stageReason || '').trim()}
                      onClick={() => onSetStage({ stage: stageTarget, reason: stageReason })}
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

