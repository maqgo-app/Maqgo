import BACKEND_URL, { fetchWithAuth } from '../../utils/api';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function fetchAdminUsersAndMachines() {
  const [usersRes, machinesRes] = await Promise.all([
    fetchWithAuth(`${BACKEND_URL}/api/admin/users`),
    fetchWithAuth(`${BACKEND_URL}/api/admin/machines`),
  ]);
  const usersJson = await usersRes.json().catch(() => ({}));
  const machinesJson = await machinesRes.json().catch(() => ({}));
  const clients = safeArray(usersJson?.clients);
  const providersRaw = safeArray(usersJson?.providers);
  const machines = safeArray(machinesJson?.machines);

  const providerOwners = providersRaw.filter((u) => {
    const providerRole = String(u?.provider_role || '').trim();
    const ownerId = String(u?.owner_id || '').trim();
    if (providerRole === 'operator') return false;
    if (providerRole === 'super_master') return true;
    return !ownerId;
  });

  const operators = providersRaw.filter((u) => {
    const providerRole = String(u?.provider_role || '').trim();
    const roles = Array.isArray(u?.roles) ? u.roles.map((x) => String(x || '').toLowerCase()) : [];
    return providerRole === 'operator' || roles.includes('operator') || Boolean(String(u?.owner_id || '').trim());
  });

  const machinesByProvider = new Map();
  machines.forEach((machine) => {
    const pid = String(machine?.provider_id || '');
    if (!pid) return;
    const current = machinesByProvider.get(pid) || [];
    current.push(machine);
    machinesByProvider.set(pid, current);
  });

  const operatorsByOwner = new Map();
  operators.forEach((operator) => {
    const ownerId = String(operator?.owner_id || '');
    const current = operatorsByOwner.get(ownerId) || [];
    current.push(operator);
    if (ownerId) operatorsByOwner.set(ownerId, current);
    const selfId = String(operator?.id || '');
    if (selfId && !operatorsByOwner.has(selfId)) {
      operatorsByOwner.set(selfId, []);
    }
  });

  return {
    clients,
    providers: providerOwners,
    operators,
    machines,
    machinesByProvider,
    operatorsByOwner,
  };
}

export async function fetchAdminServices(status = 'all', limit = 50, offset = 0, options = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', status);
  if (options?.fromDate) qs.set('from_date', String(options.fromDate));
  if (options?.toDate) qs.set('to_date', String(options.toDate));
  if (options?.dateField) qs.set('date_field', String(options.dateField));
  const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/all?${qs.toString()}`);
  return res.json();
}

export async function fetchAdminMatching(limit = 100) {
  const res = await fetchWithAuth(`${BACKEND_URL}/api/service-requests/admin/active?limit=${encodeURIComponent(String(limit))}`);
  return res.json();
}

export async function fetchAdminMatchingHistory(limit = 200, options = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (options?.fromDate) qs.set('from_date', String(options.fromDate));
  if (options?.toDate) qs.set('to_date', String(options.toDate));
  if (options?.statusScope) qs.set('status_scope', String(options.statusScope));
  const res = await fetchWithAuth(`${BACKEND_URL}/api/service-requests/admin/history?${qs.toString()}`);
  return res.json();
}

export async function fetchAdminSupport() {
  const [ticketsRes, blockedRes] = await Promise.all([
    fetchWithAuth(`${BACKEND_URL}/api/support/tickets?status=open`),
    fetchWithAuth(`${BACKEND_URL}/api/support/blocked-phones?active=true`),
  ]);
  const ticketsJson = await ticketsRes.json().catch(() => ({}));
  const blockedJson = await blockedRes.json().catch(() => ({}));
  return {
    tickets: safeArray(ticketsJson?.items),
    blockedPhones: safeArray(blockedJson?.items),
  };
}

export async function fetchAdminReportsSummary() {
  const [subsRes, weeklyRes, monthlyRes] = await Promise.all([
    fetchWithAuth(`${BACKEND_URL}/api/admin/reports/subscriptions`),
    fetchWithAuth(`${BACKEND_URL}/api/admin/reports/weekly?weeks_ago=1`),
    fetchWithAuth(`${BACKEND_URL}/api/admin/reports/monthly-finance`),
  ]);
  return {
    subscriptions: await subsRes.json().catch(() => ({})),
    weekly: await weeklyRes.json().catch(() => ({})),
    monthly: await monthlyRes.json().catch(() => ({})),
  };
}

export async function fetchAdminWeeklyReport(weeksAgo = 1) {
  const qs = new URLSearchParams();
  qs.set('weeks_ago', String(Math.max(0, Number(weeksAgo) || 0)));
  const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/weekly?${qs.toString()}`);
  return res.json();
}

export async function fetchAdminMonthlyReport(year, month) {
  const now = new Date();
  const safeYear = Number(year) || now.getFullYear();
  const safeMonth = Math.min(12, Math.max(1, Number(month) || now.getMonth() + 1));
  const qs = new URLSearchParams();
  qs.set('year', String(safeYear));
  qs.set('month', String(safeMonth));
  const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/reports/monthly-finance?${qs.toString()}`);
  return res.json();
}

export async function downloadAdminReportPdf(kind, params = {}) {
  const qs = new URLSearchParams();
  let endpoint = '';
  let filename = 'maqgo_reporte.pdf';

  if (kind === 'weekly') {
    const weeksAgo = Math.max(0, Number(params.weeksAgo) || 0);
    qs.set('weeks_ago', String(weeksAgo));
    qs.set('format', 'pdf');
    endpoint = `${BACKEND_URL}/api/admin/reports/weekly?${qs.toString()}`;
    filename = `maqgo_informe_semanal_${weeksAgo}.pdf`;
  } else {
    const now = new Date();
    const safeYear = Number(params.year) || now.getFullYear();
    const safeMonth = Math.min(12, Math.max(1, Number(params.month) || now.getMonth() + 1));
    qs.set('year', String(safeYear));
    qs.set('month', String(safeMonth));
    qs.set('format', 'pdf');
    endpoint = `${BACKEND_URL}/api/admin/reports/monthly-finance?${qs.toString()}`;
    filename = `maqgo_informe_mensual_${safeYear}-${String(safeMonth).padStart(2, '0')}.pdf`;
  }

  const res = await fetchWithAuth(endpoint);
  if (!res.ok) {
    let detail = '';
    try {
      const json = await res.json();
      detail = String(json?.detail || '').trim();
    } catch {
      detail = '';
    }
    throw new Error(detail || `No se pudo descargar el reporte (${res.status}).`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 800);
}

export async function fetchAdminDashboardSnapshot() {
  const [users, services, matching, support, reports] = await Promise.all([
    fetchAdminUsersAndMachines(),
    fetchAdminServices('all', 50, 0),
    fetchAdminMatching(100).catch(() => []),
    fetchAdminSupport().catch(() => ({ tickets: [], blockedPhones: [] })),
    fetchAdminReportsSummary().catch(() => ({ subscriptions: {}, weekly: {}, monthly: {} })),
  ]);

  return {
    users,
    services,
    matching: Array.isArray(matching) ? matching : [],
    support,
    reports,
  };
}
