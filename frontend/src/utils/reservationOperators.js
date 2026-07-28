const STORAGE_PREFIX = 'reservationAssignedOperators';

function storageKey(requestId) {
  const id = String(requestId || '').trim();
  return id ? `${STORAGE_PREFIX}:${id}` : '';
}

function uniqueOperators(operators = []) {
  const seen = new Set();
  return (Array.isArray(operators) ? operators : []).filter((operator) => {
    const id = String(operator?.id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function loadReservationAssignedOperators(requestId) {
  const key = storageKey(requestId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return uniqueOperators(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveReservationAssignedOperators(requestId, operators = []) {
  const key = storageKey(requestId);
  if (!key) return [];
  const next = uniqueOperators(operators);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

export function clearReservationAssignedOperators(requestId) {
  const key = storageKey(requestId);
  if (!key) return;
  localStorage.removeItem(key);
}
