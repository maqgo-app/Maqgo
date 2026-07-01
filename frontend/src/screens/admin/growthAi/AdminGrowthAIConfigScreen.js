import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';

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
      <Section
        theme={THEME}
        title="Config (MVP)"
        right={
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()} disabled={loading || saving}>
              Recargar
            </button>
            <button type="button" className="maqgo-btn-primary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void save()} disabled={loading || saving}>
              Guardar
            </button>
          </div>
        }
      >
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
          Configuración interna. En MVP no habilita automatizaciones irreversibles.
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          rows={18}
          style={{ marginTop: 12, width: '100%', borderRadius: 14, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: 12, outline: 'none', fontSize: 12, lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
        />
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>
    </div>
  );
}

