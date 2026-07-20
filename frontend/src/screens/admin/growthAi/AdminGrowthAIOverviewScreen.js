import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

function Card({ theme, title, children, right }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.panelBg,
        borderRadius: 16,
        padding: 16,
      }}
    >
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

export default function AdminGrowthAIOverviewScreen() {
  const { THEME } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/overview`, { method: 'GET' }, 15000);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar Overview (${res.status})`);
        if (!mounted) return;
        setData(payload);
      } catch (e) {
        if (!mounted) return;
        setError(friendlyFetchError(e, 'No se pudo cargar Growth AI.'));
        setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const topNodes = useMemo(() => {
    const items = Array.isArray(data?.top_nodes) ? data.top_nodes : [];
    return items.slice(0, 6);
  }, [data]);

  const risks = useMemo(() => {
    const items = Array.isArray(data?.p0_risks) ? data.p0_risks : [];
    return items.slice(0, 6);
  }, [data]);

  const workingNow = useMemo(() => {
    const items = Array.isArray(data?.working_now) ? data.working_now : [];
    return items.slice(0, 6);
  }, [data]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Card
          theme={THEME}
          title="Nodos prioritarios"
          right={
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
              onClick={() => navigate('/admin/growth-ai/map')}
            >
              Ver mapa
            </button>
          }
        >
          {loading ? (
            <ListSkeleton rows={5} />
          ) : error ? (
            <div style={{ color: '#E57373', fontSize: 13, lineHeight: 1.4 }}>{error}</div>
          ) : topNodes.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45 }}>
              No hay nodos configurados todavía.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {topNodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
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
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em' }}>
                      {n.name || n.comuna || 'Nodo'}
                    </div>
                    {n.region || n.comuna ? (
                      <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                        {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                      {n.primary_gap || 'Sin brecha principal'}
                    </div>
                  </div>
                  <Pill theme={THEME} label={n.traffic_light || '—'} tone={n.traffic_tone || 'neutral'} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card theme={THEME} title="Acción #1">
          {loading ? (
            <div style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
          ) : data?.top_action ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{data.top_action.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>
                {data.top_action.reason}
              </div>
              {data.top_action.node_id ? (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="maqgo-btn-primary"
                    style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 900 }}
                    onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(data.top_action.node_id)}`)}
                  >
                    Ir al nodo
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
              Sin acción prioritaria por ahora.
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Card theme={THEME} title="Readiness marketplace">
          {loading ? (
            <ListSkeleton rows={3} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.75)' }}>Estado</div>
                <Pill theme={THEME} label={data?.marketplace?.status || '—'} tone={data?.marketplace?.tone || 'neutral'} />
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>
                {data?.marketplace?.summary || '—'}
              </div>
            </div>
          )}
        </Card>

        <Card
          theme={THEME}
          title="Riesgos P0"
          right={
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
              onClick={() => navigate('/admin/growth-ai/audit')}
            >
              Ver auditoría
            </button>
          }
        >
          {loading ? (
            <ListSkeleton rows={4} />
          ) : risks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin riesgos P0 activos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {risks.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: `1px solid rgba(229,115,115,0.25)`,
                    background: 'rgba(229,115,115,0.10)',
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{r.title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
                    {r.detail}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card theme={THEME} title="Trabajando ahora">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : workingNow.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
              No hay ejecuciones recientes registradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workingNow.map((w) => (
                <div
                  key={w.id}
                  style={{
                    border: `1px solid ${THEME.border}`,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{w.title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{w.meta}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
