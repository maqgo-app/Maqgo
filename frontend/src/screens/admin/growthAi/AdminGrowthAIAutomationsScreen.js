import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';

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

function Toggle({ enabled }) {
  return (
    <span style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${enabled ? 'rgba(102,187,106,0.28)' : 'rgba(255,255,255,0.14)'}`, background: enabled ? 'rgba(102,187,106,0.14)' : 'rgba(255,255,255,0.08)', color: enabled ? '#CFF3D1' : 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 900 }}>
      {enabled ? 'Activa' : 'Pausada'}
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
  const [filter, setFilter] = useState('all');

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
    const paused = Math.max(0, items.length - active);
    const withRun = items.filter((i) => !!i.last_run_at).length;
    return { total: items.length, active, paused, withRun };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'active') return items.filter((item) => !!item.enabled);
    if (filter === 'paused') return items.filter((item) => !item.enabled);
    return items;
  }, [filter, items]);

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
          Orquestación comercial
        </div>
        <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Playbooks autonomos que aceleran expansion sin perder control operativo.</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5, maxWidth: 760 }}>
          Esta capa define que playbooks del motor comercial estan activos, cuanto del motor esta corriendo y donde conviene intervenir manualmente.
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatCard label="Playbooks" value={String(summary.total)} subtitle="Capacidades activables de Growth AI" />
          <StatCard label="Activas" value={String(summary.active)} subtitle="Rutinas habilitadas hoy" tone={summary.active > 0 ? 'green' : 'amber'} />
          <StatCard label="Pausadas" value={String(summary.paused)} subtitle="Rutinas detenidas o en espera" tone={summary.paused > 0 ? 'amber' : 'green'} />
          <StatCard label="Con actividad" value={String(summary.withRun)} subtitle={status?.summary || 'Sin estado reportado'} />
        </div>
      </div>

      <Section
        theme={THEME}
        title="Centro de control"
        right={
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()}>
            Recargar
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none', fontWeight: 800 }}
          >
            <option value="all">Todas</option>
            <option value="active">Solo activas</option>
            <option value="paused">Solo pausadas</option>
          </select>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
            {filteredItems.length} automatizacion{filteredItems.length === 1 ? '' : 'es'} en vista
          </div>
          {status?.summary ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{status.summary}</div> : null}
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Portafolio autonomo">
        {loading ? (
          <ListSkeleton rows={10} />
        ) : filteredItems.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin playbooks configurados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredItems.map((a) => (
              <div key={a.id} style={{ border: `1px solid ${a.enabled ? 'rgba(102,187,106,0.20)' : THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{a.title}</div>
                    <Toggle enabled={Boolean(a.enabled)} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{a.description || 'Sin descripcion operativa.'}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME.border}`, fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
                      Flujo {a.id}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${a.last_run_at ? 'rgba(102,187,106,0.22)' : THEME.border}`, fontSize: 11, color: a.last_run_at ? '#CFF3D1' : 'rgba(255,255,255,0.70)', fontWeight: 800, background: a.last_run_at ? 'rgba(102,187,106,0.10)' : 'transparent' }}>
                      {a.last_run_at ? 'Con actividad' : 'Sin actividad'}
                    </span>
                  </div>
                  {a.last_run_at ? <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Ultima actividad: {a.last_run_at}</div> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void setEnabled(a.id, !a.enabled)}>
                    {a.enabled ? 'Pausar' : 'Activar'}
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
