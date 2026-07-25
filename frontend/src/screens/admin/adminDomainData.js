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

export async function fetchAdminServices(status = 'all', limit = 50, offset = 0) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', status);
  const res = await fetchWithAuth(`${BACKEND_URL}/api/services/admin/all?${qs.toString()}`);
  return res.json();
}

export async function fetchAdminMatching(limit = 100) {
  const res = await fetchWithAuth(`${BACKEND_URL}/api/service-requests/admin/active?limit=${encodeURIComponent(String(limit))}`);
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
