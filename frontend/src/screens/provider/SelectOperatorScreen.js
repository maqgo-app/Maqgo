import React, { useState, useLayoutEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import PhoneNationalInput from '../../components/PhoneNationalInput';
import { validateCelularChile } from '../../utils/chileanValidation';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../components/Toast';
import { getObject, getArray, getObjectFirst } from '../../utils/safeStorage';
import { syncAssignedOperatorToApi } from '../../utils/syncAssignedOperatorToApi';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

/**
 * Pantalla: Selección de Operador (PROVEEDOR)
 * 
 * Opción B (Flexible): El proveedor elige qué operador asignar a cada trabajo.
 * Aparece después de aceptar una solicitud, antes de ir "En Camino".
 */
const STORAGE_KEY_DEFAULT_BY_MACHINERY = 'defaultOperatorByMachinery';

function SelectOperatorScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [operators, setOperators] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [operatorPhone, setOperatorPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [useAsDefault, setUseAsDefault] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [machineryId] = useState(() => {
    const accepted = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
    const raw = (accepted.machineryId || accepted.machineryType || 'retroexcavadora').toString();
    return raw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '') || 'retroexcavadora';
  });
  
  // Datos del dueño/secretaria para notificaciones
  const [ownerPhone] = useState(() => getObject('registerData', {}).phone || '');

  useLayoutEffect(() => {
    const savedOperators = getArray('operatorsData', []);

    if (savedOperators.length === 0) {
      const registerData = getObject('registerData', {});
      const providerData = getObject('providerData', {});
      const defaultOperator = {
        id: 'owner',
        nombre: registerData.nombre || 'Propietario',
        apellido: registerData.apellido || '',
        rut: providerData.rut || 'No registrado',
        licenseType: 'Clase D',
        isOwner: true
      };
      setOperators([defaultOperator]);
      setSelectedOperator(defaultOperator);
      return;
    }

    const operatorsWithIds = savedOperators.map((op, index) => ({
      ...op,
      id: op.id || `op-${index}`
    }));
    setOperators(operatorsWithIds);

    const defaults = getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {});
    const defaultOpId = defaults[machineryId || 'retroexcavadora'];
    const defaultOp = defaultOpId ? operatorsWithIds.find((o) => o.id === defaultOpId) : null;

    if (operatorsWithIds.length === 1) {
      setSelectedOperator(operatorsWithIds[0]);
    } else if (defaultOp) {
      setSelectedOperator(defaultOp);
    } else {
      setSelectedOperator(null);
    }
  }, [machineryId]);

  const handleConfirm = () => {
    if (!selectedOperator) return;
    
    // Validar celular del operador si no es el propietario
    if (!selectedOperator.isOwner) {
      const celErr = validateCelularChile(operatorPhone);
      if (celErr) {
        toast.warning(celErr);
        return;
      }
    }
    
    setLoading(true);
    
    // Guardar operador seleccionado con su celular
    const operatorData = {
      ...selectedOperator,
      phone: selectedOperator.isOwner ? ownerPhone : operatorPhone
    };
    localStorage.setItem('assignedOperator', JSON.stringify(operatorData));
    void syncAssignedOperatorToApi(operatorData);
    // Para que el cliente vea la foto del operador (demo: mismo dispositivo)
    if (selectedOperator.photo) {
      const sel = getObject('selectedProvider', {});
      localStorage.setItem('selectedProvider', JSON.stringify({ ...sel, operator_photo: selectedOperator.photo }));
    }
    
    // Guardar como operador predeterminado para esta máquina (si marcó la opción)
    if (useAsDefault && machineryId) {
      const defaults = getObject(STORAGE_KEY_DEFAULT_BY_MACHINERY, {});
      defaults[machineryId] = selectedOperator.id;
      localStorage.setItem(STORAGE_KEY_DEFAULT_BY_MACHINERY, JSON.stringify(defaults));
    }
    
    // Guardar celular del dueño para notificaciones paralelas
    localStorage.setItem('ownerPhone', ownerPhone);
    
    navigate('/provider/en-route');
  };

  const handleBackClick = () => setShowBackModal(true);

  const handleBackConfirm = () => {
    setShowBackModal(false);
    localStorage.removeItem('acceptedRequest');
    localStorage.removeItem('incomingRequest');
    navigate(getProviderLandingPath());
  };

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
          
        </div>

        {/* Título */}
        <h2 style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 8
        }}>
          Asignar Operador
        </h2>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 24
        }}>
          Selecciona quién operará la máquina en esta reserva
        </p>

        {/* Lista de operadores */}
        <div style={{ flex: 1 }}>
          {operators.map((op) => (
            <div 
              key={op.id}
              onClick={() => setSelectedOperator(op)}
              style={{ 
                background: selectedOperator?.id === op.id ? 'rgba(236, 104, 25, 0.15)' : '#363636',
                border: selectedOperator?.id === op.id ? '2px solid #EC6819' : '2px solid transparent',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              data-testid={`operator-option-${op.id}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Avatar */}
                <div style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: selectedOperator?.id === op.id ? '#EC6819' : '#444',
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
                
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    color: '#fff', 
                    fontSize: 16, 
                    fontWeight: 600,
                    marginBottom: 4
                  }}>
                    {op.nombre} {op.apellido}
                    {op.isOwner && (
                      <span style={{ 
                        marginLeft: 8, 
                        fontSize: 12, 
                        background: 'rgba(144, 189, 211, 0.2)', 
                        color: '#90BDD3',
                        padding: '2px 6px',
                        borderRadius: 4
                      }}>
                        Propietario
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                    RUT: {op.rut}
                  </div>
                  {op.licenseType && (
                    <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 2 }}>
                      Licencia: {op.licenseType}
                    </div>
                  )}
                </div>

                {/* Check */}
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: `2px solid ${selectedOperator?.id === op.id ? '#EC6819' : '#555'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {selectedOperator?.id === op.id && (
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#EC6819' }} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Campo celular del operador (si no es propietario) */}
          {selectedOperator && !selectedOperator.isOwner && (
            <div style={{
              background: '#363636',
              borderRadius: 12,
              padding: 16,
              marginTop: 16
            }}>
              <label style={{ 
                display: 'block',
                color: 'rgba(255,255,255,0.95)', 
                fontSize: 13, 
                marginBottom: 8
              }}>
                Celular del operador <span style={{ color: '#EC6819' }}>*</span>
              </label>
              <PhoneNationalInput
                value={operatorPhone}
                onDigitsChange={setOperatorPhone}
                data-testid="operator-phone-input"
                ariaLabel="Celular del operador"
                containerStyle={{ marginBottom: 0 }}
              />
              <p style={{ 
                color: 'rgba(255,255,255,0.95)', 
                fontSize: 13, 
                marginTop: 8,
                marginBottom: 0
              }}>
                El operador recibirá todas las notificaciones de la reserva
              </p>
            </div>
          )}

          {/* Opción: Usar como predeterminado para esta máquina */}
          {selectedOperator && operators.length > 1 && (
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
                Tú también recibirás notificaciones cuando el servicio inicie y finalice
              </p>
            </div>
          </div>

          {/* Info adicional */}
          {operators.length === 1 && (
            <div style={{
              background: 'rgba(236, 104, 25, 0.1)',
              borderRadius: 10,
              padding: '12px 14px',
              marginTop: 12
            }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0, textAlign: 'center' }}>
                Puedes agregar más operadores desde tu perfil
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
          aria-label={loading ? 'Asignando operador' : 'Confirmar y continuar'}
          style={{ 
            marginTop: 20,
            opacity: (!selectedOperator || loading) ? 0.5 : 1
          }}
          data-testid="confirm-operator-btn"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Asignando...
            </span>
          ) : (
            'Confirmar y continuar'
          )}
        </button>

        <ConfirmModal
          open={showBackModal}
          onClose={() => setShowBackModal(false)}
          title="Cancelar aceptación"
          message="¿Cancelar la aceptación de la reserva? Volverás al inicio sin asignar operador."
          confirmLabel="Sí, cancelar"
          cancelLabel="No, continuar"
          onConfirm={handleBackConfirm}
          variant="danger"
        />
      </div>
    </div>
  );
}

export default SelectOperatorScreen;
