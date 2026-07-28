import React, { useMemo, useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/authHooks';
import { useToast } from '../../components/Toast';

import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { getOperatorInvitationWarning, getOverdueOperatorInvitations } from '../../utils/operatorInvitations';
import {
  formatRut,
  normalizeChileanMobileDraft,
  normalizeChileanMobileE164,
  sanitizeRutInput,
  validatePersonRut,
} from '../../utils/chileanValidation';

/**
 * Pantalla: Gestión de equipo (Mis operadores)
 *
 * - Lista de gerentes y operadores de la empresa
 * - Códigos de invitación: operador de campo vs gerente (master)
 * - La asignación de operador a una máquina concreta es en Mis máquinas (/provider/machines)
 */
function TeamManagementScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperMaster } = useAuth();
  const isSuperMasterUser = isSuperMaster();
  const toast = useToast();
  const requestedMode = (() => {
    try {
      const raw = new URLSearchParams(location.search).get('mode');
      return raw === 'master' || raw === 'operator' ? raw : null;
    } catch {
      return null;
    }
  })();
  const requestedTab = (() => {
    try {
      const raw = new URLSearchParams(location.search).get('tab');
      return raw === 'team' || raw === 'invite' ? raw : null;
    } catch {
      return null;
    }
  })();
  const requestedInviteView = (() => {
    try {
      const raw = new URLSearchParams(location.search).get('view');
      return raw === 'codes' || raw === 'create' ? raw : null;
    } catch {
      return null;
    }
  })();
  const screenMode = location.pathname === '/provider/managers' ? 'master' : 'operator';
  const resolvedMode = requestedMode || screenMode;
  const effectiveMode =
    resolvedMode === 'master' && !isSuperMasterUser
      ? 'operator'
      : resolvedMode;
  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'invite'
  const [inviteType, setInviteType] = useState(effectiveMode); // 'operator' | 'master'
  const [team, setTeam] = useState({ masters: [], operators: [], pending_invitations: [] });
  const [loading, setLoading] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [inviteDelivery, setInviteDelivery] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [operatorFirstName, setOperatorFirstName] = useState('');
  const [operatorLastName, setOperatorLastName] = useState('');
  const [operatorRut, setOperatorRut] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('+569');
  const [masterFirstName, setMasterFirstName] = useState('');
  const [masterLastName, setMasterLastName] = useState('');
  const [masterRut, setMasterRut] = useState('');
  const [masterPhone, setMasterPhone] = useState('+569');
  const [masterInvitePermissions, setMasterInvitePermissions] = useState({
    can_view_finance: false,
    can_manage_machines: false,
    can_manage_operators: false,
    can_create_work: false,
    can_assign_operator: false,
    can_view_work_details: true,
    can_edit_master_profile: false,
    can_delete_master: false,
    can_delete_machines: false,
  });
  const [didAttemptInvite, setDidAttemptInvite] = useState(false);
  const [, setFinanceSummary] = useState({ facturado: 0, porCobrar: 0, pagado: 0 });
  const [, setWorksByMaster] = useState({});
  const [, setDashboardLoading] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [editMemberType, setEditMemberType] = useState('operator');
  const [editName, setEditName] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const GPS_FRESH_MINUTES = 10;
  const GPS_STALE_MINUTES = 120;

  useEffect(() => {
    if (!isSuperMasterUser && (requestedMode === 'master' || location.pathname === '/provider/managers')) {
      navigate('/provider/team', { replace: true });
    }
    setInviteType(effectiveMode);
    setActiveTab(requestedTab || 'team');
    setShowCode(false);
    setInviteCode('');
    setBatchInvites(null);
    setDidAttemptInvite(false);
    setOperatorFirstName('');
    setOperatorLastName('');
    setOperatorRut('');
    setOperatorPhone('+569');
    setMasterFirstName('');
    setMasterLastName('');
    setMasterRut('');
    setMasterPhone('+569');
    setMasterInvitePermissions({
      can_view_finance: false,
      can_manage_machines: false,
      can_manage_operators: false,
      can_create_work: false,
      can_assign_operator: false,
      can_view_work_details: true,
      can_edit_master_profile: false,
      can_delete_master: false,
      can_delete_machines: false,
    });
  }, [effectiveMode, isSuperMasterUser, requestedMode, location.pathname, navigate]);

  const parseIsoOrNull = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getOperatorGpsBadge = (op) => {
    const isActive = Boolean(op?.isAvailable);
    if (!isActive) {
      return { color: '#F44336', title: 'GPS apagado o disponibilidad desactivada' };
    }
    const loc = op?.location;
    const hasCoords = Boolean(loc && typeof loc === 'object' && loc.lat != null && loc.lng != null);
    if (!hasCoords) {
      return { color: '#F44336', title: 'GPS sin ubicación válida' };
    }
    const updatedAt = parseIsoOrNull(op?.locationUpdatedAt);
    if (!updatedAt) {
      return { color: '#FFA726', title: 'Ubicación sin señal reciente' };
    }
    const diffMin = (Date.now() - updatedAt.getTime()) / 60000;
    if (diffMin <= GPS_FRESH_MINUTES) {
      return { color: '#4CAF50', title: 'GPS activo' };
    }
    if (diffMin <= GPS_STALE_MINUTES) {
      return { color: '#FFA726', title: 'GPS activo (señal débil)' };
    }
    return { color: '#F44336', title: 'GPS sin señal reciente' };
  };

  useEffect(() => {
    const fetchTeam = async () => {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId') || userId;
      try {
        const response = await axios.get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 8000 });
        setTeam(response.data);
      } catch (e) {
        console.error('Error loading team:', e);
        setTeam({
          masters: [],
          operators: [],
          pending_invitations: [],
          masters_count: 0,
          operators_count: 0
        });
      }
      setLoading(false);
    };
    fetchTeam();
  }, [refreshKey]);

  const loadTeam = () => setRefreshKey(k => k + 1);

  const joinDisplayName = (...parts) =>
    parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

  const normalizeEditablePhoneDraft = (raw, required = false) => {
    if (!String(raw || '').trim()) return required ? '+569' : '';
    return normalizeChileanMobileDraft(raw);
  };

  const getTeamMemberEndpoint = (ownerId, memberType, memberId) =>
    `${BACKEND_URL}/api/users/${encodeURIComponent(ownerId)}/${memberType === 'master' ? 'masters' : 'operators'}/${encodeURIComponent(memberId)}`;

  const getMemberStatusMeta = (member) => {
    const raw = String(member?.visible_status || member?.status || '').trim().toLowerCase();
    if (raw === 'pending' || raw === 'pending_activation') {
      return {
        label: 'Pendiente',
        background: 'rgba(255, 167, 38, 0.18)',
        color: '#FFA726',
      };
    }
    if (raw === 'inactive') {
      return {
        label: 'Inactivo',
        background: 'rgba(158, 158, 158, 0.18)',
        color: '#BDBDBD',
      };
    }
    return {
      label: 'Activo',
      background: 'rgba(76, 175, 80, 0.18)',
      color: '#4CAF50',
    };
  };

  const computeFinanceFromServices = (services) => {
    const list = Array.isArray(services) ? services : [];
    const amountReceived = (s) => {
      if (s?.paid_without_invoice && s?.amount_paid_to_provider != null) return Number(s.amount_paid_to_provider) || 0;
      return Number(s?.net_total) || 0;
    };
    let facturado = 0;
    let porCobrar = 0;
    let pagado = 0;
    list.forEach((s) => {
      const status = String(s?.status || '');
      const amt = amountReceived(s);
      if (status === 'paid') {
        pagado += amt;
        facturado += amt;
        return;
      }
      if (status === 'approved' || status === 'invoiced') {
        porCobrar += amt;
        facturado += amt;
      }
    });
    return { facturado: Math.round(facturado), porCobrar: Math.round(porCobrar), pagado: Math.round(pagado) };
  };

  const computeFinanceByMember = (services, members) => {
    const list = Array.isArray(services) ? services : [];
    const ids = new Set((Array.isArray(members) ? members : []).map((m) => String(m?.id || '')).filter(Boolean));
    const out = {};
    ids.forEach((id) => {
      out[id] = { facturado: 0, porCobrar: 0, pagado: 0 };
    });
    list.forEach((svc) => {
      const memberId = String(svc?.provider_id || svc?.providerId || '');
      if (!memberId || !ids.has(memberId)) return;
      out[memberId] = out[memberId] || { facturado: 0, porCobrar: 0, pagado: 0 };
      const totals = computeFinanceFromServices([svc]);
      out[memberId].facturado += totals.facturado;
      out[memberId].porCobrar += totals.porCobrar;
      out[memberId].pagado += totals.pagado;
    });
    return out;
  };

  const openEditMember = (memberType, member) => {
    setEditMember(member || null);
    setEditMemberType(memberType);
    setEditName(String(member?.name || '').trim());
    setEditRut(sanitizeRutInput(member?.rut || ''));
    setEditPhone(String(member?.phone || '').trim());
  };

  const closeEditMember = () => {
    setEditMember(null);
    setEditMemberType('operator');
    setEditName('');
    setEditRut('');
    setEditPhone('');
    setSavingMember(false);
  };

  const saveMemberEdit = async () => {
    if (!editMember?.id) return;
    const ownerId = localStorage.getItem('ownerId') || localStorage.getItem('userId');
    if (!ownerId) {
      toast.error('No pudimos identificar la empresa.');
      return;
    }
    const memberLabel = editMemberType === 'master' ? 'Gerente' : 'Operador';
    if (!editName.trim()) {
      toast.warning(`Ingresa el nombre del ${memberLabel}.`);
      return;
    }
    if (!validatePersonRut(editRut)) {
      toast.warning(`Ingresa un RUT de persona válido para el ${memberLabel}.`);
      return;
    }
    const normalizedPhone = normalizeChileanMobileE164(editPhone);
    if (editMemberType === 'master' && !normalizedPhone) {
      toast.warning('Completa un celular válido para el Gerente.');
      return;
    }
    if (editMemberType !== 'master' && editPhone.trim() && !normalizedPhone) {
      toast.warning('Ingresa un celular válido para el operador o déjalo vacío.');
      return;
    }

    setSavingMember(true);
    try {
      const payload = {
        name: editName.trim(),
        rut: formatRut(editRut),
        phone: normalizedPhone || '',
      };
      const res = await fetchWithAuth(
        getTeamMemberEndpoint(ownerId, editMemberType, editMember.id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        15000
      );
      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          detail = data?.detail ? String(data.detail) : '';
        } catch {
          void 0;
        }
        throw new Error(detail || `No pudimos actualizar el ${memberLabel}.`);
      }
      toast.success(`${editMemberType === 'master' ? 'Gerente' : 'Operador'} actualizado`);
      closeEditMember();
      loadTeam();
    } catch (e) {
      toast.error(e?.message || `No pudimos actualizar el ${memberLabel}.`);
      setSavingMember(false);
    }
  };

  useEffect(() => {
    if (!isSuperMasterUser) return;
    if (activeTab !== 'team') return;
    if (inviteType !== 'master') return;
    const userId = localStorage.getItem('userId');
    const ownerId = localStorage.getItem('ownerId') || userId;
    if (!ownerId) return;
    let cancelled = false;
    const run = async () => {
      setDashboardLoading(true);
      try {
        const servicesRes = await fetchWithAuth(`${BACKEND_URL}/api/services/provider/${ownerId}`, {}, 20000);
        if (cancelled) return;
        const servicesData = servicesRes.ok ? await servicesRes.json() : {};
        const services = Array.isArray(servicesData?.services) ? servicesData.services : [];
        setFinanceSummary(computeFinanceFromServices(services));
        const masterIds = (Array.isArray(team.masters) ? team.masters : [])
          .map((m) => String(m?.id || ''))
          .filter(Boolean);
        const masterResponses = await Promise.all(
          masterIds.map((id) => fetchWithAuth(`${BACKEND_URL}/api/services/provider/${encodeURIComponent(id)}`, {}, 20000))
        );
        const allMasterServices = [];
        for (const r of masterResponses) {
          if (!r?.ok) continue;
          try {
            const d = await r.json();
            const list = Array.isArray(d?.services) ? d.services : [];
            allMasterServices.push(...list);
          } catch {
            void 0;
          }
        }
        setWorksByMaster(computeFinanceByMember(allMasterServices, team.masters));
      } catch {
        if (cancelled) return;
        setFinanceSummary({ facturado: 0, porCobrar: 0, pagado: 0 });
        setWorksByMaster({});
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, inviteType, isSuperMasterUser, refreshKey, team.masters]);

  const generateInviteCode = async () => {
    setDidAttemptInvite(true);
    setInviting(true);
    try {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId') || userId;

      const endpoint = inviteType === 'master' 
        ? `${BACKEND_URL}/api/operators/masters/invite`
        : `${BACKEND_URL}/api/operators/invite`;

      // Validaciones básicas para operador: nombre completo y RUT obligatorios
      let payload = { owner_id: ownerId };
      if (inviteType === 'operator') {
        const fullName = joinDisplayName(operatorFirstName, operatorLastName);
        if (!operatorFirstName.trim() || !operatorLastName.trim() || !operatorRut.trim()) {
          toast.warning('Ingresa nombre, apellido y RUT del operador antes de invitarlo.');
          setInviting(false);
          return;
        }
        if (!validatePersonRut(operatorRut)) {
          toast.warning('Ingresa un RUT de persona válido para el operador. No se acepta RUT empresa.');
          setInviting(false);
          return;
        }
        const normalizedPhone = normalizeChileanMobileE164(operatorPhone);
        payload = {
          owner_id: ownerId,
          operator_name: fullName,
          operator_phone: normalizedPhone || undefined,
          operator_rut: formatRut(operatorRut.trim()),
        };
      } else if (inviteType === 'master') {
        const fullName = joinDisplayName(masterFirstName, masterLastName);
        if (!validatePersonRut(masterRut)) {
          toast.warning('Ingresa un RUT de persona válido para el Gerente. No se acepta RUT empresa.');
          setInviting(false);
          return;
        }
        const normalizedPhone = normalizeChileanMobileE164(masterPhone);
        if (!masterFirstName.trim() || !masterLastName.trim() || !masterRut.trim() || !normalizedPhone) {
          toast.warning('Completa nombre, apellido, RUT y celular del Gerente antes de invitarlo.');
          setInviting(false);
          return;
        }
        payload = {
          owner_id: ownerId,
          master_name: masterFirstName.trim(),
          master_last_name: masterLastName.trim(),
          master_rut: formatRut(masterRut.trim()),
          master_phone: normalizedPhone,
          master_full_name: fullName,
          permissions: masterInvitePermissions,
        };
      }

      const response = await axios.post(endpoint, payload);
      
      setInviteDelivery({
        inviteType,
        targetName:
          inviteType === 'master'
            ? joinDisplayName(masterFirstName, masterLastName)
            : joinDisplayName(operatorFirstName, operatorLastName),
        phone:
          response?.data?.delivery?.phone ||
          (inviteType === 'master' ? payload.master_phone : payload.operator_phone) ||
          '',
        smsSent: Boolean(response?.data?.delivery?.sms_sent),
        smsError: response?.data?.delivery?.sms_error || '',
      });
      setShowCode(true);
      // Limpiar formulario de datos de operador
      setOperatorFirstName('');
      setOperatorLastName('');
      setOperatorRut('');
      setOperatorPhone('+569');
      setMasterFirstName('');
      setMasterLastName('');
      setMasterRut('');
      setMasterPhone('+569');
      setDidAttemptInvite(false);
      loadTeam(); // Recargar para ver la invitación pendiente
    } catch (e) {
      console.error('Error generating invite:', e);
      toast.error(e.response?.data?.detail || 'No pudimos enviar la invitación.');
    }
    setInviting(false);
  };

  const executeConfirmAction = async () => {
    if (!confirmAction?.memberId || !confirmAction?.memberType) return;
    const ownerId = localStorage.getItem('ownerId') || localStorage.getItem('userId');
    if (!ownerId) {
      toast.error('No pudimos identificar la empresa.');
      return;
    }
    const memberLabel = confirmAction.memberType === 'master' ? 'Gerente' : 'Operador';
    try {
      const res = await fetchWithAuth(
        getTeamMemberEndpoint(ownerId, confirmAction.memberType, confirmAction.memberId),
        confirmAction.action === 'deactivate'
          ? {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'inactive' }),
            }
          : { method: 'DELETE' },
        15000
      );
      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          detail = data?.detail ? String(data.detail) : '';
        } catch {
          void 0;
        }
        throw new Error(detail || `No pudimos desactivar el ${memberLabel}.`);
      }
      toast.success(`${confirmAction.memberType === 'master' ? 'Gerente' : 'Operador'} desactivado`);
      setConfirmAction(null);
      loadTeam();
    } catch (e) {
      toast.error(e?.message || `No pudimos desactivar el ${memberLabel}.`);
    }
  };

  const cancelInvitation = async (code) => {
    try {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId') || userId;
      
      await axios.delete(`${BACKEND_URL}/api/operators/invitation/${code}?owner_id=${ownerId}`);
      loadTeam();
    } catch (e) {
      console.error('Error canceling invitation:', e);
    }
  };

  const missingInviteFields = [];
  if (inviteType === 'operator') {
    if (!operatorFirstName.trim()) missingInviteFields.push('Nombre');
    if (!operatorLastName.trim()) missingInviteFields.push('Apellido');
    if (!validatePersonRut(operatorRut)) missingInviteFields.push('RUT persona');
    if (operatorPhone !== '+569' && !normalizeChileanMobileE164(operatorPhone)) missingInviteFields.push('Celular válido');
  }
  if (inviteType === 'master') {
    if (!masterFirstName.trim()) missingInviteFields.push('Nombre');
    if (!masterLastName.trim()) missingInviteFields.push('Apellido');
    if (!validatePersonRut(masterRut)) missingInviteFields.push('RUT persona');
    if (!normalizeChileanMobileE164(masterPhone)) missingInviteFields.push('Celular');
  }
  const isInviteFormValid =
    missingInviteFields.length === 0;
  const visiblePendingInvitations = (team.pending_invitations || []).filter((inv) => {
    const t = inv?.invite_type || 'operator';
    return inviteType === 'master' ? t === 'master' : t !== 'master';
  });
  const overduePendingInvitations = useMemo(
    () => inviteType === 'operator' ? getOverdueOperatorInvitations(visiblePendingInvitations) : [],
    [inviteType, visiblePendingInvitations]
  );
  const currentMembers = inviteType === 'master' ? (team.masters || []) : (team.operators || []);
  const currentCount = currentMembers.length;
  const createLabel = inviteType === 'master' ? 'Crear Gerente' : 'Crear Operador';
  const listTitle = inviteType === 'master' ? 'Gerentes creados' : 'Operadores creados';
  const inviteView =
    activeTab === 'invite'
      ? (requestedInviteView === 'codes' ? 'codes' : 'create')
      : 'create';
  const masterPermissionGroups = [
    {
      title: 'Mis máquinas',
      items: [
        {
          k: 'can_manage_machines',
          label: 'Puede editar máquinas y operadores por máquina',
          help: 'Permite crear, editar y actualizar qué operador queda asociado a cada máquina.',
        },
        {
          k: 'can_delete_machines',
          label: 'Puede eliminar máquinas',
          help: 'Permite eliminar maquinaria desde Mis Máquinas. Acción sensible.',
        },
        {
          k: 'can_assign_operator',
          label: 'Puede asignar o cambiar operador en servicios',
          help: 'Permite definir qué operador irá en un servicio aceptado.',
        },
      ],
    },
    {
      title: 'Mi empresa',
      items: [
        {
          k: 'can_edit_master_profile',
          label: 'Puede editar datos de empresa',
          help: 'Permite actualizar datos visibles de la empresa en MAQGO.',
        },
        {
          k: 'can_view_finance',
          label: 'Puede ver pagos y facturas',
          help: 'Permite revisar pagos, facturas y estados de cobro.',
        },
      ],
    },
    {
      title: 'Usuarios y accesos',
      items: [
        {
          k: 'can_manage_operators',
          label: 'Puede crear y administrar operadores',
          help: 'Permite generar invitaciones, revisar accesos y gestionar operadores.',
        },
        {
          k: 'can_delete_master',
          label: 'Puede desactivar Gerentes',
          help: 'Permite quitar acceso operativo a otros Gerentes.',
        },
      ],
    },
    {
      title: 'Solicitudes',
      items: [
        {
          k: 'can_view_work_details',
          label: 'Puede ver solicitudes de servicio y su detalle',
          help: 'Permite revisar solicitudes que llegan desde clientes, pero no decidir sobre ellas.',
        },
        {
          k: 'can_create_work',
          label: 'Puede aceptar o rechazar solicitudes de servicio',
          help: 'Permite tomar la decisión operativa sobre una solicitud de cliente.',
        },
      ],
    },
  ];

  if (inviteType === 'master' && !isSuperMasterUser) {
    return <Navigate to="/provider/team" replace />;
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button 
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 8
            }}
            data-testid="back-btn"
            aria-label="Volver"
          >
            <BackArrowIcon />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 18 }}>
          {showCode
            ? inviteType === 'master'
              ? 'Invitación enviada'
              : 'Invitación enviada'
            : activeTab === 'invite'
              ? inviteView === 'codes'
                ? 'Invitaciones pendientes'
                : inviteType === 'master'
                  ? 'Crear Gerente'
                  : 'Crear Operador'
              : 'Usuarios y accesos'}
        </h1>

        {isSuperMasterUser && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: 4,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
            <button
              type="button"
              onClick={() => navigate(`/provider/team?mode=operator&tab=${encodeURIComponent(activeTab)}`, { replace: true })}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: inviteType === 'operator' ? '#EC6819' : 'transparent',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Operadores
            </button>
            <button
              type="button"
              onClick={() => navigate(`/provider/team?mode=master&tab=${encodeURIComponent(activeTab)}`, { replace: true })}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: inviteType === 'master' ? '#EC6819' : 'transparent',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Gerente
            </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: activeTab === 'invite' ? 'flex-end' : 'space-between', gap: 12, marginBottom: 20 }}>
          {activeTab === 'team' && (
            <div>
              <p style={{ color: '#fff', fontSize: 16, margin: 0, fontWeight: 700 }}>
                {listTitle}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, margin: '4px 0 0' }}>
                {`${currentCount} creados`}
              </p>
            </div>
          )}
          {activeTab === 'team' ? (
            <button
              onClick={() => {
                setActiveTab('invite');
                setShowCode(false);
                const modeQs = inviteType === 'master' ? 'master' : 'operator';
                navigate(`/provider/team?mode=${encodeURIComponent(modeQs)}&tab=invite&view=create`, { replace: true });
              }}
              style={{
                padding: '10px 14px',
                background: '#EC6819',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              data-testid="tab-invite"
            >
              {createLabel}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {inviteView === 'codes' && (
                <button
                  onClick={() => {
                    setShowCode(false);
                    const modeQs = inviteType === 'master' ? 'master' : 'operator';
                    navigate(`/provider/team?mode=${encodeURIComponent(modeQs)}&tab=invite&view=create`, { replace: true });
                  }}
                  style={{
                    padding: '10px 14px',
                    background: '#EC6819',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {createLabel}
                </button>
              )}
              <button
                onClick={() => {
                  setActiveTab('team');
                  setShowCode(false);
                  const modeQs = inviteType === 'master' ? 'master' : 'operator';
                  navigate(`/provider/team?mode=${encodeURIComponent(modeQs)}&tab=team`, { replace: true });
                }}
                style={{
                  padding: '10px 14px',
                  background: '#2A2A2A',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                data-testid="tab-team"
              >
                Volver a lista
              </button>
            </div>
          )}
        </div>

        {/* Tab: Equipo */}
        {activeTab === 'team' && (
          <div>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.95)', textAlign: 'center' }}>Cargando...</p>
            ) : (
              <>
                {inviteType === 'master' ? (
                  <div style={{ marginBottom: 20 }}>
                    {team.masters && team.masters.length > 0 ? (
                      team.masters.map((member, idx) => {
                        const statusMeta = getMemberStatusMeta(member);
                        return (
                        <div
                          key={member.id || idx}
                          style={{
                            background: '#2A2A2A',
                            borderRadius: 12,
                            padding: 14,
                            marginBottom: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: '50%',
                              background: '#363636',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ color: '#9C27B0', fontSize: 18, fontWeight: 700 }}>
                              {member.name?.charAt(0) || 'M'}
                            </span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                              {member.name}
                            </p>
                            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                              {member.rut && (
                                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                  RUT: {member.rut}
                                </p>
                              )}
                              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                                {member.phone || 'Sin celular'}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span
                              style={{
                                padding: '4px 10px',
                                borderRadius: 20,
                                background: 'rgba(156, 39, 176, 0.2)',
                                color: '#9C27B0',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              Gerente
                            </span>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: 20,
                              background: statusMeta.background,
                              color: statusMeta.color,
                              fontSize: 13,
                              fontWeight: 600,
                            }}>
                              {statusMeta.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditMember('master', member)}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ action: 'deactivate', memberType: 'master', memberId: member.id, memberName: member.name })}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(255, 167, 38, 0.18)',
                                border: '1px solid rgba(255, 167, 38, 0.35)',
                                borderRadius: 8,
                                color: '#FFA726',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Desactivar
                            </button>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 18 }}>
                        <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>
                          Aún no tienes Gerentes creados.
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.45 }}>
                          El Titular no aparece aquí.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                  {team.operators && team.operators.length > 0 ? (
                    team.operators.map((op, idx) => (
                      (() => {
                        const gpsBadge = getOperatorGpsBadge(op);
                        const statusMeta = getMemberStatusMeta(op);
                        return (
                      <div 
                        key={op.id || idx}
                        style={{
                          background: '#2A2A2A',
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                      >
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: '#363636',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{ color: '#90BDD3', fontSize: 18, fontWeight: 700 }}>
                            {op.name?.charAt(0) || 'O'}
                          </span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                            {op.name}
                          </p>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {op.rut && (
                              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                RUT: {op.rut}
                              </p>
                            )}
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                              {op.phone || 'Sin celular'}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                              {op.services_completed || 0} servicios
                            </p>
                          </div>
                        </div>
                        <div style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: gpsBadge.color,
                          boxShadow: `0 0 0 3px ${gpsBadge.color}22`
                        }} title={gpsBadge.title}></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 20,
                            background: statusMeta.background,
                            color: statusMeta.color,
                            fontSize: 13,
                            fontWeight: 600
                          }}>
                            {statusMeta.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditMember('operator', op)}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: 8,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ action: 'deactivate', memberType: 'operator', memberId: op.id, memberName: op.name })}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(255, 167, 38, 0.18)',
                              border: '1px solid rgba(255, 167, 38, 0.35)',
                              borderRadius: 8,
                              color: '#FFA726',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Desactivar
                          </button>
                        </div>
                      </div>
                        );
                      })()
                    ))
                  ) : (
                    <div style={{
                      background: '#2A2A2A',
                      borderRadius: 12,
                      padding: 18
                    }}>
                      <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>
                        Aun no tienes operadores creados.
                      </p>
                    </div>
                  )}
                </div>
                )}

                {/* Invitaciones pendientes */}
                {visiblePendingInvitations.length > 0 && (
                  <div>
                    {inviteType === 'operator' && overduePendingInvitations.length > 0 && (
                      <div
                        style={{
                          background: 'rgba(255, 167, 38, 0.12)',
                          border: '1px solid rgba(255, 167, 38, 0.42)',
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ color: '#FFA726', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                          Warning de enrolamiento
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, lineHeight: 1.45 }}>
                          {overduePendingInvitations.length === 1
                            ? 'Hay 1 operador con mas de 24 horas sin completar su invitacion.'
                            : `Hay ${overduePendingInvitations.length} operadores con mas de 24 horas sin completar su invitacion.`}
                        </div>
                      </div>
                    )}
                    <p style={{ 
                      color: 'rgba(255,255,255,0.95)', 
                      fontSize: 12, 
                      textTransform: 'uppercase',
                      marginBottom: 10
                    }}>
                      Invitaciones pendientes ({visiblePendingInvitations.length})
                    </p>
                    {visiblePendingInvitations.map((inv, idx) => {
                      const warning = getOperatorInvitationWarning(inv);
                      return (
                      <div 
                        key={inv.code || idx}
                        style={{
                          background: warning?.overdue ? 'rgba(255, 167, 38, 0.10)' : '#2A2A2A',
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                          borderLeft: warning?.overdue ? '4px solid #FFA726' : '4px solid rgba(255,255,255,0.18)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, fontWeight: 700 }}>
                              {inv.invite_type === 'master' ? 'Para Gerente' : 'Para Operador'}
                            </p>
                            {inv.invite_type === 'master' && inv.master_name && (
                              <div style={{ marginTop: 6 }}>
                                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                  {joinDisplayName(inv.master_name, inv.master_last_name)}
                                </p>
                                {inv.master_rut ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    RUT {inv.master_rut}
                                  </p>
                                ) : null}
                                {inv.master_phone ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    {inv.master_phone}
                                  </p>
                                ) : null}
                              </div>
                            )}
                            {inv.invite_type !== 'master' && inv.operator_name && (
                              <div style={{ marginTop: 6 }}>
                                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                  {inv.operator_name}
                                </p>
                                {inv.operator_rut ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    RUT {inv.operator_rut}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => cancelInvitation(inv.code)}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(244, 67, 54, 0.2)',
                                border: '1px solid rgba(244, 67, 54, 0.35)',
                                borderRadius: 6,
                                color: '#F44336',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: 20,
                            background: 'rgba(255, 167, 38, 0.18)',
                            color: '#FFA726',
                            fontSize: 13,
                            fontWeight: 600
                          }}>
                            Pendiente
                          </span>
                          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
                            SMS enviado automaticamente por MAQGO.
                          </div>
                          {warning ? (
                            <div
                              style={{
                                marginTop: 8,
                                color: warning.overdue ? '#FFA726' : 'rgba(255,255,255,0.72)',
                                fontSize: 12,
                                fontWeight: warning.overdue ? 700 : 500,
                              }}
                            >
                              {warning.message}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Agregar */}
        {activeTab === 'invite' && (
          <div>
            {inviteView === 'codes' ? (
              visiblePendingInvitations.length > 0 ? (
                <div>
                  {inviteType === 'operator' && overduePendingInvitations.length > 0 && (
                    <div
                      style={{
                        background: 'rgba(255, 167, 38, 0.12)',
                        border: '1px solid rgba(255, 167, 38, 0.42)',
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ color: '#FFA726', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                        Warning de enrolamiento
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, lineHeight: 1.45 }}>
                        {overduePendingInvitations.length === 1
                          ? 'Hay 1 operador con mas de 24 horas sin completar su invitacion.'
                          : `Hay ${overduePendingInvitations.length} operadores con mas de 24 horas sin completar su invitacion.`}
                      </div>
                    </div>
                  )}
                  <p style={{
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}>
                    Invitaciones pendientes ({visiblePendingInvitations.length})
                  </p>
                  {visiblePendingInvitations.map((inv, idx) => {
                    const warning = getOperatorInvitationWarning(inv);
                    return (
                      <div
                        key={inv.code || idx}
                        style={{
                          background: warning?.overdue ? 'rgba(255, 167, 38, 0.10)' : '#2A2A2A',
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                          borderLeft: warning?.overdue ? '4px solid #FFA726' : '4px solid rgba(255,255,255,0.18)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, fontWeight: 700 }}>
                              {inv.invite_type === 'master' ? 'Para Gerente' : 'Para Operador'}
                            </p>
                            {inv.invite_type === 'master' && inv.master_name && (
                              <div style={{ marginTop: 6 }}>
                                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                  {joinDisplayName(inv.master_name, inv.master_last_name)}
                                </p>
                                {inv.master_rut ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    RUT {inv.master_rut}
                                  </p>
                                ) : null}
                                {inv.master_phone ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    {inv.master_phone}
                                  </p>
                                ) : null}
                              </div>
                            )}
                            {inv.invite_type !== 'master' && inv.operator_name && (
                              <div style={{ marginTop: 6 }}>
                                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                  {inv.operator_name}
                                </p>
                                {inv.operator_rut ? (
                                  <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12, margin: '4px 0 0' }}>
                                    RUT {inv.operator_rut}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => cancelInvitation(inv.code)}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(244,67,54,0.16)',
                                border: '1px solid rgba(244,67,54,0.30)',
                                borderRadius: 6,
                                color: '#F44336',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
                          SMS enviado automaticamente por MAQGO.
                        </div>
                        {warning ? (
                          <div style={{ marginTop: 8, color: warning.color, fontSize: 12, lineHeight: 1.45 }}>
                            {warning.message}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 18 }}>
                  <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>
                    No tienes invitaciones pendientes.
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.45 }}>
                    Cuando generes una invitación para Operador o Gerente, la verás aquí.
                  </p>
                </div>
              )
            ) : !showCode ? (
              <>
                {/* Datos del operador cuando la invitación es para operador */}
                {inviteType === 'operator' && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                          Nombre *
                        </label>
                        <input
                          className="maqgo-input"
                          type="text"
                          value={operatorFirstName}
                          onChange={(e) => setOperatorFirstName(e.target.value)}
                          placeholder="Ej: Juan"
                          style={{
                            border: didAttemptInvite && !operatorFirstName.trim() ? '1px solid #F44336' : '1px solid #444',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                          Apellido *
                        </label>
                        <input
                          className="maqgo-input"
                          type="text"
                          value={operatorLastName}
                          onChange={(e) => setOperatorLastName(e.target.value)}
                          placeholder="Ej: Pérez"
                          style={{
                            border: didAttemptInvite && !operatorLastName.trim() ? '1px solid #F44336' : '1px solid #444',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        RUT *
                      </label>
                      <input
                        className="maqgo-input"
                        type="text"
                        value={formatRut(operatorRut)}
                        onChange={(e) => setOperatorRut(sanitizeRutInput(e.target.value))}
                        placeholder="12.345.678-9"
                        style={{
                          border: didAttemptInvite && !validatePersonRut(operatorRut) ? '1px solid #F44336' : '1px solid #444',
                          fontFamily: "'JetBrains Mono', monospace"
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Celular
                      </label>
                      <input
                        className="maqgo-input"
                        type="tel"
                        value={operatorPhone}
                        onChange={(e) => setOperatorPhone(normalizeChileanMobileDraft(e.target.value))}
                        placeholder="+56 9 1234 5678"
                        style={{
                          border:
                            didAttemptInvite && operatorPhone !== '+569' && !normalizeChileanMobileE164(operatorPhone)
                              ? '1px solid #F44336'
                              : '1px solid #444',
                        }}
                      />
                    </div>
                    {didAttemptInvite && missingInviteFields.length > 0 && (
                      <p style={{ color: '#F44336', fontSize: 12, margin: '2px 0 10px' }}>
                        Falta completar: {missingInviteFields.join(', ')}.
                      </p>
                    )}
                  </div>
                )}

                {inviteType === 'master' && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                            Nombre *
                          </label>
                          <input
                            className="maqgo-input"
                            type="text"
                            value={masterFirstName}
                            onChange={(e) => setMasterFirstName(e.target.value)}
                            placeholder="Ej: María"
                            style={{
                              border: didAttemptInvite && !masterFirstName.trim() ? '1px solid #F44336' : '1px solid #444',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                            Apellido *
                          </label>
                          <input
                            className="maqgo-input"
                            type="text"
                            value={masterLastName}
                            onChange={(e) => setMasterLastName(e.target.value)}
                            placeholder="Ej: Soto"
                            style={{
                              border: didAttemptInvite && !masterLastName.trim() ? '1px solid #F44336' : '1px solid #444',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        RUT *
                      </label>
                      <input
                        className="maqgo-input"
                        type="text"
                        value={formatRut(masterRut)}
                        onChange={(e) => setMasterRut(sanitizeRutInput(e.target.value))}
                        placeholder="12.345.678-9"
                        style={{
                          border: didAttemptInvite && !validatePersonRut(masterRut) ? '1px solid #F44336' : '1px solid #444',
                          fontFamily: "'JetBrains Mono', monospace"
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Celular *
                      </label>
                      <input
                        className="maqgo-input"
                        type="tel"
                        value={masterPhone}
                        onChange={(e) => setMasterPhone(normalizeChileanMobileDraft(e.target.value))}
                        placeholder="+56 9 1234 5678"
                        style={{
                          border: didAttemptInvite && !normalizeChileanMobileE164(masterPhone) ? '1px solid #F44336' : '1px solid #444',
                        }}
                      />
                    </div>

                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', margin: '8px 0 10px' }}>
                      Permisos
                    </p>
                    <div>
                      {masterPermissionGroups.map((group) => (
                        <div
                          key={group.title}
                          style={{
                            marginBottom: 12,
                            background: '#2A2A2A',
                            borderRadius: 12,
                            padding: 12,
                            border: '1px solid rgba(255,255,255,0.10)',
                          }}
                        >
                          <p style={{ color: '#fff', fontSize: 13, margin: '0 0 10px', fontWeight: 700 }}>
                            {group.title}
                          </p>
                          {group.items.map((it) => {
                            const checked = Boolean(masterInvitePermissions?.[it.k]);
                            return (
                              <button
                                key={it.k}
                                type="button"
                                onClick={() =>
                                  setMasterInvitePermissions((prev) => ({
                                    ...(prev || {}),
                                    [it.k]: !prev?.[it.k],
                                  }))
                                }
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  padding: '10px 12px',
                                  borderRadius: 10,
                                  border: '1px solid rgba(255,255,255,0.10)',
                                  background: checked ? 'rgba(236, 104, 25, 0.18)' : 'rgba(255,255,255,0.04)',
                                  cursor: 'pointer',
                                  marginBottom: 8,
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 10 }}>
                                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{it.label}</span>
                                  {it.help ? (
                                    <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.35 }}>
                                      {it.help}
                                    </span>
                                  ) : null}
                                </span>
                                <span
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    border: checked ? '1px solid #EC6819' : '1px solid rgba(255,255,255,0.35)',
                                    background: checked ? '#EC6819' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: '#fff',
                                    fontSize: 12,
                                    fontWeight: 900,
                                  }}
                                >
                                  {checked ? '✓' : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    {didAttemptInvite && missingInviteFields.length > 0 && (
                      <p style={{ color: '#F44336', fontSize: 12, margin: '10px 0 0' }}>
                        Falta completar: {missingInviteFields.join(', ')}.
                      </p>
                    )}
                  </div>
                )}

                <button
                  className="maqgo-btn-primary"
                  onClick={generateInviteCode}
                  disabled={inviting || !isInviteFormValid}
                  style={{ opacity: (inviting || !isInviteFormValid) ? 0.6 : 1 }}
                  data-testid="generate-code-btn"
                >
                  {inviting
                    ? 'Generando...'
                    : 'Generar invitación'}
                </button>
              </>
            ) : (
              /* Invitación generada */
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: inviteType === 'master' ? '#9C27B0' : '#90BDD3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px'
                }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12L11 14L15 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                <h2 style={{ 
                  color: '#fff', 
                  fontSize: 20, 
                  fontWeight: 700, 
                  margin: '0 0 8px',
                  fontFamily: "'Space Grotesk', sans-serif"
                }}>
                  {inviteType === 'master' ? 'Invitación enviada' : 'Invitación enviada'}
                </h2>
                
                <p style={{ 
                  color: 'rgba(255,255,255,0.95)', 
                  fontSize: 13, 
                  margin: '0 0 25px'
                }}>
                  {inviteType === 'master' ? 'MAQGO ya envió el SMS al nuevo Gerente.' : 'MAQGO ya envió el SMS al nuevo Operador.'}
                </p>
                <div style={{
                  background: '#2A2A2A',
                  borderRadius: 16,
                  padding: 24,
                  marginBottom: 20
                }}>
                  <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>
                    {inviteDelivery?.targetName || (inviteType === 'master' ? 'Gerente invitado' : 'Operador invitado')}
                  </p>
                  {inviteDelivery?.phone ? (
                    <p style={{ color: 'rgba(255,255,255,0.76)', fontSize: 13, margin: '8px 0 0' }}>
                      SMS enviado a {inviteDelivery.phone}
                    </p>
                  ) : null}
                  <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.5 }}>
                    {inviteDelivery?.smsSent
                      ? 'La invitacion ya fue enviada automaticamente por MAQGO. La empresa no necesita copiar ni compartir nada manualmente.'
                      : 'Registramos la invitacion, pero el SMS no pudo confirmarse. Revisa el celular y vuelve a intentar si es necesario.'}
                  </p>
                  {inviteDelivery?.smsError ? (
                    <p style={{ color: '#FFA726', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
                      Detalle: {inviteDelivery.smsError}
                    </p>
                  ) : null}
                </div>

                <button
                  onClick={() => {
                    setShowCode(false);
                    setInviteDelivery(null);
                    setActiveTab('team');
                  }}
                  style={{
                    width: '100%',
                    padding: 14,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 10,
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Volver a lista
                </button>
              </div>
            )}
          </div>
        )}

        {editMember ? (
          <div className="maqgo-modal-overlay" role="dialog" aria-modal="true" onClick={closeEditMember}>
            <div
              className="maqgo-modal-dialog"
              style={{ width: 'min(92vw, 520px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>
                {editMemberType === 'master' ? 'Editar Gerente' : 'Editar Operador'}
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Nombre y apellido *</span>
                  <input
                    className="maqgo-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={editMemberType === 'master' ? 'Ej: María Soto' : 'Ej: Juan Pérez'}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>RUT *</span>
                  <input
                    className="maqgo-input"
                    value={formatRut(editRut)}
                    onChange={(e) => setEditRut(sanitizeRutInput(e.target.value))}
                    placeholder="12.345.678-9"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                    {editMemberType === 'master' ? 'Celular *' : 'Celular'}
                  </span>
                  <input
                    className="maqgo-input"
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(normalizeEditablePhoneDraft(e.target.value, editMemberType === 'master'))}
                    placeholder="+56 9 1234 5678"
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={closeEditMember}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'rgba(255,255,255,0.95)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveMemberEdit}
                  disabled={savingMember}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#EC6819',
                    border: 'none',
                    color: '#fff',
                    cursor: savingMember ? 'default' : 'pointer',
                    fontWeight: 700,
                    opacity: savingMember ? 0.6 : 1,
                  }}
                >
                  {savingMember ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmModal
          open={Boolean(confirmAction)}
          onClose={() => setConfirmAction(null)}
          title={`Desactivar ${confirmAction?.memberType === 'master' ? 'Gerente' : 'Operador'}`}
          message={`Desactivar a ${confirmAction?.memberName || 'este usuario'} para que deje de estar disponible en la empresa?`}
          confirmLabel="Desactivar"
          cancelLabel="Cancelar"
          onConfirm={executeConfirmAction}
          variant="primary"
        />
      </div>
    </div>
  );
}

export default TeamManagementScreen;
