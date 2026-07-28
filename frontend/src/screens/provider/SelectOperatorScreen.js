import React, { useLayoutEffect, useMemo, useState } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useLocation, useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ConfirmModal from '../../components/ConfirmModal';
import { getObject, getArray, getObjectFirst } from '../../utils/safeStorage';
import { syncAssignedOperatorToApi } from '../../utils/syncAssignedOperatorToApi';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';
import { getMachines } from '../../utils/providerMachines';
import { loadReservationAssignedOperators, saveReservationAssignedOperators } from '../../utils/reservationOperators';

/**
 * Pantalla: Selección de Operador (PROVEEDOR)
 * 
 * Opción B (Flexible): El proveedor elige qué operador asignar a cada trabajo.
 * Aparece después de aceptar una solicitud, antes de ir "En Camino".
 */
const STORAGE_KEY_DEFAULT_BY_MACHINERY = 'defaultOperatorByMachinery';

function normalizeStoredOperator(operator = {}, index = 0) {
  if (!operator || typeof operator !== 'object') return null;
  const nombre = String(operator.nombre || operator.name || '').trim();
  const apellido = String(operator.apellido || '').trim();
  const fullName = `${nombre} ${apellido}`.trim();
  const fallbackName = String(operator.name || '').trim();
  const finalName = fullName || fallbackName;
  if (!finalName) return null;
  const phone = String(operator.phone || operator.telefono || '').trim();
  if (!phone) return null;
  return {
    ...operator,
    id: String(operator.id || `op-${index}`),
    nombre: nombre || finalName,
    apellido,
    name: finalName,
    rut: String(operator.rut || '').trim(),
    phone,
    isOwner: Boolean(operator.isOwner),
  };
}

function normalizeMachineryKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .trim();
}

function resolveMatchedMachine(request) {
  const machines = getMachines();
  const requestMachineId = String(request?.machineId || request?.machine_id || '').trim();
  const requestMachineryKey = normalizeMachineryKey(
    request?.machineryId || request?.machineryType || request?.machinery_type
  );

  if (requestMachineId) {
    const byId = machines.find((machine) => String(machine?.id || '').trim() === requestMachineId);
    if (byId) return byId;
  }

  if (!requestMachineryKey) return null;
  return (
    machines.find(
      (machine) =>
        normalizeMachineryKey(machine?.machineryType || machine?.type || machine?.id) === requestMachineryKey
    ) || null
  );
}

function SelectOperatorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [operators, setOperators] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [loading, setLoading] = useState(false);
  const [useAsDefault, setUseAsDefault] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const fromEnRoute = Boolean(location.state?.fromEnRoute);
  const fromRequestReceived = Boolean(location.state?.fromRequestReceived);
  const manageMode = String(location.state?.manageMode || '').trim().toLowerCase();
  const isReservationEditor = fromRequestReceived || manageMode === 'replace' || manageMode === 'add';
  const acceptedRequest = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
  const matchedMachine = resolveMatchedMachine(acceptedRequest);
  const requestId = String(location.state?.requestId || acceptedRequest?.id || '').trim();
  const returnTo = String(location.state?.returnTo || (fromRequestReceived ? '/provider/request-received' : '')).trim();
  const [machineryId] = useState(() => {
    const raw = (acceptedRequest.machineryId || acceptedRequest.machineryType || 'retroexcavadora').toString();
    return raw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '') || 'retroexcavadora';
  });
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState([]);
  const currentReservationOperators = useMemo(
    () => loadReservationAssignedOperators(requestId).map((operator, index) => normalizeStoredOperator(operator, index)).filter(Boolean),
    [requestId]
  );
  const currentPrimaryReservationOperator = currentReservationOperators[0] || null;
  const currentAdditionalReservationIds = currentReservationOperators
    .slice(1)
    .map((operator) => String(operator?.id || '').trim())
    .filter(Boolean);
  const screenTitle = manageMode === 'add' ? 'Agregar operador' : 'Cambiar operador';
  const screenSubtitle = manageMode === 'add'
    ? 'Suma operadores adicionales solo para esta reserva.'
    : 'Reemplaza el operador principal solo para esta reserva.';

  useLayoutEffect(() => {
    const serviceOperators = getArray('assignableServiceOperators', []);
    const savedOperators = (serviceOperators.length > 0 ? serviceOperators : getArray('operatorsData', []))
      .map((op, index) => normalizeStoredOperator(op, index))
      .filter(Boolean);
    const currentAssignedOperator = normalizeStoredOperator(getObject('assignedOperator', {}), -1);

    if (savedOperators.length === 0) {
      setOperators([]);
      setSelectedOperator(null);
      return;
    }

    const operatorsWithIds = savedOperators;
    setOperators(operatorsWithIds);

    const defaults = getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {});
    const defaultOpId = defaults[machineryId || 'retroexcavadora'];
    const currentAssignedId = String(currentAssignedOperator?.id || '').trim();
    const currentAssignedOp = currentAssignedId
      ? operatorsWithIds.find((o) => String(o.id || '').trim() === currentAssignedId)
      : null;
    const defaultOp = defaultOpId ? operatorsWithIds.find((o) => o.id === defaultOpId) : null;
    const reservationPrimaryId = String(currentPrimaryReservationOperator?.id || '').trim();
    const reservationPrimaryOp = reservationPrimaryId
      ? operatorsWithIds.find((operator) => String(operator?.id || '').trim() === reservationPrimaryId)
      : null;

    if (isReservationEditor && manageMode === 'add') {
      setSelectedOperator(reservationPrimaryOp || currentAssignedOp || defaultOp || operatorsWithIds[0] || null);
      setSelectedAdditionalIds(
        currentAdditionalReservationIds.filter((operatorId) =>
          operatorsWithIds.some((operator) => String(operator?.id || '').trim() === operatorId)
        )
      );
      return;
    }

    if (isReservationEditor) {
      setSelectedOperator(reservationPrimaryOp || currentAssignedOp || defaultOp || operatorsWithIds[0] || null);
      setSelectedAdditionalIds(currentAdditionalReservationIds);
      return;
    }

    if (operatorsWithIds.length === 1) {
      setSelectedOperator(operatorsWithIds[0]);
    } else if (currentAssignedOp) {
      setSelectedOperator(currentAssignedOp);
    } else if (defaultOp) {
      setSelectedOperator(defaultOp);
    } else {
      setSelectedOperator(null);
    }
  }, [currentAdditionalReservationIds, currentPrimaryReservationOperator, isReservationEditor, machineryId, manageMode]);

  const additionalCandidates = useMemo(() => {
    const primaryId = String(selectedOperator?.id || currentPrimaryReservationOperator?.id || '').trim();
    return operators.filter((operator) => String(operator?.id || '').trim() !== primaryId);
  }, [currentPrimaryReservationOperator, operators, selectedOperator]);

  const toggleAdditionalOperator = (operatorId) => {
    const nextId = String(operatorId || '').trim();
    if (!nextId) return;
    setSelectedAdditionalIds((current) => (
      current.includes(nextId)
        ? current.filter((id) => id !== nextId)
        : [...current, nextId]
    ));
  };

  const handleConfirm = () => {
    if (!selectedOperator) return;

    if (isReservationEditor) {
      const nextOperators = manageMode === 'add'
        ? [
            selectedOperator,
            ...additionalCandidates.filter((operator) => selectedAdditionalIds.includes(String(operator?.id || '').trim())),
          ]
        : [
            selectedOperator,
            ...operators.filter((operator) => {
              const id = String(operator?.id || '').trim();
              return id && currentAdditionalReservationIds.includes(id) && id !== String(selectedOperator?.id || '').trim();
            }),
          ];
      saveReservationAssignedOperators(requestId, nextOperators);
      navigate(returnTo || '/provider/request-received', {
        replace: true,
        state: { operatorsUpdatedAt: Date.now() },
      });
      return;
    }

    setLoading(true);
    const operatorData = {
      ...selectedOperator,
      phone: selectedOperator.phone || '',
    };
    localStorage.setItem('assignedOperator', JSON.stringify(operatorData));
    localStorage.setItem('assignedOperators', JSON.stringify([operatorData]));
    void syncAssignedOperatorToApi(operatorData);
    if (selectedOperator.photo) {
      const sel = getObject('selectedProvider', {});
      localStorage.setItem('selectedProvider', JSON.stringify({ ...sel, operator_photo: selectedOperator.photo }));
    }

    if (useAsDefault && machineryId) {
      const defaults = getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {});
      defaults[machineryId] = selectedOperator.id;
      localStorage.setItem(STORAGE_KEY_DEFAULT_BY_MACHINERY, JSON.stringify(defaults));
    }

    navigate('/provider/en-route', { replace: fromEnRoute });
  };

  const handleBackClick = () => setShowBackModal(true);

  const handleBackConfirm = () => {
    setShowBackModal(false);
    if (isReservationEditor) {
      navigate(returnTo || '/provider/request-received', { replace: true });
      return;
    }
    if (fromEnRoute) {
      navigate('/provider/en-route', { replace: true });
      return;
    }
    localStorage.removeItem('acceptedRequest');
    localStorage.removeItem('incomingRequest');
    navigate(getProviderLandingPath());
  };

  const handleEditMachineOperators = () => {
    if (!matchedMachine?.id) return;
    navigate('/provider/machines', {
      state: {
        activationEdit: true,
        returnTo: isReservationEditor ? (returnTo || '/provider/request-received') : '/provider/select-operator',
        openOperatorForMachineId: matchedMachine.id,
      },
    });
  };

  const renderOperatorCard = (operator, selected, onClick, multiselect = false) => (
    <div
      key={operator.id}
      onClick={onClick}
      style={{
        background: selected ? 'rgba(236, 104, 25, 0.15)' : '#363636',
        border: selected ? '2px solid #EC6819' : '2px solid transparent',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
      data-testid={`operator-option-${operator.id}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: selected ? '#EC6819' : '#444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="#fff" strokeWidth="2"/>
            <path d="M4 20C4 17 7 14 12 14C17 14 20 17 20 20" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 4
          }}>
            {operator.nombre} {operator.apellido}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
            RUT: {operator.rut}
          </div>
          {operator.licenseType && (
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 2 }}>
              Licencia: {operator.licenseType}
            </div>
          )}
        </div>

        <div style={{
          width: 24,
          height: 24,
          borderRadius: multiselect ? 8 : '50%',
          border: `2px solid ${selected ? '#EC6819' : '#555'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {selected ? (
            <div style={{ width: 12, height: 12, borderRadius: multiselect ? 4 : '50%', background: '#EC6819' }} />
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20
        }}>
          <button 
            onClick={handleBackClick}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="back-btn"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {/* Título */}
        <h2 style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 8
        }}>
          {isReservationEditor ? screenTitle : 'Asignar Operador'}
        </h2>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 24
        }}>
          {isReservationEditor ? screenSubtitle : 'Selecciona quién operará la máquina en esta reserva'}
        </p>

        {/* Lista de operadores */}
        <div style={{ flex: 1 }}>
          {operators.length === 0 && (
            <div
              style={{
                background: '#363636',
                borderRadius: 12,
                padding: 18,
                marginBottom: 16,
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>
                Esta maquina no tiene un operador real con celular asignado
              </p>
              <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.45 }}>
                Agrega o cambia el operador de esta maquina antes de continuar para no perder la reserva.
              </p>
              {matchedMachine?.id ? (
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  onClick={handleEditMachineOperators}
                  style={{ width: '100%', marginTop: 14 }}
                >
                  Agregar o cambiar operador
                </button>
              ) : null}
            </div>
          )}

          {isReservationEditor && selectedOperator ? (
            <div style={{
              background: '#363636',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16
            }}>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, textTransform: 'uppercase', margin: 0, marginBottom: 8 }}>
                Operador principal de esta reserva
              </p>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>
                {selectedOperator.nombre} {selectedOperator.apellido}
              </p>
              <p style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 13,
                margin: '8px 0 0',
                lineHeight: 1.45
              }}>
                {manageMode === 'add'
                  ? 'Se mantiene asignado mientras agregas apoyo adicional.'
                  : 'Este operador reemplazará al predeterminado solo para esta reserva.'}
              </p>
            </div>
          ) : null}

          {isReservationEditor && manageMode === 'add' ? (
            additionalCandidates.length === 0 ? (
              <div style={{ background: '#363636', borderRadius: 12, padding: 16 }}>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>
                  No hay operadores adicionales disponibles en esta máquina
                </p>
                <p style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.45 }}>
                  Agrega más operadores a la máquina si este trabajo requiere apoyo adicional.
                </p>
              </div>
            ) : (
              additionalCandidates.map((operator) =>
                renderOperatorCard(
                  operator,
                  selectedAdditionalIds.includes(String(operator?.id || '').trim()),
                  () => toggleAdditionalOperator(operator.id),
                  true
                )
              )
            )
          ) : (
            operators.map((operator) =>
              renderOperatorCard(
                operator,
                selectedOperator?.id === operator.id,
                () => setSelectedOperator(operator)
              )
            )
          )}

          {/* Opción: Usar como predeterminado para esta máquina */}
          {!isReservationEditor && selectedOperator && operators.length > 1 && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 16,
              padding: 14,
              background: '#363636',
              borderRadius: 12,
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={useAsDefault}
                onChange={(e) => setUseAsDefault(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: '#EC6819' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                Usar como predeterminado para esta máquina en próximas reservas
              </span>
            </label>
          )}

          {/* Info notificaciones paralelas */}
          <div style={{
            background: 'rgba(144, 189, 211, 0.1)',
            borderRadius: 10,
            padding: '12px 14px',
            marginTop: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
                <path d="M12 8V12" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1" fill="#90BDD3"/>
              </svg>
              <p style={{ color: '#90BDD3', fontSize: 12, margin: 0, lineHeight: 1.4 }}>
                {isReservationEditor
                  ? 'Estos cambios solo aplican a esta reserva. La máquina mantiene su operador predeterminado original.'
                  : 'Tú también recibirás notificaciones cuando el servicio inicie y finalice'}
              </p>
            </div>
          </div>

          {/* Info adicional */}
          {!isReservationEditor && operators.length === 1 && (
            <div style={{
              background: 'rgba(236, 104, 25, 0.1)',
              borderRadius: 10,
              padding: '12px 14px',
              marginTop: 12
            }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0, textAlign: 'center' }}>
                Puedes agregar o cambiar operadores de esta máquina sin salir del flujo
              </p>
            </div>
          )}
        </div>

        {/* Botón confirmar */}
        <button
          className="maqgo-btn-primary"
          onClick={handleConfirm}
          disabled={!selectedOperator || loading}
          aria-busy={loading}
          aria-label={
            loading
              ? 'Guardando operador'
              : (
                isReservationEditor
                  ? (manageMode === 'add' ? 'Guardar operadores adicionales' : 'Guardar operador para esta reserva')
                  : 'Confirmar y continuar'
              )
          }
          style={{ 
            marginTop: 20,
            opacity: (!selectedOperator || loading) ? 0.5 : 1
          }}
          data-testid="confirm-operator-btn"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Guardando...
            </span>
          ) : (
            isReservationEditor
              ? (manageMode === 'add' ? 'Guardar y volver a la reserva' : 'Usar este operador en la reserva')
              : 'Confirmar y continuar'
          )}
        </button>

        <ConfirmModal
          open={showBackModal}
          onClose={() => setShowBackModal(false)}
          title={
            isReservationEditor
              ? 'Volver a la reserva'
              : (fromEnRoute ? 'Volver al servicio' : 'Cancelar aceptación')
          }
          message={
            isReservationEditor
              ? '¿Volver a la reserva sin guardar cambios en los operadores?'
              : (
                fromEnRoute
                  ? '¿Volver al servicio sin cambiar el operador asignado?'
                  : '¿Cancelar la aceptación de la reserva? Volverás al inicio sin asignar operador.'
              )
          }
          confirmLabel={isReservationEditor ? 'Sí, volver' : (fromEnRoute ? 'Sí, volver' : 'Sí, cancelar')}
          cancelLabel="No, continuar"
          onConfirm={handleBackConfirm}
          variant="danger"
        />
      </div>
    </div>
  );
}

export default SelectOperatorScreen;
