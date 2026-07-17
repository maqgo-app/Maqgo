import React, { useState, useEffect, useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ProviderNavigation } from '../../components/BottomNavigation';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/authHooks';
import {
  deleteMachineInApi,
  fetchProviderMachinesFromApi,
  getMachines,
  updateMachine,
  updateMachineInApi,
  needsTransport,
  MACHINERY_TYPES
} from '../../utils/providerMachines';
import { REFERENCE_PRICES, REFERENCE_TRANSPORT, MAX_PRICE_ABOVE_MARKET_PCT, getPriceAlert, getTransportAlert } from '../../utils/pricing';
import { vibrate } from '../../utils/uberUX';
import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';
import { getOverdueOperatorInvitations } from '../../utils/operatorInvitations';
import {
  formatRut,
  normalizeChileanMobileDraft,
  normalizeChileanMobileE164,
  sanitizeRutInput,
  validatePersonRut,
} from '../../utils/chileanValidation';

const STORAGE_KEY_DEFAULT_BY_MACHINERY = 'defaultOperatorByMachinery';

function toMachineryId(type) {
  if (!type) return 'retroexcavadora';
  const t = type.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  return MACHINERY_TYPES.find(m => m.id === t || m.name.toLowerCase().includes(t))?.id || 'retroexcavadora';
}

