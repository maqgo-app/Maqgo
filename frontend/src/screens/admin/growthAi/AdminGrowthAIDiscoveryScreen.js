import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { useToast } from '../../../components/Toast';

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>Discovery (scouting)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '10px 12px', borderRadius: 10 }} onClick={fetchAll}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="maqgo-btn"
            style={{ padding: '10px 12px', borderRadius: 10, background: '#EC6819' }}
            onClick={runDiscovery}
            disabled={running}
          >
            {running ? 'Ejecutando…' : 'Run ahora'}
          </button>
        </div>
      </div>

      {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13 }}>{error}</div> : null}
      {sourcesError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Sources: {sourcesError}</div> : null}
      {runsError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Runs: {runsError}</div> : null}
      {itemsError ? <div style={{ marginTop: 6, color: '#E57373', fontSize: 12 }}>Items: {itemsError}</div> : null}

      <div style={{ marginTop: 14, padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: THEME.panelBg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>Sources</div>
          <div style={{ display: 'flex', gap: 8 }}>
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
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {sources.map((s, idx) => (
            <div key={s.id || idx} style={{ padding: 12, borderRadius: 14, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>{s.id}</div>
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
                    <option value="supply">Supply</option>
                    <option value="demand">Demand</option>
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
          {!loading && sources.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin sources.</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: THEME.panelBg }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Últimos runs</div>
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {runs.slice(0, 10).map((r) => (
            <div key={r.id} style={{ padding: 12, borderRadius: 14, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>Run {String(r.id).slice(0, 10)}</div>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{r.at}</div>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
                sources={r.sources} fetched={r.fetched} created={r.items_created} errors={(r.errors || []).length}
              </div>
            </div>
          ))}
          {!loading && runs.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin runs.</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: THEME.panelBg }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Oportunidades nuevas (top 25)</div>
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {newItems.map((it) => (
            <div key={it.id} style={{ padding: 12, borderRadius: 14, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>{it.title}</div>
              {it.link ? (
                <a href={it.link} target="_blank" rel="noreferrer" style={{ marginTop: 6, display: 'inline-block', color: THEME.info, fontSize: 12 }}>
                  Abrir fuente
                </a>
              ) : null}
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                {it.kind} · {it.source} {it.node_id ? `· node=${it.node_id}` : ''}
              </div>
            </div>
          ))}
          {!loading && newItems.length === 0 ? <div style={{ color: THEME.textMuted, fontSize: 13 }}>Sin items nuevos.</div> : null}
        </div>
      </div>
    </div>
  );
}
