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

function OutcomeStrip({ expected, observed, learning }) {
  return (
    <div style={{ marginTop: 10, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>Outcome loop</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
        <span style={{ color: 'rgba(255,255,255,0.60)', fontWeight: 900 }}>Esperado:</span> {expected || '—'}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
        <span style={{ color: 'rgba(255,255,255,0.60)', fontWeight: 900 }}>Obtenido:</span> {observed || '—'}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45 }}>
        <span style={{ color: 'rgba(255,255,255,0.60)', fontWeight: 900 }}>Aprendizaje:</span> {learning || '—'}
      </div>
    </div>
  );
}

function ReasonModal({ open, theme, title, placeholder, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!open) setText('');
  }, [open]);
  if (!open) return null;
  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 560px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{ width: '100%', borderRadius: 12, border: `1px solid ${theme.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: '#fff', padding: 12, outline: 'none', fontSize: 13, lineHeight: 1.45, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="maqgo-btn-secondary" style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="maqgo-btn-primary" style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }} disabled={!String(text || '').trim()} onClick={() => onConfirm(text)}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGrowthAIActionsScreen() {
  const { THEME } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [posting, setPosting] = useState(false);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/actions`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar (${res.status})`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudieron cargar acciones.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => String(i.status || '') === 'done').length;
    return { total, done };
  }, [items]);

  const saveField = async (id, kind, text) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/actions/${encodeURIComponent(id)}/${encodeURIComponent(kind)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo guardar (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo guardar.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        theme={THEME}
        title="Acciones"
        right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>{summary.done}/{summary.total} done</div>
            <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10, fontWeight: 900, fontSize: 12 }} onClick={() => void load()}>
              Recargar
            </button>
          </div>
        }
      >
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
          Registro de esperado/obtenido/aprendizaje. El Cerebro mejora por outcomes, no por actividad.
        </div>
        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div> : null}
      </Section>

      <Section theme={THEME} title="Backlog">
        {loading ? (
          <ListSkeleton rows={10} />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin acciones por ahora.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((a) => (
              <div key={a.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBg, borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', fontWeight: 900 }}>{a.status || 'open'}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{a.reason || '—'}</div>
                {a.node_id ? <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Nodo: {a.node_id}</div> : null}
                <OutcomeStrip expected={a.expected} observed={a.observed} learning={a.learning} />
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="maqgo-btn-secondary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => setModal({ id: a.id, kind: 'expected', title: 'Resultado esperado', placeholder: 'Qué esperas conseguir…' })}>
                    Esperado
                  </button>
                  <button type="button" className="maqgo-btn-secondary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => setModal({ id: a.id, kind: 'observed', title: 'Resultado obtenido', placeholder: 'Qué ocurrió realmente…' })}>
                    Obtenido
                  </button>
                  <button type="button" className="maqgo-btn-primary" style={{ padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 12 }} disabled={posting} onClick={() => setModal({ id: a.id, kind: 'learning', title: 'Aprendizaje', placeholder: 'Qué aprendiste y qué cambiaría…' })}>
                    Aprendizaje
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ReasonModal
        open={Boolean(modal)}
        theme={THEME}
        title={modal?.title || ''}
        placeholder={modal?.placeholder || ''}
        onCancel={() => setModal(null)}
        onConfirm={(text) => {
          const m = modal;
          setModal(null);
          if (m?.id && m?.kind) void saveField(m.id, m.kind, text);
        }}
      />
    </div>
  );
}

