import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { useToast } from '../../../components/Toast';

function Pill({ label, tone }) {
  const colors = {
    draft: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.85)', bd: 'rgba(255,255,255,0.16)' },
    approved: { bg: 'rgba(126,184,212,0.12)', fg: '#7EB8D4', bd: 'rgba(126,184,212,0.35)' },
    executed: { bg: 'rgba(102,187,106,0.12)', fg: '#66BB6A', bd: 'rgba(102,187,106,0.35)' },
    failed: { bg: 'rgba(229,115,115,0.12)', fg: '#E57373', bd: 'rgba(229,115,115,0.35)' },
    manual_required: { bg: 'rgba(232,163,75,0.12)', fg: '#D9A15A', bd: 'rgba(232,163,75,0.35)' },
  };
  const c = colors[String(tone || '').toLowerCase()] || colors.draft;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

export default function AdminGrowthAIContactsScreen() {
  const { THEME } = useOutletContext();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ persona: 'proveedor', channel: 'email', to: '', subject: 'MAQGO', message: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/contact-actions${qs}`, { method: 'GET' }, 15000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(String(e?.message || e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const counts = useMemo(() => {
    const c = { draft: 0, approved: 0, executed: 0, failed: 0, manual_required: 0 };
    for (const it of items) {
      const k = String(it?.status || '').toLowerCase();
      if (k in c) c[k] += 1;
    }
    return c;
  }, [items]);

  const createDraft = useCallback(async () => {
    if (!draft.to.trim() || !draft.message.trim()) {
      toast.show('Completa destino y mensaje', { tone: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const payload = {
        persona: draft.persona,
        channel: draft.channel,
        to: draft.to.trim(),
        subject: draft.subject.trim(),
        message: draft.message.trim(),
        execution_mode: 'manual',
      };
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/contact-actions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        15000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      toast.show('Contacto creado', { tone: 'success' });
      setDraft((d) => ({ ...d, to: '', message: '' }));
      fetchItems();
    } catch (e) {
      toast.show(`Error: ${String(e?.message || e)}`, { tone: 'danger' });
    } finally {
      setCreating(false);
    }
  }, [draft, fetchItems, toast]);

  const approve = useCallback(
    async (id) => {
      try {
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/admin/growth-ai/contact-actions/${id}/approve`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'ok', allow_auto_execute: false }) },
          15000
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
        toast.show('Aprobado', { tone: 'success' });
        fetchItems();
      } catch (e) {
        toast.show(`Error: ${String(e?.message || e)}`, { tone: 'danger' });
      }
    },
    [fetchItems, toast]
  );

  const execute = useCallback(
    async (id) => {
      try {
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/admin/growth-ai/contact-actions/${id}/execute`,
          { method: 'POST' },
          25000
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
        if (data?.result?.status === 'manual_required' && data?.result?.url) {
          window.open(String(data.result.url), '_blank', 'noopener,noreferrer');
        }
        toast.show('Ejecutado', { tone: 'success' });
        fetchItems();
      } catch (e) {
        toast.show(`Error: ${String(e?.message || e)}`, { tone: 'danger' });
      }
    },
    [fetchItems, toast]
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>Contactos</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill label={`Draft ${counts.draft}`} tone="draft" />
          <Pill label={`Approved ${counts.approved}`} tone="approved" />
          <Pill label={`Executed ${counts.executed}`} tone="executed" />
          <Pill label={`Manual ${counts.manual_required}`} tone="manual_required" />
          <Pill label={`Failed ${counts.failed}`} tone="failed" />
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 16,
          border: `1px solid ${THEME.border}`,
          background: THEME.panelBg,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${THEME.border}`,
              color: '#fff',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <option value="">Todos</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="executed">Executed</option>
            <option value="manual_required">Manual required</option>
            <option value="failed">Failed</option>
          </select>

          <button
            type="button"
            onClick={fetchItems}
            className="maqgo-btn-secondary"
            style={{ padding: '10px 12px', borderRadius: 10 }}
            disabled={loading}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        {error ? <div style={{ marginTop: 10, color: '#E57373', fontSize: 13 }}>{error}</div> : null}

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                padding: 12,
                borderRadius: 14,
                border: `1px solid ${THEME.border}`,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {String(it.channel || '').toUpperCase()} → {it.to}
                  </div>
                  <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.35 }}>
                    {it.message}
                  </div>
                </div>
                <Pill label={it.status} tone={it.status} />
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {String(it.status).toLowerCase() === 'draft' ? (
                  <button type="button" className="maqgo-btn-secondary" style={{ padding: '8px 10px', borderRadius: 10 }} onClick={() => approve(it.id)}>
                    Aprobar
                  </button>
                ) : null}
                {String(it.status).toLowerCase() === 'approved' ? (
                  <button type="button" className="maqgo-btn" style={{ padding: '8px 10px', borderRadius: 10, background: '#EC6819' }} onClick={() => execute(it.id)}>
                    Ejecutar
                  </button>
                ) : null}
                {String(it.status).toLowerCase() === 'manual_required' && it.manualUrl ? (
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '8px 10px', borderRadius: 10 }}
                    onClick={() => window.open(String(it.manualUrl), '_blank', 'noopener,noreferrer')}
                  >
                    Abrir link
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && items.length === 0 ? (
            <div style={{ padding: 12, color: THEME.textMuted, fontSize: 13 }}>Sin contactos.</div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 16,
          border: `1px solid ${THEME.border}`,
          background: THEME.panelBg,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 14 }}>Nuevo contacto (draft)</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={draft.persona}
              onChange={(e) => setDraft((d) => ({ ...d, persona: e.target.value }))}
              style={{
                flex: '0 0 160px',
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${THEME.border}`,
                color: '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              <option value="proveedor">Proveedor</option>
              <option value="cliente">Cliente</option>
            </select>
            <select
              value={draft.channel}
              onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value }))}
              style={{
                flex: '0 0 160px',
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${THEME.border}`,
                color: '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp (manual)</option>
              <option value="form">Form (manual)</option>
            </select>
            <input
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              placeholder={draft.channel === 'email' ? 'email@dominio.com' : draft.channel === 'sms' || draft.channel === 'whatsapp' ? '+569XXXXXXXX' : 'https://...'}
              style={{
                flex: '1 1 260px',
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${THEME.border}`,
                color: '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          </div>
          {draft.channel === 'email' ? (
            <input
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder="Asunto"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${THEME.border}`,
                color: '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          ) : null}
          <textarea
            value={draft.message}
            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
            placeholder="Mensaje"
            rows={5}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${THEME.border}`,
              color: '#fff',
              borderRadius: 12,
              padding: '12px 12px',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.35,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={createDraft}
              disabled={creating}
              className="maqgo-btn"
              style={{ padding: '10px 14px', borderRadius: 10, background: '#EC6819' }}
            >
              {creating ? 'Creando…' : 'Crear draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

