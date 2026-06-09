import React, { useMemo, useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/authHooks';
import { useToast } from '../../components/Toast';

import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { getOperatorInvitationWarning, getOverdueOperatorInvitations } from '../../utils/operatorInvitations';

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
  const [inviteCode, setInviteCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [batchInvites, setBatchInvites] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [operatorNombreCompleto, setOperatorNombreCompleto] = useState('');
  const [operatorRut, setOperatorRut] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('');
  const [masterInvitePermissions, setMasterInvitePermissions] = useState({
    can_view_finance: false,
    can_manage_machines: false,
    can_manage_operators: false,
    can_create_work: false,
    can_assign_operator: false,
    can_view_work_details: true,
    can_edit_master_profile: false,
    can_delete_master: false,
  });
  const [didAttemptInvite, setDidAttemptInvite] = useState(false);
  const [declaredOperators, setDeclaredOperators] = useState([]);
  const [declaredLoading, setDeclaredLoading] = useState(false);
  const [selectedDeclaredKeys, setSelectedDeclaredKeys] = useState(() => new Set());
  const [inviteSearch, setInviteSearch] = useState('');
  const [useManualInvite, setUseManualInvite] = useState(false);
  const [financeSummary, setFinanceSummary] = useState({ facturado: 0, porCobrar: 0, pagado: 0 });
  const [worksByMaster, setWorksByMaster] = useState({});
  const [dashboardLoading, setDashboardLoading] = useState(false);
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
    setOperatorNombreCompleto('');
    setOperatorRut('');
    setOperatorPhone('');
    setMasterInvitePermissions({
      can_view_finance: false,
      can_manage_machines: false,
      can_manage_operators: false,
      can_create_work: false,
      can_assign_operator: false,
      can_view_work_details: true,
      can_edit_master_profile: false,
      can_delete_master: false,
    });
    setInviteSearch('');
    setUseManualInvite(false);
    setSelectedDeclaredKeys(new Set());
  }, [effectiveMode, isSuperMasterUser, requestedMode, location.pathname, navigate]);

  const normalizeRutKey = (rut) => String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

  const parseIsoOrNull = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getOperatorGpsBadge = (op) => {
    const isActive = Boolean(op?.isAvailable);
    if (!isActive) {
      return { color: '#F44336', title: 'GPS apagado o servicio activo desactivado' };
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

  useEffect(() => {
    let cancelled = false;
    if (activeTab !== 'invite' || inviteType !== 'operator') return () => void 0;
    const userId = localStorage.getItem('userId');
    const ownerId = localStorage.getItem('ownerId') || userId;
    if (!ownerId) return () => void 0;
    setDeclaredLoading(true);
    fetchWithAuth(`${BACKEND_URL}/api/users/${encodeURIComponent(ownerId)}`, { method: 'GET' }, 8000)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((user) => {
        if (cancelled) return;
        const raw = Array.isArray(user?.operators) ? user.operators : [];
        const normalized = raw
          .map((op, idx) => {
            if (!op || typeof op !== 'object') return null;
            const nombre = String(op.nombre || '').trim();
            const apellido = String(op.apellido || '').trim();
            const name = String(op.name || `${nombre} ${apellido}`.trim()).trim();
            const rut = String(op.rut || '').trim();
            const key = normalizeRutKey(rut) || `op_${idx + 1}`;
            return { key, name, rut };
          })
          .filter(Boolean);
        setDeclaredOperators(normalized);
        if (normalized.length === 0) {
          setUseManualInvite(true);
          setSelectedDeclaredKeys(new Set());
          return;
        }
        setUseManualInvite(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDeclaredOperators([]);
        setUseManualInvite(true);
      })
      .finally(() => {
        if (cancelled) return;
        setDeclaredLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, inviteType, refreshKey]);

  const loadTeam = () => setRefreshKey(k => k + 1);

  const normalizePhoneForChannel = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('+')) {
      return `+${s.slice(1).replace(/\D/g, '')}`;
    }
    const digits = s.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('56')) return `+${digits}`;
    if (digits.length === 9) return `+56${digits}`;
    return `+${digits}`;
  };

  const base64UrlEncodeJson = (obj) => {
    try {
      const json = JSON.stringify(obj || {});
      const b64 = btoa(json);
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    } catch {
      return '';
    }
  };

  const loadMasterInvitePermissionsByCode = () => {
    try {
      const raw = localStorage.getItem('masterInvitePermissionsByCode') || '{}';
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const persistMasterInvitePermissionsByCode = (code, perms) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return;
    try {
      const map = loadMasterInvitePermissionsByCode();
      map[c] = perms;
      localStorage.setItem('masterInvitePermissionsByCode', JSON.stringify(map));
    } catch {
      void 0;
    }
  };

  const buildMasterJoinLink = (code, perms) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return '';
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const p = base64UrlEncodeJson(perms || {});
    const qs = p ? `?code=${encodeURIComponent(c)}&p=${encodeURIComponent(p)}` : `?code=${encodeURIComponent(c)}`;
    return `${origin}/master/join${qs}`;
  };

  const buildOperatorJoinLink = (code) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return '';
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    return `${origin}/operator/join?code=${encodeURIComponent(c)}`;
  };

  const formatClp = (value) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
      Number(value || 0) || 0
    );

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

  const buildInviteMessage = (code, type = inviteType, permsOverride = null) => {
    const c = String(code || '').trim().toUpperCase();
    if (type === 'master') {
      const link = buildMasterJoinLink(c, permsOverride || masterInvitePermissions);
      return `Tu código MAQGO para crear usuario Master (Gestión) es: ${c}\n\n1) Abre MAQGO\n2) Toca “Soy gerente / Master”\n3) Ingresa el código\n\nLuego iniciarás sesión con tu celular usando un código SMS (MAQGO).\n\nLink directo:\n${link}\n\nVálido por 7 días.\nUso único (1 persona).`;
    }
    const link = buildOperatorJoinLink(c);
    return `Tu código MAQGO de autenticación (Operador) es: ${c}\n\n1) Abre MAQGO\n2) Toca “Soy operador (tengo código)”\n3) Ingresa el código\n\nEste código lo genera tu empresa (no es el código SMS).\n\nLink directo:\n${link}\n\nVálido por 7 días.`;
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

      if (inviteType === 'operator' && !useManualInvite) {
        if (!ownerId) {
          toast.error('Tu sesión expiró. Inicia sesión nuevamente.');
          setInviting(false);
          return;
        }
        const selected = declaredOperators.filter((op) => selectedDeclaredKeys.has(op.key));
        if (selected.length === 0) {
          toast.warning('Selecciona al menos 1 operador.');
          setInviting(false);
          return;
        }
        const batchPayload = {
          owner_id: ownerId,
          operators: selected.map((op) => ({
            operator_name: op.name,
            operator_rut: op.rut,
          })),
        };
        const batchResponse = await axios.post(
          `${BACKEND_URL}/api/operators/invite/batch`,
          batchPayload,
          { timeout: 8000 },
        );
        const items = Array.isArray(batchResponse.data?.invitations) ? batchResponse.data.invitations : [];
        if (!items.length) {
          toast.error('No pudimos generar códigos para tu selección.');
          setInviting(false);
          return;
        }
        setBatchInvites(items);
        setInviteCode(items[0]?.code || '');
        setShowCode(true);
        setDidAttemptInvite(false);
        loadTeam();
        setInviting(false);
        return;
      }

      const endpoint = inviteType === 'master' 
        ? `${BACKEND_URL}/api/operators/masters/invite`
        : `${BACKEND_URL}/api/operators/invite`;

      // Validaciones básicas para operador: nombre completo y RUT obligatorios
      let payload = { owner_id: ownerId };
      if (inviteType === 'operator') {
        const fullName = operatorNombreCompleto.trim();
        if (!fullName || !operatorRut.trim()) {
          toast.warning('Ingresa nombre completo y RUT del operador antes de generar el código.');
          setInviting(false);
          return;
        }
        const normalizedPhone = normalizePhoneForChannel(operatorPhone);
        payload = {
          owner_id: ownerId,
          operator_name: fullName,
          operator_phone: normalizedPhone || undefined,
          operator_rut: operatorRut.trim(),
        };
      } else if (inviteType === 'master') {
        const fullName = operatorNombreCompleto.trim();
        const normalizedPhone = normalizePhoneForChannel(operatorPhone);
        payload = {
          owner_id: ownerId,
          master_name: fullName || undefined,
          master_phone: normalizedPhone || undefined,
        };
      }

      const response = await axios.post(endpoint, payload);
      
      setInviteCode(response.data.code);
      if (inviteType === 'master' && response?.data?.code) {
        persistMasterInvitePermissionsByCode(response.data.code, masterInvitePermissions);
      }
      setBatchInvites(null);
      setShowCode(true);
      // Limpiar formulario de datos de operador
      setOperatorNombreCompleto('');
      setOperatorRut('');
      setOperatorPhone('');
      setDidAttemptInvite(false);
      loadTeam(); // Recargar para ver la invitación pendiente
    } catch (e) {
      console.error('Error generating invite:', e);
      toast.error(e.response?.data?.detail || 'Error al generar código');
    }
    setInviting(false);
  };

  const toggleDeclaredKey = (key) => {
    setSelectedDeclaredKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllDeclared = (on) => {
    if (!on) {
      setSelectedDeclaredKeys(new Set());
      return;
    }
    setSelectedDeclaredKeys(new Set(declaredOperators.map((o) => o.key)));
  };

  const filteredDeclaredOperators = useMemo(() => {
    const q = String(inviteSearch || '').trim().toLowerCase();
    if (!q) return declaredOperators;
    return declaredOperators.filter((op) => {
      const name = String(op.name || '').toLowerCase();
      const rut = String(op.rut || '').toLowerCase();
      return name.includes(q) || rut.includes(q);
    });
  }, [declaredOperators, inviteSearch]);

  const copyCode = async () => {
    try {
      if (!inviteCode) return;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
        toast.success('Código copiado al portapapeles');
        return;
      }
    } catch {
      void 0;
    }
    try {
      window.prompt('Copia este código:', inviteCode);
    } catch {
      void 0;
    }
    toast.warning('No se pudo copiar automáticamente. Copia el código manualmente.');
  };

  const copyTextToClipboard = async (text, successMessage) => {
    const t = String(text || '').trim();
    if (!t) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        toast.success(successMessage || 'Copiado');
        return;
      }
    } catch {
      void 0;
    }
    try {
      window.prompt('Copia este texto:', t);
    } catch {
      void 0;
    }
    toast.warning('No se pudo copiar automáticamente. Copia el texto manualmente.');
  };

  const shareCode = async (channel) => {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) return;
    const text = buildInviteMessage(code, inviteType);
    const phone = normalizePhoneForChannel(operatorPhone);
    if (channel === 'system') {
      if (navigator?.share) {
        try {
          await navigator.share({ text });
          return;
        } catch {
          void 0;
        }
      }
      toast.warning('No se pudo abrir el menú de compartir. Usa Copiar código.');
      return;
    }
    if (channel === 'whatsapp') {
      const base = phone ? `https://wa.me/${phone.replace('+', '')}` : 'https://wa.me/';
      window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (channel === 'sms') {
      const target = phone ? phone : '';
      const url = `sms:${encodeURIComponent(target)}?&body=${encodeURIComponent(text)}`;
      window.location.href = url;
    }
  };

  const shareInvite = async (channel, code, phone, type) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return;
    const permsByCode = type === 'master' ? loadMasterInvitePermissionsByCode() : null;
    const text = buildInviteMessage(c, type, permsByCode && permsByCode[c] ? permsByCode[c] : null);
    const normalized = normalizePhoneForChannel(phone);
    if (channel === 'whatsapp') {
      const base = normalized ? `https://wa.me/${normalized.replace('+', '')}` : 'https://wa.me/';
      window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (channel === 'sms') {
      const target = normalized ? normalized : '';
      const url = `sms:${encodeURIComponent(target)}?&body=${encodeURIComponent(text)}`;
      window.location.href = url;
      return;
    }
    if (channel === 'copy') {
      await copyTextToClipboard(c, 'Código copiado');
    }
  };

  const deleteOperator = async (operatorId, operatorName) => {
    const userId = localStorage.getItem('userId');
    const ownerId = localStorage.getItem('ownerId') || userId;
    if (!ownerId || !operatorId) return;
    const confirmText = `¿Eliminar a ${operatorName || 'este operador'}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmText)) return;
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/users/${encodeURIComponent(ownerId)}/operators/${encodeURIComponent(operatorId)}`,
        { method: 'DELETE' },
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
        throw new Error(detail || 'No pudimos eliminar el operador.');
      }
      toast.success('Operador eliminado');
      loadTeam();
    } catch (e) {
      toast.error(e?.message || 'No pudimos eliminar el operador.');
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
    if (!operatorNombreCompleto.trim()) missingInviteFields.push('Nombre completo');
    if (!operatorRut.trim()) missingInviteFields.push('RUT');
  }
  const selectedDeclaredCount = selectedDeclaredKeys.size;
  const isInviteFormValid =
    inviteType !== 'operator' ||
    (useManualInvite ? missingInviteFields.length === 0 : selectedDeclaredCount > 0);
  const visiblePendingInvitations = (team.pending_invitations || []).filter((inv) => {
    const t = inv?.invite_type || 'operator';
    return inviteType === 'master' ? t === 'master' : t !== 'master';
  });
  const overduePendingInvitations = useMemo(
    () => inviteType === 'operator' ? getOverdueOperatorInvitations(visiblePendingInvitations) : [],
    [inviteType, visiblePendingInvitations]
  );

  if (inviteType === 'master' && !isSuperMasterUser) {
    return <Navigate to="/provider/team" replace />;
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12, 
          marginBottom: 14,
          marginTop: 10
        }}>
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
          >
            <BackArrowIcon />
          </button>
          <h1 style={{ 
            color: '#fff', 
            fontSize: 20, 
            fontWeight: 700, 
            margin: 0,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            {showCode ? 'Código listo' : activeTab === 'invite' ? 'Invitar' : 'Equipo'}
          </h1>
        </div>

        {isSuperMasterUser && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, margin: '0 0 10px', fontWeight: 800, textTransform: 'uppercase' }}>
              ¿A quién vas a invitar?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => navigate(`/provider/team?mode=operator&tab=${encodeURIComponent(activeTab)}`, { replace: true })}
              style={{
                flex: 1,
                padding: 12,
                background: inviteType === 'operator' ? '#EC6819' : '#2A2A2A',
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
                padding: 12,
                background: inviteType === 'master' ? '#EC6819' : '#2A2A2A',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Gerentes
            </button>
            </div>
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20
        }}>
          {(() => {
            const teamCount = inviteType === 'master' ? (team.masters?.length || 0) : (team.operators?.length || 0);
            return (
              <>
                <button
                  onClick={() => {
                    setActiveTab('team');
                    setShowCode(false);
                    const modeQs = inviteType === 'master' ? 'master' : 'operator';
                    navigate(`/provider/team?mode=${encodeURIComponent(modeQs)}&tab=team`, { replace: true });
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: activeTab === 'team' ? '#EC6819' : '#2A2A2A',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  data-testid="tab-team"
                >
                  {`Equipo (${teamCount})`}
                </button>
                <button
                  onClick={() => {
                    setActiveTab('invite');
                    const modeQs = inviteType === 'master' ? 'master' : 'operator';
                    navigate(`/provider/team?mode=${encodeURIComponent(modeQs)}&tab=invite`, { replace: true });
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: activeTab === 'invite' ? '#EC6819' : '#2A2A2A',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  data-testid="tab-invite"
                >
                  Invitar
                </button>
              </>
            );
          })()}
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
                    {isSuperMasterUser && (
                      <div
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 14,
                        }}
                      >
                        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0, fontWeight: 800, textTransform: 'uppercase' }}>
                          Finanzas (Empresa)
                        </p>
                        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 140px', background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.10)' }}>
                            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: 0 }}>Total facturado</p>
                            <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '6px 0 0' }}>{formatClp(financeSummary.facturado)}</p>
                          </div>
                          <div style={{ flex: '1 1 140px', background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.10)' }}>
                            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: 0 }}>Por cobrar</p>
                            <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '6px 0 0' }}>{formatClp(financeSummary.porCobrar)}</p>
                          </div>
                          <div style={{ flex: '1 1 140px', background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.10)' }}>
                            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: 0 }}>Pagado</p>
                            <p style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '6px 0 0' }}>{formatClp(financeSummary.pagado)}</p>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, margin: 0 }}>
                            {dashboardLoading ? 'Actualizando…' : 'Desglose interno por gerente (WORKs aceptados)'}
                          </p>
                          <button
                            type="button"
                            onClick={() => navigate('/provider/cobros')}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 999,
                              border: '1px solid rgba(255,255,255,0.16)',
                              background: 'rgba(0,0,0,0.20)',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Ver cobros
                          </button>
                        </div>
                      </div>
                    )}
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', marginBottom: 10 }}>
                      Gerentes ({team.masters?.length || 0})
                    </p>
                    {team.masters && team.masters.length > 0 ? (
                      team.masters.map((member, idx) => (
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
                            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '2px 0 0' }}>
                              {member.phone || 'Sin celular'}
                            </p>
                            {isSuperMasterUser && worksByMaster[String(member.id || '')] && (
                              <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, margin: '6px 0 0' }}>
                                Facturado:{' '}
                                <strong style={{ color: '#fff' }}>{formatClp(worksByMaster[String(member.id)].facturado || 0)}</strong>
                                {' · '}
                                Por cobrar:{' '}
                                <strong style={{ color: '#fff' }}>{formatClp(worksByMaster[String(member.id)].porCobrar || 0)}</strong>
                                {' · '}
                                Pagado:{' '}
                                <strong style={{ color: '#fff' }}>{formatClp(worksByMaster[String(member.id)].pagado || 0)}</strong>
                              </p>
                            )}
                          </div>
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
                        </div>
                      ))
                    ) : (
                      <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 30, textAlign: 'center' }}>
                        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, margin: 0 }}>
                          No hay gerentes registrados
                        </p>
                        <button
                          onClick={() => setActiveTab('invite')}
                          style={{
                            marginTop: 12,
                            padding: '10px 20px',
                            background: '#EC6819',
                            border: 'none',
                            borderRadius: 20,
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Invitar gerente
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', marginBottom: 10 }}>
                      Operadores ({team.operators?.length || 0})
                    </p>
                  {team.operators && team.operators.length > 0 ? (
                    team.operators.map((op, idx) => (
                      (() => {
                        const gpsBadge = getOperatorGpsBadge(op);
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
                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            {op.rut && (
                              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
                                RUT: {op.rut}
                              </p>
                            )}
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
                            background: 'rgba(76, 175, 80, 0.18)',
                            color: '#4CAF50',
                            fontSize: 13,
                            fontWeight: 600
                          }}>
                            Activo
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteOperator(op.id, op.name)}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(244, 67, 54, 0.18)',
                              border: '1px solid rgba(244, 67, 54, 0.35)',
                              borderRadius: 8,
                              color: '#F44336',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Eliminar
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
                      padding: 30,
                      textAlign: 'center'
                    }}>
                      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, margin: 0 }}>
                        No hay operadores registrados
                      </p>
                      <button
                        onClick={() => setActiveTab('invite')}
                        style={{
                          marginTop: 12,
                          padding: '10px 20px',
                          background: '#EC6819',
                          border: 'none',
                          borderRadius: 20,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Invitar operador
                      </button>
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
                            ? 'Hay 1 operador con mas de 24 horas sin enrolar su codigo de activacion.'
                            : `Hay ${overduePendingInvitations.length} operadores con mas de 24 horas sin enrolar su codigo de activacion.`}
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
                            <p style={{ 
                              color: '#FFA726', 
                              fontSize: 18, 
                              fontWeight: 700, 
                              margin: 0,
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: 2
                            }}>
                              {inv.code}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '4px 0 0' }}>
                              {inv.invite_type === 'master' ? 'Para Gerente' : 'Para Operador'}
                            </p>
                            {inv.invite_type === 'master' && inv.master_name && (
                              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '6px 0 0' }}>
                                {inv.master_name}{inv.master_phone ? ` · ${inv.master_phone}` : ''}
                              </p>
                            )}
                            {inv.invite_type !== 'master' && inv.operator_name && (
                              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '6px 0 0' }}>
                                {inv.operator_name}{inv.operator_rut ? ` · RUT ${inv.operator_rut}` : ''}
                              </p>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => shareInvite('copy', inv.code, inv.invite_type === 'master' ? inv.master_phone : inv.operator_phone, inv.invite_type)}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 6,
                                color: 'rgba(255,255,255,0.92)',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700
                              }}
                            >
                              Copiar código
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const code = String(inv.code || '').trim().toUpperCase();
                                if (!code) return;
                                const link =
                                  inv.invite_type === 'master'
                                    ? buildMasterJoinLink(
                                        code,
                                        (loadMasterInvitePermissionsByCode()?.[code]) || {}
                                      )
                                    : buildOperatorJoinLink(code);
                                copyTextToClipboard(link, 'Link copiado');
                              }}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(144, 189, 211, 0.14)',
                                border: '1px solid rgba(144, 189, 211, 0.35)',
                                borderRadius: 6,
                                color: 'rgba(255,255,255,0.92)',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700
                              }}
                            >
                              Copiar link
                            </button>
                            <button
                              type="button"
                              onClick={() => shareInvite('whatsapp', inv.code, inv.invite_type === 'master' ? inv.master_phone : inv.operator_phone, inv.invite_type)}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(37, 211, 102, 0.14)',
                                border: '1px solid rgba(37, 211, 102, 0.35)',
                                borderRadius: 6,
                                color: 'rgba(255,255,255,0.92)',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700
                              }}
                            >
                              WhatsApp
                            </button>
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

        {/* Tab: Invitar */}
        {activeTab === 'invite' && (
          <div>
            {!showCode ? (
              <>
                <div
                  style={{
                    marginBottom: 20,
                    padding: 14,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {inviteType === 'master' ? (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                        <strong>Creación de usuario Master (gestión)</strong>: genera un código para que una persona cree un{' '}
                        <strong>usuario master</strong> dentro de tu empresa (cuenta de gestión).
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
                        Este usuario es para <strong>gestión</strong>. Luego inicia sesión con su celular usando <strong>código SMS</strong>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                        <strong>Autenticación de operador</strong>: genera un código para que un operador se registre y quede vinculado a tu empresa.
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
                        Este código lo genera tu empresa (no es el código SMS).
                        <br />
                        La <strong>asignación operador ↔ máquina</strong> se hace en{' '}
                        <Link to="/provider/machines" style={{ color: '#EC6819', fontWeight: 600 }}>
                          Mis máquinas
                        </Link>
                        .
                      </p>
                    </>
                  )}
                </div>

                <p
                  style={{
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 14,
                    textAlign: 'center',
                    marginBottom: 20,
                    lineHeight: 1.45,
                  }}
                >
                  {inviteType === 'master'
                    ? 'Genera un código y compártelo con la persona que creará el usuario master.'
                    : 'Genera un código y compártelo con tu operador.'}
                </p>

                {/* Datos del operador cuando la invitación es para operador */}
                {inviteType === 'operator' && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', margin: 0 }}>
                        Operadores
                      </p>
                      {(declaredLoading || declaredOperators.length > 0) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setUseManualInvite((v) => !v);
                            setDidAttemptInvite(false);
                            setOperatorNombreCompleto('');
                            setOperatorRut('');
                            setOperatorPhone('');
                          }}
                          style={{ background: 'none', border: 'none', color: '#90BDD3', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {useManualInvite ? 'Buscar en lista' : 'Ingresar manual'}
                        </button>
                      ) : null}
                    </div>

                    {!useManualInvite && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          <input
                            type="text"
                            value={inviteSearch}
                            onChange={(e) => setInviteSearch(e.target.value)}
                            placeholder="Buscar por nombre o RUT"
                            style={{
                              flex: 1,
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1px solid #444',
                              background: '#1F1F1F',
                              color: '#fff',
                              fontSize: 14,
                              outline: 'none',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setAllDeclared(selectedDeclaredCount !== declaredOperators.length)}
                            disabled={declaredLoading || declaredOperators.length === 0}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1px solid #444',
                              background: '#2A2A2A',
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              opacity: declaredLoading || declaredOperators.length === 0 ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {selectedDeclaredCount === declaredOperators.length && declaredOperators.length > 0 ? 'Ninguno' : 'Todos'}
                          </button>
                        </div>

                        <div
                          style={{
                            maxHeight: 240,
                            overflowY: 'auto',
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.06)',
                            padding: 10,
                          }}
                        >
                          {declaredLoading ? (
                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: 0, textAlign: 'center', padding: 14 }}>
                              Cargando operadores…
                            </p>
                          ) : filteredDeclaredOperators.length === 0 ? (
                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: 0, textAlign: 'center', padding: 14 }}>
                              No hay operadores para mostrar.
                            </p>
                          ) : (
                            filteredDeclaredOperators.map((op) => {
                              const checked = selectedDeclaredKeys.has(op.key);
                              return (
                                <button
                                  key={op.key}
                                  type="button"
                                  onClick={() => toggleDeclaredKey(op.key)}
                                  style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 10px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(255,255,255,0.10)',
                                    background: checked ? 'rgba(236,104,25,0.18)' : 'rgba(0,0,0,0)',
                                    cursor: 'pointer',
                                    marginBottom: 8,
                                    textAlign: 'left',
                                  }}
                                >
                                  <div
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
                                    }}
                                  >
                                    {checked ? <span style={{ color: '#111', fontSize: 12, fontWeight: 900 }}>✓</span> : null}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                                      {op.name || 'Operador'}
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '4px 0 0', fontFamily: "'JetBrains Mono', monospace" }}>
                                      {op.rut || 'RUT —'}
                                    </p>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>

                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '10px 0 0' }}>
                          Seleccionados: <strong style={{ color: '#fff' }}>{selectedDeclaredCount}</strong>
                        </p>
                      </div>
                    )}

                    {useManualInvite && (
                      <>
                        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', marginBottom: 10 }}>
                          Datos del operador
                        </p>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                            Nombre completo *
                          </label>
                          <input
                            type="text"
                            value={operatorNombreCompleto}
                            onChange={(e) => setOperatorNombreCompleto(e.target.value)}
                            placeholder="Ej: Juan Pérez"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: didAttemptInvite && !operatorNombreCompleto.trim() ? '1px solid #F44336' : '1px solid #444',
                              background: '#1F1F1F',
                              color: '#fff',
                              fontSize: 14,
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                            RUT *
                          </label>
                          <input
                            type="text"
                            value={operatorRut}
                            onChange={(e) => setOperatorRut(e.target.value)}
                            placeholder="12.345.678-9"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: didAttemptInvite && !operatorRut.trim() ? '1px solid #F44336' : '1px solid #444',
                              background: '#1F1F1F',
                              color: '#fff',
                              fontSize: 14,
                              outline: 'none',
                              fontFamily: "'JetBrains Mono', monospace"
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                            Celular (opcional)
                          </label>
                          <input
                            type="tel"
                            value={operatorPhone}
                            onChange={(e) => setOperatorPhone(e.target.value)}
                            placeholder="+56 9 1234 5678"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1px solid #444',
                              background: '#1F1F1F',
                              color: '#fff',
                              fontSize: 14,
                              outline: 'none',
                            }}
                          />
                        </div>
                        {didAttemptInvite && missingInviteFields.length > 0 && (
                          <p style={{ color: '#F44336', fontSize: 12, margin: '2px 0 10px' }}>
                            Falta completar: {missingInviteFields.join(', ')}.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {inviteType === 'master' && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', marginBottom: 10 }}>
                      Datos del gerente (opcional)
                    </p>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={operatorNombreCompleto}
                        onChange={(e) => setOperatorNombreCompleto(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #444',
                          background: '#1F1F1F',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Celular
                      </label>
                      <input
                        type="tel"
                        value={operatorPhone}
                        onChange={(e) => setOperatorPhone(e.target.value)}
                        placeholder="+56 9 1234 5678"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #444',
                          background: '#1F1F1F',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none',
                        }}
                      />
                    </div>

                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, textTransform: 'uppercase', margin: '8px 0 10px' }}>
                      Permisos del gerente
                    </p>
                    <div
                      style={{
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.06)',
                        padding: 12,
                      }}
                    >
                      {[
                        { k: 'can_view_finance', label: 'Ver finanzas' },
                        { k: 'can_manage_machines', label: 'Gestionar máquinas' },
                        { k: 'can_manage_operators', label: 'Gestionar operadores' },
                        { k: 'can_create_work', label: 'Crear WORK' },
                        { k: 'can_assign_operator', label: 'Asignar operador' },
                        { k: 'can_view_work_details', label: 'Ver detalle de WORK' },
                        { k: 'can_edit_master_profile', label: 'Editar perfil' },
                        { k: 'can_delete_master', label: 'Eliminar gerente' },
                      ].map((it) => {
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
                              background: checked ? 'rgba(156, 39, 176, 0.16)' : 'rgba(0,0,0,0.12)',
                              cursor: 'pointer',
                              marginBottom: 8,
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{it.label}</span>
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                border: checked ? '1px solid #9C27B0' : '1px solid rgba(255,255,255,0.35)',
                                background: checked ? '#9C27B0' : 'transparent',
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
                      <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, margin: '6px 0 0' }}>
                        Define los permisos antes de generar el código: viajan en el link y se guardan en el dispositivo del usuario master (no backend).
                      </p>
                    </div>
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
                    : inviteType === 'master'
                      ? 'Generar código (Master)'
                      : 'Generar código (Operador)'}
                </button>
              </>
            ) : (
              /* Código generado */
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
                  Código generado
                </h2>
                
                <p style={{ 
                  color: 'rgba(255,255,255,0.95)', 
                  fontSize: 13, 
                  margin: '0 0 25px'
                }}>
                  {inviteType === 'master' ? 'Para crear usuario Master (gestión)' : 'Para autenticar Operador'}
                </p>

                {Array.isArray(batchInvites) && batchInvites.length > 1 && (
                  <div style={{
                    background: '#2A2A2A',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                    textAlign: 'left',
                  }}>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: '0 0 12px' }}>
                      Códigos generados ({batchInvites.length})
                    </p>
                    {batchInvites.map((inv) => (
                      <div
                        key={inv.code || inv.operator_rut}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div>
                          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>
                            {inv.operator_name || 'Operador'}
                          </p>
                          <p style={{
                            color: '#90BDD3',
                            fontSize: 18,
                            fontWeight: 700,
                            margin: '4px 0 0',
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: 2,
                          }}>
                            {inv.code}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyTextToClipboard(inv.code, 'Código copiado')}
                          style={{
                            padding: '6px 10px',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 6,
                            color: '#fff',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Código grande */}
                <div style={{
                  background: '#2A2A2A',
                  borderRadius: 16,
                  padding: 24,
                  marginBottom: 20
                }}>
                  <p style={{
                    color: inviteType === 'master' ? '#9C27B0' : '#90BDD3',
                    fontSize: 36,
                    fontWeight: 700,
                    margin: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: 6
                  }}>
                    {inviteCode}
                  </p>
                  <p style={{ 
                    color: 'rgba(255,255,255,0.9)', 
                    fontSize: 12, 
                    margin: '12px 0 0'
                  }}>
                    {inviteType === 'master' ? 'Válido por 7 días · Uso único (1 persona)' : 'Válido por 7 días · Uso único (1 persona)'}
                  </p>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  textAlign: 'left',
                }}>
                  <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, margin: 0, fontWeight: 800, textTransform: 'uppercase' }}>
                    Link directo
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '8px 0 10px', lineHeight: 1.45 }}>
                    Úsalo si la otra persona prefiere entrar tocando un link (igual puede pegar solo el código).
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{
                      flex: '1 1 220px',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.20)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: 'rgba(255,255,255,0.92)',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {inviteType === 'master'
                        ? buildMasterJoinLink(inviteCode, masterInvitePermissions)
                        : buildOperatorJoinLink(inviteCode)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const link = inviteType === 'master'
                          ? buildMasterJoinLink(inviteCode, masterInvitePermissions)
                          : buildOperatorJoinLink(inviteCode);
                        copyTextToClipboard(link, 'Link copiado');
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(144, 189, 211, 0.35)',
                        background: 'rgba(144, 189, 211, 0.14)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Copiar link
                    </button>
                  </div>
                </div>

                <button
                  onClick={copyCode}
                  style={{
                    width: '100%',
                    padding: 14,
                    background: '#363636',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  data-testid="copy-code-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copiar código
                </button>

                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => shareCode('whatsapp')}
                    style={{
                      flex: '1 1 160px',
                      padding: 12,
                      background: 'rgba(37, 211, 102, 0.14)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Enviar por WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => shareCode('sms')}
                    style={{
                      flex: '1 1 160px',
                      padding: 12,
                      background: 'rgba(144, 189, 211, 0.14)',
                      border: '1px solid rgba(144, 189, 211, 0.35)',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Enviar por SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => shareCode('system')}
                    style={{
                      flex: '1 1 160px',
                      padding: 12,
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.22)',
                      borderRadius: 10,
                      color: 'rgba(255,255,255,0.92)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Compartir…
                  </button>
                </div>

                <div style={{
                  background: 'rgba(236, 104, 25, 0.1)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 20
                }}>
                  <p style={{ color: '#EC6819', fontSize: 13, margin: 0 }}>
                    Este código lo comparte la oficina por su canal interno (WhatsApp, SMS, llamada o correo).
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '6px 0 0' }}>
                    {inviteType === 'master'
                      ? 'Este código lo genera tu empresa. MAQGO solo envía el código SMS cuando el usuario master inicia sesión con su celular.'
                      : 'Este código lo genera tu empresa. El operador queda vinculado a tu empresa al ingresarlo.'}
                  </p>
                </div>

                <button
                  onClick={() => { setShowCode(false); setInviteCode(''); }}
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
                  Generar otro código
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamManagementScreen;
