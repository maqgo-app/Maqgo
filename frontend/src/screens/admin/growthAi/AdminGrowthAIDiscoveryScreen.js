import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { useToast } from '../../../components/Toast';

function toneCard(tone = 'neutral') {
  if (tone === 'amber') {
    return { border: 'rgba(217,161,90,0.22)', bg: 'rgba(217,161,90,0.10)', fg: '#FFE3B8' };
  }
  if (tone === 'green') {
    return { border: 'rgba(102,187,106,0.22)', bg: 'rgba(102,187,106,0.10)', fg: '#CFF3D1' };
  }
  if (tone === 'red') {
    return { border: 'rgba(229,115,115,0.22)', bg: 'rgba(229,115,115,0.10)', fg: '#FFD2D2' };
  }
  return { border: 'rgba(255,255,255,0.10)', bg: 'rgba(255,255,255,0.04)', fg: '#FFFFFF' };
}

function StatCard({ label, value, subtitle, tone = 'neutral' }) {
  const palette = toneCard(tone);
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.66)' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: palette.fg }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>{subtitle}</div> : null}
    </div>
  );
}

function Section({ theme, title, subtitle, right, children }) {
  return (
    <div style={{ padding: 16, borderRadius: 18, border: `1px solid ${theme.border}`, background: theme.panelBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 1.45 }}>{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.72)' }}>{label}</div>
      {children}
    </div>
  );
}

