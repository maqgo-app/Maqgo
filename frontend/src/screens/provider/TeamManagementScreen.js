import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import LoginPhoneChileInput from '../../components/LoginPhoneChileInput';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/authHooks';
import { useToast } from '../../components/Toast';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla: Gestión de equipo (Mis operadores)
 *
 * - Lista de gerentes y operadores de la empresa
 * - Códigos de invitación: operador de campo vs gerente (master)
 * - La asignación de operador a una máquina concreta es en Mis máquinas (/provider/machines)
 */
function TeamManagementScreen() {
  const navigate = useNavigate();
  const { isSuperMaster } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'invite'
  const [inviteType, setInviteType] = useState('operator'); // 'operator' | 'master'
  const [team, setTeam] = useState({ masters: [], operators: [], pending_invitations: [] });
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [operatorNombre, setOperatorNombre] = useState('');
  const [operatorApellido, setOperatorApellido] = useState('');
  const [operatorRut, setOperatorRut] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('');
  const [didAttemptInvite, setDidAttemptInvite] = useState(false);
  const GPS_FRESH_MINUTES = 10;
  const GPS_STALE_MINUTES = 120;

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
      const FAST_FALLBACK_MS = 2500;
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId') || userId;
      try {
        const apiPromise = axios.get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 5000 });
        const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_FALLBACK_MS));
        const response = await Promise.race([apiPromise, timeoutPromise]);
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

  const generateInviteCode = async () => {
    setDidAttemptInvite(true);
    setInviting(true);
    try {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId') || userId;
      
      const endpoint = inviteType === 'master' 
        ? `${BACKEND_URL}/api/operators/masters/invite`
        : `${BACKEND_URL}/api/operators/invite`;

      // Validaciones básicas para operador: nombre y RUT obligatorios
      let payload = { owner_id: ownerId };
      if (inviteType === 'operator') {
        const nom = operatorNombre.trim();
        const ape = operatorApellido.trim();
        if (!nom || !ape || !operatorRut.trim()) {
          toast.warning('Ingresa nombre, apellido y RUT del operador antes de generar el código.');
          setInviting(false);
          return;
        }
        const phoneDigits = String(operatorPhone || '').replace(/\D/g, '').slice(0, 9);
        payload = {
          owner_id: ownerId,
          operator_name: `${nom} ${ape}`.trim(),
          operator_rut: operatorRut.trim(),
          operator_phone: /^9\d{8}$/.test(phoneDigits) ? `+56${phoneDigits}` : null,
        };
      }

      const response = await axios.post(endpoint, payload);
      
      setInviteCode(response.data.code);
      setShowCode(true);
      // Limpiar formulario de datos de operador
      setOperatorNombre('');
      setOperatorApellido('');
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

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    toast.success('Código copiado al portapapeles');
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
    if (!operatorNombre.trim()) missingInviteFields.push('Nombre');
    if (!operatorApellido.trim()) missingInviteFields.push('Apellido');
    if (!operatorRut.trim()) missingInviteFields.push('RUT');
  }
  const isInviteFormValid = inviteType !== 'operator' || missingInviteFields.length === 0;

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
            Mis operadores
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
            Integrantes ({team.masters_count + team.operators_count || 0})
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
            Invitar
          </button>
        </div>

        {/* Tab: Equipo */}
        {activeTab === 'team' && (
          <div>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.95)', textAlign: 'center' }}>Cargando...</p>
            ) : (
              <>
                {/* Masters */}
                {team.masters && team.masters.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ 
                      color: 'rgba(255,255,255,0.95)', 
                      fontSize: 12, 
                      textTransform: 'uppercase',
                      marginBottom: 10
                    }}>
                      Gerentes ({team.masters.length})
                    </p>
                    {team.masters.map((member, idx) => (
                      <div 
                        key={member.id || idx}
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
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 20,
                          background: 'rgba(156, 39, 176, 0.2)',
                          color: '#9C27B0',
                          fontSize: 13,
                          fontWeight: 600
                        }}>
                          Gerente
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Operadores */}
                <div style={{ marginBottom: 20 }}>
                  <p style={{ 
                    color: 'rgba(255,255,255,0.95)', 
                    fontSize: 12, 
                    textTransform: 'uppercase',
                    marginBottom: 10
                  }}>
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

                {/* Invitaciones pendientes */}
                {team.pending_invitations && team.pending_invitations.length > 0 && (
                  <div>
                    <p style={{ 
                      color: 'rgba(255,255,255,0.95)', 
                      fontSize: 12, 
                      textTransform: 'uppercase',
                      marginBottom: 10
                    }}>
                      Invitaciones pendientes ({team.pending_invitations.length})
                    </p>
                    {team.pending_invitations.map((inv, idx) => (
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
                          </div>
                          <button
                            onClick={() => cancelInvitation(inv.code)}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(244, 67, 54, 0.2)',
                              border: 'none',
                              borderRadius: 6,
                              color: '#F44336',
                              fontSize: 12,
                              cursor: 'pointer'
                            }}
                          >
                            Cancelar
                          </button>
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
                  <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                    <strong>Equipo de la empresa</strong> (esta pantalla): invitas a alguien al rol de{' '}
                    <strong>operador de campo</strong> o de <strong>gerente</strong>. Son perfiles distintos.
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
                    Para <strong>asignar un operador a una máquina</strong> (retro, minicargador, etc.), usa{' '}
                    <Link to="/provider/machines" style={{ color: '#EC6819', fontWeight: 600 }}>
                      Mis máquinas
                    </Link>
                    . Ahí no se mezcla con el código de gerente.
                  </p>
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
                    ? 'Genera un código para que una persona se una como gerente de tu empresa: cuenta proveedor con permisos amplios (no es solo operar una máquina).'
                    : 'Genera un código para que un operador de campo se registre y quede vinculado a tu empresa.'}
                </p>

                {/* Selector de tipo */}
                <div style={{ marginBottom: 25 }}>
                  <p style={{ 
                    color: 'rgba(255,255,255,0.95)', 
                    fontSize: 12, 
                    textTransform: 'uppercase',
                    marginBottom: 10
                  }}>
                    ¿Qué quieres invitar?
                  </p>
                  
                  {/* Opción Operador */}
                  <div
                    onClick={() => setInviteType('operator')}
                    style={{
                      background: inviteType === 'operator' ? 'rgba(144, 189, 211, 0.15)' : '#2A2A2A',
                      border: inviteType === 'operator' ? '2px solid #90BDD3' : '2px solid transparent',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 10,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    data-testid="invite-type-operator"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: '#90BDD3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="8" r="4" stroke="#fff" strokeWidth="2"/>
                          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="#fff" strokeWidth="2"/>
                        </svg>
                      </div>
                      <div>
                        <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                          Operador
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '2px 0 0' }}>
                          Servicios en terreno (rol operador de la empresa)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Opción Master - Solo visible para Titular */}
                  {isSuperMaster() && (
                    <div
                      onClick={() => setInviteType('master')}
                      style={{
                        background: inviteType === 'master' ? 'rgba(156, 39, 176, 0.15)' : '#2A2A2A',
                        border: inviteType === 'master' ? '2px solid #9C27B0' : '2px solid transparent',
                        borderRadius: 12,
                        padding: 16,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      data-testid="invite-type-master"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: '#9C27B0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2"/>
                            <path d="M8 12h8M12 8v8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div>
                          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                            Gerente / Master
                          </p>
                          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '2px 0 0' }}>
                            Cuenta proveedor tipo gerente: gestión de la empresa (no es operador de una máquina)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {inviteType === 'master' && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: 14,
                      borderRadius: 12,
                      background: 'rgba(156, 39, 176, 0.12)',
                      border: '1px solid rgba(156, 39, 176, 0.4)',
                    }}
                  >
                    <p style={{ color: '#E1BEE7', fontSize: 12, fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Autorización de gerente
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                      Este código es el mecanismo para dar de alta a un <strong>gerente</strong>: al usarlo en la app crea una cuenta <strong>proveedor</strong> con rol gerente, vinculada a tu empresa. Es una autorización fuerte: solo compártelo con alguien de confianza. No sustituye invitar operadores de terreno ni asignar personas en{' '}
                      <Link to="/provider/machines" style={{ color: '#CE93D8', fontWeight: 600 }}>
                        Mis máquinas
                      </Link>
                      .
                    </p>
                  </div>
                )}

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
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={operatorNombre}
                        onChange={(e) => setOperatorNombre(e.target.value)}
                        placeholder="Ej: Tomás"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: didAttemptInvite && !operatorNombre.trim() ? '1px solid #F44336' : '1px solid #444',
                          background: '#1F1F1F',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Apellido *
                      </label>
                      <input
                        type="text"
                        value={operatorApellido}
                        onChange={(e) => setOperatorApellido(e.target.value)}
                        placeholder="Ej: Leiva"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: didAttemptInvite && !operatorApellido.trim() ? '1px solid #F44336' : '1px solid #444',
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
                    {didAttemptInvite && missingInviteFields.length > 0 && (
                      <p style={{ color: '#F44336', fontSize: 12, margin: '2px 0 10px' }}>
                        Falta completar: {missingInviteFields.join(', ')}.
                      </p>
                    )}
                    <div>
                      <label htmlFor="team-invite-operator-phone" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4, display: 'block' }}>
                        Celular (opcional)
                      </label>
                      <LoginPhoneChileInput
                        id="team-invite-operator-phone"
                        name="operatorPhone"
                        value={operatorPhone}
                        onDigitsChange={setOperatorPhone}
                        ariaLabel="Celular del operador, nueve dígitos"
                      />
                      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.35 }}>
                        El prefijo +56 ya está fijo; ingresa solo los 9 dígitos (empiezan en 9). Puedes dejarlo vacío.
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
