import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
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

export default function AdminGrowthAIAuditScreen() {
  const { THEME } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const nodeId = params.get('nodeId') || '';

  const load = async (nid) => {
    setLoading(true);
    setError('');
    try {
      const qs = nid ? `?nodeId=${encodeURIComponent(nid)}` : '';
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/audit${qs}`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar (${res.status})`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo cargar auditoría.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(nodeId);
  }, [nodeId]);

  const summary = useMemo(() => {
    const total = items.length;
    const p0 = items.filter((i) => String(i.severity || '').toUpperCase() === 'P0').length;
    return { total, p0 };
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        theme={THEME}
        title="Auditoría"
        right={
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load(nodeId)}>
            Recargar
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={nodeId}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setParams({ nodeId: v });
              else setParams({});
            }}
            placeholder="Filtrar por nodeId (opcional)"
            style={{ flex: 1, minWidth: 220, borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
            {summary.total} eventos · {summary.p0} P0
          </div>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Eventos">
        {loading ? (
          <ListSkeleton rows={10} />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin eventos por ahora.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${String(a.severity || '').toUpperCase() === 'P0' ? 'rgba(229,115,115,0.25)' : THEME.border}`,
                  background: String(a.severity || '').toUpperCase() === 'P0' ? 'rgba(229,115,115,0.10)' : 'rgba(255,255,255,0.04)',
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.88)' }}>{a.title}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{a.at}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 1.45 }}>{a.detail}</div>
                {a.node_id ? <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Nodo: {a.node_id}</div> : null}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

