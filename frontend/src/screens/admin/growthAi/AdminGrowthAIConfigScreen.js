import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';

function statPalette(tone = 'neutral') {
  if (tone === 'green') return { border: 'rgba(102,187,106,0.22)', bg: 'rgba(102,187,106,0.10)', fg: '#CFF3D1' };
  if (tone === 'amber') return { border: 'rgba(217,161,90,0.22)', bg: 'rgba(217,161,90,0.10)', fg: '#FFE3B8' };
  if (tone === 'red') return { border: 'rgba(229,115,115,0.22)', bg: 'rgba(229,115,115,0.10)', fg: '#FFD2D2' };
  return { border: 'rgba(255,255,255,0.10)', bg: 'rgba(255,255,255,0.04)', fg: '#FFFFFF' };
}

function Section({ theme, title, right, children }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, background: theme.panelBg, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, subtitle, tone = 'neutral' }) {
  const palette = statPalette(tone);
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
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: palette.fg }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>{subtitle}</div> : null}
    </div>
  );
}

function prettyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminGrowthAIConfigScreen() {
  const { THEME } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/config`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar (${res.status})`);
      setConfig(payload?.config || {});
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo cargar configuración.'));
      setConfig({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const jsonText = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    setDraft(jsonText);
  }, [jsonText]);

  const parsedDraft = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(draft || '{}') };
    } catch (e) {
      return { ok: false, message: String(e?.message || 'JSON inválido') };
    }
  }, [draft]);

  const summary = useMemo(() => {
    const safe = config && typeof config === 'object' ? config : {};
    const discoverySources = Array.isArray(safe.discovery_sources) ? safe.discovery_sources : [];
    const enabledSources = discoverySources.filter((item) => !!item?.enabled).length;
    const nodeCoverage = new Set(discoverySources.map((item) => item?.node_id).filter(Boolean)).size;
    const topKeys = Object.keys(safe).slice(0, 6);
    return {
      keys: Object.keys(safe).length,
      discoverySources: discoverySources.length,
      enabledSources,
      nodeCoverage,
      topKeys,
    };
  }, [config]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let parsed;
      try {
        parsed = JSON.parse(draft || '{}');
      } catch {
        throw new Error('JSON inválido');
      }
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/config`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: parsed }) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo guardar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo guardar configuración.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: 18,
          borderRadius: 20,
          border: `1px solid ${THEME.border}`,
          background: 'linear-gradient(135deg, rgba(236,104,25,0.10), rgba(15,23,42,0.96) 42%, rgba(143,179,201,0.08))',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.56)', fontWeight: 900 }}>
          Gobierno del motor
        </div>
        <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Configuración premium para operar Growth AI con claridad y control.</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5, maxWidth: 760 }}>
          Esta superficie resume la estructura activa del motor y mantiene el editor JSON como capa experta, no como experiencia principal.
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatCard label="Bloques de config" value={String(summary.keys)} subtitle="Secciones detectadas en la configuración" />
          <StatCard label="Fuentes discovery" value={String(summary.discoverySources)} subtitle={`${summary.enabledSources} activas para scouting`} tone={summary.enabledSources > 0 ? 'green' : 'amber'} />
          <StatCard label="Cobertura nodos" value={String(summary.nodeCoverage)} subtitle="Nodos declarados en discovery" />
          <StatCard label="Validez del borrador" value={parsedDraft.ok ? 'OK' : 'Error'} subtitle={parsedDraft.ok ? 'Listo para guardar' : parsedDraft.message} tone={parsedDraft.ok ? 'green' : 'red'} />
        </div>
      </div>

      <Section
        theme={THEME}
        title="Resumen operativo"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.1fr) minmax(260px, 1fr)', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 0.7 }}>Lectura ejecutiva</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, lineHeight: 1.35 }}>
              {summary.discoverySources > 0
                ? `Growth AI opera con ${summary.discoverySources} fuentes configuradas y cobertura declarada en ${summary.nodeCoverage} nodo(s).`
                : 'Growth AI no tiene aún discovery sources registradas en la configuración global.'}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
              El editor experto permanece disponible, pero esta vista prioriza lectura y seguridad operativa.
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 0.7 }}>Bloques visibles</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {summary.topKeys.length > 0 ? (
                summary.topKeys.map((key) => (
                  <span key={key} style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.80)', fontWeight: 800 }}>
                    {prettyLabel(key)}
                  </span>
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin claves configuradas todavía.</div>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        theme={THEME}
        title="Editor experto"
        right={
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()} disabled={loading || saving}>
              Recargar
            </button>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => setDraft(jsonText)} disabled={loading || saving}>
              Restaurar formato
            </button>
            <button type="button" className="maqgo-btn-primary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void save()} disabled={loading || saving}>
              Guardar
            </button>
          </div>
        }
      >
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
          Configuración avanzada del motor. Mantiene la flexibilidad técnica sin perder legibilidad ni control de cambios.
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          rows={18}
          style={{ marginTop: 12, width: '100%', borderRadius: 14, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: 12, outline: 'none', fontSize: 12, lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
        />
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: parsedDraft.ok ? '#CFF3D1' : '#FFD2D2', fontWeight: 800 }}>
            {parsedDraft.ok ? 'JSON válido y listo para guardar.' : `JSON inválido: ${parsedDraft.message}`}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>{draft.length} caracteres</div>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Vista rápida del payload">
        <div style={{ display: 'grid', gap: 10 }}>
          {summary.topKeys.length > 0 ? (
            summary.topKeys.map((key) => {
              const value = config?.[key];
              const text =
                Array.isArray(value)
                  ? `${value.length} item(s)`
                  : value && typeof value === 'object'
                    ? `${Object.keys(value).length} clave(s)`
                    : String(value ?? '—');
              return (
                <div key={key} style={{ borderRadius: 14, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{prettyLabel(key)}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{text}</div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin datos para previsualizar.</div>
          )}
        </div>
      </Section>
    </div>
  );
}
