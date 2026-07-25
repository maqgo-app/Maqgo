const STORAGE_PREFIX = 'maqgo_admin_range_';

export function toDateInputValue(date) {
  const safe = date instanceof Date ? date : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
}

export function buildRecentRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { fromDate: toDateInputValue(start), toDate: toDateInputValue(end) };
}

export function readAdminRange(scope = 'operations', searchParams, defaultDays = 30) {
  const fromUrl = String(searchParams?.get?.('from') || '').trim();
  const toUrl = String(searchParams?.get?.('to') || '').trim();
  if (fromUrl && toUrl) {
    return { fromDate: fromUrl, toDate: toUrl };
  }
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.fromDate && parsed?.toDate) {
        return { fromDate: parsed.fromDate, toDate: parsed.toDate };
      }
    }
  } catch {
    // Ignore storage failures and fall back to the default range.
  }
  return buildRecentRange(defaultDays);
}

export function persistAdminRange(scope = 'operations', range) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(range));
  } catch {
    // Ignore storage failures; the UI can still work from memory.
  }
}

export function buildAdminQuery(range, extras = {}) {
  const qs = new URLSearchParams();
  if (range?.fromDate) qs.set('from', String(range.fromDate));
  if (range?.toDate) qs.set('to', String(range.toDate));
  Object.entries(extras || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.set(key, String(value));
  });
  const text = qs.toString();
  return text ? `?${text}` : '';
}

export const ADMIN_RANGE_PRESETS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];
