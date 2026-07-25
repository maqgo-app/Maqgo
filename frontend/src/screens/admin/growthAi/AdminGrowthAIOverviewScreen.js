import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

function Card({ theme, title, children, right, subtitle }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.panelBg,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>{title}</div>
          {subtitle ? (
            <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 1.4 }}>{subtitle}</div>
          ) : null}
        </div>
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

function StatCard({ label, value, subtitle, tone = 'neutral' }) {
  const palette =
    tone === 'green'
      ? { bg: 'rgba(102,187,106,0.10)', border: 'rgba(102,187,106,0.22)', color: '#CFF3D1' }
      : tone === 'red'
        ? { bg: 'rgba(229,115,115,0.10)', border: 'rgba(229,115,115,0.22)', color: '#FFD2D2' }
        : tone === 'amber'
          ? { bg: 'rgba(217,161,90,0.10)', border: 'rgba(217,161,90,0.22)', color: '#FFE3B8' }
          : { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', color: '#fff' };
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.66)' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: palette.color }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 1.35 }}>{subtitle}</div> : null}
    </div>
  );
}

function ActionCard({ theme, title, subtitle, bullets, actionLabel, onClick, tone = 'neutral' }) {
  const borderColor =
    tone === 'green'
      ? 'rgba(102,187,106,0.20)'
      : tone === 'amber'
        ? 'rgba(217,161,90,0.20)'
        : tone === 'red'
          ? 'rgba(229,115,115,0.20)'
          : theme.border;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        background: 'rgba(255,255,255,0.04)',
        padding: 14,
        cursor: 'pointer',
        color: '#fff',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>{subtitle}</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bullets.map((bullet) => (
          <div key={`${title}-${bullet}`} style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', lineHeight: 1.35 }}>
            {bullet}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, fontWeight: 900, color: '#EC6819' }}>{actionLabel}</div>
    </button>
  );
}

function loadCountByStatus(items, key, expected) {
  return items.filter((item) => String(item?.[key] || '').toLowerCase() === expected).length;
}

