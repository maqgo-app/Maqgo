import BACKEND_URL, { fetchWithAuth } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getVapidPublicKey() {
  const res = await fetch(`${BACKEND_URL}/api/push/vapid-public-key`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.enabled || !data?.publicKey) return null;
  return String(data.publicKey);
}

export async function ensurePushSubscribedIfGranted() {
  if (typeof window === 'undefined') return { success: false, skipped: true };
  if (!('serviceWorker' in navigator)) return { success: false, skipped: true };
  if (!('PushManager' in window)) return { success: false, skipped: true };
  if (typeof Notification === 'undefined') return { success: false, skipped: true };
  if (Notification.permission !== 'granted') return { success: false, skipped: true };

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return { success: false, skipped: true };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const payload = { subscription: sub.toJSON() };
  const r = await fetchWithAuth(`${BACKEND_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirectOn401: false,
  });
  if (!r.ok) return { success: false, skipped: false };
  return { success: true };
}

export async function requestPushPermissionAndSubscribe() {
  if (typeof window === 'undefined') return { success: false };
  if (typeof Notification === 'undefined') return { success: false };
  if (Notification.permission === 'denied') return { success: false, denied: true };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { success: false, denied: permission === 'denied' };
  return await ensurePushSubscribedIfGranted();
}

