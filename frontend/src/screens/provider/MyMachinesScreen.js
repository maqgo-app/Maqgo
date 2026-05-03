import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { ProviderNavigation } from '../../components/BottomNavigation';
import { useToast } from '../../components/Toast';
import { getMachines, resetMachines, updateMachine, removeMachine, needsTransport, MACHINERY_TYPES } from '../../utils/providerMachines';
import { REFERENCE_PRICES, REFERENCE_TRANSPORT, MAX_PRICE_ABOVE_MARKET_PCT, getPriceAlert, getTransportAlert } from '../../utils/pricing';
import { vibrate } from '../../utils/uberUX';
import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';

const STORAGE_KEY_DEFAULT_BY_MACHINERY = 'defaultOperatorByMachinery';

function toMachineryId(type) {
  if (!type) return 'retroexcavadora';
  const t = type.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  return MACHINERY_TYPES.find(m => m.id === t || m.name.toLowerCase().includes(t))?.id || 'retroexcavadora';
}

function MyMachinesScreen() {
  const navigate = useNavigate();
  const location = useLocation();
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
    if (!openOperatorForMachineId) return;
    const machine = getMachines().find((m) => m?.id === openOperatorForMachineId);
    if (machine) {
      setOperatorModal({ machine });
      navigate(location.pathname, { replace: true, state: { activationEdit, returnTo } });
    }
  }, [activationEdit, navigate, openOperatorForMachineId, location.pathname, returnTo]);

  const handleResetAllMachines = () => {
    resetMachines();
    loadMachines();
    setDeleteMachineConfirm(null);
  };


  const setDefaultOperator = (machineryId, operatorId) => {
    const updated = { ...defaultByMachinery, [machineryId]: operatorId };
    setDefaultByMachinery(updated);
    localStorage.setItem(STORAGE_KEY_DEFAULT_BY_MACHINERY, JSON.stringify(updated));
  };

  const savePricing = (machineId, updates) => {
    updateMachine(machineId, updates);
    loadMachines();
    setEditPricingModal(null);
  };

  const saveMachineOperators = (machineId, operators) => {
    const machines = getMachines();
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    const mid = toMachineryId(machine.type);
    const selectedIds = new Set((operators || []).map(o => o.id));
    if (defaultByMachinery[mid] && !selectedIds.has(defaultByMachinery[mid])) {
      setDefaultOperator(mid, '');
    }

    updateMachine(machineId, { operators: operators || [] });
    loadMachines();
    setOperatorModal(null);
    if (activationEdit) navigate(returnTo, { replace: true });
  };

  const toggleAvailability = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    updateMachine(machineId, { available: !machine.available });
    loadMachines();
  };

  const handleAddMachine = () => {
    navigate('/provider/machine-data', { state: { returnTo: '/provider/machines' } });
  };

  const handleDeleteMachine = (machineId) => {
    removeMachine(machineId);
    loadMachines();
    setDeleteMachineConfirm(null);
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
          {machines.length > 0 && (
            <button
              onClick={() => setDeleteMachineConfirm({ kind: 'reset_all' })}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'rgba(255,255,255,0.8)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="reset-all-machines"
              title="Eliminar todas las máquinas (reset)"
            >
              Limpiar
            </button>
          )}
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
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            + Agregar
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
        ) : machines.map(machine => (
          <div
            key={machine.id}
            style={{
              background: '#1A1A1F',
              borderRadius: 12,
              padding: 16,
              border: machine.available ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(244, 67, 54, 0.3)'
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
                  title={machine.available ? 'Marcar como no disponible' : 'Marcar como disponible'}
                  style={{
                    background: machine.available ? 'rgba(236, 104, 25, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                    color: machine.available ? '#EC6819' : '#F44336',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {machine.available ? 'Disponible' : 'No disponible'}
                </button>
                <button
                  onClick={() => setDeleteMachineConfirm(machine)}
                  title="Eliminar máquina"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
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
                Operadores ({(machine.operators || []).length})
              </p>
              <div
                style={{
                  background: 'rgba(236, 104, 25, 0.1)',
                  border: '1px solid rgba(236, 104, 25, 0.35)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  marginBottom: 8
                }}
              >
                <p style={{ color: '#EC6819', fontSize: 13, margin: 0, fontWeight: 700 }}>
                  Máquina: {machine.type} · Patente {machine.licensePlate ? String(machine.licensePlate).toUpperCase() : 'SIN PATENTE'}
                </p>
              </div>
              {(machine.operators || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(machine.operators || []).map(op => {
                    const mid = toMachineryId(machine.type);
                    const isDefault = defaultByMachinery[mid] === op.id;
                    return (
                      <div
                        key={op.id}
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
                              {op.name}
                              {isDefault && (
                                <span style={{ fontSize: 9, background: '#EC6819', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  Por defecto
                                </span>
                              )}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>
                              {op.phone || 'Sin celular'}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {(machine.operators || []).length > 1 && (
                            <button
                              onClick={() => setDefaultOperator(mid, isDefault ? '' : op.id)}
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
              <button
                onClick={() => setOperatorModal({ machine })}
                style={{
                  width: '100%', marginTop: 8, padding: '10px',
                  background: 'none', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: 8,
                  color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                Asignar operadores
              </button>
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
        ))}
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
          onSave={(operators) => saveMachineOperators(operatorModal.machine.id, operators)}
          onClose={() => setOperatorModal(null)}
        />
      )}

      {deleteMachineConfirm && (
        <ConfirmModal
          title={deleteMachineConfirm.kind === 'reset_all' ? 'Limpiar máquinas' : 'Eliminar máquina'}
          message={
            deleteMachineConfirm.kind === 'reset_all'
              ? '¿Eliminar todas tus máquinas? Quedará la lista vacía para que agregues una por una.'
              : `¿Eliminar ${deleteMachineConfirm.type} ${deleteMachineConfirm.brand}? Esta acción no se puede deshacer.`
          }
          onConfirm={() =>
            deleteMachineConfirm.kind === 'reset_all'
              ? handleResetAllMachines()
              : handleDeleteMachine(deleteMachineConfirm.id)
          }
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

function AssignOperatorsModal({ machine, onSave, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [teamOperators, setTeamOperators] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set((machine.operators || []).map(o => o.id)));
  const [error, setError] = useState('');

  useEffect(() => {
    const ownerId = localStorage.getItem('ownerId') || localStorage.getItem('userId');
    axios
      .get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 8000 })
      .then((r) => {
        const ops = (r.data?.operators || []).filter((o) => (o?.provider_role || '') === 'operator' || !o?.provider_role);
        setTeamOperators(ops);
      })
      .catch(() => {
        setTeamOperators([]);
        setError('No pudimos cargar los operadores de tu empresa.');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (opId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  };

  const handleSave = () => {
    const selected = teamOperators
      .filter((op) => selectedIds.has(op.id))
      .map((op) => ({
        id: op.id,
        name: op.name,
        phone: op.phone || '',
        rut: op.rut || '',
      }));
    onSave(selected);
    toast.success('Operadores asignados');
  };

  return (
    <ModalOverlay onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Asignar operadores</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 14px' }}>{machine.type}</p>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
            Aquí solo aparecen <strong>operadores activos</strong>. Los operadores <strong>pendientes</strong> (código sin usar) no se muestran para asignación.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: 0 }}>Cargando operadores…</p>
          </div>
        ) : teamOperators.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 10px' }}>
              No tienes operadores activos.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
              Crea un operador en <strong>Roles y accesos</strong>, comparte el código y cuando se enrolen aparecerán aquí.
            </p>
            <button onClick={() => { onClose(); navigate('/provider/team'); }} style={{ ...btnPrimary, marginTop: 16 }}>
              Ir a Roles y accesos
            </button>
          </div>
        ) : (
          <>
            {error && <p style={{ color: '#F44336', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
              {teamOperators.map((op) => (
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
                    onChange={() => toggle(op.id)}
                    style={{ width: 18, height: 18 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{op.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                      {(op.rut ? `RUT ${op.rut} · ` : '')}{op.phone || 'Sin celular'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
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
