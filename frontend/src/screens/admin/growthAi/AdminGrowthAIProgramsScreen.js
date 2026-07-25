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

function StatusPill({ status }) {
  const s = String(status || 'proposed').toLowerCase();
  const label = s === 'active' ? 'Activo' : s === 'paused' ? 'Pausado' : s === 'closed' ? 'Cerrado' : 'Propuesto';
  const cfg =
    s === 'active'
      ? { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' }
      : s === 'paused'
        ? { fg: '#FFE3B8', bg: 'rgba(217,161,90,0.14)', br: 'rgba(217,161,90,0.28)' }
        : s === 'closed'
          ? { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' }
          : { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: 'rgba(255,255,255,0.14)' };
  return (
    <span style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${cfg.br}`, background: cfg.bg, color: cfg.fg, fontSize: 12, fontWeight: 900 }}>
      {label}
    </span>
  );
}

export default function AdminGrowthAIProgramsScreen() {
  const { THEME } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState({ title: '', objective: '', node_id: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/programs`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar (${res.status})`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudieron cargar Programas.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canCreate = useMemo(() => String(draft.title || '').trim().length >= 3, [draft.title]);
  const summary = useMemo(
    () => ({
      proposed: items.filter((item) => String(item?.status || '').toLowerCase() === 'proposed').length,
      active: items.filter((item) => String(item?.status || '').toLowerCase() === 'active').length,
      paused: items.filter((item) => String(item?.status || '').toLowerCase() === 'paused').length,
      closed: items.filter((item) => String(item?.status || '').toLowerCase() === 'closed').length,
    }),
    [items]
  );

  const create = async () => {
    if (!canCreate || posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/programs`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo crear (${res.status})`);
      setDraft({ title: '', objective: '', node_id: '' });
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo crear el Programa.'));
    } finally {
      setPosting(false);
    }
  };

  const transition = async (id, action) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/programs/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Cambio de estado' }) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo actualizar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo actualizar el Programa.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        theme={THEME}
        title="Programas"
        right={
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()}>
            Recargar
          </button>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div style={{ borderRadius: 14, border: `1px solid ${THEME.border}`, background: 'rgba(255,255,255,0.04)', padding: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>Propuestos</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>{summary.proposed}</div>
          </div>
          <div style={{ borderRadius: 14, border: '1px solid rgba(102,187,106,0.22)', background: 'rgba(102,187,106,0.10)', padding: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>Activos</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>{summary.active}</div>
          </div>
          <div style={{ borderRadius: 14, border: '1px solid rgba(217,161,90,0.22)', background: 'rgba(217,161,90,0.10)', padding: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>Pausados</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>{summary.paused}</div>
          </div>
          <div style={{ borderRadius: 14, border: '1px solid rgba(229,115,115,0.22)', background: 'rgba(229,115,115,0.10)', padding: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>Cerrados</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>{summary.closed}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Título (ej. Abrir Lampa)"
            style={{ borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <input
            value={draft.node_id}
            onChange={(e) => setDraft((d) => ({ ...d, node_id: e.target.value }))}
            placeholder="Nodo (opcional)"
            style={{ borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <input
            value={draft.objective}
            onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))}
            placeholder="Objetivo (opcional)"
            style={{ borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <button type="button" className="maqgo-btn-primary" style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }} disabled={!canCreate || posting} onClick={() => void create()}>
            Crear
          </button>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Portafolio" right={<div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>{items.length} programas</div>}>
        {loading ? (
          <ListSkeleton rows={8} />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>No hay Programas todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{p.title}</div>
                    <StatusPill status={p.status} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
                    {p.objective || '—'}
                  </div>
                  {p.node_id ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>Nodo: {p.node_id}</div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {p.status === 'proposed' ? (
                    <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void transition(p.id, 'approve')}>
                      Aprobar
                    </button>
                  ) : null}
                  {p.status === 'active' ? (
                    <button type="button" className="maqgo-btn-secondary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void transition(p.id, 'pause')}>
                      Pausar
                    </button>
                  ) : null}
                  {p.status === 'paused' ? (
                    <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void transition(p.id, 'resume')}>
                      Reanudar
                    </button>
                  ) : null}
                  {p.status !== 'closed' ? (
                    <button type="button" className="maqgo-btn-secondary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => void transition(p.id, 'close')}>
                      Cerrar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