function buildOperatorJoinLink(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/operator/join?code=${encodeURIComponent(c)}`;
}

function getCurrentOwnerOperator() {
  const id = (localStorage.getItem('ownerId') || localStorage.getItem('userId') || '').trim();
  const phone = normalizeChileanMobileE164(localStorage.getItem('userPhone') || '');
  return { id, phone };
}

function mergeOwnerPhoneFallback(operator = {}) {
  if (!operator || typeof operator !== 'object') return operator;
  const { id: ownerId, phone: ownerPhone } = getCurrentOwnerOperator();
  const operatorId = String(operator.id || '').trim();
  if (!ownerId || !ownerPhone) return operator;
  if (operator.phone) return operator;
  if (operator.isOwner || operatorId === ownerId) {
    return { ...operator, phone: ownerPhone };
  }
  return operator;
}

function getOperatorStableId(operator = {}, fallback = '') {
  if (!operator || typeof operator !== 'object') return String(fallback || '').trim();
  const directId = String(operator.id || '').trim();
  if (directId) return directId;
  const rut = String(operator.rut || '').trim().toLowerCase();
  if (rut) return `op-rut-${rut}`;
  const phone = normalizeChileanMobileE164(operator.phone || operator.telefono || '');
  if (phone) return `op-phone-${phone}`;
  const fullName = String(operator.name || `${operator.nombre || ''} ${operator.apellido || ''}`.trim()).trim().toLowerCase();
  if (fullName) return `op-name-${fullName.replace(/\s+/g, '-')}`;
  return String(fallback || '').trim();
}

function normalizeMachineOperator(machine, operator = {}, fallback = '') {
  if (!operator || typeof operator !== 'object') return null;
  const merged = mergeOwnerPhoneFallback(operator);
  const currentOperators = Array.isArray(machine?.operators) ? machine.operators : [];
  const { id: ownerId, phone: ownerPhone } = getCurrentOwnerOperator();
  const shouldAssumeOwner =
    currentOperators.length === 1 &&
    !merged?.phone &&
    !!ownerPhone;
  const next = shouldAssumeOwner
    ? {
        ...merged,
        id: String(merged?.id || ownerId || fallback || '').trim(),
        phone: ownerPhone,
        isOwner: true,
      }
    : merged;
  const stableId = getOperatorStableId(next, fallback);
  if (!stableId) return null;
  return {
    ...next,
    id: stableId,
  };
}

function getEffectiveDefaultOperatorId(machine, defaultByMachinery = {}) {
  const mid = toMachineryId(machine?.type);
  const configuredId = String(defaultByMachinery?.[mid] || '').trim();
  if (configuredId) return configuredId;
  const firstOperatorId = normalizeMachineOperator(machine, machine?.operators?.[0], '')?.id || '';
  return firstOperatorId;
}

function buildOperatorCodesRoute() {
  return '/provider/team?mode=operator&tab=invite&view=codes';
}

function MyMachinesScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission, loading: authLoading } = useAuth();
  const toast = useToast();
  const canManageMachines = hasPermission('canManageMachines') || hasPermission('can_manage_machines');
  const canDeleteMachines = hasPermission('canDeleteMachines') || hasPermission('can_delete_machines');
  const canAssignOperator = hasPermission('canAssignOperator') || hasPermission('can_assign_operator');
  const canManageOperators = hasPermission('canManageOperators') || hasPermission('can_manage_operators');
  const canAssignOperators = canAssignOperator || canManageOperators;
  const blocked = !canManageMachines;
  const activationEdit = Boolean(location.state?.activationEdit);
  const returnTo = String(location.state?.returnTo || '/provider/home');
  const openOperatorForMachineId = location.state?.openOperatorForMachineId;
  const [machines, setMachines] = useState(() => getMachines());
  const [defaultByMachinery, setDefaultByMachinery] = useState(() =>
    getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {})
  );
  const [editPricingModal, setEditPricingModal] = useState(null);
  const [operatorModal, setOperatorModal] = useState(null);
  const [deleteMachineConfirm, setDeleteMachineConfirm] = useState(null);

  const loadMachines = () => setMachines(getMachines());

  useEffect(() => {
    if (blocked) return undefined;
    let cancelled = false;
    fetchProviderMachinesFromApi()
      .then((fresh) => {
        if (!cancelled) setMachines(fresh);
      })
      .catch(() => {
        if (!cancelled) loadMachines();
      });
    return () => {
      cancelled = true;
    };
  }, [blocked]);

  useEffect(() => {
    if (blocked) return;
    if (!openOperatorForMachineId) return;
    if (!canAssignOperators) {
      navigate(location.pathname, { replace: true, state: { activationEdit, returnTo } });
      return;
    }
    const machine = (Array.isArray(machines) ? machines : []).find((m) => m?.id === openOperatorForMachineId);
    if (machine) {
      openOperatorsModal(machine);
      navigate(location.pathname, { replace: true, state: { activationEdit, returnTo } });
    }
  }, [activationEdit, blocked, canAssignOperators, machines, navigate, openOperatorForMachineId, location.pathname, returnTo]);

  if (authLoading) {
    return null;
  }

  if (blocked) {
    return <Navigate to="/provider/data" replace />;
  }

  const setDefaultOperator = (machineryId, operatorId) => {
    const updated = { ...defaultByMachinery, [machineryId]: operatorId };
    setDefaultByMachinery(updated);
    localStorage.setItem(STORAGE_KEY_DEFAULT_BY_MACHINERY, JSON.stringify(updated));
  };

  const savePricing = async (machineId, updates) => {
    try {
      await updateMachineInApi(machineId, updates);
      updateMachine(machineId, updates);
      loadMachines();
      setEditPricingModal(null);
    } catch (e) {
      toast.error(e?.message || 'No se pudo guardar el precio.');
    }
  };

  const saveMachineOperators = async (machineId, operators) => {
    const machine = (Array.isArray(machines) ? machines : []).find(m => m.id === machineId);
    if (!machine) return;
    const nextOperators = Array.isArray(operators)
      ? operators
          .map((op, index) => {
            return normalizeMachineOperator(machine, op, `op-manual-${machineId}-${index}`);
          })
          .filter(Boolean)
      : [];
    if (nextOperators.length === 0) {
      toast.warning('Esta maquina debe tener al menos un operador.');
      return;
    }

    const mid = toMachineryId(machine.type);
    const selectedIds = new Set(nextOperators.map(o => o.id));
    if (!selectedIds.has(getEffectiveDefaultOperatorId(machine, defaultByMachinery))) {
      setDefaultOperator(mid, nextOperators[0]?.id || '');
    } else if (!defaultByMachinery[mid]) {
      setDefaultOperator(mid, getEffectiveDefaultOperatorId(machine, defaultByMachinery));
    }

    try {
      await updateMachineInApi(machineId, { operators: nextOperators });
      updateMachine(machineId, { operators: nextOperators });
      loadMachines();
      setOperatorModal(null);
      if (activationEdit) navigate(returnTo, { replace: true });
    } catch (e) {
      toast.error(e?.message || 'No se pudieron asignar operadores.');
    }
  };

  const toggleAvailability = async (machineId) => {
    const machine = (Array.isArray(machines) ? machines : []).find(m => m.id === machineId);
    if (!machine) return;
    const normalizedOperators = (Array.isArray(machine.operators) ? machine.operators : [])
      .map((op, index) => normalizeMachineOperator(machine, op, `op-toggle-${machineId}-${index}`))
      .filter(Boolean);
    if (normalizedOperators.length === 0) {
      toast.warning('Esta maquina debe tener al menos un operador.');
      return;
    }
    try {
      await updateMachineInApi(machineId, { available: !machine.available });
      updateMachine(machineId, { available: !machine.available });
      loadMachines();
    } catch (e) {
      toast.error(e?.message || 'No se pudo cambiar disponibilidad.');
    }
  };

  const handleAddMachine = () => {
    navigate('/provider/machine-data', { state: { returnTo: '/provider/machines' } });
  };

  const openOperatorsModal = async (machine) => {
    const ownerId = (localStorage.getItem('ownerId') || localStorage.getItem('userId') || '').trim();
    if (!ownerId) {
      setOperatorModal({
        machine,
        initialLoaded: true,
        initialError: 'Tu sesion expiro. Inicia sesion nuevamente.',
        initialTeamOperators: [],
        initialPendingInvitations: [],
      });
      return;
    }
    try {
      const response = await axios.get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 8000 });
      const initialTeamOperators = (response.data?.operators || []).filter(
        (op) => (op?.provider_role || '') === 'operator' || !op?.provider_role
      );
      const initialPendingInvitations = Array.isArray(response.data?.pending_invitations)
        ? response.data.pending_invitations
        : [];
      setOperatorModal({
        machine,
        initialLoaded: true,
        initialError: '',
        initialTeamOperators,
        initialPendingInvitations,
      });
    } catch {
      setOperatorModal({
        machine,
        initialLoaded: true,
        initialError: 'No pudimos cargar los operadores de tu empresa.',
        initialTeamOperators: [],
        initialPendingInvitations: [],
      });
    }
  };

  const handleDeleteMachine = async (machineId) => {
    if (!canDeleteMachines) {
      toast.error('Solo el TITULAR puede eliminar máquinas.');
      setDeleteMachineConfirm(null);
      return;
    }
    try {
      await deleteMachineInApi(machineId);
      loadMachines();
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar la máquina.');
    } finally {
      setDeleteMachineConfirm(null);
    }
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price || 0);

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{
          padding: 'var(--maqgo-screen-padding-top) 20px 20px',
          paddingBottom: 80,
        }}
      >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="maqgo-h1" style={{ margin: 0 }}>
            Mis Máquinas
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '4px 0 0' }}>
            Gestiona tus equipos, precios y operadores
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleAddMachine}
            style={{
              background: '#EC6819',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 0 0 #9F3E00',
            }}
          >
            Agregar máquina
          </button>
        </div>
      </div>

      {/* Lista de máquinas o empty state */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {machines.length === 0 ? (
          <div style={{
            background: '#1A1A1F',
            borderRadius: 16,
            padding: 40,
            textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.15)'
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(236, 104, 25, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EC6819" strokeWidth="2">
                <rect x="4" y="16" width="24" height="10" rx="2"/>
                <rect x="20" y="10" width="10" height="8" rx="1"/>
                <circle cx="10" cy="28" r="3"/>
                <circle cx="22" cy="28" r="3"/>
              </svg>
            </div>
            <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
              Aún no tienes máquinas
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
              Agrega tu primera máquina para empezar a recibir solicitudes
            </p>
            <button
              onClick={handleAddMachine}
              style={{
                padding: '14px 28px',
                background: '#EC6819',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + Agregar mi primera máquina
            </button>
          </div>
        ) : machines.map(machine => {
          const normalizedOperators = (Array.isArray(machine.operators) ? machine.operators : [])
            .map((op, index) => normalizeMachineOperator(machine, op, `op-list-${machine.id}-${index}`))
            .filter(Boolean);
          const hasAssignedOperator = normalizedOperators.length > 0;
          const effectiveAvailable = Boolean(machine.available) && hasAssignedOperator;
          return (
          <div
            key={machine.id}
            style={{
              background: '#1A1A1F',
              borderRadius: 12,
              padding: 16,
              border: effectiveAvailable ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(244, 67, 54, 0.3)'
            }}
          >
            {/* Header máquina */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 2px' }}>{machine.type}</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>{machine.brand}</p>
                <p style={{ color: '#EC6819', fontSize: 12, margin: '4px 0 0', fontWeight: 700 }}>
                  Patente: {machine.licensePlate ? String(machine.licensePlate).toUpperCase() : 'SIN PATENTE'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => toggleAvailability(machine.id)}
                  title={!hasAssignedOperator ? 'Asigna un operador para habilitar esta máquina' : effectiveAvailable ? 'Marcar como no disponible' : 'Marcar como disponible'}
                  disabled={!hasAssignedOperator}
                  style={{
                    background: effectiveAvailable ? 'rgba(236, 104, 25, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                    color: effectiveAvailable ? '#EC6819' : '#F44336',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: !hasAssignedOperator ? 'not-allowed' : 'pointer',
                    opacity: !hasAssignedOperator ? 0.9 : 1
                  }}
                >
                  {!hasAssignedOperator ? 'Operador requerido' : effectiveAvailable ? 'Disponible' : 'No disponible'}
                </button>
                {canDeleteMachines && (
                  <button
                    onClick={() => setDeleteMachineConfirm(machine)}
                    title="Eliminar máquina"
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Precios */}
            <div style={{ marginBottom: 12 }}>
              {(() => {
                const machineMainPrice = machine.pricePerHour ?? machine.pricePerService ?? null;
                const machineNeedsTransport = needsTransport(machine.machineryType || machine.type);
                const hasMainPrice = Number(machineMainPrice) > 0;
                const hasTransport = Number(machine.transportCost) > 0;
                const isPerHour = !!machine.pricePerHour;
                const handleEditPricing = () => {
                   vibrate('tap');
                   setEditPricingModal({
                     machine,
                     priceVal: (machine.pricePerHour || machine.pricePerService || 0).toString(),
                     transportVal: (machine.transportCost || 0).toString(),
                     isPerHour: !!machine.pricePerHour
                   });
                 };
                return (
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div 
                      onClick={handleEditPricing}
                      style={{ cursor: 'pointer' }}
                    >
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase' }}>
                        {isPerHour ? 'Precio p/hora' : 'Precio p/viaje'}
                      </p>
                      <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {hasMainPrice ? formatPrice(machineMainPrice) : 'Sin definir'}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </p>
                    </div>
                    {machineNeedsTransport && (
                      <div 
                        onClick={handleEditPricing}
                        style={{ cursor: 'pointer' }}
                      >
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase' }}>Traslado</p>
                        <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {hasTransport ? formatPrice(machine.transportCost) : 'Sin definir'}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Operadores */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Operadores ({normalizedOperators.length})
              </p>
              {normalizedOperators.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {normalizedOperators.map(displayOp => {
                    const mid = toMachineryId(machine.type);
                    const isDefault = getEffectiveDefaultOperatorId(machine, defaultByMachinery) === displayOp.id;
                    return (
                      <div
                        key={displayOp.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isDefault ? 'rgba(236, 104, 25, 0.12)' : '#2A2A2A',
                          borderRadius: 8,
                          padding: '10px 12px',
                          border: isDefault ? '1px solid rgba(236, 104, 25, 0.4)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div>
                            <p style={{ color: '#fff', fontSize: 13, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {displayOp.name}
                              {isDefault && (
                                <span style={{ fontSize: 9, background: '#EC6819', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  Por defecto
                                </span>
                              )}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>
                              {displayOp.phone || 'Sin celular'}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {canAssignOperators && (machine.operators || []).length > 1 && (
                            <button
                              onClick={() => setDefaultOperator(mid, isDefault ? '' : displayOp.id)}
                              title={isDefault ? 'Quitar como predeterminado' : 'Usar por defecto'}
                              style={{
                                background: isDefault ? '#EC6819' : 'transparent',
                                border: `1px solid ${isDefault ? '#EC6819' : 'rgba(255,255,255,0.3)'}`,
                                color: isDefault ? '#fff' : 'rgba(255,255,255,0.7)',
                                cursor: 'pointer',
                                padding: '6px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              {isDefault ? '✓ Activo' : 'Activar'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, fontStyle: 'italic' }}>
                  Sin operadores asignados
                </p>
              )}
              {canAssignOperators && (
                <button
                  onClick={() => openOperatorsModal(machine)}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px',
                    background: 'none', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: 8,
                    color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  {'Agregar / modificar operadores'}
                </button>
              )}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => navigate(`/provider/edit-machine/${machine.id}`, { state: { machine } })}
                style={{
                  flex: 1, padding: '12px',
                  background: '#2A2A2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                  color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                }}
              >
                Editar datos
              </button>
              <button
                onClick={() => setEditPricingModal({
                  machine,
                  priceVal: (machine.pricePerHour || machine.pricePerService || 0).toString(),
                  transportVal: (machine.transportCost || 0).toString(),
                  isPerHour: !!machine.pricePerHour
                })}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(236, 104, 25, 0.2)', border: '1px solid rgba(236, 104, 25, 0.4)', borderRadius: 8,
                  color: '#EC6819', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Editar precios netos
              </button>
            </div>
          </div>
        )})}
      </div>

      {editPricingModal && (
        <EditPricingModal
          machine={editPricingModal.machine}
          priceVal={editPricingModal.priceVal}
          transportVal={editPricingModal.transportVal}
          isPerHour={editPricingModal.isPerHour}
          onSave={(updates) => savePricing(editPricingModal.machine.id, updates)}
          onClose={() => setEditPricingModal(null)}
        />
      )}

      {operatorModal && (
        <AssignOperatorsModal
          machine={operatorModal.machine}
          initialLoaded={operatorModal.initialLoaded}
          initialError={operatorModal.initialError}
          initialTeamOperators={operatorModal.initialTeamOperators}
          initialPendingInvitations={operatorModal.initialPendingInvitations}
          defaultOperatorId={getEffectiveDefaultOperatorId(operatorModal.machine, defaultByMachinery)}
          onSave={(operators) => saveMachineOperators(operatorModal.machine.id, operators)}
          onClose={() => setOperatorModal(null)}
        />
      )}

      {deleteMachineConfirm && (
        <ConfirmModal
          title="Eliminar máquina"
          message={`¿Eliminar ${deleteMachineConfirm.type} ${deleteMachineConfirm.brand}? Esta acción no se puede deshacer.`}
          onConfirm={() => handleDeleteMachine(deleteMachineConfirm.id)}
          onCancel={() => setDeleteMachineConfirm(null)}
        />
      )}

      </div>

      <ProviderNavigation />
    </div>
  );
}

function EditPricingModal({ machine, priceVal: initialPrice, transportVal: initialTransport, isPerHour, onSave, onClose }) {
  const [priceVal, setPriceVal] = useState(initialPrice);
  const [transportVal, setTransportVal] = useState(initialTransport);
  const [error, setError] = useState('');
  const machineNeedsTransport = needsTransport(machine.machineryType || machine.type);
  const machineryId = toMachineryId(machine.machineryType || machine.type);
  const refPrice = REFERENCE_PRICES[machineryId] || 80000;
  const maxPrice = Math.round(refPrice * MAX_PRICE_ABOVE_MARKET_PCT);
  const maxTransport = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
  const priceNum = parseInt(priceVal.replace(/\D/g, '')) || 0;
  const transportNum = parseInt(transportVal.replace(/\D/g, '')) || 0;
  const minPrice = isPerHour ? 20000 : 100000;
  const priceAlert = priceNum >= minPrice ? getPriceAlert(priceNum, refPrice) : null;
  const transportAlert = machineNeedsTransport && transportNum >= 15000 ? getTransportAlert(transportNum) : null;

  const handleSave = () => {
    setError('');
    if (priceNum < 20000) { setError('El valor mínimo es $20.000'); return; }
    if (priceNum > maxPrice) { setError(`El valor máximo es ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(maxPrice)}.`); return; }
    if (machineNeedsTransport && (transportNum < 0 || transportNum > maxTransport)) { setError(`El traslado máximo es ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(maxTransport)}.`); return; }
    const updates = isPerHour
      ? { pricePerHour: priceNum, pricePerService: null, transportCost: machineNeedsTransport ? transportNum : 0 }
      : { pricePerHour: null, pricePerService: priceNum, transportCost: machineNeedsTransport ? transportNum : 0 };
    onSave(updates);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Editar precios netos</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 8px' }}>{machine.type} · {machine.brand}</p>
              {/* Mensaje de tracción general eliminado; se usan solo alertas de precio contextuales */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>
            {isPerHour ? 'Valor por hora neto (CLP, sin IVA)' : 'Precio por servicio neto (CLP, sin IVA)'}
          </label>
          <input type="number" placeholder={isPerHour ? '80000' : '260000'} value={priceVal} onChange={e => setPriceVal(e.target.value.replace(/\D/g, ''))} className="maqgo-input" style={{ width: '100%' }} />
          {priceAlert && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, minHeight: 36, background: `${priceAlert.color}20`, border: `1px solid ${priceAlert.color}60`, display: 'flex', alignItems: 'center' }}>
              <p style={{ color: priceAlert.color, fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{priceAlert.msg}</p>
            </div>
          )}
        </div>
        {machineNeedsTransport && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Costo de traslado neto (CLP, sin IVA)</label>
            <input type="number" placeholder="25000" value={transportVal} onChange={e => setTransportVal(e.target.value.replace(/\D/g, ''))} className="maqgo-input" style={{ width: '100%' }} />
            {transportAlert && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, minHeight: 36, background: `${transportAlert.color}20`, border: `1px solid ${transportAlert.color}60`, display: 'flex', alignItems: 'center' }}>
                <p style={{ color: transportAlert.color, fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{transportAlert.msg}</p>
              </div>
            )}
          </div>
        )}
        {error && <p style={{ color: '#F44336', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" className="maqgo-btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} style={btnPrimary}>Guardar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function AssignOperatorsModal({
  machine,
  initialLoaded = false,
  initialError = '',
  initialTeamOperators = [],
  initialPendingInvitations = [],
  defaultOperatorId,
  onSave,
  onClose,
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManageOperators = hasPermission('canManageOperators');
  const [loading, setLoading] = useState(() => !initialLoaded);
  const [teamOperators, setTeamOperators] = useState(() => initialTeamOperators || []);
  const [pendingInvitations, setPendingInvitations] = useState(() => initialPendingInvitations || []);
  const [selectedIds, setSelectedIds] = useState(() =>
    new Set(
      (machine.operators || [])
        .map((o, index) => normalizeMachineOperator(machine, o, `op-selected-${index}`)?.id)
        .filter(Boolean)
    )
  );
  const [error, setError] = useState(() => initialError || '');
  const [newOperatorName, setNewOperatorName] = useState('');
  const [newOperatorRut, setNewOperatorRut] = useState('');
  const [newOperatorPhone, setNewOperatorPhone] = useState('+569');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [recentInvite, setRecentInvite] = useState(null);
  const [showInlineInviteForm, setShowInlineInviteForm] = useState(false);

  const ownerId = (localStorage.getItem('ownerId') || localStorage.getItem('userId') || '').trim();
  const copyTextToClipboard = async (text, successMessage) => {
    const value = String(text || '').trim();
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      return true;
    } catch {
      window.prompt('Copia este texto:', value);
      return false;
    }
  };

  const loadAssignableData = async () => {
    if (!ownerId) {
      setTeamOperators([]);
      setPendingInvitations([]);
      setLoading(false);
      setError('Tu sesion expiro. Inicia sesion nuevamente.');
      return;
    }
    setError('');
    try {
      const r = await axios.get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 8000 });
      const ops = (r.data?.operators || []).filter((o) => (o?.provider_role || '') === 'operator' || !o?.provider_role);
      setTeamOperators(ops);
      setPendingInvitations(Array.isArray(r.data?.pending_invitations) ? r.data.pending_invitations : []);
    } catch {
      setTeamOperators([]);
      setPendingInvitations([]);
      setError('No pudimos cargar los operadores de tu empresa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialLoaded) {
      loadAssignableData();
    }
  }, [initialLoaded]);

  const toggle = (opId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  };

  const handleSave = () => {
    const byId = new Map();
    operatorOptions.forEach((op, index) => {
      const stableId = getOperatorStableId(op, `op-option-${index}`);
      if (stableId) {
        byId.set(stableId, {
          id: stableId,
          name: op.name,
          phone: op.phone || '',
          rut: op.rut || '',
        });
      }
    });

    const selected = Array.from(byId.values()).filter((op) => selectedIds.has(op.id));
    if (selected.length === 0) {
      toast.warning('Esta maquina debe tener al menos un operador.');
      return;
    }
    onSave(selected);
    toast.success('Operadores asignados');
  };

  const operatorOptions = useMemo(() => {
    const byId = new Map();
    const currentOperators = Array.isArray(machine.operators) ? machine.operators : [];
    currentOperators.forEach((op, index) => {
      const normalized = normalizeMachineOperator(machine, op, `op-current-${index}`);
      if (!normalized) return;
      byId.set(normalized.id, {
        id: normalized.id,
        name: normalized.name || op.name || 'Operador',
        phone: normalized.phone || '',
        rut: normalized.rut || op.rut || '',
      });
    });
    teamOperators.forEach((op, index) => {
      const stableId = getOperatorStableId(op, `op-team-${index}`);
      if (!stableId) return;
      const prev = byId.get(stableId) || {};
      byId.set(stableId, {
        id: stableId,
        name: op.name || prev.name || 'Operador',
        phone: op.phone || prev.phone || '',
        rut: op.rut || prev.rut || '',
      });
    });
    return Array.from(byId.values());
  }, [machine.operators, teamOperators]);

  const selectableIds = useMemo(() => new Set(operatorOptions.map((o) => o.id)), [operatorOptions]);
  const missingAssigned = useMemo(() => {
    return (Array.isArray(machine.operators) ? machine.operators : []).filter(
      (op, index) => {
        const stableId = normalizeMachineOperator(machine, op, `op-missing-${index}`)?.id;
        return stableId && !selectableIds.has(stableId);
      }
    );
  }, [machine, machine.operators, selectableIds]);
  const overduePendingInvitations = useMemo(
    () => getOverdueOperatorInvitations(pendingInvitations),
    [pendingInvitations]
  );

  const handleCreateInlineInvite = async () => {
    const fullName = String(newOperatorName || '').trim();
    const rut = String(newOperatorRut || '').trim();
    const normalizedPhone = normalizeChileanMobileE164(newOperatorPhone);
    if (!fullName || !rut || !normalizedPhone) {
      toast.warning('Ingresa nombre completo, RUT y celular del operador.');
      return;
    }
    if (!validatePersonRut(rut)) {
      toast.warning('Ingresa un RUT de persona válido para el operador. No se acepta RUT empresa.');
      return;
    }
    if (!ownerId) {
      toast.error('Tu sesion expiro. Inicia sesion nuevamente.');
      return;
    }

    setCreatingInvite(true);
    try {
      const payload = {
        owner_id: ownerId,
        operator_name: fullName,
        operator_rut: formatRut(rut),
        operator_phone: normalizedPhone,
      };
      const response = await axios.post(`${BACKEND_URL}/api/operators/invite`, payload, { timeout: 8000 });
      const invite = {
        code: response?.data?.code || '',
        operator_name: fullName,
        operator_rut: rut,
        operator_phone: normalizedPhone,
        created_at: new Date().toISOString(),
        status: 'pending',
        invite_type: 'operator',
      };
      setRecentInvite(invite);
      setNewOperatorName('');
      setNewOperatorRut('');
      setNewOperatorPhone('+569');
      await loadAssignableData();
      toast.success('Codigo de activacion generado');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo generar el codigo del operador.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const shouldShowInlineInviteForm = canManageOperators && (showInlineInviteForm || !!recentInvite);

  const createInvitePanel = (
    <div
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        Generar código
      </div>
      <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.45, margin: '0 0 12px' }}>
        Te mostraremos un codigo para que lo compartas con el operador.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="maqgo-input"
          placeholder="Nombre completo"
          value={newOperatorName}
          onChange={(e) => setNewOperatorName(e.target.value)}
          style={{ width: '100%' }}
        />
        <input
          className="maqgo-input"
          placeholder="RUT"
          value={formatRut(newOperatorRut)}
          onChange={(e) => setNewOperatorRut(sanitizeRutInput(e.target.value))}
          style={{ width: '100%' }}
        />
        <input
          className="maqgo-input"
          placeholder="Celular"
          value={newOperatorPhone}
          onChange={(e) => setNewOperatorPhone(normalizeChileanMobileDraft(e.target.value))}
          style={{ width: '100%' }}
        />
        <button
          type="button"
          onClick={handleCreateInlineInvite}
          disabled={creatingInvite}
          style={{ ...btnPrimary, width: '100%', flex: 'none', opacity: creatingInvite ? 0.7 : 1 }}
        >
          {creatingInvite ? 'Generando...' : 'Generar código'}
        </button>
      </div>
      {recentInvite?.code ? (
        <div
          style={{
            marginTop: 12,
            background: 'rgba(236, 104, 25, 0.10)',
            border: '1px solid rgba(236, 104, 25, 0.35)',
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
            Codigo listo para {recentInvite.operator_name}
          </div>
          <div style={{ color: '#EC6819', fontSize: 18, fontWeight: 800, letterSpacing: 1.2, marginTop: 6 }}>
            {recentInvite.code}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 }}>
            Compártelo para que lo ingrese en MAQGO.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => copyTextToClipboard(recentInvite.code, 'Codigo copiado')}
              style={{ ...btnPrimary, flex: '1 1 120px', padding: 10, fontSize: 12 }}
            >
              Copiar codigo
            </button>
            <button
              type="button"
              onClick={() => copyTextToClipboard(buildOperatorJoinLink(recentInvite.code), 'Link copiado')}
              style={{
                flex: '1 1 120px',
                padding: 10,
                background: 'rgba(144, 189, 211, 0.14)',
                border: '1px solid rgba(144, 189, 211, 0.35)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Copiar link
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderInlineInviteEntry = (label = 'Agregar operador') =>
    canManageOperators ? (
      shouldShowInlineInviteForm ? (
        createInvitePanel
      ) : (
        <button
          type="button"
          onClick={() => setShowInlineInviteForm(true)}
          style={{
            width: '100%',
            padding: 12,
            background: 'rgba(236, 104, 25, 0.12)',
            border: '1px solid rgba(236, 104, 25, 0.35)',
            borderRadius: 12,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          {label}
        </button>
      )
    ) : null;

  return (
    <ModalOverlay onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>
            {'Operadores de esta máquina'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, margin: '0 0 14px' }}>
          Aquí puedes agregar o modificar operadores.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: 0 }}>Cargando operadores…</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 10px' }}>
              {error}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
              Revisa tu conexión y vuelve a intentar.
              {canManageOperators ? (
                <> También puedes gestionar códigos desde <strong>Código de activación operadores</strong>.</>
              ) : null}
            </p>
            {canManageOperators ? (
              <button onClick={() => { onClose(); navigate(buildOperatorCodesRoute()); }} style={{ ...btnPrimary, marginTop: 16 }}>
                Ir a Código de activación
              </button>
            ) : null}
            {renderInlineInviteEntry()}
          </div>
        ) : operatorOptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 10px' }}>
              Esta máquina debe tener al menos un operador.
            </p>
            <div style={{ marginTop: 16 }}>
              {renderInlineInviteEntry()}
            </div>
          </div>
        ) : (
          <>
            {renderInlineInviteEntry()}
            {overduePendingInvitations.length > 0 && (
              <div
                style={{
                  background: 'rgba(255, 167, 38, 0.12)',
                  border: '1px solid rgba(255, 167, 38, 0.42)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ color: '#FFA726', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  Warning de enrolamiento
                </div>
                <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, lineHeight: 1.45 }}>
                  {overduePendingInvitations.length === 1
                    ? 'Hay 1 operador que lleva mas de 24 horas sin enrolar su codigo de activacion.'
                    : `Hay ${overduePendingInvitations.length} operadores que llevan mas de 24 horas sin enrolar su codigo de activacion.`}
                </div>
              </div>
            )}
            {missingAssigned.length > 0 && (
              <div style={{ background: 'rgba(236, 104, 25, 0.1)', border: '1px solid rgba(236, 104, 25, 0.35)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ color: '#EC6819', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  Operadores pendientes de activación
                </div>
                <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 1.45 }}>
                  {missingAssigned.map((op) => op?.name).filter(Boolean).join(', ')}.
                  {' '}Revísalos en Ver códigos.
                </div>
                {canManageOperators ? (
                  <button onClick={() => { onClose(); navigate(buildOperatorCodesRoute()); }} style={{ ...btnPrimary, marginTop: 12 }}>
                    Ver códigos
                  </button>
                ) : null}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
              {operatorOptions.map((op) => {
                const isOnlySelected = selectedIds.size === 1 && selectedIds.has(op.id);
                const isDefault = String(defaultOperatorId || '').trim() === String(op.id || '').trim();
                return (
                <label
                  key={op.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    background: '#2A2A2A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: 12,
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(op.id)}
                    disabled={isOnlySelected}
                    onChange={() => toggle(op.id)}
                    style={{ width: 18, height: 18 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {op.name}
                      {isDefault ? (
                        <span style={{ fontSize: 9, background: '#EC6819', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                          Por defecto
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                      {(op.rut ? `RUT ${op.rut} · ` : '')}{op.phone || 'Sin celular'}
                    </div>
                  </div>
                </label>
              )})}
            </div>

            {pendingInvitations.length > 0 && (
              <div style={{ margin: '0 0 16px' }}>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                  Códigos pendientes ({pendingInvitations.length})
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.4 }}>
                    Tienes {pendingInvitations.length} código{pendingInvitations.length === 1 ? '' : 's'} pendiente{pendingInvitations.length === 1 ? '' : 's'}.
                  </div>
                  {canManageOperators ? (
                    <button
                      onClick={() => { onClose(); navigate(buildOperatorCodesRoute()); }}
                      style={{ ...btnPrimary, marginTop: 12, width: '100%' }}
                    >
                      Ver códigos
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="maqgo-btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSave} style={btnPrimary}>Guardar</button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <ModalOverlay onClick={onCancel}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="maqgo-btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</button>
          <button onClick={onConfirm} style={{ ...btnPrimary, background: '#F44336' }}>Eliminar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({ children, onClick }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={onClick}>
      {children}
    </div>
  );
}

const modalStyle = {
  background: '#1A1A1F',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 360,
  border: '1px solid rgba(255,255,255,0.1)'
};

const btnPrimary = { flex: 1, padding: 12, background: '#EC6819', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' };

export default MyMachinesScreen;
