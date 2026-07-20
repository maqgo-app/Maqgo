import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

function Card({ theme, title, right, children }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, background: theme.panelBg, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>{title}</div>
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Pill({ theme, label, tone }) {
  const cfg =
    tone === 'green'
      ? { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' }
      : tone === 'red'
        ? { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' }
        : tone === 'amber'
          ? { fg: '#FFE3B8', bg: 'rgba(217,161,90,0.14)', br: 'rgba(217,161,90,0.28)' }
          : { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: theme.border };
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

function ReasonModal({ open, theme, title, confirmLabel, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  if (!open) return null;
  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 560px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45, marginBottom: 12 }}>
          Registra el motivo. Esto queda en auditoría.
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)…"
          rows={4}
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
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }}
            onClick={() => onConfirm(reason)}
            disabled={!String(reason || '').trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkGoLiveModal({ open, theme, title, machineKeys, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!open) {
      setReason('');
      setSelected({});
      return;
    }
    const next = {};
    for (const k of machineKeys || []) next[k] = true;
    setSelected(next);
  }, [open, machineKeys]);

  if (!open) return null;

  const keys = Array.isArray(machineKeys) ? machineKeys : [];
  const selectedKeys = keys.filter((k) => Boolean(selected[k]));

  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 660px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45, marginBottom: 12 }}>
          Selecciona qué maquinarias pasan a <span style={{ color: '#CFF3D1', fontWeight: 900 }}>LIVE</span>. Esto habilita captación de demanda.
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
            onClick={() => {
              const next = {};
              for (const k of keys) next[k] = true;
              setSelected(next);
            }}
          >
            Seleccionar todo
          </button>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
            onClick={() => setSelected({})}
          >
            Limpiar
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
            Seleccionadas: {selectedKeys.length}/{keys.length}
          </div>
        </div>

        <div style={{
          border: `1px solid ${theme.border}`,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 10,
          maxHeight: 320,
          overflowY: 'auto'
        }}>
          {keys.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>No hay maquinarias listas.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {keys.map((k) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[k])}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [k]: e.target.checked }))}
                  />
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{k}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45 }}>
          Motivo (obligatorio):
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }}
            onClick={() => onConfirm({ reason, machine_keys: selectedKeys })}
            disabled={!String(reason || '').trim() || selectedKeys.length === 0}
          >
            Aprobar {selectedKeys.length}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGrowthAIComunasScreen() {
  const { THEME } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [posting, setPosting] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/comunas`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar comunas (${res.status})`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudieron cargar las comunas.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    const out = { captando: [], por_abrir: [], abierta: [], pausada: [] };
    for (const r of rows) {
      const st = String(r?.stage || '').trim().toLowerCase();
      if (st === 'por_abrir') out.por_abrir.push(r);
      else if (st === 'abierta') out.abierta.push(r);
      else if (st === 'pausada') out.pausada.push(r);
      else out.captando.push(r);
    }
    return out;
  }, [items]);

  const postStage = async ({ nodeId, stage, reason }) => {
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/pipeline-stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage, reason }),
        },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo actualizar etapa (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo actualizar la etapa.'));
    } finally {
      setPosting(false);
    }
  };

  const approveBulk = async ({ nodeId, machine_keys, reason }) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/go-live-machines`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine_keys, enable: true, reason }),
        },
        20000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo aprobar GO LIVE (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo aprobar GO LIVE en bulk.'));
    } finally {
      setPosting(false);
    }
  };

  const StageColumn = ({ title, tone, stageKey, rows }) => {
    return (
      <Card
        theme={THEME}
        title={title}
        right={<Pill theme={THEME} label={`${rows.length}`} tone={tone} />}
      >
        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <div style={{ color: '#E57373', fontSize: 13, lineHeight: 1.4 }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin elementos.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((n) => {
              const ready = Number(n?.ready_machines?.total || 0) || 0;
              const notLive = Number(n?.ready_machines?.not_live || 0) || 0;
              const live = Number(n?.live_machines?.total || 0) || 0;
              const signalLabel = n?.comuna_signal?.label || '—';
              const signalTone = n?.comuna_signal?.tone || 'neutral';
              const readyAll = Array.isArray(n?.ready_not_live_all)
                ? n.ready_not_live_all
                : Array.isArray(n?.ready_not_live)
                  ? n.ready_not_live
                  : [];
              const canBulkApprove = String(n?.stage || '').toLowerCase() !== 'pausada' && readyAll.length > 0;
              return (
                <div
                  key={n.id}
                  style={{
                    border: `1px solid ${THEME.border}`,
                    background: THEME.panelBgSoft,
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em' }}>{n.name || n.comuna || 'Nodo'}</div>
                    <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                      {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Pill theme={THEME} label={`LISTA ${notLive}`} tone={notLive > 0 ? 'amber' : 'neutral'} />
                      <Pill theme={THEME} label={`LIVE ${live}`} tone={live > 0 ? 'green' : 'neutral'} />
                    </div>
                    {Array.isArray(n.ready_not_live) && n.ready_not_live.length ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.35 }}>
                        Próximas para GO LIVE: {n.ready_not_live.join(', ')}
                      </div>
                    ) : null}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Pill theme={THEME} label={signalLabel} tone={signalTone} />
                      <Pill theme={THEME} label={stageKey.replace('_', ' ')} tone={tone} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {canBulkApprove ? (
                        <button
                          type="button"
                          className="maqgo-btn-primary"
                          style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }}
                          disabled={posting}
                          onClick={() =>
                            setBulkModal({
                              nodeId: n.id,
                              title: `Aprobar GO LIVE (bulk): ${n.comuna || n.name}`,
                              machineKeys: readyAll,
                            })
                          }
                        >
                          Aprobar LISTAS
                        </button>
                      ) : null}
                      {stageKey !== 'por_abrir' ? (
                        <button
                          type="button"
                          className="maqgo-btn-secondary"
                          style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                          disabled={posting}
                          onClick={() => setReasonModal({ nodeId: n.id, stage: 'por_abrir', title: `Mover a Por abrir: ${n.comuna || n.name}`, label: 'Mover' })}
                        >
                          Por abrir
                        </button>
                      ) : null}
                      {stageKey !== 'captando' ? (
                        <button
                          type="button"
                          className="maqgo-btn-secondary"
                          style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                          disabled={posting}
                          onClick={() => setReasonModal({ nodeId: n.id, stage: 'captando', title: `Mover a Captando: ${n.comuna || n.name}`, label: 'Mover' })}
                        >
                          Captando
                        </button>
                      ) : null}
                      {stageKey !== 'abierta' ? (
                        <button
                          type="button"
                          className="maqgo-btn-primary"
                          style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }}
                          disabled={posting}
                          onClick={() => setReasonModal({ nodeId: n.id, stage: 'abierta', title: `Marcar Abierta: ${n.comuna || n.name}`, label: 'Marcar' })}
                        >
                          Abierta
                        </button>
                      ) : null}
                      {stageKey !== 'pausada' ? (
                        <button
                          type="button"
                          className="maqgo-btn-secondary"
                          style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                          disabled={posting}
                          onClick={() => setReasonModal({ nodeId: n.id, stage: 'pausada', title: `Pausar: ${n.comuna || n.name}`, label: 'Pausar' })}
                        >
                          Pausar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Comunas</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>
            Pipeline operativo: captación de oferta → por abrir → abierta. GO LIVE por maquinaria se gestiona dentro del nodo.
          </div>
        </div>
        <button
          type="button"
          className="maqgo-btn-secondary"
          style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
          onClick={() => load()}
          disabled={posting}
        >
          Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StageColumn title="Captando" tone="neutral" stageKey="captando" rows={byStage.captando} />
        <StageColumn title="Por abrir" tone="amber" stageKey="por_abrir" rows={byStage.por_abrir} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StageColumn title="Abiertas" tone="green" stageKey="abierta" rows={byStage.abierta} />
        <StageColumn title="Pausadas" tone="red" stageKey="pausada" rows={byStage.pausada} />
      </div>

      <ReasonModal
        open={Boolean(reasonModal)}
        theme={THEME}
        title={reasonModal?.title || ''}
        confirmLabel={reasonModal?.label || ''}
        onCancel={() => setReasonModal(null)}
        onConfirm={(reason) => {
          const r = reasonModal;
          setReasonModal(null);
          if (!r?.nodeId || !r?.stage) return;
          void postStage({ nodeId: r.nodeId, stage: r.stage, reason });
        }}
      />

      <BulkGoLiveModal
        open={Boolean(bulkModal)}
        theme={THEME}
        title={bulkModal?.title || ''}
        machineKeys={bulkModal?.machineKeys || []}
        onCancel={() => setBulkModal(null)}
        onConfirm={({ reason, machine_keys }) => {
          const b = bulkModal;
          setBulkModal(null);
          if (!b?.nodeId) return;
          void approveBulk({ nodeId: b.nodeId, machine_keys, reason });
        }}
      />
    </div>
  );
}
