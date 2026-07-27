import BACKEND_URL, { fetchWithAuth } from './api.js';

const API_BASE = `${BACKEND_URL}/api/notifications`;
const UNREAD_CACHE_PREFIX = 'maqgo:notifications:unread:';

function unreadCacheKey(audienceRole = 'client') {
  return `${UNREAD_CACHE_PREFIX}${String(audienceRole || 'client').trim().toLowerCase() || 'client'}`;
}

export function readCachedUnreadCount(audienceRole = 'client') {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(unreadCacheKey(audienceRole));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function writeCachedUnreadCount(audienceRole = 'client', unread = 0) {
  if (typeof window === 'undefined') return;
  const next = Number(unread);
  const safe = Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0;
  window.localStorage.setItem(unreadCacheKey(audienceRole), String(safe));
}

export async function fetchNotifications({ limit = 50, cursor = null } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', String(cursor));

  const res = await fetchWithAuth(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('No se pudieron cargar avisos');
  return res.json();
}

export async function fetchUnreadCount(audienceRole = 'client') {
  const res = await fetchWithAuth(`${API_BASE}/unread-count`, { method: 'GET' });
  if (!res.ok) throw new Error('No se pudo obtener el conteo de no leídos');
  const data = await res.json();
  const unread = Number(data?.unread || 0);
  const safeUnread = Number.isFinite(unread) && unread >= 0 ? unread : 0;
  writeCachedUnreadCount(audienceRole, safeUnread);
  return { ...data, unread: safeUnread };
}

export async function markNotificationRead(notificationId) {
  const res = await fetchWithAuth(`${API_BASE}/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });
  if (!res.ok) throw new Error('No se pudo marcar como leído');
  return res.json();
}

export async function ackNotification(notificationId) {
  const res = await fetchWithAuth(`${API_BASE}/${encodeURIComponent(notificationId)}/ack`, { method: 'POST' });
  if (!res.ok) throw new Error('No se pudo confirmar');
  return res.json();
}
