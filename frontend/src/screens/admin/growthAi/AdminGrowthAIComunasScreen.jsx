import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';
import ComunaDrawer from '../../../components/growthAi/ComunaDrawer.jsx';

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

export default function AdminGrowthAIComunasScreen() {
  const { THEME } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [drawerId, setDrawerId] = useState('');
  const [posting, setPosting] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchReason, setBatchReason] = useState('');
  const [batchConfirm, setBatchConfirm] = useState('');
  const [batchSelected, setBatchSelected] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

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

  const forceBootstrap = async () => {
    if (bootstrapping) return;
    setBootstrapping(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/bootstrap`, { method: 'POST' }, 20000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo inicializar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo inicializar Growth AI.'));
    } finally {
      setBootstrapping(false);
    }
  };

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

  const isEmpty = !loading && !error && Array.isArray(items) && items.length === 0;

  const selected = useMemo(() => {
    if (!drawerId) return null;
    return (Array.isArray(items) ? items : []).find((x) => String(x?.id || '') === String(drawerId)) || null;
  }, [items, drawerId]);

  useEffect(() => {
    let mounted = true;
    const nodeId = selected?.id ? String(selected.id) : '';
    if (!nodeId) {
      setDrawerData(null);
      setDrawerLoading(false);
      return () => {
        mounted = false;
      };
    }

    const loadDrawer = async () => {
      setDrawerLoading(true);
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/drawer`, { method: 'GET' }, 15000);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar drawer (${res.status})`);
        if (!mounted) return;
        setDrawerData(payload);
      } catch (e) {
        if (!mounted) return;
        setDrawerData({ error: friendlyFetchError(e, 'No se pudo cargar auditoría/leads.') });
      } finally {
        if (mounted) setDrawerLoading(false);
      }
    };

    void loadDrawer();
    return () => {
      mounted = false;
    };
  }, [selected?.id]);

  const openDrawer = (id) => setDrawerId(String(id || ''));
  const closeDrawer = () => setDrawerId('');

  const setStage = async ({ nodeId, stage, reason }) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/pipeline-stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage, reason }),
        },
        20000
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

  const approveGoLiveBulk = async ({ nodeId, machine_keys, reason }) => {
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
        30000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo aprobar GO LIVE (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo aprobar GO LIVE.'));
    } finally {
      setPosting(false);
    }
  };

  const postGoLiveBulk = async ({ nodeId, machine_keys, reason }) => {
    const res = await fetchWithAuth(
      `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/go-live-machines`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_keys, enable: true, reason }),
      },
      30000
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.detail || `No se pudo aprobar GO LIVE (${res.status})`);
    return payload;
  };

  const batchCandidates = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    return rows
      .filter((r) => String(r?.stage || '').toLowerCase() !== 'pausada')
      .filter((r) => (Number(r?.ready_not_live_total || 0) || 0) > 0)
      .slice(0, 50);
  }, [items]);

  useEffect(() => {
    if (!batchOpen) return;
    const next = {};
    for (const r of batchCandidates) next[String(r.id)] = true;
    setBatchSelected(next);
    setBatchReason('');
    setBatchConfirm('');
    setBatchProgress(null);
  }, [batchOpen, batchCandidates]);

  const KanbanColumn = ({ title, tone, stageKey, rows }) => {
    const list = Array.isArray(rows) ? rows : [];
    return (
      <div style={{ width: 340, minWidth: 340, maxWidth: 340 }}>
        <Card theme={THEME} title={title} right={<Pill theme={THEME} label={`${list.length}`} tone={tone} />}>
          {loading ? (
            <ListSkeleton rows={6} />
          ) : error ? (
            <div style={{ color: '#E57373', fontSize: 12, lineHeight: 1.35 }}>{error}</div>
          ) : list.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Sin elementos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560, overflowY: 'auto' }}>
              {list.map((n) => {
                const notLive = Number(n?.ready_machines?.not_live || 0) || 0;
                const live = Number(n?.live_machines?.total || 0) || 0;
                const signalLabel = n?.comuna_signal?.label || '—';
                const signalTone = n?.comuna_signal?.tone || 'neutral';
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openDrawer(n.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      borderRadius: 14,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.panelBgSoft,
                      padding: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em' }}>{n.name || n.comuna || 'Comuna'}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                        {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Pill theme={THEME} label={`LISTA ${notLive}`} tone={notLive ? 'amber' : 'neutral'} />
                        <Pill theme={THEME} label={`LIVE ${live}`} tone={live ? 'green' : 'neutral'} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <Pill theme={THEME} label={signalLabel} tone={signalTone} />
                      <Pill theme={THEME} label={stageKey.replace('_', ' ')} tone={tone} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="maqgo-admin-title">Comunas</div>
          <div className="maqgo-admin-subtitle">Estado por comuna (oferta y GO LIVE).</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
            onClick={() => setBatchOpen(true)}
            disabled={loading || posting}
          >
            Batch GO LIVE
          </button>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
            onClick={() => load()}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
      </div>

      {isEmpty ? (
        <Card theme={THEME} title="Inicialización" right={<Pill theme={THEME} label="RM" tone="neutral" />}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
            No hay comunas configuradas todavía. Puedes inicializar las 3 comunas de RM (Lampa, Quilicura, Pudahuel).
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="maqgo-btn-primary"
              style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
              disabled={bootstrapping}
              onClick={forceBootstrap}
            >
              {bootstrapping ? 'Inicializando…' : 'Inicializar RM (3 comunas)'}
            </button>
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 2 }}>
        <KanbanColumn title="Captando" tone="neutral" stageKey="captando" rows={byStage.captando} />
        <KanbanColumn title="Por abrir" tone="amber" stageKey="por_abrir" rows={byStage.por_abrir} />
        <KanbanColumn title="Abiertas" tone="green" stageKey="abierta" rows={byStage.abierta} />
        <KanbanColumn title="Pausadas" tone="red" stageKey="pausada" rows={byStage.pausada} />
      </div>

      <ComunaDrawer
        open={Boolean(selected)}
        theme={THEME}
        item={selected}
        busy={posting}
        drawerLoading={drawerLoading}
        drawerData={drawerData}
        onClose={closeDrawer}
        onOpenNode={() => {
          if (!selected?.id) return;
          navigate(`/admin/growth-ai/nodes/${encodeURIComponent(selected.id)}`);
        }}
        onSetStage={({ stage, reason }) => {
          if (!selected?.id) return;
          void setStage({ nodeId: selected.id, stage, reason });
        }}
        onApproveGoLiveBulk={({ machine_keys, reason }) => {
          if (!selected?.id) return;
          void approveGoLiveBulk({ nodeId: selected.id, machine_keys, reason });
        }}
      />

      {batchOpen ? (
        <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
          <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 720px)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 900 }}>Batch GO LIVE (seguro)</div>
                <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.35 }}>
                  Aprueba en bloque las maquinarias LISTA por comuna. Requiere motivo y confirmación.
                </div>
              </div>
              <button
                type="button"
                className="maqgo-btn-secondary"
                style={{ padding: '10px 12px', borderRadius: 12 }}
                onClick={() => {
                  if (batchRunning) return;
                  setBatchOpen(false);
                }}
              >
                Cerrar
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                border: `1px solid ${THEME.border}`,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                padding: 12,
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {batchCandidates.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>No hay comunas con LISTA(s) sin LIVE.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {batchCandidates.map((c) => {
                    const id = String(c.id);
                    const label = c.name || c.comuna || id;
                    const n = Number(c.ready_not_live_total || 0) || 0;
                    return (
                      <label
                        key={id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(batchSelected?.[id])}
                            onChange={(e) => setBatchSelected((p) => ({ ...p, [id]: e.target.checked }))}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1.2 }}>{label}</div>
                            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{(c.region ? `${c.region} · ` : '') + (c.comuna || '')}</div>
                          </div>
                        </div>
                        <Pill theme={THEME} label={`LISTA ${n}`} tone={n ? 'amber' : 'neutral'} />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {batchProgress ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                  Procesando {batchProgress.done}/{batchProgress.total}: {batchProgress.current || '—'}
                </div>
              ) : null}

              <textarea
                value={batchReason}
                onChange={(e) => setBatchReason(e.target.value)}
                placeholder="Motivo (obligatorio)…"
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: `1px solid ${THEME.borderStrong}`,
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: 12,
                  outline: 'none',
                  fontSize: 13,
                  lineHeight: 1.45,
                  resize: 'vertical',
                }}
                disabled={batchRunning}
              />

              <input
                value={batchConfirm}
                onChange={(e) => setBatchConfirm(e.target.value)}
                placeholder="Escribe APROBAR para confirmar"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: `1px solid ${THEME.borderStrong}`,
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: 12,
                  outline: 'none',
                  fontSize: 13,
                }}
                disabled={batchRunning}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }}
                  onClick={() => {
                    if (batchRunning) return;
                    setBatchOpen(false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }}
                  disabled={
                    batchRunning ||
                    !String(batchReason || '').trim() ||
                    String(batchConfirm || '').trim().toUpperCase() !== 'APROBAR' ||
                    batchCandidates.filter((c) => Boolean(batchSelected?.[String(c.id)])).length === 0
                  }
                  onClick={async () => {
                    const selectedRows = batchCandidates.filter((c) => Boolean(batchSelected?.[String(c.id)]));
                    setBatchRunning(true);
                    setError('');
                    try {
                      let done = 0;
                      setBatchProgress({ done: 0, total: selectedRows.length, current: '' });
                      for (const row of selectedRows) {
                        const id = String(row.id);
                        const keys = Array.isArray(row.ready_not_live_all) ? row.ready_not_live_all : [];
                        setBatchProgress({ done, total: selectedRows.length, current: row.name || row.comuna || id });
                        if (keys.length) await postGoLiveBulk({ nodeId: id, machine_keys: keys, reason: batchReason });
                        done += 1;
                        setBatchProgress({ done, total: selectedRows.length, current: row.name || row.comuna || id });
                      }
                      await load();
                      setBatchOpen(false);
                    } catch (e) {
                      setError(friendlyFetchError(e, 'Batch GO LIVE falló.'));
                    } finally {
                      setBatchRunning(false);
                      setBatchProgress(null);
                    }
                  }}
                >
                  Ejecutar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

