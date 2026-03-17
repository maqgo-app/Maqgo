import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ProviderNavigation } from '../../components/BottomNavigation';
import { useToast } from '../../components/Toast';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import { getMachines, updateMachine, addMachine, removeMachine, needsTransport, MACHINERY_TYPES } from '../../utils/providerMachines';
import { REFERENCE_PRICES, REFERENCE_TRANSPORT, MAX_PRICE_ABOVE_MARKET_PCT, getPriceAlert, getTransportAlert } from '../../utils/pricing';
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
  const [machines, setMachines] = useState([]);
  const [defaultByMachinery, setDefaultByMachinery] = useState({});
  const [editPricingModal, setEditPricingModal] = useState(null);
  const [operatorModal, setOperatorModal] = useState(null);
  const [deleteMachineConfirm, setDeleteMachineConfirm] = useState(null);
  const [deleteOperatorConfirm, setDeleteOperatorConfirm] = useState(null);

  const loadMachines = () => setMachines(getMachines());

  useEffect(() => {
    setDefaultByMachinery(getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {}));
    loadMachines();
  }, []);

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

  const saveOperator = (machineId, operatorData) => {
    const machines = getMachines();
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    const ops = [...(machine.operators || [])];
    if (operatorData.id) {
      const idx = ops.findIndex(o => o.id === operatorData.id);
      if (idx >= 0) ops[idx] = { ...ops[idx], ...operatorData };
    } else {
      ops.push({
        id: `op-${Date.now()}`,
        name: operatorData.name,
        phone: operatorData.phone || '',
        online: false,
        lastSeen: new Date().toISOString(),
        ...operatorData
      });
    }
    updateMachine(machineId, { operators: ops });
    loadMachines();
    setOperatorModal(null);
  };

  const deleteOperator = (machineId, operatorId) => {
    const machines = getMachines();
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    const ops = (machine.operators || []).filter(o => o.id !== operatorId);
    updateMachine(machineId, { operators: ops });
    const mid = toMachineryId(machine.type);
    if (defaultByMachinery[mid] === operatorId) {
      setDefaultOperator(mid, '');
    }
    loadMachines();
  };

  const toggleAvailability = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    updateMachine(machineId, { available: !machine.available });
    loadMachines();
  };

  const handleAddMachine = () => {
    const newMachine = addMachine({
      machineryType: 'retroexcavadora',
      type: 'Retroexcavadora',
      brand: 'Nueva máquina',
      pricePerHour: 80000,
      transportCost: 25000,
      available: true,
      operators: []
    });
    loadMachines();
    navigate(`/provider/edit-machine/${newMachine.id}`, { state: { machine: newMachine } });
  };

  const handleDeleteMachine = (machineId) => {
    removeMachine(machineId);
    loadMachines();
    setDeleteMachineConfirm(null);
  };

  const handleDeleteOperator = (machineId, operatorId, operatorName) => {
    deleteOperator(machineId, operatorId);
    setDeleteOperatorConfirm(null);
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price || 0);

  return (
    <div style={{ background: '#18181C', minHeight: '100vh', padding: '20px', paddingBottom: 80 }}>
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
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => toggleAvailability(machine.id)}
                  title={machine.available ? 'Marcar como no disponible' : 'Marcar como disponible'}
                  style={{
                    background: machine.available ? 'rgba(236, 104, 25, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                    color: machine.available ? '#EC6819' : '#F44336',
                    fontSize: 10,
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
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Valor hora y traslado
              </p>
              <div style={{ background: '#2A2A2A', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    {machine.pricePerHour ? 'Precio/hora' : 'Precio/servicio'}
                  </span>
                  <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>
                    {formatPrice(machine.pricePerHour || machine.pricePerService)}
                  </span>
                </div>
                {machine.transportCost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Traslado</span>
                    <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(machine.transportCost)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Operadores */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Operadores ({(machine.operators || []).length})
              </p>
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
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: op.online ? '#4CAF50' : '#666', flexShrink: 0
                          }} />
                          <div>
                            <p style={{ color: '#fff', fontSize: 13, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {op.name}
                              {isDefault && (
                                <span style={{ fontSize: 9, background: '#EC6819', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  Por defecto
                                </span>
                              )}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: 0 }}>
                              {op.phone || (op.online ? 'Conectado' : 'Desconectado')}
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
                                fontSize: 10,
                                fontWeight: 600
                              }}
                            >
                              {isDefault ? '✓ Activo' : 'Activar'}
                            </button>
                          )}
                          <button
                            onClick={() => setOperatorModal({ machine, operator: op })}
                            title="Editar operador"
                            style={{ background: 'none', border: 'none', color: '#90BDD3', cursor: 'pointer', padding: 4 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                              <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteOperatorConfirm({ machine, operator: op })}
                            title="Eliminar operador"
                            style={{ background: 'none', border: 'none', color: '#F44336', cursor: 'pointer', padding: 4 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </button>
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
                onClick={() => setOperatorModal({ machine, operator: null })}
                style={{
                  width: '100%', marginTop: 8, padding: '10px',
                  background: 'none', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: 8,
                  color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                + Agregar operador
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
                Editar precios
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
        operatorModal.operator ? (
          <OperatorModal
            machine={operatorModal.machine}
            operator={operatorModal.operator}
            onSave={(data) => saveOperator(operatorModal.machine.id, data)}
            onClose={() => setOperatorModal(null)}
          />
        ) : (
          <AddOperatorChoiceModal
            machine={operatorModal.machine}
            onSelectFromTeam={(op) => { saveOperator(operatorModal.machine.id, { id: op.id, name: op.name, phone: op.phone || '' }); setOperatorModal(null); }}
            onSaveManual={(data) => { saveOperator(operatorModal.machine.id, data); setOperatorModal(null); }}
            onClose={() => setOperatorModal(null)}
          />
        )
      )}

      {deleteMachineConfirm && (
        <ConfirmModal
          title="Eliminar máquina"
          message={`¿Eliminar ${deleteMachineConfirm.type} ${deleteMachineConfirm.brand}? Esta acción no se puede deshacer.`}
          onConfirm={() => handleDeleteMachine(deleteMachineConfirm.id)}
          onCancel={() => setDeleteMachineConfirm(null)}
        />
      )}

      {deleteOperatorConfirm && (
        <ConfirmModal
          title="Eliminar operador"
          message={`¿Quitar a ${deleteOperatorConfirm.operator.name} de esta máquina?`}
          onConfirm={() => handleDeleteOperator(deleteOperatorConfirm.machine.id, deleteOperatorConfirm.operator.id, deleteOperatorConfirm.operator.name)}
          onCancel={() => setDeleteOperatorConfirm(null)}
        />
      )}

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
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Editar precios</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 8px' }}>{machine.type} · {machine.brand}</p>
              {/* Mensaje de tracción general eliminado; se usan solo alertas de precio contextuales */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>
            {isPerHour ? 'Valor por hora (CLP)' : 'Precio por servicio (CLP)'}
          </label>
          <input type="number" placeholder={isPerHour ? '80000' : '260000'} value={priceVal} onChange={e => setPriceVal(e.target.value.replace(/\D/g, ''))} className="maqgo-input" style={{ width: '100%' }} />
          {priceAlert && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, minHeight: 36, background: `${priceAlert.color}20`, border: `1px solid ${priceAlert.color}60`, display: 'flex', alignItems: 'center' }}>
              <p style={{ color: priceAlert.color, fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{priceAlert.msg}</p>
            </div>
          )}
        </div>
        {machineNeedsTransport && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Costo de traslado (CLP)</label>
            <input type="number" placeholder="25000" value={transportVal} onChange={e => setTransportVal(e.target.value.replace(/\D/g, ''))} className="maqgo-input" style={{ width: '100%' }} />
            {transportAlert && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, minHeight: 36, background: `${transportAlert.color}20`, border: `1px solid ${transportAlert.color}60`, display: 'flex', alignItems: 'center' }}>
                <p style={{ color: transportAlert.color, fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{transportAlert.msg}</p>
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

function AddOperatorChoiceModal({ machine, onSelectFromTeam, onSaveManual, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('loading'); // 'loading' | 'choice' | 'fromTeam' | 'inviteForm' | 'inviteNew' | 'manual'
  const [teamOperators, setTeamOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rut, setRut] = useState('');
  const [error, setError] = useState('');
  const existingIds = (machine.operators || []).map(o => o.id);

  // Cargar equipo al abrir (mejor práctica: mostrar opción más probable primero)
  useEffect(() => {
    const ownerId = localStorage.getItem('ownerId') || localStorage.getItem('userId');
    const FAST_FALLBACK_MS = 2500;
    const apiPromise = axios.get(`${BACKEND_URL}/api/operators/team/${ownerId}`, { timeout: 5000 });
    const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_FALLBACK_MS));
    Promise.race([apiPromise, timeoutPromise])
      .then(r => {
        const ops = r.data.operators || [];
        setTeamOperators(ops);
        const available = ops.filter(o => !existingIds.includes(o.id));
        setMode(available.length > 0 ? 'fromTeam' : 'choice');
      })
      .catch(() => { setTeamOperators([]); setMode('choice'); })
      .finally(() => setLoading(false));
  }, []);

  const handleInviteNew = async () => {
    setError('');
    const n = name.trim();
    const p = phone.replace(/\D/g, '');
    if (!n) { setError('Ingresa el nombre del operador'); return; }
    if (!p || p.length < 9) { setError('Ingresa el celular del operador'); return; }
    if (rut.trim() && !validateRut(rut)) { setError('RUT inválido'); return; }
    setInviting(true);
    try {
      const ownerId = localStorage.getItem('ownerId') || localStorage.getItem('userId');
      const r = await axios.post(`${BACKEND_URL}/api/operators/invite`, {
        owner_id: ownerId,
        operator_name: n,
        operator_phone: phone.startsWith('+56') ? phone : `+56${p}`,
        operator_rut: rut.trim() || null
      });
      setInviteCode(r.data.code);
      setMode('inviteNew');
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al generar código');
    }
    setInviting(false);
  };

  const availableOperators = teamOperators.filter(o => !existingIds.includes(o.id));

  return (
    <ModalOverlay onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Agregar operador</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 20px' }}>{machine.type}</p>

        {mode === 'loading' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Cargando equipo...</p>
          </div>
        )}

        {mode === 'choice' && (
          <>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 16px' }}>
              No hay operadores en tu equipo. Invita uno o agrega manualmente.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => setMode('inviteForm')}
                style={{
                  padding: 14, background: 'rgba(236, 104, 25, 0.2)', border: '2px solid #EC6819', borderRadius: 12,
                  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12
                }}
              >
                <span style={{ fontSize: 20 }}>📱</span>
                <div>
                  <div>Invitar nuevo operador</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>Inscríbelo y genera código · Solo necesitará el código</div>
                </div>
              </button>
              <button
                onClick={() => setMode('manual')}
                style={{
                  padding: 14, background: '#2A2A2A', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
                  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12
                }}
              >
                <span style={{ fontSize: 20 }}>✏️</span>
                <div>
                  <div>Agregar manualmente</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>Nombre y teléfono (sin enrolar)</div>
                </div>
              </button>
            </div>
            {error && <p style={{ color: '#F44336', fontSize: 12, marginBottom: 12 }}>{error}</p>}
          </>
        )}

        {mode === 'inviteForm' && (
          <>
            <button type="button" className="maqgo-btn-secondary" onClick={() => setMode(availableOperators.length > 0 ? 'fromTeam' : 'choice')} style={{ marginBottom: 16, width: '100%' }}>← Volver</button>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 16px' }}>
              Inscribe al operador. Solo necesitará el código para enrolarse.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 6 }}>Nombre completo *</label>
              <input type="text" placeholder="Ej: Juan Pérez" value={name} onChange={e => setName(e.target.value)} className="maqgo-input" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 6 }}>Celular *</label>
              <input type="tel" placeholder="+56 9 1234 5678" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} className="maqgo-input" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 6 }}>RUT <span style={{ color: 'rgba(255,255,255,0.4)' }}>(opcional)</span></label>
              <input type="text" placeholder="12.345.678-9" value={rut} onChange={e => setRut(formatRut(e.target.value))} maxLength={12} className="maqgo-input" style={{ width: '100%', fontFamily: "'JetBrains Mono', monospace" }} />
            </div>
            {error && <p style={{ color: '#F44336', fontSize: 12, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleInviteNew} disabled={inviting} style={btnPrimary}>
              {inviting ? 'Generando...' : 'Inscribir y generar código'}
            </button>
          </>
        )}

        {mode === 'fromTeam' && (
          <>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>Cargando equipo...</p>
            ) : availableOperators.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '0 0 12px' }}>
                  No hay operadores en tu equipo o ya están asignados a esta máquina.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0 }}>
                  Ve a <strong>Mi Equipo</strong> para invitar operadores.
                </p>
                <button onClick={() => { onClose(); navigate('/provider/team'); }} style={{ ...btnPrimary, marginTop: 16 }}>Ir a Mi Equipo</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                  {availableOperators.map(op => (
                    <button
                      key={op.id}
                      onClick={() => onSelectFromTeam(op)}
                      style={{
                        padding: 12, background: '#2A2A2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                        color: '#fff', fontSize: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#90BDD3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F0F12', fontWeight: 700 }}>
                        {op.name?.charAt(0) || 'O'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{op.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{op.phone || 'Sin teléfono'}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setMode('inviteForm')}
                  style={{
                    width: '100%', padding: 10, background: 'none', border: 'none',
                    color: '#90BDD3', fontSize: 12, cursor: 'pointer', textDecoration: 'underline'
                  }}
                >
                  ¿No está? Inscribir e invitar nuevo operador
                </button>
              </>
            )}
          </>
        )}

        {mode === 'inviteNew' && inviteCode && (
          <>
            <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 24, marginBottom: 16, textAlign: 'center' }}>
              <p style={{ color: '#90BDD3', fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 6, margin: '0 0 8px' }}>{inviteCode}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>Válido 7 días</p>
            </div>
            <div style={{ background: 'rgba(236, 104, 25, 0.1)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <p style={{ color: '#EC6819', fontSize: 13, margin: 0 }}>
                Envía este código al operador. Solo debe abrir Maqgo → <strong>Soy operador</strong> → ingresar el código.
              </p>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Tu código MAQGO: ${inviteCode}\n\nAbre Maqgo → Soy operador → ingresa el código + tu nombre + celular.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: 14, marginBottom: 8,
                background: '#25D366', border: 'none', borderRadius: 10, color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Compartir por WhatsApp
            </a>
            <button type="button" className="maqgo-btn-secondary" onClick={() => { navigator.clipboard.writeText(inviteCode); toast.success('Código copiado'); }} style={{ marginBottom: 8, width: '100%' }}>
              Copiar código
            </button>
            <button onClick={onClose} style={btnPrimary}>Listo</button>
          </>
        )}

        {mode === 'manual' && (
          <>
            <button type="button" className="maqgo-btn-secondary" onClick={() => setMode('choice')} style={{ marginBottom: 16, width: '100%' }}>← Volver</button>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Nombre completo</label>
              <input type="text" placeholder="Ej: Juan Pérez" value={name} onChange={e => setName(e.target.value)} className="maqgo-input" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Teléfono</label>
              <input type="tel" placeholder="+56 9 1234 5678" value={phone} onChange={e => setPhone(e.target.value)} className="maqgo-input" style={{ width: '100%' }} />
            </div>
            {error && <p style={{ color: '#F44336', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="maqgo-btn-secondary" onClick={() => setMode('choice')} style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => { setError(''); const t = name.trim(); if (!t) { setError('El nombre es obligatorio'); return; } onSaveManual({ name: t, phone: phone.trim() }); }} style={btnPrimary}>Guardar</button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function OperatorModal({ machine, operator, onSave, onClose }) {
  const [name, setName] = useState(operator?.name || '');
  const [phone, setPhone] = useState(operator?.phone || '');
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) { setError('El nombre es obligatorio'); return; }
    onSave({ id: operator?.id, name: trimmed, phone: phone.trim() });
  };

  return (
    <ModalOverlay onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>
          {operator ? 'Editar operador' : 'Agregar operador'}
        </h3>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 20px' }}>{machine.type}</p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Nombre completo</label>
          <input type="text" placeholder="Ej: Juan Pérez" value={name} onChange={e => setName(e.target.value)} className="maqgo-input" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6 }}>Teléfono</label>
          <input type="tel" placeholder="+56 9 1234 5678" value={phone} onChange={e => setPhone(e.target.value)} className="maqgo-input" style={{ width: '100%' }} />
        </div>
        {error && <p style={{ color: '#F44336', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" className="maqgo-btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} style={btnPrimary}>Guardar</button>
        </div>
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
