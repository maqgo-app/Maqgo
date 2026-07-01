import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

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

function Toggle({ enabled }) {
  return (
    <span style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${enabled ? 'rgba(102,187,106,0.28)' : 'rgba(255,255,255,0.14)'}`, background: enabled ? 'rgba(102,187,106,0.14)' : 'rgba(255,255,255,0.08)', color: enabled ? '#CFF3D1' : 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 900 }}>
      {enabled ? 'enabled' : 'disabled'}
    </span>
  );
}

export default function AdminGrowthAIAutomationsScreen() {
  const { THEME } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, sRes] = await Promise.all([
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/automations`, { method: 'GET' }, 15000),
        fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/automations/status`, { method: 'GET' }, 15000),
      ]);
      const aPayload = await aRes.json().catch(() => ({}));
      const sPayload = await sRes.json().catch(() => ({}));
      if (!aRes.ok) throw new Error(aPayload?.detail || `No se pudo cargar (${aRes.status})`);
      setItems(Array.isArray(aPayload?.items) ? aPayload.items : []);
      setStatus(sRes.ok ? sPayload : null);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudieron cargar automatizaciones.'));
      setItems([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const active = items.filter((i) => i.enabled).length;
    return { total: items.length, active };
  }, [items]);

  const setEnabled = async (id, enabled) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/automations/${encodeURIComponent(id)}/enable`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo actualizar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo actualizar.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        theme={THEME}
        title="Automatizaciones"
        right={
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()}>
            Recargar
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
            {summary.active}/{summary.total} activas
          </div>
          {status?.summary ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{status.summary}</div> : null}
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Lista">
        {loading ? (
          <ListSkeleton rows={10} />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin automatizaciones configuradas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((a) => (
              <div key={a.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{a.title}</div>
                    <Toggle enabled={Boolean(a.enabled)} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{a.description || '—'}</div>
                  {a.last_run_at ? <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Última ejecución: {a.last_run_at}</div> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void setEnabled(a.id, !a.enabled)}>
                    {a.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

