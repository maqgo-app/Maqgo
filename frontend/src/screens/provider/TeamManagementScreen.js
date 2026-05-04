import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/authHooks';
import { useToast } from '../../components/Toast';

import BACKEND_URL, { fetchWithAuth } from '../../utils/api';

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
  const screenMode = location.pathname === '/provider/managers' ? 'master' : 'operator';
  const { isSuperMaster } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'invite'
  const [inviteType, setInviteType] = useState(screenMode); // 'operator' | 'master'
  const [team, setTeam] = useState({ masters: [], operators: [], pending_invitations: [] });
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [operatorNombreCompleto, setOperatorNombreCompleto] = useState('');
  const [operatorRut, setOperatorRut] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('');
  const [didAttemptInvite, setDidAttemptInvite] = useState(false);
  const GPS_FRESH_MINUTES = 10;
  const GPS_STALE_MINUTES = 120;

  useEffect(() => {
    setInviteType(screenMode);
    setActiveTab('team');
    setShowCode(false);
    setInviteCode('');
    setDidAttemptInvite(false);
    setOperatorNombreCompleto('');
    setOperatorRut('');
    setOperatorPhone('');
  }, [screenMode]);

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

  const buildInviteMessage = (code, type = inviteType) => {
    const c = String(code || '').trim().toUpperCase();
    if (type === 'master') {
      return `Tu código de acceso MAQGO (Gerente) es: ${c}\n\n1) Abre MAQGO\n2) Toca “Soy gerente”\n3) Ingresa el código\n\nVálido por 7 días.`;
    }
    return `Tu código de activación MAQGO (Operador) es: ${c}\n\n1) Abre MAQGO\n2) Toca “Soy operador (tengo código)”\n3) Ingresa el código\n\nVálido por 7 días.`;
  };

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
    const text = buildInviteMessage(c, type);
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
  const isInviteFormValid = inviteType !== 'operator' || missingInviteFields.length === 0;
  const visiblePendingInvitations = (team.pending_invitations || []).filter((inv) => {
    const t = inv?.invite_type || 'operator';
    return inviteType === 'master' ? t === 'master' : t !== 'master';
  });

  if (inviteType === 'master' && !isSuperMaster()) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 10 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}
              data-testid="back-btn"
            >
              <BackArrowIcon />
            </button>
            <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
              Accesos de gerentes
            </h1>
          </div>
          <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 18, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, margin: 0, lineHeight: 1.45 }}>
              Acceso restringido. Solo el titular de la empresa puede gestionar gerentes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12, 
          marginBottom: 20,
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
            {inviteType === 'master' ? 'Accesos de gerentes' : 'Código de activación operadores'}
          </h1>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20
        }}>
          <button
            onClick={() => { setActiveTab('team'); setShowCode(false); }}
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
            {inviteType === 'master'
              ? `Gerentes (${team.masters?.length || 0})`
              : `Operadores (${team.operators?.length || 0})`}
          </button>
          <button
            onClick={() => setActiveTab('invite')}
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
            {inviteType === 'master' ? 'Invitar gerente' : 'Invitar operador'}
          </button>
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
                    <p style={{ 
                      color: 'rgba(255,255,255,0.95)', 
                      fontSize: 12, 
                      textTransform: 'uppercase',
                      marginBottom: 10
                    }}>
                      Invitaciones pendientes ({visiblePendingInvitations.length})
                    </p>
                    {visiblePendingInvitations.map((inv, idx) => (
                      <div 
                        key={inv.code || idx}
                        style={{
                          background: '#2A2A2A',
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                          borderLeft: '4px solid #FFA726'
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
                              Copiar
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
                        </div>
                      </div>
                    ))}
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
                        <strong>Acceso de gerentes</strong>: genera un código para que una persona se una como{' '}
                        <strong>gerente</strong> de tu empresa (cuenta de gestión).
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
                        Este acceso es para <strong>gestión</strong> (no es operar una máquina).
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                        <strong>Operadores de maquinaria</strong>: genera un código para que un operador se registre y quede
                        vinculado a tu empresa.
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
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
                    ? 'Genera un código y compártelo con tu gerente.'
                    : 'Genera un código y envíaselo a tu operador.'}
                </p>

                {/* Datos del operador cuando la invitación es para operador */}
                {inviteType === 'operator' && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ 
                      color: 'rgba(255,255,255,0.95)', 
                      fontSize: 12, 
                      textTransform: 'uppercase',
                      marginBottom: 10
                    }}>
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
                  </div>
                )}

                <button
                  className="maqgo-btn-primary"
                  onClick={generateInviteCode}
                  disabled={inviting || !isInviteFormValid}
                  style={{ opacity: (inviting || !isInviteFormValid) ? 0.6 : 1 }}
                  data-testid="generate-code-btn"
                >
                  {inviting ? 'Generando...' : 'Generar código de invitación'}
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
                  {inviteType === 'master' ? 'Para nuevo Gerente' : 'Para nuevo Operador'}
                </p>

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
                    Válido por 7 días
                  </p>
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
                      ? 'MAQGO no envía este código por WhatsApp ni SMS: debes compartirlo tú con el futuro gerente.'
                      : 'MAQGO no envía mensajes automáticos al operador.'}
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