export default function AdminGrowthAIDiscoveryScreen() {
  const { THEME } = useOutletContext();
  const toast = useToast();
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [items, setItems] = useState([]);
  const [kindFilter, setKindFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [sourcesError, setSourcesError] = useState('');
  const [runsError, setRunsError] = useState('');
  const [itemsError, setItemsError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setSourcesError('');
    setRunsError('');
    setItemsError('');
    try {
      const sRes = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/discovery/sources`, { method: 'GET' }, 15000);
      const sData = await sRes.json().catch(() => ({}));
      if (!sRes.ok) {
        setSourcesError(String(sData?.detail || `sources HTTP ${sRes.status}`));
        setSources([]);
      } else {
        setSources(Array.isArray(sData?.items) ? sData.items : []);
      }

      const rRes = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/discovery/runs`, { method: 'GET' }, 15000);
      const rData = await rRes.json().catch(() => ({}));
      if (!rRes.ok) {
        setRunsError(String(rData?.detail || `runs HTTP ${rRes.status}`));
        setRuns([]);
      } else {
        setRuns(Array.isArray(rData?.items) ? rData.items : []);
      }

      const iRes = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/opportunity-items?status=new`, { method: 'GET' }, 15000);
      const iData = await iRes.json().catch(() => ({}));
      if (!iRes.ok) {
        setItemsError(String(iData?.detail || `items HTTP ${iRes.status}`));
        setItems([]);
      } else {
        setItems(Array.isArray(iData?.items) ? iData.items : []);
      }

      if (!sRes.ok || !rRes.ok || !iRes.ok) {
        const parts = [];
        if (!sRes.ok) parts.push('sources');
        if (!rRes.ok) parts.push('runs');
        if (!iRes.ok) parts.push('items');
        setError(`Error cargando: ${parts.join(', ')}`);
      }
    } catch (e) {
      setError(String(e?.message || e));
      setSources([]);
      setRuns([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addSource = useCallback(() => {
    setSources((prev) => [
      ...prev,
      {
        id: `src_${Date.now()}`,
        url: '',
        type: 'rss',
        kind: 'supply',
        node_id: '',
        category: '',
        enabled: true,
        max_items: 25,
      },
    ]);
  }, []);

  const removeSource = useCallback((id) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const saveSources = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/discovery/sources`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sources) },
        20000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      toast.show(`Sources guardadas (${data?.count ?? sources.length})`, { tone: 'success' });
      fetchAll();
    } catch (e) {
      toast.show(`Error: ${String(e?.message || e)}`, { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [fetchAll, sources, toast]);

  const runDiscovery = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/discovery/run`, { method: 'POST' }, 30000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      toast.show(`Discovery OK: +${data?.items_created ?? 0} items`, { tone: 'success' });
      fetchAll();
    } catch (e) {
      toast.show(`Error: ${String(e?.message || e)}`, { tone: 'danger' });
    } finally {
      setRunning(false);
    }
  }, [fetchAll, toast]);

  const newItems = useMemo(() => items.slice(0, 25), [items]);
  const summary = useMemo(() => {
    const enabled = sources.filter((s) => !!s.enabled).length;
    const supply = sources.filter((s) => String(s.kind || '').toLowerCase() === 'supply').length;
    const demand = sources.filter((s) => String(s.kind || '').toLowerCase() === 'demand').length;
    const lastRun = runs[0] || null;
    const totalErrors = runs.reduce((acc, run) => acc + (Array.isArray(run?.errors) ? run.errors.length : 0), 0);
    return {
      totalSources: sources.length,
      enabled,
      supply,
      demand,
      newItems: items.length,
      lastCreated: Number(lastRun?.items_created || 0),
      lastFetched: Number(lastRun?.fetched || 0),
      lastRunAt: lastRun?.at || 'Sin ejecución',
      totalErrors,
    };
  }, [items.length, runs, sources]);

  const filteredSources = useMemo(() => {
    if (kindFilter === 'all') return sources;
    return sources.filter((source) => String(source?.kind || '').toLowerCase() === kindFilter);
  }, [kindFilter, sources]);

  const healthTone = summary.totalErrors > 0 ? 'amber' : summary.lastCreated > 0 ? 'green' : 'neutral';
  const opportunityTone = summary.newItems > 0 ? 'amber' : 'neutral';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: 18,
          borderRadius: 20,
          border: `1px solid ${THEME.border}`,
          background: 'linear-gradient(135deg, rgba(236,104,25,0.12), rgba(15,23,42,0.96) 45%, rgba(143,179,201,0.08))',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, maxWidth: 760 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.56)', fontWeight: 900 }}>
              Discovery comercial
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Radar premium para detectar oferta, demanda y nuevas aperturas.</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5 }}>
              Growth AI monitorea fuentes, ejecuta scouting y convierte hallazgos en oportunidades accionables para expansión.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '10px 12px', borderRadius: 12 }} onClick={fetchAll}>
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
            <button
              type="button"
              className="maqgo-btn"
              style={{ padding: '10px 12px', borderRadius: 12, background: '#EC6819' }}
              onClick={runDiscovery}
              disabled={running}
            >
              {running ? 'Ejecutando…' : 'Ejecutar scouting'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <StatCard label="Fuentes activas" value={`${summary.enabled}/${summary.totalSources}`} subtitle="Cobertura actualmente habilitada" tone="green" />
          <StatCard label="Oferta vs demanda" value={`${summary.supply} / ${summary.demand}`} subtitle="Balance de scouting por tipo de señal" />
          <StatCard label="Última corrida" value={String(summary.lastCreated)} subtitle={`Items creados · fetched ${summary.lastFetched}`} tone={healthTone} />
          <StatCard label="Oportunidades nuevas" value={String(summary.newItems)} subtitle="Bandeja lista para priorización" tone={opportunityTone} />
        </div>

        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13 }}>{error}</div> : null}
        {sourcesError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Fuentes: {sourcesError}</div> : null}
        {runsError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Corridas: {runsError}</div> : null}
        {itemsError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Oportunidades: {itemsError}</div> : null}
      </div>

      <Section
        theme={THEME}
        title="Pulso ejecutivo"
        subtitle="Lectura rápida del estado del radar comercial y su capacidad de generar pipeline nuevo."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.2fr) minmax(260px, 1fr)', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 0.7 }}>Lectura actual</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, lineHeight: 1.35 }}>
              {summary.totalSources === 0
                ? 'Growth AI aún no tiene fuentes configuradas para abrir nuevas oportunidades.'
                : summary.lastCreated > 0
                  ? `La última corrida abrió ${summary.lastCreated} nuevos hallazgos desde ${summary.enabled} fuentes activas.`
                  : 'El radar está activo, pero la última corrida no convirtió hallazgos en nuevas oportunidades.'}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
              Última ejecución: {summary.lastRunAt}
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 0.7 }}>Prioridad operativa</div>
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: '#fff' }}>
              {summary.newItems > 0
                ? 'Existe inventario nuevo para priorizar y convertir en expansión real.'
                : 'No hay oportunidad nueva pendiente; conviene revisar cobertura o lanzar una corrida manual.'}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
              Errores acumulados en historial reciente: {summary.totalErrors}
            </div>
          </div>
        </div>
      </Section>

      <Section
        theme={THEME}
        title="Fuentes de scouting"
        subtitle="Configura de dónde aprende el motor y qué tipo de señal comercial debe capturar."
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              style={{
                borderRadius: 10,
                border: `1px solid ${THEME.borderStrong}`,
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              <option value="all">Todas</option>
              <option value="supply">Oferta</option>
              <option value="demand">Demanda</option>
            </select>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10 }} onClick={addSource}>
              Agregar
            </button>
            <button
              type="button"
              className="maqgo-btn"
              style={{ padding: '8px 10px', borderRadius: 10, background: '#EC6819' }}
              onClick={saveSources}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div style={{ marginTop: 2, marginBottom: 12, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
          {filteredSources.length} fuente{filteredSources.length === 1 ? '' : 's'} en vista.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {filteredSources.map((s, idx) => (
            <div key={s.id || idx} style={{ padding: 14, borderRadius: 16, border: `1px solid ${s.enabled ? 'rgba(102,187,106,0.20)' : THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{s.id}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>
                      {String(s.kind || '').toLowerCase() === 'demand' ? 'Demanda' : 'Oferta'}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>
                      {String(s.type || '').toUpperCase()}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${s.enabled ? 'rgba(102,187,106,0.28)' : THEME.border}`, fontSize: 11, color: s.enabled ? '#CFF3D1' : 'rgba(255,255,255,0.64)', fontWeight: 800, background: s.enabled ? 'rgba(102,187,106,0.12)' : 'transparent' }}>
                      {s.enabled ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                </div>
                <button type="button" className="maqgo-btn-secondary" style={{ padding: '6px 10px', borderRadius: 10 }} onClick={() => removeSource(s.id)}>
                  Quitar
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="URL">
                  <input
                    value={s.url || ''}
                    onChange={(e) =>
                      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, url: e.target.value } : x)))
                    }
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </Field>
                <Field label="Tipo">
                  <select
                    value={s.type || 'rss'}
                    onChange={(e) =>
                      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, type: e.target.value } : x)))
                    }
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <option value="rss">RSS</option>
                    <option value="html">HTML</option>
                  </select>
                </Field>
                <Field label="Kind">
                  <select
                    value={s.kind || 'supply'}
                    onChange={(e) =>
                      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, kind: e.target.value } : x)))
                    }
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <option value="supply">Oferta</option>
                    <option value="demand">Demanda</option>
                  </select>
                </Field>
                <Field label="Node ID">
                  <input
                    value={s.node_id || ''}
                    onChange={(e) =>
                      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, node_id: e.target.value } : x)))
                    }
                    placeholder="lampa"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </Field>
                <Field label="Categoría">
                  <input
                    value={s.category || ''}
                    onChange={(e) =>
                      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, category: e.target.value } : x)))
                    }
                    placeholder="excavadora / retro / etc"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </Field>
                <Field label="Max items">
                  <input
                    type="number"
                    value={s.max_items ?? 25}
                    onChange={(e) =>
                      setSources((prev) =>
                        prev.map((x) => (x.id === s.id ? { ...x, max_items: Number(e.target.value || 0) } : x))
                      )
                    }
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${THEME.border}`,
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </Field>
                <Field label="Enabled">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={!!s.enabled}
                      onChange={(e) =>
                        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)))
                      }
                    />
                    Activo
                  </label>
                </Field>
              </div>
            </div>
          ))}
          {!loading && filteredSources.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin fuentes para este filtro.</div> : null}
        </div>
      </Section>

      <Section
        theme={THEME}
        title="Historial de corridas"
        subtitle="Controla si el radar está trayendo señal útil y detecta fricción antes de que impacte el pipeline."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {runs.slice(0, 10).map((r) => (
            <div key={r.id} style={{ padding: 14, borderRadius: 16, border: `1px solid ${Array.isArray(r?.errors) && r.errors.length ? 'rgba(217,161,90,0.22)' : THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>Corrida {String(r.id).slice(0, 10)}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
                      Fuentes {r.sources}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
                      Fetched {r.fetched}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${Number(r.items_created || 0) > 0 ? 'rgba(102,187,106,0.28)' : THEME.border}`, fontSize: 11, color: Number(r.items_created || 0) > 0 ? '#CFF3D1' : 'rgba(255,255,255,0.70)', fontWeight: 800, background: Number(r.items_created || 0) > 0 ? 'rgba(102,187,106,0.12)' : 'transparent' }}>
                      Nuevas {r.items_created}
                    </span>
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{r.at}</div>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
                {Array.isArray(r?.errors) && r.errors.length
                  ? `${r.errors.length} error(es) detectados en la corrida.`
                  : 'Corrida sin errores registrados.'}
              </div>
            </div>
          ))}
          {!loading && runs.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin corridas registradas.</div> : null}
        </div>
      </Section>

      <Section
        theme={THEME}
        title="Bandeja nueva"
        subtitle="Preview de los hallazgos recién capturados para convertirlos en oportunidad comercial."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {newItems.map((it) => (
            <div key={it.id} style={{ padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{it.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {it.kind ? <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{it.kind}</span> : null}
                  {it.source ? <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{it.source}</span> : null}
                </div>
              </div>
              {it.link ? (
                <a href={it.link} target="_blank" rel="noreferrer" style={{ marginTop: 6, display: 'inline-block', color: THEME.info, fontSize: 12 }}>
                  Abrir fuente
                </a>
              ) : null}
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                {it.node_id ? `Nodo ${it.node_id}` : 'Sin nodo asignado'} {it.category ? `· ${it.category}` : ''}
              </div>
            </div>
          ))}
          {!loading && newItems.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin hallazgos nuevos.</div> : null}
        </div>
      </Section>
    </div>
  );
}
