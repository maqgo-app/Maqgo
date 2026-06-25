import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestPushPermissionAndSubscribe, unsubscribePushNotifications } from '../../utils/pushNotifications';
import BACKEND_URL from '../../utils/api';
import {
  ackNotification,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from '../../utils/notificationsClient';

function formatTimeLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function isTodayIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function formatFullDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = months[d.getMonth()] || '';
  const yyyy = d.getFullYear();
  return `${dd} ${mm} ${yyyy} · ${formatTimeLabel(iso)}`;
}

function formatModalTimestamp(iso) {
  if (!iso) return '';
  if (isTodayIso(iso)) return `Hoy · ${formatTimeLabel(iso)}`;
  return formatFullDateTime(iso);
}

function toneToColors(severity) {
  if (severity === 'critical') return { bg: 'rgba(236, 104, 25, 0.14)', border: 'rgba(236, 104, 25, 0.30)', dot: '#EC6819' };
  if (severity === 'important') return { bg: 'rgba(236, 104, 25, 0.12)', border: 'rgba(236, 104, 25, 0.28)', dot: '#EC6819' };
  return { bg: 'rgba(144, 189, 211, 0.10)', border: 'rgba(144, 189, 211, 0.22)', dot: '#90BDD3' };
}

function AvisosHubScreen({ audienceRole = 'client' }) {
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
  const [pushBusy, setPushBusy] = useState(false);
  const [pushBackend, setPushBackend] = useState({ checked: false, enabled: undefined, publicKey: undefined });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    setPushPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPushConfig = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/push/vapid-public-key`);
        const json = await res.json();
        if (cancelled) return;
        setPushBackend({
          checked: true,
          enabled: Boolean(json?.enabled),
          publicKey: json?.publicKey || null,
        });
      } catch {
        if (cancelled) return;
        setPushBackend({ checked: true, enabled: undefined, publicKey: undefined });
      }
    };
    loadPushConfig();
    return () => {
      cancelled = true;
    };
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

  const pushBackendAvailable = pushBackend?.checked && pushBackend?.enabled === true && Boolean(pushBackend?.publicKey);
  const pushBackendUnavailable = pushBackend?.checked && (pushBackend?.enabled === false || pushBackend?.publicKey === null);
  const pushEnabled = pushBackendAvailable ? pushPermission === 'granted' : pushPermission === 'granted';

  const headerCardStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: '12px 14px',
  };

  const headerTitleStyle = {
    color: '#fff',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const headerSubtitleStyle = {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 1.25,
  };

  const onTogglePush = async () => {
    if (pushBusy) return;
    if (pushBackendUnavailable) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribePushNotifications();
        setPushPermission(window.Notification.permission);
        return;
      }

      const result = await requestPushPermissionAndSubscribe();
      if (result?.denied) setPushPermission('denied');
      else setPushPermission(window.Notification.permission);
    } finally {
      setPushBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const todayItems = [];
    const olderItems = [];
    for (const a of filtered) {
      const at = a?.createdAt || a?.updatedAt;
      if (isTodayIso(at)) todayItems.push(a);
      else olderItems.push(a);
    }
    const sortDesc = (x, y) => ((x?.createdAt || '') < (y?.createdAt || '') ? 1 : -1);
    return {
      today: todayItems.sort(sortDesc),
      older: olderItems.sort(sortDesc),
    };
  }, [filtered]);

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

  const headerSubtitle = useMemo(() => {
    if (audienceRole === 'provider') return 'Actualizaciones de tu operación, en un solo lugar';
    if (audienceRole === 'operator') return 'Actualizaciones de tu servicio, en un solo lugar';
    return 'Actualizaciones de tu servicio, en un solo lugar';
  }, [audienceRole]);

  return (
    <div className={audienceRole === 'client' ? 'maqgo-app maqgo-client-funnel' : 'maqgo-app'}>
      <div
        className="maqgo-screen"
        style={{
          padding: '16px 24px 24px',
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="w-full mx-auto" style={{ maxWidth: 1040 }}>
          <div style={headerCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={headerTitleStyle}>Centro de Avisos</div>
              {unread > 0 ? (
                <div
                  style={{
                    minWidth: 24,
                    height: 24,
                    padding: '0 8px',
                    borderRadius: 999,
                    background: '#EC6819',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(236, 104, 25, 0.28)',
                  }}
                >
                  {unread > 99 ? '99+' : unread}
                </div>
              ) : null}
            </div>

            <div style={headerSubtitleStyle}>{headerSubtitle}</div>
          </div>

          <div style={{ height: 10 }} />

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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              marginTop: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>Notificaciones Push</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 4, lineHeight: 1.3 }}>
                {pushBackendUnavailable
                  ? 'No disponible por ahora.'
                  : 'Recibe avisos importantes incluso cuando la app está cerrada. Sin Push, los avisos fuera de la app quedan limitados a casos críticos.'}
              </div>
            </div>

            {pushBackendUnavailable ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.70)',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '8px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.06)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                No disponible
              </div>
            ) : (
              <button
                type="button"
                onClick={onTogglePush}
                disabled={pushBusy || pushPermission === 'unsupported'}
                aria-label={pushEnabled ? 'Desactivar Push' : 'Activar Push'}
                style={{
                  position: 'relative',
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  border: pushEnabled ? '1px solid rgba(236,104,25,0.55)' : '1px solid rgba(255,255,255,0.14)',
                  background: pushEnabled ? 'rgba(236,104,25,0.22)' : 'rgba(255,255,255,0.06)',
                  cursor:
                    pushBusy || pushPermission === 'unsupported' ? 'not-allowed' : 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: pushEnabled ? 24 : 3,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: '#fff',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                    transition: 'left 180ms ease',
                  }}
                />
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Cargando avisos…</div>
            </div>
          ) : error ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(244, 67, 54, 0.10)', border: '1px solid rgba(244, 67, 54, 0.26)' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>No se pudieron cargar avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{error}</div>
            </div>
          ) : grouped.today.length === 0 && grouped.older.length === 0 ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Sin avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>No hay eventos para este filtro.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {grouped.today.length ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>HOY</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {grouped.today.map((a, idx) => {
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
                            borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                            cursor: 'pointer',
                          }}
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
                                    <div style={{ color: '#fff', fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                                      Requiere acción
                                    </div>
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

              {grouped.older.length ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>ANTERIORES</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {grouped.older.map((a, idx) => {
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
                            borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ marginTop: 3, width: 10, height: 10, borderRadius: 99, background: colors.dot }} />
                              <div>
                                <div style={{ color: '#fff', fontSize: 14, fontWeight: isUnread ? 900 : 800, lineHeight: 1.25 }}>{a.title}</div>
                                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{a.body}</div>
                                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 700 }}>{formatFullDateTime(at)}</div>
                                  {a.ackRequired ? (
                                    <div style={{ color: '#fff', fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                                      Requiere acción
                                    </div>
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
                    {formatModalTimestamp(selected.createdAt || selected.updatedAt)}
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
