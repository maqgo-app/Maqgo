import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../../utils/api';
import { friendlyFetchError } from '../../../utils/fetchErrors';
import ListSkeleton from '../../../components/ListSkeleton.jsx';
function toneToBadge(tone) {
  if (tone === 'green') return { fg: '#CFF3D1', bg: 'rgba(102,187,106,0.14)', br: 'rgba(102,187,106,0.28)' };
  if (tone === 'amber') return { fg: '#FFE3B8', bg: 'rgba(217,161,90,0.14)', br: 'rgba(217,161,90,0.28)' };
  if (tone === 'red') return { fg: '#FFD2D2', bg: 'rgba(229,115,115,0.14)', br: 'rgba(229,115,115,0.28)' };
  return { fg: 'rgba(255,255,255,0.82)', bg: 'rgba(255,255,255,0.08)', br: 'rgba(255,255,255,0.14)' };
}
function Pill({ label, tone }) {
  const cfg = toneToBadge(tone);
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
function Section({ theme, title, children, right }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, background: theme.panelBg, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function ReasonModal({ open, theme, title, confirmLabel, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  if (!open) return null;
  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 560px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45, marginBottom: 12 }}>
          Registra el motivo. Esto queda en auditoría y mejora el aprendizaje.
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)…"
          rows={4}
          style={{
            width: '100%',
            borderRadius: 12,
            border: `1px solid ${theme.borderStrong}`,
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            padding: 12,
            outline: 'none',
            fontSize: 13,
            lineHeight: 1.45,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="maqgo-btn-secondary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }}
            onClick={() => onConfirm(reason)}
            disabled={!String(reason || '').trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkGoLiveModal({ open, theme, title, machineKeys, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!open) {
      setReason('');
      setSelected({});
      return;
    }
    const next = {};
    for (const k of machineKeys || []) next[k] = true;
    setSelected(next);
  }, [open, machineKeys]);

  if (!open) return null;

  const keys = Array.isArray(machineKeys) ? machineKeys : [];
  const selectedKeys = keys.filter((k) => Boolean(selected[k]));

  return (
    <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
      <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 660px)' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '0 0 10px' }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45, marginBottom: 12 }}>
          Selecciona qué maquinarias pasan a <span style={{ color: '#CFF3D1', fontWeight: 900 }}>LIVE</span>.
        </div>

        <div
          style={{
            border: `1px solid ${theme.border}`,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 10,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {keys.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>No hay maquinarias LISTA.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {keys.map((k) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[k])}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [k]: e.target.checked }))}
                  />
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{k}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.45 }}>Motivo:</div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)…"
          rows={3}
          style={{
            width: '100%',
            borderRadius: 12,
            border: `1px solid ${theme.borderStrong}`,
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            padding: 12,
            outline: 'none',
            fontSize: 13,
            lineHeight: 1.45,
            resize: 'vertical',
            marginTop: 8,
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="maqgo-btn-secondary" style={{ flex: 1, padding: '12px 14px', borderRadius: 12 }} onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, fontWeight: 900 }}
            onClick={() => onConfirm({ reason, machine_keys: selectedKeys })}
            disabled={!String(reason || '').trim() || selectedKeys.length === 0}
          >
            Aprobar {selectedKeys.length}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGrowthAINodeScreen() {
  const { THEME } = useOutletContext();
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [posting, setPosting] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}`, { method: 'GET' }, 15000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo cargar Nodo (${res.status})`);
      setData(payload);
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo cargar el nodo.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const node = data?.node || null;
  const recommendations = useMemo(() => (Array.isArray(data?.recommendations) ? data.recommendations : []), [data]);
  const gaps = useMemo(() => (Array.isArray(data?.gaps) ? data.gaps : []), [data]);
  const risks = useMemo(() => (Array.isArray(data?.risks) ? data.risks : []), [data]);
  const readyByMachine = useMemo(() => (Array.isArray(data?.node?.ready_by_machine) ? data.node.ready_by_machine : []), [data]);
  const minSupplyPerMachine = useMemo(() => Number(data?.node?.min_supply_per_machine || 0) || 0, [data]);

  const listMachineKeys = useMemo(() => {
    return readyByMachine
      .filter((m) => !Boolean(m?.is_live))
      .map((m) => String(m?.machine_key || '').trim())
      .filter(Boolean);
  }, [readyByMachine]);

  const liveMachineCount = useMemo(() => readyByMachine.filter((m) => Boolean(m?.is_live)).length, [readyByMachine]);

  const postDecision = async (kind, reason) => {
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/decisions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, reason }),
        },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo registrar decisión (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo registrar la decisión.'));
    } finally {
      setPosting(false);
    }
  };

  const setGoLiveMachine = async ({ machineKey, enable, reason }) => {
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/go-live-machine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine_key: machineKey, enable, reason: reason || '' }),
        },
        15000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo actualizar GO LIVE (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo actualizar GO LIVE.'));
    } finally {
      setPosting(false);
    }
  };

  const approveBulk = async ({ machine_keys, reason }) => {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/growth-ai/nodes/${encodeURIComponent(nodeId)}/go-live-machines`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine_keys, enable: true, reason }),
        },
        20000
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `No se pudo aprobar GO LIVE (${res.status})`);
      await load();
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo aprobar GO LIVE.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          className="maqgo-btn-secondary"
          style={{ padding: '10px 12px', borderRadius: 12 }}
          onClick={() => navigate('/admin/growth-ai')}
        >
          Volver
        </button>
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: 800 }}>
          {nodeId}
        </div>
      </div>

      <Section
        theme={THEME}
        title={node?.name || node?.comuna || 'Nodo'}
        right={<Pill label={node?.traffic_light || '—'} tone={node?.traffic_tone || 'neutral'} />}
      >
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <div style={{ color: '#E57373', fontSize: 13, lineHeight: 1.45 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {node?.region || node?.comuna ? (
                <div style={{ marginBottom: 10, color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900 }}>
                  {(node?.region ? `${node.region} · ` : '') + (node?.comuna || '')}
                </div>
              ) : null}
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900 }}>Estado</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900 }}>{node?.status || '—'}</div>
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900 }}>
                  ZOC
                </summary>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.35 }}>
                  {node?.zoc_summary || 'Sin ZOC definida'}
                </div>
              </details>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900 }}>Decisión</div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 900 }}>
                  Cambiar
                </summary>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                    disabled={posting}
                    onClick={() => setReasonModal({ kind: 'pilot', title: 'Habilitar piloto', label: 'Registrar piloto' })}
                  >
                    Piloto
                  </button>
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                    disabled={posting}
                    onClick={() => setReasonModal({ kind: 'launch', title: 'Lanzar', label: 'Registrar lanzamiento' })}
                  >
                    Lanzar
                  </button>
                  <button
                    type="button"
                    className="maqgo-btn-secondary"
                    style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 800 }}
                    disabled={posting}
                    onClick={() => setReasonModal({ kind: 'pause', title: 'Pausar demanda', label: 'Registrar pausa' })}
                  >
                    Pausar
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.35 }}>
                  Queda en auditoría.
                </div>
              </details>
            </div>
          </div>
        )}
      </Section>

      <Section
        theme={THEME}
        title="GO LIVE por maquinaria"
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {minSupplyPerMachine ? <Pill label={`Mínimo ${minSupplyPerMachine}`} tone="neutral" /> : null}
            <Pill label={`LISTA ${listMachineKeys.length}`} tone={listMachineKeys.length ? 'amber' : 'neutral'} />
            <Pill label={`LIVE ${liveMachineCount}`} tone={liveMachineCount ? 'green' : 'neutral'} />
          </div>
        }
      >
        {loading ? (
          <ListSkeleton rows={4} />
        ) : readyByMachine.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
            Aún no hay maquinarias listas para GO LIVE en esta comuna.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {listMachineKeys.length ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Aprobar en bloque para abrir demanda controlada.</div>
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                  disabled={posting}
                  onClick={() => setBulkModal({ title: 'Aprobar GO LIVE (bulk)', machineKeys: listMachineKeys })}
                >
                  Aprobar LISTAS ({listMachineKeys.length})
                </button>
              </div>
            ) : null}
            {readyByMachine.map((m) => {
              const machineKey = String(m.machine_key || '').trim();
              const units = Number(m.units || 0) || 0;
              const isLive = Boolean(m.is_live);
              return (
                <div
                  key={machineKey}
                  style={{
                    border: `1px solid ${THEME.border}`,
                    background: THEME.panelBgSoft,
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{machineKey}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{units} activa(s) detectada(s)</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Pill label={isLive ? 'LIVE' : 'LISTA'} tone={isLive ? 'green' : 'amber'} />
                    {isLive ? (
                      <button
                        type="button"
                        className="maqgo-btn-secondary"
                        style={{ padding: '10px 12px', borderRadius: 12 }}
                        disabled={posting}
                        onClick={() =>
                          setReasonModal({
                            kind: 'go_live_off',
                            machineKey,
                            title: `Remover GO LIVE: ${machineKey}`,
                            label: 'Remover',
                          })
                        }
                      >
                        Remover
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="maqgo-btn-secondary"
                        style={{ padding: '10px 12px', borderRadius: 12, fontWeight: 900 }}
                        disabled={posting}
                        onClick={() =>
                          setReasonModal({
                            kind: 'go_live_on',
                            machineKey,
                            title: `Aprobar GO LIVE: ${machineKey}`,
                            label: 'Aprobar',
                          })
                        }
                      >
                        Aprobar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 900 }}>
                ¿Qué significa LISTA/LIVE?
              </summary>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.35 }}>
                LISTA = cumple el mínimo de oferta activa detectada. LIVE = aprobado por Admin para abrir demanda y mostrar al cliente.
              </div>
            </details>
          </div>
        )}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Section theme={THEME} title="Brechas">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : gaps.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin brechas registradas.</div>
          ) : (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)' }}>{`Ver ${gaps.length}`}</summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gaps.slice(0, 8).map((g) => (
                  <div key={g.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBgSoft, borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{g.title}</div>
                    {g.detail ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35 }}>{g.detail}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>

        <Section theme={THEME} title="Riesgos">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : risks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin riesgos P0 activos.</div>
          ) : (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.78)' }}>{`Ver ${risks.length}`}</summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {risks.slice(0, 8).map((r) => (
                  <div key={r.id} style={{ border: `1px solid rgba(229,115,115,0.25)`, background: 'rgba(229,115,115,0.10)', borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{r.title}</div>
                    {r.detail ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.35 }}>{r.detail}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>
      </div>

      <Section theme={THEME} title="Recomendaciones">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : recommendations.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Sin recomendaciones por ahora.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {recommendations.slice(0, 8).map((rec) => (
              <div key={rec.id} style={{ border: `1px solid ${THEME.border}`, background: THEME.panelBgSoft, borderRadius: 16, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>{rec.title}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>{rec.summary}</div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rec.impact ? <Pill label={`Impacto: ${rec.impact}`} tone="neutral" /> : null}
                  {rec.effort ? <Pill label={`Esfuerzo: ${rec.effort}`} tone="neutral" /> : null}
                  {rec.confidence ? <Pill label={`Confianza: ${rec.confidence}`} tone="neutral" /> : null}
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
        confirmLabel={reasonModal?.label || 'Registrar'}
        onCancel={() => setReasonModal(null)}
        onConfirm={(reason) => {
          const kind = reasonModal?.kind;
          const machineKey = reasonModal?.machineKey;
          setReasonModal(null);
          if (kind === 'go_live_on' && machineKey) void setGoLiveMachine({ machineKey, enable: true, reason });
          else if (kind === 'go_live_off' && machineKey) void setGoLiveMachine({ machineKey, enable: false, reason });
          else if (kind) void postDecision(kind, reason);
        }}
      />

      <BulkGoLiveModal
        open={Boolean(bulkModal)}
        theme={THEME}
        title={bulkModal?.title || ''}
        machineKeys={bulkModal?.machineKeys || []}
        onCancel={() => setBulkModal(null)}
        onConfirm={({ reason, machine_keys }) => {
          setBulkModal(null);
          void approveBulk({ machine_keys, reason });
        }}
      />
    </div>
  );
}
