import BACKEND_URL, { fetchWithAuth } from './api.js';

const API_BASE = `${BACKEND_URL}/api/notifications`;

export async function fetchNotifications({ limit = 50, cursor = null } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', String(cursor));

  const res = await fetchWithAuth(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('No se pudieron cargar avisos');
  return res.json();
}

export async function fetchUnreadCount() {
  const res = await fetchWithAuth(`${API_BASE}/unread-count`, { method: 'GET' });
  if (!res.ok) throw new Error('No se pudo obtener el conteo de no leídos');
  return res.json();
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

