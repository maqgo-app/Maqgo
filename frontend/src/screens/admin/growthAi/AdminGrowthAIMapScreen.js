import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

function toneToPill(tone) {
  if (tone === 'green') return { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' };
  if (tone === 'amber') return { fg: '#FFE3B8', bg: 'rgba(217,161,90,0.14)', br: 'rgba(217,161,90,0.28)' };
  if (tone === 'red') return { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' };
  return { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: 'rgba(255,255,255,0.14)' };
}

function Pill({ label, tone }) {
  const cfg = toneToPill(tone);
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
        fontWeight: 900,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function AdminGrowthAIMapScreen() {
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
        const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/map`, { method: 'GET' }, 15000);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar Mapa (${res.status})`);
        if (!mounted) return;
        setData(payload);
      } catch (e) {
        if (!mounted) return;
        setError(friendlyFetchError(e, 'No se pudo cargar el mapa.'));
        setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const nodes = useMemo(() => {
    const items = Array.isArray(data?.nodes) ? data.nodes : [];
    return items;
  }, [data]);

  const summary = useMemo(() => {
    const total = nodes.length;
    const green = nodes.filter((item) => String(item?.traffic_tone || '') === 'green').length;
    const amber = nodes.filter((item) => String(item?.traffic_tone || '') === 'amber').length;
    const red = nodes.filter((item) => String(item?.traffic_tone || '') === 'red').length;
    return { total, green, amber, red };
  }, [nodes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          border: `1px solid ${THEME.border}`,
          background: 'linear-gradient(135deg, rgba(236,104,25,0.10), rgba(15,23,42,0.96) 42%, rgba(143,179,201,0.08))',
          borderRadius: 18,
          padding: 18,
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.56)', fontWeight: 900 }}>
          Mapa comercial
        </div>
        <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Orden de apertura por comuna para construir oferta y activar mercado.</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5 }}>
          Esta vista muestra la secuencia de expansión priorizada por Growth AI para decidir dónde concentrar prospección, preparación y GO LIVE.
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill label={`Nodos ${summary.total}`} tone="neutral" />
          <Pill label={`Listos ${summary.amber}`} tone={summary.amber ? 'amber' : 'neutral'} />
          <Pill label={`Abiertos ${summary.green}`} tone={summary.green ? 'green' : 'neutral'} />
          <Pill label={`En riesgo ${summary.red}`} tone={summary.red ? 'red' : 'neutral'} />
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${THEME.border}`,
          background: THEME.panelBg,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Secuencia de expansión</div>
          {data?.next_suggested?.node_id ? (
            <button
              type="button"
              className="maqgo-btn-primary"
              style={{ padding: '9px 12px', borderRadius: 12, fontWeight: 900, fontSize: 12 }}
              onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(data.next_suggested.node_id)}`)}
            >
              Siguiente sugerido
            </button>
          ) : null}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
          Secuencia priorizada por comuna objetivo, lista para bajar a ejecución comercial con la misma lógica premium del Admin.
        </div>
      </div>

      {loading ? (
        <div style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 16 }}>
          <ListSkeleton rows={6} />
        </div>
      ) : error ? (
        <div style={{ border: `1px solid rgba(229,115,115,0.25)`, background: 'rgba(229,115,115,0.10)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>No se pudo cargar</div>
          <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.45 }}>{error}</div>
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
            No hay nodos configurados todavía. Define cobertura inicial para que el mapa comercial pueda ordenar la expansión.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {nodes.map((n, idx) => (
            <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 10, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>
                {idx + 1}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/admin/growth-ai/nodes/${encodeURIComponent(n.id)}`)}
                style={{
                  textAlign: 'left',
                  borderRadius: 16,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelBg,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>{n.name || n.comuna || 'Nodo'}</div>
                  {n.region || n.comuna ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
                      {(n.region ? `${n.region} · ` : '') + (n.comuna || '')}
                    </div>
                  ) : null}
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
                    {n.subtitle || n.primary_gap || '—'}
                  </div>
                </div>
                <Pill label={n.traffic_light || '—'} tone={n.traffic_tone || 'neutral'} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
