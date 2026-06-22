import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceTopBar from '../../components/serviceState/ServiceTopBar';
import { requestPushPermissionAndSubscribe } from '../../utils/pushNotifications';
import {
  ackNotification,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from '../../utils/notificationsClient';

function formatDayLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const isSameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isSameDay) return 'Hoy';
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatTimeLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function toneToColors(severity) {
  if (severity === 'critical') return { bg: 'rgba(244, 67, 54, 0.14)', border: 'rgba(244, 67, 54, 0.26)', dot: '#F44336' };
  if (severity === 'important') return { bg: 'rgba(236, 104, 25, 0.12)', border: 'rgba(236, 104, 25, 0.28)', dot: '#EC6819' };
  return { bg: 'rgba(144, 189, 211, 0.10)', border: 'rgba(144, 189, 211, 0.22)', dot: '#90BDD3' };
}

function AvisosHubScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pushPermission, setPushPermission] = useState(() => {
    if (typeof window === 'undefined') return 'unsupported';
    if (!('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    setPushPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [listRes, unreadRes] = await Promise.all([fetchNotifications({ limit: 80 }), fetchUnreadCount()]);
        if (!mounted) return;
        setItems(Array.isArray(listRes?.items) ? listRes.items : []);
        setUnread(Number(unreadRes?.unread || 0));
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError(String(e?.message || e || 'Error cargando avisos'));
        setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'important') return items.filter((a) => a?.severity === 'critical' || a?.ackRequired);
    if (filter === 'unread') return items.filter((a) => !a?.readAt);
    return items;
  }, [filter, items]);

  const pushStatusLabel = useMemo(() => {
    if (pushPermission === 'unsupported') return 'No disponible';
    if (pushPermission === 'granted') return 'Activado';
    if (pushPermission === 'denied') return 'Bloqueado';
    return 'Desactivado';
  }, [pushPermission]);

  const pushActionLabel = useMemo(() => {
    if (pushPermission === 'default') return 'Activar';
    if (pushPermission === 'granted') return 'Gestionar';
    if (pushPermission === 'denied') return 'Gestionar';
    return null;
  }, [pushPermission]);

  const handlePushAction = async () => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (window.Notification.permission === 'default') {
      const result = await requestPushPermissionAndSubscribe();
      setPushPermission(result?.permission || window.Notification.permission);
      return;
    }

    window.alert('Para gestionar Push, usa los ajustes de notificaciones del navegador o del dispositivo.');
  };

  const grouped = useMemo(() => {
    const out = new Map();
    for (const a of filtered) {
      const at = a?.createdAt || a?.updatedAt;
      const dayKey = new Date(at).toISOString().slice(0, 10);
      if (!out.has(dayKey)) out.set(dayKey, []);
      out.get(dayKey).push(a);
    }
    return Array.from(out.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayKey, list]) => ({
        dayKey,
        list: list.sort((x, y) => ((x?.createdAt || '') < (y?.createdAt || '') ? 1 : -1)),
      }));
  }, [filtered]);

  const pinned = useMemo(() => items.filter((a) => a?.pinned), [items]);

  const openItem = async (a) => {
    setSelected(a);
    if (!a?.readAt && a?.id) {
      try {
        await markNotificationRead(a.id);
      } catch {
        void 0;
      }
      setUnread((v) => Math.max(0, Number(v || 0) - 1));
      setItems((prev) => prev.map((x) => (x?.id === a.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
  };

  const closeModal = () => setSelected(null);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 1040 }}>
          <ServiceTopBar showBack showHome />

          <div style={{ height: 12 }} />

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>Centro de Avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 4 }}>
                Registro de eventos del servicio
              </div>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 99, background: unread ? '#EC6819' : 'rgba(255,255,255,0.22)' }} />
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: 800 }}>
                {unread ? `${unread} sin leer` : 'Todo al día'}
              </span>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                padding: '9px 12px',
                borderRadius: 999,
                border: filter === 'all' ? '1px solid rgba(236,104,25,0.55)' : '1px solid rgba(255,255,255,0.12)',
                background: filter === 'all' ? 'rgba(236,104,25,0.12)' : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              style={{
                padding: '9px 12px',
                borderRadius: 999,
                border: filter === 'unread' ? '1px solid rgba(236,104,25,0.55)' : '1px solid rgba(255,255,255,0.12)',
                background: filter === 'unread' ? 'rgba(236,104,25,0.12)' : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Sin leer
            </button>
            <button
              type="button"
              onClick={() => setFilter('important')}
              style={{
                padding: '9px 12px',
                borderRadius: 999,
                border: filter === 'important' ? '1px solid rgba(236,104,25,0.55)' : '1px solid rgba(255,255,255,0.12)',
                background: filter === 'important' ? 'rgba(236,104,25,0.12)' : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Importantes
            </button>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase' }}>Push (opcional)</div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, marginTop: 6 }}>{pushStatusLabel}</div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
                  Alertas fuera de la app (si está disponible).
                </div>
              </div>

              {pushActionLabel ? (
                <button
                  type="button"
                  onClick={handlePushAction}
                  style={{
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: pushPermission === 'default' ? '1px solid rgba(236,104,25,0.40)' : '1px solid rgba(255,255,255,0.14)',
                    background: pushPermission === 'default' ? 'rgba(236,104,25,0.16)' : 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pushActionLabel}
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ height: 16 }} />

          {loading ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Cargando avisos…</div>
            </div>
          ) : error ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(244, 67, 54, 0.10)', border: '1px solid rgba(244, 67, 54, 0.26)' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>No se pudieron cargar avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{error}</div>
            </div>
          ) : grouped.length === 0 ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Sin avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>No hay eventos para este filtro.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pinned.length ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Críticos</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {pinned.slice(0, 3).map((a) => {
                      const colors = toneToColors(a?.severity);
                      const isUnread = !a?.readAt;
                      const at = a?.createdAt || a?.updatedAt;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openItem(a)}
                          style={{ width: '100%', textAlign: 'left', padding: 14, background: colors.bg, border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ marginTop: 3, width: 10, height: 10, borderRadius: 99, background: colors.dot }} />
                              <div>
                                <div style={{ color: '#fff', fontSize: 14, fontWeight: isUnread ? 900 : 800, lineHeight: 1.25 }}>{a.title}</div>
                                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{a.body}</div>
                                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 700 }}>{formatTimeLabel(at)}</div>
                                  {a.ackRequired ? (
                                    <>
                                      <div style={{ width: 4, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.25)' }} />
                                      <div style={{ color: '#fff', fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: 'rgba(244, 67, 54, 0.18)', border: `1px solid ${colors.border}` }}>
                                        Requiere acción
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {isUnread ? (
                              <div style={{ minWidth: 74, display: 'flex', justifyContent: 'flex-end' }}>
                                <div style={{ background: 'rgba(236,104,25,0.14)', border: '1px solid rgba(236,104,25,0.28)', color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: 900, padding: '6px 10px', borderRadius: 999 }}>
                                  Nuevo
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {grouped.map(({ dayKey, list }) => (
                <div key={dayKey} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      {formatDayLabel(dayKey)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {list.map((a) => {
                      const colors = toneToColors(a?.severity);
                      const isUnread = !a?.readAt;
                      const at = a?.createdAt || a?.updatedAt;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openItem(a)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: 14,
                            background: colors.bg,
                            border: 'none',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ marginTop: 3, width: 10, height: 10, borderRadius: 99, background: colors.dot }} />
                              <div>
                                <div style={{ color: '#fff', fontSize: 14, fontWeight: isUnread ? 900 : 800, lineHeight: 1.25 }}>
                                  {a.title}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
                                  {a.body}
                                </div>
                                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 700 }}>
                                    {formatTimeLabel(at)}
                                  </div>
                                  {a.ackRequired ? (
                                    <>
                                      <div style={{
                                        color: '#fff',
                                        fontSize: 11,
                                        fontWeight: 900,
                                        padding: '4px 8px',
                                        borderRadius: 999,
                                        background: 'rgba(244, 67, 54, 0.18)',
                                        border: `1px solid ${colors.border}`,
                                      }}>
                                        Requiere acción
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {isUnread ? (
                              <div style={{
                                minWidth: 74,
                                display: 'flex',
                                justifyContent: 'flex-end',
                              }}>
                                <div style={{
                                  background: 'rgba(236,104,25,0.14)',
                                  border: '1px solid rgba(236,104,25,0.28)',
                                  color: 'rgba(255,255,255,0.92)',
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                }}>
                                  Nuevo
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.72)',
              zIndex: 1000,
              padding: 18,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
            onClick={closeModal}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 520,
                background: '#2A2A2A',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.10)',
                padding: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 900 }}>{selected.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>
                    {formatDayLabel(selected.createdAt || selected.updatedAt)} · {formatTimeLabel(selected.createdAt || selected.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Cerrar"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 20,
                    fontWeight: 900,
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ color: 'rgba(255,255,255,0.90)', fontSize: 13, lineHeight: 1.55 }}>
                {selected.body}
              </div>

              <div style={{ height: 16 }} />

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {selected.deepLink ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      navigate(selected.deepLink);
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.92)',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Ver estado
                  </button>
                ) : null}
                {selected.ackRequired ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await ackNotification(selected.id);
                        setItems((prev) => prev.map((x) => (x?.id === selected.id ? { ...x, ackAt: new Date().toISOString(), pinned: false, readAt: x.readAt || new Date().toISOString() } : x)));
                      } catch {
                        void 0;
                      }
                      closeModal();
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: 'none',
                      background: '#EC6819',
                      color: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Entendido
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.92)',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AvisosHubScreen;
