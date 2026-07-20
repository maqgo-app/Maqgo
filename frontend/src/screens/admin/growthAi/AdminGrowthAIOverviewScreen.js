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
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
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
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const forceBootstrap = async () => {
    if (bootstrapping) return;
    setBootstrapping(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/bootstrap`, { method: 'POST' }, 20000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo inicializar (${res.status})`);
      const res2 = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/overview`, { method: 'GET' }, 15000);
      const payload2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(payload2?.detail || `No se pudo cargar Overview (${res2.status})`);
      setData(payload2);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo inicializar Growth AI.'));
    } finally {
      setBootstrapping(false);
    }
  };

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

  const goLive = useMemo(() => data?.weekly?.go_live || null, [data]);
  const pipeline = useMemo(() => data?.pipeline || null, [data]);

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
              <div style={{ marginTop: 10 }}>
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
        <Card
          theme={THEME}
          title="Reporte semanal"
          right={
            goLive ? <Pill theme={THEME} label={`GO LIVE: ${goLive.status || '—'}`} tone={goLive.tone || 'neutral'} /> : null
          }
        >
          {loading ? (
            <ListSkeleton rows={2} />
          ) : goLive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
                {goLive.reason || '—'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Pill theme={THEME} label={`LIVE: ${goLive.live_machines ?? 0}`} tone={goLive.live_machines > 0 ? 'green' : 'neutral'} />
                <Pill theme={THEME} label={`LISTA: ${goLive.ready_not_live ?? 0}`} tone={goLive.ready_not_live > 0 ? 'amber' : 'neutral'} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
                  Último cambio: {goLive.last_change ? String(goLive.last_change) : '—'}
                </div>
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
                  onClick={() => navigate('/admin/growth-ai/comunas')}
                >
                  Ver comunas
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
              Sin datos de reporte semanal todavía.
            </div>
          )}
        </Card>

        <Card
          theme={THEME}
          title="Comunas"
          right={
            pipeline ? (
              <Pill
                theme={THEME}
                label={`Captando ${Array.isArray(pipeline.captando) ? pipeline.captando.length : 0} · Por abrir ${Array.isArray(pipeline.por_abrir) ? pipeline.por_abrir.length : 0}`}
                tone="neutral"
              />
            ) : null
          }
        >
          {loading ? (
            <ListSkeleton rows={4} />
          ) : pipeline ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)', marginBottom: 6 }}>
                  Captando (siguientes)
                </div>
                {Array.isArray(pipeline.next_captando) && pipeline.next_captando.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pipeline.next_captando.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 12,
                          border: `1px solid ${THEME.border}`,
                          background: 'rgba(255,255,255,0.04)',
                          padding: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900 }}>{n.name || n.comuna || 'Comuna'}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                            {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                          </div>
                        </div>
                        <Pill
                          theme={THEME}
                          label={n?.comuna_signal?.label || 'Captando'}
                          tone={n?.comuna_signal?.tone || 'neutral'}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>No hay comunas en captación.</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)', marginBottom: 6 }}>
                  Por abrir (listas)
                </div>
                {Array.isArray(pipeline.next_por_abrir) && pipeline.next_por_abrir.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pipeline.next_por_abrir.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 12,
                          border: `1px solid ${THEME.border}`,
                          background: 'rgba(255,255,255,0.04)',
                          padding: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900 }}>{n.name || n.comuna || 'Comuna'}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                            {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                          </div>
                          {Array.isArray(n.ready_not_live) && n.ready_not_live.length ? (
                            <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                              Lista: {n.ready_not_live.join(', ')}
                            </div>
                          ) : null}
                        </div>
                        <Pill
                          theme={THEME}
                          label={n?.comuna_signal?.label || 'Por abrir'}
                          tone={n?.comuna_signal?.tone || 'amber'}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>No hay comunas listas para abrir.</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>Sin pipeline todavía.</div>
          )}
        </Card>

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
