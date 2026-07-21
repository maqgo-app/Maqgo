import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import maqgoLogo from '../../assets/maqgo-logo.png';

import BACKEND_URL from '../../utils/api';

const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
  danger: '#E57373',
};

const ADMIN_THEME = {
  appBg: '#070B12',
  panelBg: '#0F172A',
  panelBgSoft: '#0B1220',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textMuted: 'rgba(255,255,255,0.70)',
};

const MAQGO_PUBLIC_ID_PREFIX = '0019702204';
const MAQGO_PUBLIC_ID_SUFFIX_MOD = 10000000n;
const MAQGO_PUBLIC_ID_SUFFIX_LEN = 7;

function maqgoPublicId(rawId, kind) {
  if (!rawId) return '-';
  const kindDigit = kind === 'client' ? '1' : kind === 'provider' ? '2' : kind === 'machine' ? '3' : kind === 'txn' ? '4' : '0';
  const s = String(rawId);
  let h = 1469598103934665603n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 1099511628211n) & ((1n << 64n) - 1n);
  }
  const suffix = (h % MAQGO_PUBLIC_ID_SUFFIX_MOD).toString().padStart(MAQGO_PUBLIC_ID_SUFFIX_LEN, '0');
  return `${MAQGO_PUBLIC_ID_PREFIX}${kindDigit}${suffix}`;
}

function AdminUsersScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState({ clients: [], providers: [], machines: [], total_clients: 0, total_providers: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients'); // 'clients' | 'providers' | 'machines'
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'test' | 'deleted'
  const [editKind, setEditKind] = useState('client'); // 'client' | 'provider' | 'machine'
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [deleteMachineTarget, setDeleteMachineTarget] = useState(null);
  const [photoModalUrl, setPhotoModalUrl] = useState('');
  const [expandedProviderIds, setExpandedProviderIds] = useState(() => new Set());

  const goDashboardArea = (area) => {
    try {
      localStorage.setItem('maqgo_admin_area', area);
    } catch {
      void 0;
    }
    navigate('/admin');
  };

  async function fetchUsers() {
    try {
      const [usersRes, machinesRes] = await Promise.all([
        fetchWithAuth(`${BACKEND_URL}/api/admin/users`),
        fetchWithAuth(`${BACKEND_URL}/api/admin/machines`),
      ]);
      const json = await usersRes.json();
      const machinesJson = await machinesRes.json().catch(() => ({}));
      setData({ ...json, machines: Array.isArray(machinesJson?.machines) ? machinesJson.machines : [] });
    } catch (e) {
      console.error(e);
      setData({ clients: [], providers: [], machines: [], total_clients: 0, total_providers: 0 });
    }
    setLoading(false);
  }

  useEffect(() => {
    setTimeout(() => {
      fetchUsers();
    }, 0);
  }, []);

  const formatDate = (str) => {
    if (!str) return '-';
    try {
      return new Date(str).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return str;
    }
  };

  const displayRut = (user) => {
    const v = user?.providerData?.rut || user?.rut || '-';
    return typeof v === 'string' ? (v.trim() || '-') : '-';
  };

  const getStatusMeta = (user) => {
    const st = String(user?.status || 'active');
    const isDel = Boolean(user?.deleted) || st === 'deleted';
    const label = isDel ? 'Eliminado' : st === 'test' ? 'Test' : st === 'suspended' ? 'Suspendido' : st === 'inactive' ? 'Inactivo' : 'Activo';
    const bg = isDel ? 'rgba(220, 53, 69, 0.18)' : st === 'test' ? 'rgba(143, 179, 201, 0.18)' : st === 'inactive' || st === 'suspended' ? 'rgba(217, 161, 90, 0.18)' : 'rgba(102, 187, 106, 0.16)';
    const fg = isDel ? ADMIN_PALETTE.danger : st === 'test' ? ADMIN_PALETTE.info : st === 'inactive' || st === 'suspended' ? ADMIN_PALETTE.warning : ADMIN_PALETTE.success;
    return { st, isDel, label, bg, fg };
  };

  const getProviderRoleLabel = (providerRole) => {
    if (providerRole === 'super_master') return 'Titular';
    if (providerRole === 'master') return 'Gerente';
    if (providerRole === 'operator') return 'Operador';
    return providerRole || '-';
  };

  const getRolesLabel = (user) => {
    const roles = Array.isArray(user?.roles) ? user.roles.filter(Boolean) : [];
    if (roles.length > 0) return roles.join(', ');
    return user?.role ? String(user.role) : '-';
  };

  const users = useMemo(() => {
    if (tab === 'clients') return data.clients;
    if (tab === 'providers') return data.providers;
    return [];
  }, [tab, data.clients, data.providers]);

  const normalizedUsers = useMemo(() => {
    return (Array.isArray(users) ? users : []).map((u) => {
      const onboardingCompleted = Boolean(u?.onboarding_completed);
      return { ...u, __onboardingCompleted: onboardingCompleted };
    });
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (tab === 'machines') return normalizedUsers;
    const list = Array.isArray(normalizedUsers) ? normalizedUsers : [];
    const filtered = list.filter((u) => {
      const st = String(u?.status || 'active');
      const isDeleted = Boolean(u?.deleted) || st === 'deleted';
      if (statusFilter === 'deleted') return isDeleted;
      if (isDeleted) return false;
      if (statusFilter === 'test') return st === 'test';
      if (statusFilter === 'inactive') return st === 'inactive' || st === 'suspended';
      return st === 'active' || !u?.status;
    });
    if (tab !== 'providers') return filtered;
    return filtered.filter((u) => {
      const providerRole = String(u?.provider_role || '').trim();
      const ownerId = String(u?.owner_id || '').trim();
      if (providerRole === 'operator') return false;
      if (providerRole === 'super_master') return true;
      return !ownerId;
    });
  }, [normalizedUsers, statusFilter, tab]);

  const applyUserAdminStatus = async (u, nextStatus) => {
    if (!u?.id) return;
    try {
      const patch = { status: nextStatus };
      if (nextStatus === 'active') patch.deleted = false;
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo guardar (${res.status}).`);
        return;
      }
      const updatedUser = json?.user || null;
      if (!updatedUser) {
        await fetchUsers();
        return;
      }
      setData((prev) => {
        const listKey = tab === 'clients' ? 'clients' : 'providers';
        const list = Array.isArray(prev[listKey]) ? prev[listKey] : [];
        const nextList = list.map((x) => (x?.id === updatedUser.id ? updatedUser : x));
        return { ...prev, [listKey]: nextList };
      });
      toast.success('Estado actualizado.');
    } catch (e) {
      toast.error(e?.message || 'No se pudo guardar.');
    }
  };

  const restoreUser = async (u) => {
    return applyUserAdminStatus(u, 'active');
  };

  const _softDeleteUser = async (u) => {
    if (!u?.id) return;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo eliminar (${res.status}).`);
        return;
      }
      await fetchUsers();
      toast.success('Usuario eliminado (soft).');
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar.');
    }
  };

  const machineRows = useMemo(() => {
    const machines = Array.isArray(data.machines) ? data.machines : [];
    return machines.map((m) => {
      const provider = m?.provider && typeof m.provider === 'object' ? m.provider : {};
      let primaryPhoto = m?.primaryPhoto || m?.photo || m?.image || '';
      if (!primaryPhoto) {
        const raw = m?.machinePhotos || m?.photos || m?.images || [];
        if (Array.isArray(raw) && raw.length > 0) {
          const first = raw[0];
          primaryPhoto = typeof first === 'string' ? first : (first?.url || first?.src || '');
        }
      }
      return {
        ...m,
        providerId: m?.provider_id || '',
        providerUser: provider,
        providerName: m?.providerName || provider?.name || '-',
        providerEmail: m?.providerEmail || provider?.email || '-',
        providerPhone: m?.providerPhone || provider?.phone || '-',
        machineryType: m?.machineryType || m?.machinery_type || '-',
        licensePlate: m?.licensePlate || m?.license_plate || '-',
        comuna: m?.comuna || '-',
        onboardingCompleted: Boolean(m?.onboardingCompleted),
        isAvailable: Boolean(m?.available) && Boolean(m?.isProviderAvailable),
        providerRole: provider?.provider_role || '',
        createdAt: m?.createdAt || '',
        machineKey: m?.id || `${m?.provider_id || ''}|${m?.licensePlate || m?.license_plate || ''}|${m?.machineryType || m?.machinery_type || ''}`,
        primaryPhoto,
      };
    });
  }, [data.machines]);

  const machinesCount = useMemo(() => {
    return machineRows.filter((m) => String(m.machineryType || '').trim() && m.machineryType !== '-').length;
  }, [machineRows]);

  const providerMachineCountById = useMemo(() => {
    const map = new Map();
    machineRows.forEach((m) => {
      const providerId = String(m?.providerId || '').trim();
      if (!providerId) return;
      const mt = String(m?.machineryType || '').trim();
      if (!mt || mt === '-') return;
      map.set(providerId, (map.get(providerId) || 0) + 1);
    });
    return map;
  }, [machineRows]);

  const toggleProviderExpanded = (providerId) => {
    const id = String(providerId || '').trim();
    if (!id) return;
    setExpandedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const providerGroups = useMemo(() => {
    const list = Array.isArray(data.providers) ? data.providers : [];
    const groups = new Map();

    list.forEach((u) => {
      const id = String(u?.id || '').trim();
      if (!id) return;
      const providerRole = String(u?.provider_role || '').trim();
      const ownerId = String(u?.owner_id || '').trim();
      const rootId = providerRole === 'super_master' || !ownerId ? id : ownerId;

      if (!groups.has(rootId)) {
        groups.set(rootId, { providerId: rootId, rootUser: null, members: [] });
      }

      const g = groups.get(rootId);
      g.members.push(u);

      const isRootCandidate = providerRole === 'super_master' || (!ownerId && providerRole !== 'operator');
      if (isRootCandidate) {
        if (!g.rootUser) g.rootUser = u;
        else if (String(g.rootUser?.provider_role || '') !== 'super_master' && providerRole === 'super_master') g.rootUser = u;
      }
    });

    return Array.from(groups.values()).map((g) => {
      const rootUser = g.rootUser || g.members[0] || null;
      const providerId = String(g.providerId || '').trim();
      const machines = machineRows.filter((m) => String(m?.providerId || '').trim() === providerId);
      const operators = g.members.filter((m) => String(m?.provider_role || '') === 'operator');
      const masters = g.members.filter((m) => String(m?.provider_role || '') === 'master');
      return { ...g, rootUser, machines, operators, masters };
    });
  }, [data.providers, machineRows]);

  const filteredProviderGroups = useMemo(() => {
    const want = String(statusFilter || 'active');
    return providerGroups.filter((g) => {
      const meta = getStatusMeta(g.rootUser || {});
      if (want === 'deleted') return meta.isDel;
      if (meta.isDel) return false;
      if (want === 'test') return meta.st === 'test';
      if (want === 'inactive') return meta.st === 'inactive' || meta.st === 'suspended';
      return meta.st === 'active' || !g.rootUser?.status;
    });
  }, [providerGroups, statusFilter]);

  const providerGroupById = useMemo(() => {
    const m = new Map();
    providerGroups.forEach((g) => {
      const id = String(g?.providerId || '').trim();
      if (id) m.set(id, g);
    });
    return m;
  }, [providerGroups]);

  const openEdit = (u, kindOverride = null) => {
    const md = kindOverride === 'machine' ? u : (u?.machineData && typeof u.machineData === 'object' ? u.machineData : {});
    const kind =
      kindOverride ||
      (tab === 'clients' ? 'client' : tab === 'providers' ? 'provider' : 'machine');
    setEditKind(kind);
    setEditingUser(u);
    setEditForm({
      name: u?.name || '',
      email: u?.email || '',
      phone: u?.phone || '',
      status: String(u?.status || 'active'),
      deleted: Boolean(u?.deleted),
      provider_role: u?.provider_role || '',
      isAvailable: kindOverride === 'machine' ? Boolean(u?.available) : Boolean(u?.isAvailable),
      onboarding_completed: Boolean(u?.onboarding_completed),
      machineryType: u?.machineryType || md?.machineryType || '',
      licensePlate: md?.licensePlate || '',
      pricePerHour: md?.pricePerHour ?? '',
      pricePerService: md?.pricePerService ?? '',
      transportCost: md?.transportCost ?? '',
    });
  };

  const closeEdit = () => {
    setEditingUser(null);
    setEditForm(null);
    setEditKind('client');
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingUser?.id || !editForm || saving) return;
    setSaving(true);
    try {
      if (editKind === 'machine') {
        const toNumberOrEmpty = (v) => {
          if (v === '' || v == null) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const update = {
          machineryType: String(editForm.machineryType || ''),
          licensePlate: String(editForm.licensePlate || '').trim().toUpperCase(),
          pricePerHour: toNumberOrEmpty(editForm.pricePerHour),
          pricePerService: toNumberOrEmpty(editForm.pricePerService),
          transportCost: toNumberOrEmpty(editForm.transportCost),
          available: Boolean(editForm.isAvailable),
        };
        const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/machines/${encodeURIComponent(editingUser.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo guardar (${res.status}).`);
          return;
        }
        const updatedMachine = json?.machine || null;
        if (updatedMachine) {
          setData((prev) => {
            const list = Array.isArray(prev.machines) ? prev.machines : [];
            const nextList = list.map((x) => (x?.id === updatedMachine.id ? { ...x, ...updatedMachine } : x));
            return { ...prev, machines: nextList };
          });
        } else {
          await fetchUsers();
        }
        toast.success('Cambios guardados.');
        closeEdit();
        return;
      }

      const md0 = editingUser?.machineData && typeof editingUser.machineData === 'object' ? editingUser.machineData : {};
      const update = {};

      if (editKind !== 'machine') {
        const nextName = String(editForm.name || '');
        const nextEmail = String(editForm.email || '');
        const nextPhone = String(editForm.phone || '');
        if (nextName !== String(editingUser.name || '')) update.name = nextName;
        if (nextEmail !== String(editingUser.email || '')) update.email = nextEmail;
        if (nextPhone !== String(editingUser.phone || '')) update.phone = nextPhone;
        if (String(editForm.status || 'active') !== String(editingUser.status || 'active')) update.status = String(editForm.status || 'active');
        if (Boolean(editForm.deleted) !== Boolean(editingUser.deleted)) update.deleted = Boolean(editForm.deleted);
      }

      if (tab === 'providers' || editKind === 'machine') {
        const nextRole = String(editForm.provider_role || '');
        if (editKind !== 'machine' && nextRole !== String(editingUser.provider_role || '')) update.provider_role = nextRole;

        if (Boolean(editForm.isAvailable) !== Boolean(editingUser.isAvailable)) update.isAvailable = Boolean(editForm.isAvailable);
        if (Boolean(editForm.onboarding_completed) !== Boolean(editingUser.onboarding_completed)) {
          if (editKind !== 'machine') update.onboarding_completed = Boolean(editForm.onboarding_completed);
        }

        const nextMachineryType = String(editForm.machineryType || '');
        if (nextMachineryType !== String(editingUser.machineryType || md0?.machineryType || '')) {
          update.machineryType = nextMachineryType;
        }

        const mdUpdate = {};
        const nextLicense = String(editForm.licensePlate || '').trim().toUpperCase();
        if (nextLicense !== String(md0?.licensePlate || '')) mdUpdate.licensePlate = nextLicense;

        const toNumberOrEmpty = (v) => {
          if (v === '' || v == null) return '';
          const n = Number(v);
          return Number.isFinite(n) ? n : '';
        };
        const nextPph = toNumberOrEmpty(editForm.pricePerHour);
        const nextPps = toNumberOrEmpty(editForm.pricePerService);
        const nextTc = toNumberOrEmpty(editForm.transportCost);
        if (nextPph !== '' && nextPph !== (md0?.pricePerHour ?? '')) mdUpdate.pricePerHour = nextPph;
        if (nextPps !== '' && nextPps !== (md0?.pricePerService ?? '')) mdUpdate.pricePerService = nextPps;
        if (nextTc !== '' && nextTc !== (md0?.transportCost ?? '')) mdUpdate.transportCost = nextTc;
        if (Object.keys(mdUpdate).length > 0) update.machineData = mdUpdate;
      }

      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(editingUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo guardar (${res.status}).`);
        return;
      }

      const updatedUser = json?.user || null;
      if (!updatedUser) {
        toast.success('Cambios guardados.');
        await fetchUsers();
        closeEdit();
        return;
      }

      setData((prev) => {
        const listKey = editKind === 'machine' ? 'providers' : (tab === 'clients' ? 'clients' : 'providers');
        const list = Array.isArray(prev[listKey]) ? prev[listKey] : [];
        const nextList = list.map((x) => (x?.id === updatedUser.id ? updatedUser : x));
        return { ...prev, [listKey]: nextList };
      });
      toast.success('Cambios guardados.');
      closeEdit();
    } catch (e) {
      toast.error(e?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo eliminar (${res.status}).`);
        return;
      }
      await fetchUsers();
      toast.success('Usuario eliminado (soft).');
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const doPurge = async () => {
    if (!purgeTarget?.id) return;
    try {
      const url = `${BACKEND_URL}/api/admin/users/${encodeURIComponent(purgeTarget.id)}/purge?dry_run=false&confirm=true`;
      const res = await fetchWithAuth(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo borrar (${res.status}).`);
        return;
      }
      await fetchUsers();
      toast.success('Usuario borrado definitivamente.');
    } catch (e) {
      toast.error(e?.message || 'No se pudo borrar.');
    } finally {
      setPurgeTarget(null);
    }
  };

  const doDeleteMachine = async () => {
    if (!deleteMachineTarget?.id) return;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/machines/${encodeURIComponent(deleteMachineTarget.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.detail === 'string' ? json.detail : `No se pudo eliminar (${res.status}).`);
        return;
      }
      setData((prev) => {
        const list = Array.isArray(prev.machines) ? prev.machines : [];
        return { ...prev, machines: list.filter((x) => x?.id !== deleteMachineTarget.id) };
      });
      toast.success('Maquinaria eliminada.');
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar.');
    } finally {
      setDeleteMachineTarget(null);
    }
  };

  return (
    <div className="maqgo-admin-page" style={{ minHeight: '100dvh', background: ADMIN_THEME.appBg, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div className="maqgo-admin-topbar" style={{ background: ADMIN_THEME.panelBg, padding: '20px 24px', borderBottom: `1px solid ${ADMIN_THEME.border}` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/welcome', { replace: false })}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'transparent',
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Volver a portada"
              title="Volver a portada"
            >
              <BackArrowIcon size={18} style={{ display: 'block' }} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 }}>
              <img src={maqgoLogo} alt="MAQGO" style={{ height: 22, width: 'auto', display: 'block' }} />
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: 'rgba(255,255,255,0.78)' }}>Administrador</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 260 }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              aria-label="Sin alertas urgentes"
              disabled
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                opacity: 0.6,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3C9.79086 3 8 4.79086 8 7V8.2C8 9.09411 7.70361 9.96449 7.1577 10.7L6.44721 11.6524C5.53397 12.872 6.4022 14.6 7.92462 14.6H16.0754C17.5978 14.6 18.466 12.872 17.5528 11.6524L16.8423 10.7C16.2964 9.96449 16 9.09411 16 8.2V7C16 4.79086 14.2091 3 12 3Z"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                />
                <path
                  d="M10 16C10.1709 17.1652 10.9882 18 12 18C13.0118 18 13.8291 17.1652 14 16"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 999, border: `1px solid ${ADMIN_THEME.border}`, background: 'rgba(255,255,255,0.04)' }}>
              <button
                type="button"
                onClick={() => goDashboardArea('today')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => goDashboardArea('system')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Operación
              </button>
              <button
                type="button"
                onClick={() => goDashboardArea('platform')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                Plataforma
              </button>
            </div>
            <button
              type="button"
              onClick={() => goDashboardArea('money')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Facturación y pagos
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              style={{
                padding: '8px 16px',
                background: 'rgba(236, 104, 25, 0.22)',
                border: '1px solid rgba(236, 104, 25, 0.55)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Usuarios
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/pricing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Precios
            </button>
            <button
              type="button"
              title="Inversión semanal por canal, audiencia y CAC"
              onClick={() => navigate('/admin/marketing')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(126, 184, 212, 0.45)',
                borderRadius: 8,
                color: ADMIN_PALETTE.info,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Marketing & CAC
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('maqgo_open_report_subscriptions', '1');
                } catch {
                  void 0;
                }
                navigate('/admin');
              }}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              📧 Destinatarios
            </button>
            <button
              type="button"
              onClick={() => goDashboardArea('money')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Planilla pagos
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <div className="maqgo-admin-title">Usuarios</div>
          <div className="maqgo-admin-subtitle">Clientes, proveedores y maquinaria.</div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setTab('clients')}
            style={{
              padding: '10px 20px',
              background: tab === 'clients' ? 'rgba(255,255,255,0.06)' : ADMIN_THEME.panelBg,
              border: `1px solid ${tab === 'clients' ? 'rgba(236, 104, 25, 0.55)' : ADMIN_THEME.border}`,
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Clientes ({data.total_clients})
          </button>
          <button
            onClick={() => setTab('providers')}
            style={{
              padding: '10px 20px',
              background: tab === 'providers' ? 'rgba(255,255,255,0.06)' : ADMIN_THEME.panelBg,
              border: `1px solid ${tab === 'providers' ? 'rgba(236, 104, 25, 0.55)' : ADMIN_THEME.border}`,
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Proveedores ({providerGroups.length})
          </button>
          <button
            onClick={() => setTab('machines')}
            style={{
              padding: '10px 20px',
              background: tab === 'machines' ? 'rgba(255,255,255,0.06)' : ADMIN_THEME.panelBg,
              border: `1px solid ${tab === 'machines' ? 'rgba(236, 104, 25, 0.55)' : ADMIN_THEME.border}`,
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Maquinarias ({machinesCount})
          </button>
        </div>

        {tab !== 'machines' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                background: statusFilter === 'active' ? 'rgba(102, 187, 106, 0.18)' : ADMIN_THEME.panelBg,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                background: statusFilter === 'inactive' ? 'rgba(217, 161, 90, 0.18)' : ADMIN_THEME.panelBg,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Inactivos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('test')}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                background: statusFilter === 'test' ? 'rgba(143, 179, 201, 0.18)' : ADMIN_THEME.panelBg,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('deleted')}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                background: statusFilter === 'deleted' ? 'rgba(220, 53, 69, 0.18)' : ADMIN_THEME.panelBg,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Eliminados
            </button>
          </div>
        )}

        {/* Tabla */}
        <div style={{ background: ADMIN_THEME.panelBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${ADMIN_THEME.border}` }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.25)', borderTopColor: ADMIN_PALETTE.brand, borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              <p style={{ color: ADMIN_THEME.textMuted, fontSize: 14 }}>Cargando usuarios...</p>
            </div>
          ) : (tab === 'machines' ? machineRows.length === 0 : users.length === 0) ? (
            <div style={{ padding: 50, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 40, margin: '0 0 12px' }}>👥</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 }}>
                {tab === 'clients'
                  ? 'No hay clientes registrados'
                  : tab === 'providers'
                    ? 'No hay proveedores registrados'
                    : 'No hay maquinarias registradas'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>
                Los usuarios aparecerán aquí cuando se registren desde la app
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              {tab === 'machines' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: ADMIN_THEME.panelBgSoft }}>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>ID</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Foto</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Maquinaria</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Patente</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Comuna</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Proveedor</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Onboarding</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Disponible</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Registro</th>
                      <th style={{ padding: 14, textAlign: 'right', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineRows.map((m, i) => (
                      <tr key={m.id || `${m.providerId || 'prov'}-${i}`} style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                          {maqgoPublicId(m.machineKey, 'machine')}
                        </td>
                        <td style={{ padding: 14 }}>
                          {m.primaryPhoto ? (
                            <button
                              type="button"
                              onClick={() => setPhotoModalUrl(m.primaryPhoto)}
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                padding: 0,
                                background: 'rgba(255,255,255,0.04)',
                                cursor: 'pointer',
                                overflow: 'hidden',
                              }}
                              title="Tocar para agrandar"
                            >
                              <img
                                src={m.primaryPhoto}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                            </button>
                          ) : (
                            <span style={{ color: ADMIN_THEME.textMuted, fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.machineryType}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.licensePlate}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.comuna || '-'}</td>
                        <td style={{ padding: 14, color: '#fff', fontSize: 13 }}>{m.providerName}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{m.providerEmail}</td>
                        <td style={{ padding: 14 }}>
                          <span
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              background: m.onboardingCompleted ? 'rgba(102, 187, 106, 0.16)' : 'rgba(255,255,255,0.08)',
                              color: m.onboardingCompleted ? ADMIN_PALETTE.success : ADMIN_THEME.textMuted,
                            }}
                          >
                            {m.onboardingCompleted ? 'OK' : 'Pendiente'}
                          </span>
                        </td>
                        <td style={{ padding: 14 }}>
                          <span
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              background: m.isAvailable ? 'rgba(102, 187, 106, 0.16)' : 'rgba(255,255,255,0.08)',
                              color: m.isAvailable ? ADMIN_PALETTE.success : ADMIN_THEME.textMuted,
                            }}
                          >
                            {m.isAvailable ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{formatDate(m.createdAt)}</td>
                        <td style={{ padding: 14, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!m?.id) return;
                                openEdit(m, 'machine');
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!m?.id) return;
                                setDeleteMachineTarget(m);
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(220, 53, 69, 0.18)',
                                border: '1px solid rgba(220, 53, 69, 0.55)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 700
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: ADMIN_THEME.panelBgSoft }}>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>ID</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Nombre</th>
                      {tab === 'providers' && (
                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>RUT</th>
                      )}
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Teléfono</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Estado</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Diagnóstico acceso</th>
                      {tab === 'providers' && (
                        <>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Maquinarias</th>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Operadores</th>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Onboarding</th>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Disponible</th>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Rol</th>
                        </>
                      )}
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Registro</th>
                      <th style={{ padding: 14, textAlign: 'right', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <React.Fragment key={u.id || i}>
                        <tr style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                          {maqgoPublicId(u.id, tab === 'clients' ? 'client' : 'provider')}
                        </td>
                        <td style={{ padding: 14, color: '#fff', fontSize: 13 }}>{u.name || '-'}</td>
                        {tab === 'providers' && (
                          <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{displayRut(u)}</td>
                        )}
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.email || '-'}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.phone || '-'}</td>
                        <td style={{ padding: 14 }}>
                          {(() => {
                            const meta = getStatusMeta(u);
                            return (
                              <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700, background: meta.bg, color: meta.fg }}>
                                {meta.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 1.5 }}>
                          {(() => {
                            const meta = getStatusMeta(u);
                            return (
                              <>
                                <div><strong style={{ color: '#fff' }}>status:</strong> {meta.st}</div>
                                <div><strong style={{ color: '#fff' }}>deleted:</strong> {meta.isDel ? 'true' : 'false'}</div>
                                <div><strong style={{ color: '#fff' }}>roles:</strong> {getRolesLabel(u)}</div>
                                {tab === 'providers' ? (
                                  <div><strong style={{ color: '#fff' }}>provider_role:</strong> {u?.provider_role || '-'}</div>
                                ) : null}
                              </>
                            );
                          })()}
                        </td>
                        {tab === 'providers' && (
                          <>
                            <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                              {providerMachineCountById.get(String(u?.id || '').trim()) || 0}
                            </td>
                            <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                              {providerGroupById.get(String(u?.id || '').trim())?.operators?.length || 0}
                            </td>
                            <td style={{ padding: 14 }}>
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  background: u.__onboardingCompleted ? 'rgba(102, 187, 106, 0.16)' : 'rgba(255,255,255,0.08)',
                                  color: u.__onboardingCompleted ? ADMIN_PALETTE.success : ADMIN_THEME.textMuted,
                                }}
                              >
                                {u.__onboardingCompleted ? 'OK' : 'Pendiente'}
                              </span>
                            </td>
                            <td style={{ padding: 14 }}>
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  background: u.isAvailable ? 'rgba(102, 187, 106, 0.16)' : 'rgba(255,255,255,0.08)',
                                  color: u.isAvailable ? ADMIN_PALETTE.success : ADMIN_THEME.textMuted,
                                }}
                              >
                                {u.isAvailable ? 'Sí' : 'No'}
                              </span>
                            </td>
                            <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                              {getProviderRoleLabel(u.provider_role)}
                            </td>
                          </>
                        )}
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{formatDate(u.createdAt)}</td>
                        <td style={{ padding: 14, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {tab === 'providers' ? (
                              <button
                                type="button"
                                onClick={() => toggleProviderExpanded(u?.id)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  background: expandedProviderIds.has(String(u?.id || '').trim()) ? 'rgba(236, 104, 25, 0.18)' : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${expandedProviderIds.has(String(u?.id || '').trim()) ? 'rgba(236, 104, 25, 0.55)' : ADMIN_THEME.borderStrong}`,
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  fontWeight: 800,
                                }}
                              >
                                {expandedProviderIds.has(String(u?.id || '').trim()) ? 'Ocultar' : 'Ver'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openEdit(u)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600
                              }}
                            >
                              Editar
                            </button>
                            {(() => {
                              const meta = getStatusMeta(u);
                              if (meta.isDel) {
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => restoreUser(u)}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        background: 'rgba(102, 187, 106, 0.16)',
                                        border: '1px solid rgba(102, 187, 106, 0.45)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 800,
                                      }}
                                    >
                                      Restaurar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPurgeTarget(u)}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        background: 'rgba(220, 53, 69, 0.18)',
                                        border: '1px solid rgba(220, 53, 69, 0.55)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 900,
                                      }}
                                    >
                                      Borrar definitivo
                                    </button>
                                  </>
                                );
                              }
                              return (
                                <>
                                  {meta.st !== 'active' && (
                                    <button
                                      type="button"
                                      onClick={() => applyUserAdminStatus(u, 'active')}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        background: 'rgba(102, 187, 106, 0.16)',
                                        border: '1px solid rgba(102, 187, 106, 0.45)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 800,
                                      }}
                                    >
                                      Activar
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => applyUserAdminStatus(u, 'inactive')}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      background: 'rgba(217, 161, 90, 0.18)',
                                      border: '1px solid rgba(217, 161, 90, 0.45)',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 800,
                                    }}
                                  >
                                    Desactivar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyUserAdminStatus(u, 'suspended')}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      background: 'rgba(217, 161, 90, 0.18)',
                                      border: '1px solid rgba(217, 161, 90, 0.45)',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 800,
                                    }}
                                  >
                                    Suspender
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyUserAdminStatus(u, 'test')}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      background: 'rgba(143, 179, 201, 0.18)',
                                      border: '1px solid rgba(143, 179, 201, 0.45)',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 800,
                                    }}
                                  >
                                    Marcar test
                                  </button>
                                  {meta.st === 'test' && (
                                    <button
                                      type="button"
                                      onClick={() => setPurgeTarget(u)}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        background: 'rgba(220, 53, 69, 0.18)',
                                        border: '1px solid rgba(220, 53, 69, 0.55)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 900,
                                      }}
                                    >
                                      Borrar definitivo
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(u)}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      background: 'rgba(220, 53, 69, 0.18)',
                                      border: '1px solid rgba(220, 53, 69, 0.55)',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 900,
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                      {tab === 'providers' && expandedProviderIds.has(String(u?.id || '').trim()) ? (
                        <tr style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
                          <td colSpan={14} style={{ padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minWidth: 920 }}>
                              <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ padding: 12, borderBottom: `1px solid ${ADMIN_THEME.border}`, fontWeight: 900 }}>Maquinarias</div>
                                <div style={{ padding: 12 }}>
                                  {(() => {
                                    const providerId = String(u?.id || '').trim();
                                    const g = providerGroupById.get(providerId);
                                    const machines = Array.isArray(g?.machines) ? g.machines : [];
                                    if (machines.length === 0) {
                                      return <div style={{ color: ADMIN_THEME.textMuted, fontSize: 13 }}>Sin maquinarias registradas.</div>;
                                    }
                                    return (
                                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                          <tr>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>ID</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Foto</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Maquinaria</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Patente</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Comuna</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'left', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Disponible</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'right', color: ADMIN_THEME.textMuted, fontSize: 12, textTransform: 'uppercase' }}>Acciones</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {machines.map((m, idx) => (
                                            <tr key={m.id || idx} style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
                                              <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.86)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                                                {maqgoPublicId(m.machineKey, 'machine')}
                                              </td>
                                              <td style={{ padding: '10px 8px' }}>
                                                {m.primaryPhoto ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setPhotoModalUrl(m.primaryPhoto)}
                                                    style={{
                                                      width: 44,
                                                      height: 44,
                                                      borderRadius: 10,
                                                      border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                                      padding: 0,
                                                      background: 'rgba(255,255,255,0.04)',
                                                      cursor: 'pointer',
                                                      overflow: 'hidden',
                                                    }}
                                                    title="Tocar para agrandar"
                                                  >
                                                    <img
                                                      src={m.primaryPhoto}
                                                      alt=""
                                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                    />
                                                  </button>
                                                ) : (
                                                  <span style={{ color: ADMIN_THEME.textMuted, fontSize: 12 }}>—</span>
                                                )}
                                              </td>
                                              <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.machineryType}</td>
                                              <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.licensePlate}</td>
                                              <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{m.comuna || '-'}</td>
                                              <td style={{ padding: '10px 8px' }}>
                                                <span
                                                  style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 6,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    background: m.isAvailable ? 'rgba(102, 187, 106, 0.16)' : 'rgba(255,255,255,0.08)',
                                                    color: m.isAvailable ? ADMIN_PALETTE.success : ADMIN_THEME.textMuted,
                                                  }}
                                                >
                                                  {m.isAvailable ? 'Sí' : 'No'}
                                                </span>
                                              </td>
                                              <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                  <button
                                                    type="button"
                                                    onClick={() => openEdit(m, 'machine')}
                                                    style={{
                                                      padding: '6px 10px',
                                                      borderRadius: 8,
                                                      background: 'rgba(255,255,255,0.06)',
                                                      border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                                      color: '#fff',
                                                      cursor: 'pointer',
                                                      fontSize: 12,
                                                      fontWeight: 700,
                                                    }}
                                                  >
                                                    Editar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setDeleteMachineTarget(m)}
                                                    style={{
                                                      padding: '6px 10px',
                                                      borderRadius: 8,
                                                      background: 'rgba(220, 53, 69, 0.18)',
                                                      border: '1px solid rgba(220, 53, 69, 0.55)',
                                                      color: '#fff',
                                                      cursor: 'pointer',
                                                      fontSize: 12,
                                                      fontWeight: 900,
                                                    }}
                                                  >
                                                    Eliminar
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div style={{ border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ padding: 12, borderBottom: `1px solid ${ADMIN_THEME.border}`, fontWeight: 900 }}>Equipo</div>
                                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {(() => {
                                    const providerId = String(u?.id || '').trim();
                                    const g = providerGroupById.get(providerId);
                                    const masters = Array.isArray(g?.masters) ? g.masters : [];
                                    const operators = Array.isArray(g?.operators) ? g.operators : [];
                                    if (masters.length === 0 && operators.length === 0) {
                                      return <div style={{ color: ADMIN_THEME.textMuted, fontSize: 13 }}>Sin operadores/gerentes asociados.</div>;
                                    }
                                    return (
                                      <>
                                        {masters.map((m, idx) => (
                                          <div key={m.id || idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 10, padding: 10 }}>
                                            <div style={{ minWidth: 0 }}>
                                              <div style={{ fontWeight: 900, fontSize: 13 }}>
                                                {m.name || '-'} <span style={{ color: ADMIN_THEME.textMuted, fontWeight: 700 }}>(Gerente)</span>
                                              </div>
                                              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>{m.email || '-'} · {m.phone || '-'}</div>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => openEdit(m)}
                                              style={{
                                                padding: '6px 10px',
                                                borderRadius: 8,
                                                background: 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                                color: '#fff',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              Editar
                                            </button>
                                          </div>
                                        ))}
                                        {operators.map((op, idx) => (
                                          <div key={op.id || idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 10, padding: 10 }}>
                                            <div style={{ minWidth: 0 }}>
                                              <div style={{ fontWeight: 900, fontSize: 13 }}>
                                                {op.name || '-'} <span style={{ color: ADMIN_THEME.textMuted, fontWeight: 700 }}>(Operador)</span>
                                              </div>
                                              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>{op.email || '-'} · {op.phone || '-'}</div>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => openEdit(op)}
                                              style={{
                                                padding: '6px 10px',
                                                borderRadius: 8,
                                                background: 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${ADMIN_THEME.borderStrong}`,
                                                color: '#fff',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              Editar
                                            </button>
                                          </div>
                                        ))}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
          Los usuarios se almacenan en MongoDB (<code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>users</code>) y el inventario en <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>machines</code>.
          El registro se realiza desde la app (Empezar ahora / Ya tengo cuenta).
        </p>
      </div>

      {editingUser && editForm && (
        <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
          <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 540px)' }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>
              {editKind === 'machine' ? 'Editar maquinaria' : `Editar ${tab === 'clients' ? 'cliente' : 'proveedor'}`}
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {editKind !== 'machine' ? (
                <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 }}>Diagnóstico de acceso</div>
                  <div style={{ display: 'grid', gap: 4, color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 1.45 }}>
                    <div><strong style={{ color: '#fff' }}>user.id:</strong> {editingUser?.id || '-'}</div>
                    <div><strong style={{ color: '#fff' }}>phone:</strong> {editingUser?.phone || '-'}</div>
                    <div><strong style={{ color: '#fff' }}>status:</strong> {String(editingUser?.status || 'active')}</div>
                    <div><strong style={{ color: '#fff' }}>deleted:</strong> {editingUser?.deleted ? 'true' : 'false'}</div>
                    <div><strong style={{ color: '#fff' }}>roles:</strong> {getRolesLabel(editingUser)}</div>
                    {tab === 'providers' ? (
                      <div><strong style={{ color: '#fff' }}>provider_role:</strong> {editingUser?.provider_role || '-'}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {editKind !== 'machine' ? (
                <>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Nombre</span>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className="maqgo-input"
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Email</span>
                    <input
                      value={editForm.email}
                      onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      className="maqgo-input"
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Teléfono</span>
                    <input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                      className="maqgo-input"
                      style={{ width: '100%' }}
                    />
                  </label>
                </>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${ADMIN_THEME.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 6 }}>Proveedor</div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{editingUser?.providerName || editingUser?.provider?.name || '-'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 }}>{editingUser?.providerEmail || editingUser?.provider?.email || '-'}</div>
                </div>
              )}

              {(tab === 'providers' || editKind === 'machine') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {editKind !== 'machine' ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Rol proveedor</span>
                        <select
                          value={editForm.provider_role}
                          onChange={(e) => setEditForm((p) => ({ ...p, provider_role: e.target.value }))}
                          className="maqgo-input"
                          style={{ width: '100%' }}
                        >
                          <option value="">(vacío)</option>
                          <option value="super_master">Titular</option>
                          <option value="master">Gerente</option>
                          <option value="operator">Operador</option>
                        </select>
                      </label>
                    ) : (
                      <div />
                    )}
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Maquinaria (id)</span>
                      <input
                        value={editForm.machineryType}
                        onChange={(e) => setEditForm((p) => ({ ...p, machineryType: e.target.value }))}
                        className="maqgo-input"
                        style={{ width: '100%' }}
                        placeholder="retroexcavadora, excavadora, ..."
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Patente</span>
                      <input
                        value={editForm.licensePlate}
                        onChange={(e) => setEditForm((p) => ({ ...p, licensePlate: e.target.value }))}
                        className="maqgo-input"
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Traslado</span>
                      <input
                        value={editForm.transportCost}
                        onChange={(e) => setEditForm((p) => ({ ...p, transportCost: e.target.value }))}
                        className="maqgo-input"
                        style={{ width: '100%' }}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Precio por hora</span>
                      <input
                        value={editForm.pricePerHour}
                        onChange={(e) => setEditForm((p) => ({ ...p, pricePerHour: e.target.value }))}
                        className="maqgo-input"
                        style={{ width: '100%' }}
                        inputMode="numeric"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Precio por servicio</span>
                      <input
                        value={editForm.pricePerService}
                        onChange={(e) => setEditForm((p) => ({ ...p, pricePerService: e.target.value }))}
                        className="maqgo-input"
                        style={{ width: '100%' }}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {editKind !== 'machine' && (
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(editForm.onboarding_completed)}
                          onChange={(e) => setEditForm((p) => ({ ...p, onboarding_completed: e.target.checked }))}
                        />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>Onboarding completo</span>
                      </label>
                    )}
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editForm.isAvailable)}
                        onChange={(e) => setEditForm((p) => ({ ...p, isAvailable: e.target.checked }))}
                      />
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>Disponible</span>
                    </label>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={closeEdit}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'rgba(255,255,255,0.95)',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#EC6819',
                    border: 'none',
                    color: '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {photoModalUrl ? (
        <div
          className="maqgo-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setPhotoModalUrl('')}
        >
          <div
            className="maqgo-modal-dialog"
            style={{ width: 'min(94vw, 860px)', padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>Foto de maquinaria</h3>
              <button
                type="button"
                onClick={() => setPhotoModalUrl('')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: `1px solid ${ADMIN_THEME.borderStrong}`,
                  color: 'rgba(255,255,255,0.9)',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Cerrar
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={photoModalUrl}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: '72vh',
                  objectFit: 'contain',
                  borderRadius: 12,
                  border: `1px solid ${ADMIN_THEME.border}`,
                  background: 'rgba(0,0,0,0.35)',
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar usuario"
        message={`Eliminar definitivamente a ${deleteTarget?.name || deleteTarget?.email || 'este usuario'}?`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={doDelete}
        variant="danger"
      />

      <ConfirmModal
        open={Boolean(purgeTarget)}
        onClose={() => setPurgeTarget(null)}
        title="Borrar definitivo"
        message={`Borrar definitivamente en MongoDB a ${purgeTarget?.name || purgeTarget?.email || 'este usuario'}?`}
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        onConfirm={doPurge}
        variant="danger"
      />

      <ConfirmModal
        open={Boolean(deleteMachineTarget)}
        onClose={() => setDeleteMachineTarget(null)}
        title="Eliminar maquinaria"
        message={`Eliminar ${deleteMachineTarget?.machineryType || 'esta maquinaria'} de ${deleteMachineTarget?.providerName || 'este proveedor'}?`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={doDeleteMachine}
        variant="danger"
      />
    </div>
  );
}

export default AdminUsersScreen;
