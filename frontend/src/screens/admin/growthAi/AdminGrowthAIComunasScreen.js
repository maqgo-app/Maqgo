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

export default function AdminGrowthAIComunasScreen() {
  const { THEME } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [bootstrapping, setBootstrapping] = useState(false);

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
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Sin elementos.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((n) => {
              const notLive = Number(n?.ready_machines?.not_live || 0) || 0;
              const live = Number(n?.live_machines?.total || 0) || 0;
              const signalLabel = n?.comuna_signal?.label || '—';
              const signalTone = n?.comuna_signal?.tone || 'neutral';
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
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Pill theme={THEME} label={`LISTA ${notLive}`} tone={notLive > 0 ? 'amber' : 'neutral'} />
                      <Pill theme={THEME} label={`LIVE ${live}`} tone={live > 0 ? 'green' : 'neutral'} />
                    </div>
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Pill theme={THEME} label={signalLabel} tone={signalTone} />
                      <Pill theme={THEME} label={stageKey.replace('_', ' ')} tone={tone} />
                    </div>
                    <button
                      type="button"
                      className="maqgo-btn-secondary"
                      style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                      onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
                    >
                      Gestionar
                    </button>
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
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>Estado por comuna (oferta y GO LIVE).</div>
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StageColumn title="Captando" tone="neutral" stageKey="captando" rows={byStage.captando} />
        <StageColumn title="Por abrir" tone="amber" stageKey="por_abrir" rows={byStage.por_abrir} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StageColumn title="Abiertas" tone="green" stageKey="abierta" rows={byStage.abierta} />
        <StageColumn title="Pausadas" tone="red" stageKey="pausada" rows={byStage.pausada} />
      </div>

    </div>
  );
}
