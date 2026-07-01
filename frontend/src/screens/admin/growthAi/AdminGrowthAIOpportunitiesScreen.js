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
  const s = String(status || 'new').toLowerCase();
  const cfg =
    s === 'triaged'
      ? { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' }
      : s === 'discarded'
        ? { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' }
        : { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: 'rgba(255,255,255,0.14)' };
  return (
    <span style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${cfg.br}`, background: cfg.bg, color: cfg.fg, fontSize: 12, fontWeight: 900 }}>
      {s}
    </span>
  );
}

function ReasonModal({ open, theme, title, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  if (!open) return null;
  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 560px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)…"
          rows={4}
          style={{ width: '100%', borderRadius: 12, border: `1px solid ${theme.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: 12, outline: 'none', fontSize: 13, lineHeight: 1.45, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="maqgo-btn-secondary" style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="maqgo-btn-primary" style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }} disabled={!String(reason || '').trim()} onClick={() => onConfirm(reason)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGrowthAIOpportunitiesScreen() {
  const { THEME } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [posting, setPosting] = useState(false);
  const [filter, setFilter] = useState('');
  const [reasonModal, setReasonModal] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/opportunities`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar (${res.status})`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudieron cargar oportunidades.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = String(filter || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.title || ''} ${it.source || ''} ${it.node_id || ''} ${it.category || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  const triage = async (id, status, reason) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/opportunities/${encodeURIComponent(id)}/triage`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo actualizar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo actualizar la oportunidad.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        theme={THEME}
        title="Oportunidades"
        right={
          <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()}>
            Recargar
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por título/fuente/nodo/categoría"
            style={{ flex: 1, minWidth: 260, borderRadius: 12, border: `1px solid ${THEME.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none' }}
          />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{filtered.length} items</div>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Bandeja">
        {loading ? (
          <ListSkeleton rows={10} />
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin oportunidades.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((o) => (
              <div key={o.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{o.title}</div>
                    <StatusPill status={o.status} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{o.detail || '—'}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {o.source ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Fuente: {o.source}</span> : null}
                    {o.node_id ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Nodo: {o.node_id}</span> : null}
                    {o.category ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Cat: {o.category}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => setReasonModal({ id: o.id, status: 'triaged', title: 'Marcar como triaged' })}>
                    Triage
                  </button>
                  <button type="button" className="maqgo-btn-secondary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => setReasonModal({ id: o.id, status: 'discarded', title: 'Descartar' })}>
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ReasonModal
        open={Boolean(reasonModal)}
        theme={THEME}
        title={reasonModal?.title || ''}
        onCancel={() => setReasonModal(null)}
        onConfirm={(reason) => {
          const r = reasonModal;
          setReasonModal(null);
          if (r?.id && r?.status) void triage(r.id, r.status, reason);
        }}
      />
    </div>
  );
}