export default function AdminGrowthAIOverviewScreen() {
  const { THEME } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [runtimeError, setRuntimeError] = useState('');
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [rollups, setRollups] = useState({ opportunities: [], actions: [], programs: [], contacts: [] });
  const [bootstrapping, setBootstrapping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/overview`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar Overview (${res.status})`);
      setData(payload);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo cargar Growth AI.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRuntime = async () => {
    setRuntimeLoading(true);
    setRuntimeError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/runtime/status`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar runtime (${res.status})`);
      setRuntime(payload);
    } catch (e) {
      setRuntimeError(friendlyFetchError(e, 'No se pudo cargar estado del motor.'));
      setRuntime(null);
    } finally {
      setRuntimeLoading(false);
    }
  };

  const loadRollups = async () => {
    try {
      const [opportunitiesRes, actionsRes, programsRes, contactsRes] = await Promise.all([
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/opportunities`, { method: 'GET' }, 15000),
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/actions`, { method: 'GET' }, 15000),
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/programs`, { method: 'GET' }, 15000),
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/contact-actions`, { method: 'GET' }, 15000),
      ]);
      const [opportunitiesData, actionsData, programsData, contactsData] = await Promise.all([
        opportunitiesRes.json().catch(() => ({})),
        actionsRes.json().catch(() => ({})),
        programsRes.json().catch(() => ({})),
        contactsRes.json().catch(() => ({})),
      ]);
      setRollups({
        opportunities: opportunitiesRes.ok && Array.isArray(opportunitiesData?.items) ? opportunitiesData.items : [],
        actions: actionsRes.ok && Array.isArray(actionsData?.items) ? actionsData.items : [],
        programs: programsRes.ok && Array.isArray(programsData?.items) ? programsData.items : [],
        contacts: contactsRes.ok && Array.isArray(contactsData?.items) ? contactsData.items : [],
      });
    } catch {
      setRollups({ opportunities: [], actions: [], programs: [], contacts: [] });
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadOverview(), loadRuntime(), loadRollups()]);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const forceBootstrap = async () => {
    if (bootstrapping) return;
    setBootstrapping(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/bootstrap`, { method: 'POST' }, 20000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo inicializar (${res.status})`);
      await refreshAll();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo inicializar Growth AI.'));
    } finally {
      setBootstrapping(false);
    }
  };

  const startSearch = async () => {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_outreach: true, auto_execute_providers: true }),
        },
        30000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo iniciar (${res.status})`);
      await refreshAll();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo iniciar la búsqueda.'));
    } finally {
      setStarting(false);
    }
  };

  const stopEngine = async () => {
    if (stopping) return;
    setStopping(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/stop`, { method: 'POST' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo detener (${res.status})`);
      await refreshAll();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo detener el motor.'));
    } finally {
      setStopping(false);
    }
  };

  const topNodes = useMemo(() => (Array.isArray(data?.top_nodes) ? data.top_nodes.slice(0, 6) : []), [data]);
  const risks = useMemo(() => (Array.isArray(data?.p0_risks) ? data.p0_risks.slice(0, 6) : []), [data]);
  const workingNow = useMemo(() => (Array.isArray(data?.working_now) ? data.working_now.slice(0, 6) : []), [data]);
  const goLive = useMemo(() => data?.weekly?.go_live || null, [data]);
  const pipeline = useMemo(() => data?.pipeline || null, [data]);

  const startingComunas = useMemo(() => {
    const rows = Array.isArray(pipeline?.next_captando) ? pipeline.next_captando : Array.isArray(pipeline?.captando) ? pipeline.captando : [];
    return rows.map((r) => String(r?.comuna || r?.name || '').trim()).filter(Boolean).slice(0, 3);
  }, [pipeline]);

  const executive = useMemo(() => {
    const captando = Array.isArray(pipeline?.captando) ? pipeline.captando.length : 0;
    const porAbrir = Array.isArray(pipeline?.por_abrir) ? pipeline.por_abrir.length : 0;
    const abiertas = Array.isArray(pipeline?.abiertas) ? pipeline.abiertas.length : 0;
    const pausadas = Array.isArray(pipeline?.pausadas) ? pipeline.pausadas.length : 0;
    const contactosBorrador = loadCountByStatus(rollups.contacts, 'status', 'draft');
    const contactosAprobados = loadCountByStatus(rollups.contacts, 'status', 'approved');
    return {
      nodos: topNodes.length,
      captando,
      porAbrir,
      abiertas,
      pausadas,
      riesgos: risks.length,
      accionesAbiertas: rollups.actions.filter((item) => String(item?.status || '').toLowerCase() !== 'done').length,
      oportunidadesNuevas: loadCountByStatus(rollups.opportunities, 'status', 'new'),
      programasActivos: loadCountByStatus(rollups.programs, 'status', 'active'),
      contactosListos: contactosBorrador + contactosAprobados,
    };
  }, [pipeline, rollups, risks.length, topNodes.length]);

  const quickActions = useMemo(
    () => [
      {
        title: 'Oportunidades',
        subtitle: 'Ideas y hallazgos para priorizar expansión',
        bullets: [
          `${executive.oportunidadesNuevas} nuevas por revisar`,
          `${loadCountByStatus(rollups.opportunities, 'status', 'triaged')} ya triageadas`,
          'Convierte señales en decisiones concretas',
        ],
        actionLabel: 'Abrir bandeja',
        to: '/admin/growth-ai/opportunities',
        tone: executive.oportunidadesNuevas > 0 ? 'amber' : 'neutral',
      },
      {
        title: 'Acciones',
        subtitle: 'Loop esperado, obtenido y aprendizaje',
        bullets: [
          `${executive.accionesAbiertas} abiertas`,
          `${loadCountByStatus(rollups.actions, 'status', 'done')} cerradas`,
          'Mantiene memoria operativa del Growth AI',
        ],
        actionLabel: 'Abrir backlog',
        to: '/admin/growth-ai/actions',
        tone: executive.accionesAbiertas > 0 ? 'amber' : 'green',
      },
      {
        title: 'Contactos',
        subtitle: 'Outreach listo para aprobar o ejecutar',
        bullets: [
          `${executive.contactosListos} contactos en preparación`,
          `${loadCountByStatus(rollups.contacts, 'status', 'manual_required')} requieren paso manual`,
          'Reduce fricción entre hallazgo y contacto',
        ],
        actionLabel: 'Abrir contactos',
        to: '/admin/growth-ai/contacts',
        tone: executive.contactosListos > 0 ? 'amber' : 'neutral',
      },
      {
        title: 'Programas',
        subtitle: 'Iniciativas activas por comuna o tema',
        bullets: [
          `${executive.programasActivos} activos`,
          `${loadCountByStatus(rollups.programs, 'status', 'proposed')} propuestos`,
          'Ordena expansión en frentes gestionables',
        ],
        actionLabel: 'Abrir programas',
        to: '/admin/growth-ai/programs',
        tone: executive.programasActivos > 0 ? 'green' : 'neutral',
      },
    ],
    [executive, rollups]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card
        theme={THEME}
        title="Pulso Growth AI"
        subtitle="Controla el autopiloto comercial de MAQGO desde una sola vista ejecutiva, sin depender de marketing manual."
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
              onClick={() => void refreshAll()}
            >
              Actualizar
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}
              onClick={() => navigate('/admin/growth-ai/comunas')}
            >
              Ver comunas
            </button>
          </div>
        }
      >
        {error ? <div style={{ marginBottom: 12, color: '#E57373', fontSize: 13, lineHeight: 1.4 }}>{error}</div> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <StatCard label="Comunas en captación" value={String(executive.captando)} subtitle="Frentes donde aún estamos construyendo oferta" tone={executive.captando > 0 ? 'amber' : 'neutral'} />
          <StatCard label="Comunas listas por abrir" value={String(executive.porAbrir)} subtitle="Oferta lista para aprobar o activar" tone={executive.porAbrir > 0 ? 'amber' : 'neutral'} />
          <StatCard label="Comunas abiertas" value={String(executive.abiertas)} subtitle="Mercados ya en vivo o ejecutando expansión" tone={executive.abiertas > 0 ? 'green' : 'neutral'} />
          <StatCard label="Riesgos P0" value={String(executive.riesgos)} subtitle="Incidencias críticas que afectan expansión" tone={executive.riesgos > 0 ? 'red' : 'green'} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Pill theme={THEME} label={`Marketplace ${data?.marketplace?.status || 'Sin datos'}`} tone={data?.marketplace?.tone || 'neutral'} />
          <Pill theme={THEME} label={`Motor ${runtime?.autopilot?.enabled ? 'activo' : 'detenido'}`} tone={runtime?.autopilot?.enabled ? 'green' : 'amber'} />
          <Pill theme={THEME} label={`GO LIVE ${goLive?.status || '—'}`} tone={goLive?.tone || 'neutral'} />
          <Pill theme={THEME} label={`Acciones abiertas ${executive.accionesAbiertas}`} tone={executive.accionesAbiertas > 0 ? 'amber' : 'green'} />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card
            theme={THEME}
            title="Motor comercial"
            subtitle="Activa o detiene el radar comercial y el outreach sin salir de la vista ejecutiva."
            right={runtime?.autopilot ? <Pill theme={THEME} label={runtime.autopilot.enabled ? 'Motor automatico activo' : 'Motor automatico detenido'} tone={runtime.autopilot.enabled ? 'green' : 'neutral'} /> : null}
          >
            {runtimeLoading ? (
              <ListSkeleton rows={2} />
            ) : runtimeError ? (
              <div style={{ color: '#E57373', fontSize: 12, lineHeight: 1.35 }}>{runtimeError}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>
                  {runtime?.autopilot?.enabled
                    ? 'Growth AI está autorizado para descubrir y preparar expansión sobre la configuración vigente.'
                    : 'Growth AI está detenido. Puedes activarlo para poblar el radar comercial y disparar el primer ciclo de expansión.'}
                </div>
                <div className="maqgo-admin-chip-row">
                  <Pill theme={THEME} label={`Intervalo ${runtime?.scheduler?.interval_sec ?? '—'}s`} tone="neutral" />
                  <Pill theme={THEME} label={`Último tick ${String(runtime?.scheduler?.last_tick_at || '—').slice(0, 19).replace('T', ' ')}`} tone="neutral" />
                  <Pill theme={THEME} label={`Ultimo radar ${String(runtime?.discovery?.last_discovery_at || '—').slice(0, 19).replace('T', ' ')}`} tone="neutral" />
                </div>
                {runtime?.daily?.limits ? (
                  <div className="maqgo-admin-chip-row">
                    <Pill theme={THEME} label={`Hoy ${runtime?.daily?.total_created ?? 0}/${runtime?.daily?.limits?.total ?? '—'}`} tone="neutral" />
                    <Pill theme={THEME} label={`Oferta ${runtime?.daily?.supply_created ?? 0}/${runtime?.daily?.limits?.supply ?? '—'}`} tone="neutral" />
                    <Pill theme={THEME} label={`Demanda ${runtime?.daily?.demand_created ?? 0}/${runtime?.daily?.limits?.demand ?? '—'}`} tone="neutral" />
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="maqgo-btn-primary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                    disabled={starting}
                    onClick={startSearch}
                  >
                    {starting ? 'Activando…' : 'Activar motor'}
                  </button>
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
                    disabled={stopping || !runtime?.autopilot?.enabled}
                    onClick={stopEngine}
                  >
                    {stopping ? 'Deteniendo…' : 'Detener motor'}
                  </button>
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
                    onClick={() => navigate('/admin/growth-ai/discovery')}
                  >
                    Abrir radar
                  </button>
                </div>
                {runtime?.discovery?.last_discovery_error ? <div style={{ color: '#E57373', fontSize: 12, lineHeight: 1.35 }}>Radar: {runtime.discovery.last_discovery_error}</div> : null}
                {runtime?.inventory?.inventory_error ? <div style={{ color: '#E57373', fontSize: 12, lineHeight: 1.35 }}>Inventario: {runtime.inventory.inventory_error}</div> : null}
              </div>
            )}
          </Card>

          <Card
            theme={THEME}
            title="Bandejas clave"
            subtitle="Entra directo donde Growth AI necesita decisión o ejecución."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
              {quickActions.map((item) => (
                <ActionCard
                  key={item.title}
                  theme={THEME}
                  title={item.title}
                  subtitle={item.subtitle}
                  bullets={item.bullets}
                  actionLabel={item.actionLabel}
                  tone={item.tone}
                  onClick={() => navigate(item.to)}
                />
              ))}
            </div>
          </Card>

          <Card
            theme={THEME}
            title="Nodos prioritarios"
            subtitle="Comunas donde el cerebro comercial ve mayor urgencia o potencial."
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
                    {bootstrapping ? 'Inicializando…' : 'Inicializar comunas base RM'}
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
                      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em' }}>{n.name || n.comuna || 'Nodo'}</div>
                      {n.region || n.comuna ? <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{(n.region ? `${n.region} · ` : '') + (n.comuna || '')}</div> : null}
                      <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{n.primary_gap || 'Sin brecha principal'}</div>
                    </div>
                    <Pill theme={THEME} label={n.traffic_light || '—'} tone={n.traffic_tone || 'neutral'} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card theme={THEME} title="Siguiente acción" subtitle="Lo próximo que conviene resolver para no perder tracción.">
            {loading ? (
              <div style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
            ) : data?.top_action ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>{data.top_action.title}</div>
                {data.top_action.reason ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 1.35 }}>{data.top_action.reason}</div> : null}
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {data.top_action.node_id ? (
                    <button
                      type="button"
                      className="maqgo-btn-secondary"
                      style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 900 }}
                      onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(data.top_action.node_id)}`)}
                    >
                      Ir al nodo
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 900 }}
                    onClick={() => navigate('/admin/growth-ai/actions')}
                  >
                    Abrir acciones
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>Sin acción prioritaria por ahora.</div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card
            theme={THEME}
            title="GO LIVE semanal"
            subtitle="Señal de apertura comercial y readiness de oferta."
            right={goLive ? <Pill theme={THEME} label={`GO LIVE ${goLive.status || '—'}`} tone={goLive.tone || 'neutral'} /> : null}
          >
            {loading ? (
              <ListSkeleton rows={2} />
            ) : goLive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {goLive.reason ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>{goLive.reason}</div> : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Pill theme={THEME} label={`LIVE ${goLive.live_machines ?? 0}`} tone={goLive.live_machines > 0 ? 'green' : 'neutral'} />
                  <Pill theme={THEME} label={`LISTA ${goLive.ready_not_live ?? 0}`} tone={goLive.ready_not_live > 0 ? 'amber' : 'neutral'} />
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.35 }}>
                  Último cambio: {goLive.last_change ? String(goLive.last_change) : '—'}
                  {goLive.last_change_title ? ` · ${goLive.last_change_title}` : ''}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>Sin datos de GO LIVE todavía.</div>
            )}
          </Card>

          <Card
            theme={THEME}
            title="Comunas en foco"
            subtitle="Dónde abrir primero y dónde todavía falta construir oferta."
            right={
              pipeline ? <Pill theme={THEME} label={`Captando ${Array.isArray(pipeline.captando) ? pipeline.captando.length : 0} · Por abrir ${Array.isArray(pipeline.por_abrir) ? pipeline.por_abrir.length : 0}`} tone="neutral" /> : null
            }
          >
            {loading ? (
              <ListSkeleton rows={4} />
            ) : pipeline ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)', marginBottom: 6 }}>Captando ahora</div>
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
                            <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{(n.region ? `${n.region} · ` : '') + (n.comuna || '')}</div>
                          </div>
                          <Pill theme={THEME} label={n?.comuna_signal?.label || 'Captando'} tone={n?.comuna_signal?.tone || 'neutral'} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>No hay comunas en captación.</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)', marginBottom: 6 }}>Listas por abrir</div>
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
                            <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{(n.region ? `${n.region} · ` : '') + (n.comuna || '')}</div>
                            {Array.isArray(n.ready_not_live) && n.ready_not_live.length ? <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Lista: {n.ready_not_live.join(', ')}</div> : null}
                          </div>
                          <Pill theme={THEME} label={n?.comuna_signal?.label || 'Por abrir'} tone={n?.comuna_signal?.tone || 'amber'} />
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

          <Card
            theme={THEME}
            title="Radar comercial"
            subtitle="Prospección automática de proveedores con límites diarios y alcance controlado."
            right={<Pill theme={THEME} label={starting ? 'Buscando…' : 'Listo'} tone={starting ? 'amber' : 'neutral'} />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>
                El foco actual está en oferta. Clientes permanecen bloqueados hasta que GO LIVE tenga oferta suficiente por comuna.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Pill theme={THEME} label="Región RM" tone="neutral" />
                <Pill theme={THEME} label={startingComunas.length ? `Comunas: ${startingComunas.join(', ')}` : 'Comunas sin datos'} tone={startingComunas.length ? 'neutral' : 'amber'} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                  disabled={starting}
                  onClick={startSearch}
                >
                  {starting ? 'Ejecutando…' : 'Ejecutar radar'}
                </button>
                <button
                  type="button"
                  className="maqgo-btn-secondary"
                  style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
                  onClick={() => navigate('/admin/growth-ai/discovery')}
                >
                  Ver hallazgos
                </button>
              </div>
            </div>
          </Card>

          <Card
            theme={THEME}
            title="Auditoría y actividad"
            subtitle="Riesgos críticos y trabajo reciente del motor."
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
              <ListSkeleton rows={3} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <StatCard label="Riesgos P0" value={String(risks.length)} subtitle="Incidencias activas" tone={risks.length ? 'red' : 'green'} />
                  <StatCard label="Runs recientes" value={String(workingNow.length)} subtitle="Eventos relevantes del motor" tone="neutral" />
                </div>
                {risks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {risks.slice(0, 3).map((r) => (
                      <div key={r.id} style={{ border: '1px solid rgba(229,115,115,0.25)', background: 'rgba(229,115,115,0.10)', borderRadius: 14, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>{r.title}</div>
                        {r.detail ? <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.35 }}>{r.detail}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>Sin riesgos P0 activos.</div>
                )}
                {workingNow.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {workingNow.slice(0, 3).map((w) => (
                      <div key={w.id} style={{ border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>{w.title}</div>
                        {w.meta ? <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{w.meta}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
