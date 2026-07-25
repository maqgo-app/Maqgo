import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

function statPalette(tone = 'neutral') {
  if (tone === 'red') return { border: 'rgba(229,115,115,0.22)', bg: 'rgba(229,115,115,0.10)', fg: '#FFD2D2' };
  if (tone === 'amber') return { border: 'rgba(217,161,90,0.22)', bg: 'rgba(217,161,90,0.10)', fg: '#FFE3B8' };
  if (tone === 'green') return { border: 'rgba(102,187,106,0.22)', bg: 'rgba(102,187,106,0.10)', fg: '#CFF3D1' };
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

function SeverityPill({ severity }) {
  const safe = String(severity || 'INFO').toUpperCase();
  const palette = safe === 'P0' ? statPalette('red') : safe === 'P1' ? statPalette('amber') : statPalette('neutral');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: 11,
        fontWeight: 900,
      }}
    >
      {safe}
    </span>
  );
}

export default function AdminGrowthAIAuditScreen() {
  const { THEME } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [textFilter, setTextFilter] = useState('');

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
    const p1 = items.filter((i) => String(i.severity || '').toUpperCase() === 'P1').length;
    const nodeCount = new Set(items.map((i) => i?.node_id).filter(Boolean)).size;
    const lastAt = items[0]?.at || 'Sin actividad';
    return { total, p0, p1, nodeCount, lastAt };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = String(textFilter || '').trim().toLowerCase();
    return items.filter((item) => {
      const severity = String(item?.severity || '').toUpperCase();
      if (severityFilter !== 'all' && severity !== severityFilter) return false;
      if (!query) return true;
      const haystack = `${item?.title || ''} ${item?.detail || ''} ${item?.node_id || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, severityFilter, textFilter]);

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
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.56)', fontWeight: 900 }}>
            Auditoría operativa
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Visibilidad premium sobre riesgos, errores y trazabilidad del motor.</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5, maxWidth: 760 }}>
            Esta bandeja concentra las señales críticas de Growth AI para que el equipo actúe antes de afectar la expansión, el outreach o la confianza operativa.
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatCard label="Eventos" value={String(summary.total)} subtitle="Trazas disponibles para revisión" />
          <StatCard label="Críticos P0" value={String(summary.p0)} subtitle="Incidentes que requieren atención" tone={summary.p0 > 0 ? 'red' : 'green'} />
          <StatCard label="Alertas P1" value={String(summary.p1)} subtitle="Riesgos o degradaciones detectadas" tone={summary.p1 > 0 ? 'amber' : 'green'} />
          <StatCard label="Nodos impactados" value={String(summary.nodeCount)} subtitle={`Última actividad: ${summary.lastAt}`} />
        </div>
      </div>

      <Section
        theme={THEME}
        title="Centro de control"
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
          <input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Buscar por título, detalle o nodo"
            style={{ flex: 1, minWidth: 220, borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none', fontWeight: 800 }}
          >
            <option value="all">Todas las severidades</option>
            <option value="P0">Solo P0</option>
            <option value="P1">Solo P1</option>
            <option value="INFO">Solo info</option>
          </select>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
            {filteredItems.length} eventos en vista
          </div>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Eventos" right={<div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>Ordenados por recencia</div>}>
        {loading ? (
          <ListSkeleton rows={10} />
        ) : filteredItems.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin eventos por ahora.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredItems.map((a) => (
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.88)' }}>{a.title}</div>
                    <SeverityPill severity={a.severity} />
                  </div>
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
