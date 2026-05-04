import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { BackArrowIcon } from '../../components/BackArrowIcon';

import BACKEND_URL from '../../utils/api';

const ADMIN_PALETTE = {
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
  danger: '#E57373',
};

const ADMIN_THEME = {
  appBg: '#12151B',
  panelBg: '#1B2028',
  panelBgSoft: '#171B22',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  textMuted: 'rgba(255,255,255,0.72)',
};

function AdminUsersScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [data, setData] = useState({ clients: [], providers: [], total_clients: 0, total_providers: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients'); // 'clients' | 'providers' | 'machines'
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [photoModalUrl, setPhotoModalUrl] = useState('');

  async function fetchUsers() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
      setData({ clients: [], providers: [], total_clients: 0, total_providers: 0 });
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

  const users = useMemo(() => {
    if (tab === 'clients') return data.clients;
    if (tab === 'providers') return data.providers;
    return [];
  }, [tab, data.clients, data.providers]);

  const normalizedUsers = useMemo(() => {
    return (Array.isArray(users) ? users : []).map((u) => {
      const md = u?.machineData && typeof u.machineData === 'object' ? u.machineData : {};
      const machineryType = u?.machineryType || md?.machineryType || '-';
      const licensePlate = md?.licensePlate || md?.patente || md?.plate || '-';
      const onboardingCompleted = Boolean(u?.onboarding_completed);
      return { ...u, __machineryType: machineryType, __licensePlate: licensePlate, __onboardingCompleted: onboardingCompleted };
    });
  }, [users]);

  const machineRows = useMemo(() => {
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return providers.map((u) => {
      const md = u?.machineData && typeof u.machineData === 'object' ? u.machineData : {};
      const primaryPhoto = md?.primaryPhoto || md?.photo || md?.image || '';
      return {
        providerId: u?.id || '',
        providerName: u?.name || '-',
        providerEmail: u?.email || '-',
        providerPhone: u?.phone || '-',
        machineryType: u?.machineryType || md?.machineryType || '-',
        licensePlate: md?.licensePlate || md?.patente || md?.plate || '-',
        onboardingCompleted: Boolean(u?.onboarding_completed),
        isAvailable: Boolean(u?.isAvailable),
        providerRole: u?.provider_role || '',
        createdAt: u?.createdAt || '',
        primaryPhoto,
      };
    });
  }, [data.providers]);

  const machinesCount = useMemo(() => {
    return machineRows.filter((m) => String(m.machineryType || '').trim() && m.machineryType !== '-').length;
  }, [machineRows]);

  const openEdit = (u) => {
    if (tab === 'machines') return;
    const md = u?.machineData && typeof u.machineData === 'object' ? u.machineData : {};
    setEditingUser(u);
    setEditForm({
      name: u?.name || '',
      email: u?.email || '',
      phone: u?.phone || '',
      provider_role: u?.provider_role || '',
      isAvailable: Boolean(u?.isAvailable),
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
    setSaving(false);
  };

  const saveEdit = async () => {
    if (tab === 'machines') return;
    if (!editingUser?.id || !editForm || saving) return;
    setSaving(true);
    try {
      const md0 = editingUser?.machineData && typeof editingUser.machineData === 'object' ? editingUser.machineData : {};
      const update = {};

      const nextName = String(editForm.name || '');
      const nextEmail = String(editForm.email || '');
      const nextPhone = String(editForm.phone || '');
      if (nextName !== String(editingUser.name || '')) update.name = nextName;
      if (nextEmail !== String(editingUser.email || '')) update.email = nextEmail;
      if (nextPhone !== String(editingUser.phone || '')) update.phone = nextPhone;

      if (tab === 'providers') {
        const nextRole = String(editForm.provider_role || '');
        if (nextRole !== String(editingUser.provider_role || '')) update.provider_role = nextRole;

        if (Boolean(editForm.isAvailable) !== Boolean(editingUser.isAvailable)) update.isAvailable = Boolean(editForm.isAvailable);
        if (Boolean(editForm.onboarding_completed) !== Boolean(editingUser.onboarding_completed)) {
          update.onboarding_completed = Boolean(editForm.onboarding_completed);
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
        const listKey = tab === 'clients' ? 'clients' : 'providers';
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
    if (tab === 'machines') return;
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
      setData((prev) => {
        const listKey = tab === 'clients' ? 'clients' : 'providers';
        const list = Array.isArray(prev[listKey]) ? prev[listKey] : [];
        const nextList = list.filter((x) => x?.id !== deleteTarget.id);
        const totalsPatch =
          tab === 'clients'
            ? { total_clients: Math.max(0, (prev.total_clients || 0) - 1) }
            : { total_providers: Math.max(0, (prev.total_providers || 0) - 1) };
        return { ...prev, [listKey]: nextList, ...totalsPatch };
      });
      toast.success('Usuario eliminado.');
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: ADMIN_THEME.appBg, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: ADMIN_THEME.panelBg,
        padding: '20px 24px',
        borderBottom: `1px solid ${ADMIN_THEME.border}`
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/admin')}
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
              aria-label="Volver a Reservas"
              title="Volver a Reservas"
            >
              <BackArrowIcon size={18} style={{ display: 'block' }} />
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#EC6819', fontFamily: "'Space Grotesk', sans-serif" }}>
              Usuarios registrados
            </h1>
          </div>
        </div>
        <div style={{ maxWidth: 1400, margin: '6px auto 0' }}>
          <p style={{ color: ADMIN_THEME.textMuted, fontSize: 13, margin: 0 }}>
            Clientes y proveedores en la plataforma
          </p>
        </div>
        <div style={{ maxWidth: 1400, margin: '14px auto 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: ADMIN_THEME.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Secciones
          </span>
          {[
            { key: 'dashboard', label: 'Reservas', to: '/admin' },
            { key: 'users', label: 'Usuarios', to: '/admin/users' },
            { key: 'pricing', label: 'Precios', to: '/admin/pricing' },
            { key: 'marketing', label: 'Marketing', to: '/admin/marketing' },
          ].map((it) => {
            const active = location.pathname === it.to || (it.to === '/admin' && location.pathname === '/admin');
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => navigate(it.to)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? `1px solid rgba(236, 104, 25, 0.55)` : `1px solid ${ADMIN_THEME.borderStrong}`,
                  background: active ? 'rgba(236, 104, 25, 0.18)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#fff' : 'rgba(255,255,255,0.85)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setTab('clients')}
            style={{
              padding: '10px 20px',
              background: tab === 'clients' ? ADMIN_PALETTE.brand : ADMIN_THEME.panelBg,
              border: 'none',
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
              background: tab === 'providers' ? ADMIN_PALETTE.brand : ADMIN_THEME.panelBg,
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Proveedores ({data.total_providers})
          </button>
          <button
            onClick={() => setTab('machines')}
            style={{
              padding: '10px 20px',
              background: tab === 'machines' ? ADMIN_PALETTE.brand : ADMIN_THEME.panelBg,
              border: 'none',
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
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Foto</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Maquinaria</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Patente</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Proveedor</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Onboarding</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Disponible</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineRows.map((m, i) => (
                      <tr key={`${m.providerId || 'prov'}-${i}`} style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: ADMIN_THEME.panelBgSoft }}>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Nombre</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Teléfono</th>
                      {tab === 'providers' && (
                        <>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Maquinaria</th>
                          <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Patente</th>
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
                    {normalizedUsers.map((u, i) => (
                      <tr key={u.id || i} style={{ borderTop: `1px solid ${ADMIN_THEME.border}` }}>
                        <td style={{ padding: 14, color: '#fff', fontSize: 13 }}>{u.name || '-'}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.email || '-'}</td>
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.phone || '-'}</td>
                        {tab === 'providers' && (
                          <>
                            <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{u.__machineryType}</td>
                            <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{u.__licensePlate}</td>
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
                              {u.provider_role === 'super_master'
                                ? 'Titular'
                                : u.provider_role === 'master'
                                  ? 'Gerente'
                                  : u.provider_role === 'operator'
                                    ? 'Operador'
                                    : u.provider_role || '-'}
                            </td>
                          </>
                        )}
                        <td style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{formatDate(u.createdAt)}</td>
                        <td style={{ padding: 14, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
              )}
            </div>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
          Los datos se almacenan en MongoDB (colección <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>users</code>).
          El registro se realiza desde la app (Empezar ahora / Ya tengo cuenta).
        </p>
      </div>

      {editingUser && editForm && (
        <div className="maqgo-modal-overlay" role="dialog" aria-modal="true">
          <div className="maqgo-modal-dialog" style={{ width: 'min(92vw, 540px)' }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>
              Editar {tab === 'clients' ? 'cliente' : 'proveedor'}
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
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

              {tab === 'providers' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editForm.onboarding_completed)}
                        onChange={(e) => setEditForm((p) => ({ ...p, onboarding_completed: e.target.checked }))}
                      />
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>Onboarding completo</span>
                    </label>
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
    </div>
  );
}

export default AdminUsersScreen;
