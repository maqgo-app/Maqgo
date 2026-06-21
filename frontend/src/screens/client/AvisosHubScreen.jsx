import React, { useEffect, useMemo, useState } from 'react';
import ServiceTopBar from '../../components/serviceState/ServiceTopBar';

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

function toneToColors(tone) {
  if (tone === 'critical') return { bg: 'rgba(244, 67, 54, 0.14)', border: 'rgba(244, 67, 54, 0.26)', dot: '#F44336' };
  if (tone === 'warning') return { bg: 'rgba(255, 193, 7, 0.14)', border: 'rgba(255, 193, 7, 0.26)', dot: '#FFC107' };
  if (tone === 'success') return { bg: 'rgba(76, 175, 80, 0.14)', border: 'rgba(76, 175, 80, 0.26)', dot: '#4CAF50' };
  return { bg: 'rgba(144, 189, 211, 0.10)', border: 'rgba(144, 189, 211, 0.22)', dot: '#90BDD3' };
}

function buildMockAvisos() {
  const now = Date.now();
  return [
    {
      id: 'a-1',
      tone: 'success',
      title: 'Servicio confirmado',
      body: 'Tu servicio quedó confirmado. Revisa el estado del servicio en la app.',
      at: new Date(now - 9 * 60 * 1000).toISOString(),
      actor: 'Sistema',
      unread: true,
    },
    {
      id: 'a-2',
      tone: 'info',
      title: 'Operador asignado',
      body: 'Se asignó un operador a tu servicio. Verifica RUT y patente en portería.',
      at: new Date(now - 7 * 60 * 1000).toISOString(),
      actor: 'Sistema',
      unread: true,
    },
    {
      id: 'a-3',
      tone: 'warning',
      title: 'Demora reportada',
      body: 'El operador reportó una demora/incidente. El evento quedó registrado en Avisos.',
      at: new Date(now - 4 * 60 * 1000).toISOString(),
      actor: 'Operador',
      unread: false,
    },
    {
      id: 'a-4',
      tone: 'info',
      title: 'Operador en camino',
      body: 'Revisa el seguimiento en la pantalla del servicio.',
      at: new Date(now - 2 * 60 * 1000).toISOString(),
      actor: 'Sistema',
      unread: false,
    },
    {
      id: 'a-5',
      tone: 'critical',
      title: 'Acción requerida',
      body: 'Se requiere confirmación en portería para autorizar el ingreso. Este aviso requiere atención.',
      at: new Date(now - 40 * 60 * 1000).toISOString(),
      actor: 'Sistema',
      unread: true,
      requiresAck: true,
    },
    {
      id: 'a-6',
      tone: 'info',
      title: 'Servicio finalizado',
      body: 'El servicio se marcó como finalizado. Ya puedes ver el resumen y evaluar.',
      at: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
      actor: 'Sistema',
      unread: false,
    },
  ];
}

function AvisosHubScreen() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pushPermission, setPushPermission] = useState(() => {
    if (typeof window === 'undefined') return 'unsupported';
    if (!('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [mockUnread, setMockUnread] = useState(() => {
    const list = buildMockAvisos();
    return new Set(list.filter((a) => a.unread).map((a) => a.id));
  });
  const items = useMemo(() => buildMockAvisos(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    setPushPermission(window.Notification.permission);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'important') return items.filter((a) => a.tone === 'critical' || a.requiresAck);
    if (filter === 'unread') return items.filter((a) => mockUnread.has(a.id));
    return items;
  }, [filter, items, mockUnread]);

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
      const result = await window.Notification.requestPermission();
      setPushPermission(result);
      return;
    }

    window.alert('Para gestionar Push, usa los ajustes de notificaciones del navegador o del dispositivo.');
  };

  const grouped = useMemo(() => {
    const out = new Map();
    for (const a of filtered) {
      const dayKey = new Date(a.at).toISOString().slice(0, 10);
      if (!out.has(dayKey)) out.set(dayKey, []);
      out.get(dayKey).push(a);
    }
    return Array.from(out.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayKey, list]) => ({ dayKey, list: list.sort((x, y) => (x.at < y.at ? 1 : -1)) }));
  }, [filtered]);

  const unreadCount = useMemo(() => {
    let c = 0;
    for (const a of items) if (mockUnread.has(a.id)) c += 1;
    return c;
  }, [items, mockUnread]);

  const markAsRead = (id) => {
    setMockUnread((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const openItem = (a) => {
    setSelected(a);
    markAsRead(a.id);
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
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>Avisos</div>
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
              <span style={{ width: 8, height: 8, borderRadius: 99, background: unreadCount ? '#EC6819' : 'rgba(255,255,255,0.22)' }} />
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: 800 }}>
                {unreadCount ? `${unreadCount} sin leer` : 'Todo al día'}
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

          {grouped.length === 0 ? (
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Sin avisos</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>No hay eventos para este filtro.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {grouped.map(({ dayKey, list }) => (
                <div key={dayKey} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      {formatDayLabel(dayKey)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {list.map((a) => {
                      const colors = toneToColors(a.tone);
                      const isUnread = mockUnread.has(a.id);
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
                                    {formatTimeLabel(a.at)}
                                  </div>
                                  <div style={{ width: 4, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.25)' }} />
                                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 700 }}>{a.actor}</div>
                                  {a.requiresAck ? (
                                    <>
                                      <div style={{ width: 4, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.25)' }} />
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
                    {formatDayLabel(selected.at)} · {formatTimeLabel(selected.at)} · {selected.actor}
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
                {selected.requiresAck ? (
                  <button
                    type="button"
                    onClick={closeModal}
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
