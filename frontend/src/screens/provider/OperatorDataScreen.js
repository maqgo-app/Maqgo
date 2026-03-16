import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { getObject, getArray } from '../../utils/safeStorage';

/**
 * P07 - Datos del Operador
 * Permite múltiples operadores (máx 3) o el mismo proveedor
 * Con validación de RUT chileno
 */
function OperatorDataScreen() {
  const navigate = useNavigate();
  const [sameAsOwner, setSameAsOwner] = useState(true);
  const [rutErrors, setRutErrors] = useState({});
  const [operators, setOperators] = useState([{
    nombre: '',
    apellido: '',
    rut: '',
    licenseType: '',
    photo: null
  }]);

  useEffect(() => {
    const saved = getArray('operatorsData', []);
    // Solo cargar "Otro operador" si los datos están COMPLETOS (evita quedar bloqueado)
    const firstComplete = saved.length > 0 && saved[0].nombre && saved[0].apellido &&
      saved[0].rut && validateRut(saved[0].rut);
    if (firstComplete) {
      setOperators(saved);
      setSameAsOwner(false);
    }
  }, []);

  // Persistir fotos y datos de operadores de inmediato para facilitar onboarding
  useEffect(() => {
    const hasData = operators.some(op => op.nombre || op.apellido || op.rut || op.photo);
    if (hasData) localStorage.setItem('operatorsData', JSON.stringify(operators));
  }, [operators]);

  const updateOperator = (index, field, value) => {
    setOperators(prev => prev.map((op, i) => 
      i === index ? { ...op, [field]: value } : op
    ));
  };

  const handleRutChange = (index, value) => {
    const formatted = formatRut(value);
    updateOperator(index, 'rut', formatted);
    // Clear error while typing
    if (rutErrors[index]) {
      setRutErrors(prev => ({ ...prev, [index]: '' }));
    }
  };

  const handleRutBlur = (index) => {
    const rut = operators[index].rut;
    if (rut && !validateRut(rut)) {
      setRutErrors(prev => ({ ...prev, [index]: 'RUT inválido' }));
    } else {
      setRutErrors(prev => ({ ...prev, [index]: '' }));
    }
  };

  const addOperator = () => {
    if (operators.length < 3) {
      setOperators([...operators, {
        nombre: '',
        apellido: '',
        rut: '',
        licenseType: '',
        photo: null
      }]);
    }
  };

  const removeOperator = (index) => {
    if (operators.length > 1) {
      setOperators(operators.filter((_, i) => i !== index));
      // Also remove any RUT errors for this operator
      const newErrors = { ...rutErrors };
      delete newErrors[index];
      setRutErrors(newErrors);
    }
  };

  const handleContinue = () => {
    // Validate all RUTs before continuing
    if (!sameAsOwner) {
      const errors = {};
      let hasErrors = false;
      operators.forEach((op, idx) => {
        if (op.rut && !validateRut(op.rut)) {
          errors[idx] = 'RUT inválido';
          hasErrors = true;
        }
      });
      if (hasErrors) {
        setRutErrors(errors);
        return;
      }
    }

    if (sameAsOwner) {
      const registerData = getObject('registerData', {});
      const providerData = getObject('providerData', {});
      const businessName = (providerData.businessName || '').trim();
      const fullName = (registerData.nombre || businessName || 'Operador').trim();
      const nameParts = fullName ? fullName.split(/\s+/) : ['Operador'];
      const nombre = nameParts[0] || 'Operador';
      const apellido = nameParts.slice(1).join(' ') || (registerData.apellido || '').trim();
      const rut = (providerData.rut || '').trim();
      const ownerAsOperator = [{
        nombre,
        apellido: apellido || 'Operador',
        rut: rut || '12.345.678-5', // fallback demo si no hay RUT de empresa
        licenseType: '',
        photo: null,
        isOwner: true
      }];
      localStorage.setItem('operatorsData', JSON.stringify(ownerAsOperator));
    } else {
      localStorage.setItem('operatorsData', JSON.stringify(operators));
    }
    localStorage.setItem('providerOnboardingStep', '6');
    navigate('/provider/review');
  };

  const handleBack = () => navigate('/provider/pricing');

  // Validación: todos los operadores deben tener nombre, apellido y RUT válido
  const isValid = sameAsOwner || operators.every(op => 
    op.nombre && op.apellido && op.rut && validateRut(op.rut)
  );

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20
        }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="back-button"
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        <ProviderOnboardingProgress currentStep={5} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Datos del Operador
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.8)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 25
        }}>
          ¿Quién operará la máquina?
        </p>

        {/* Opción: Yo mismo */}
        <div 
          onClick={() => setSameAsOwner(true)}
          style={{ 
            background: sameAsOwner ? 'rgba(236, 104, 25, 0.15)' : '#363636',
            border: sameAsOwner ? '2px solid #EC6819' : '2px solid transparent',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
          data-testid="option-same-as-owner"
        >
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: `2px solid ${sameAsOwner ? '#EC6819' : '#666'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {sameAsOwner && <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#EC6819' }} />}
          </div>
          <span style={{ color: '#fff', fontSize: 16 }}>Yo mismo</span>
        </div>

        {/* Opción: Otro operador */}
        <div 
          onClick={() => setSameAsOwner(false)}
          style={{ 
            background: !sameAsOwner ? 'rgba(236, 104, 25, 0.15)' : '#363636',
            border: !sameAsOwner ? '2px solid #EC6819' : '2px solid transparent',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
          data-testid="option-other-operator"
        >
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: `2px solid ${!sameAsOwner ? '#EC6819' : '#666'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {!sameAsOwner && <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#EC6819' }} />}
          </div>
          <span style={{ color: '#fff', fontSize: 16 }}>Otro operador (puedes agregar varios)</span>
        </div>

        {/* Formulario de operadores */}
        {!sameAsOwner && (
          <div style={{ flex: 1 }}>
            {operators.map((op, index) => (
              <div key={index} style={{
                background: '#363636',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 600 }}>
                    OPERADOR {index + 1}
                  </span>
                  {operators.length > 1 && (
                    <button 
                      onClick={() => removeOperator(index)}
                      style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: 13, cursor: 'pointer' }}
                      data-testid={`remove-operator-${index}`}
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                  Nombre <span style={{ color: '#EC6819' }}>*</span>
                </label>
                <input
                  className="maqgo-input"
                  placeholder="Nombre"
                  value={op.nombre}
                  onChange={e => updateOperator(index, 'nombre', e.target.value)}
                  style={{ marginBottom: 10 }}
                  data-testid={`operator-nombre-${index}`}
                />

                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                  Apellido <span style={{ color: '#EC6819' }}>*</span>
                </label>
                <input
                  className="maqgo-input"
                  placeholder="Apellido"
                  value={op.apellido}
                  onChange={e => updateOperator(index, 'apellido', e.target.value)}
                  style={{ marginBottom: 10 }}
                  data-testid={`operator-apellido-${index}`}
                />
                
                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                  RUT <span style={{ color: '#EC6819' }}>*</span>
                </label>
                <input
                  className="maqgo-input"
                  placeholder="RUT (ej: 12.345.678-5)"
                  value={op.rut}
                  onChange={e => handleRutChange(index, e.target.value)}
                  onBlur={() => handleRutBlur(index)}
                  maxLength={12}
                  style={{ 
                    marginBottom: rutErrors[index] ? 4 : 10,
                    borderColor: rutErrors[index] ? '#f44336' : undefined
                  }}
                  data-testid={`operator-rut-${index}`}
                />
                {rutErrors[index] && (
                  <p style={{ color: '#f44336', fontSize: 11, marginTop: 0, marginBottom: 10 }}>
                    {rutErrors[index]}. Verifica el formato y dígito verificador.
                  </p>
                )}
                
                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                  Tipo de licencia (opcional)
                </label>
                <select
                  className="maqgo-input"
                  value={op.licenseType}
                  onChange={e => updateOperator(index, 'licenseType', e.target.value)}
                  style={{ marginBottom: 10 }}
                  data-testid={`operator-license-${index}`}
                >
                  <option value="">Sin licencia / No aplica</option>
                  <option value="Clase D">Clase D - Maquinaria pesada</option>
                  <option value="Clase A4">Clase A4 - Camiones hasta 17.000 kg</option>
                  <option value="Clase A5">Clase A5 - Camiones sin límite</option>
                </select>

                {/* Foto del operador - Opcional */}
                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                  Foto del operador (opcional)
                </label>
                <div 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.setAttribute('capture', 'user'); // Cámara frontal para foto del operador
                    input.onchange = (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          updateOperator(index, 'photo', event.target.result);
                        };
                        reader.readAsDataURL(file);
                      }
                    };
                    input.click();
                  }}
                  style={{
                    border: op.photo ? '2px solid #90BDD3' : '2px dashed #555',
                    borderRadius: 10,
                    padding: 16,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: op.photo ? 'rgba(144, 189, 211, 0.1)' : 'transparent'
                  }}
                  data-testid={`operator-photo-${index}`}
                >
                  {op.photo ? (
                    <div>
                      <img 
                        src={op.photo} 
                        alt="Operador" 
                        style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
                      />
                      <p style={{ color: '#90BDD3', fontSize: 12, margin: 0 }}>
                        ✓ Foto cargada - Toca para cambiar
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateOperator(index, 'photo', null);
                        }}
                        style={{
                          marginTop: 6,
                          background: 'none',
                          border: 'none',
                          color: '#ff6b6b',
                          fontSize: 11,
                          textDecoration: 'underline',
                          cursor: 'pointer'
                        }}
                      >
                        Eliminar foto
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ marginBottom: 8 }}>
                        <circle cx="16" cy="12" r="6" stroke="#666" strokeWidth="2" fill="none"/>
                        <path d="M6 28C6 22 10 18 16 18C22 18 26 22 26 28" stroke="#666" strokeWidth="2"/>
                      </svg>
                      <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                        Subir foto del operador
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Agregar operador - SIEMPRE visible mientras haya menos de 3 */}
            {operators.length < 3 && (
              <button
                onClick={addOperator}
                style={{
                  width: '100%',
                  padding: 16,
                  background: 'rgba(236, 104, 25, 0.1)',
                  border: '2px dashed #EC6819',
                  borderRadius: 12,
                  color: '#EC6819',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
                data-testid="add-operator-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EC6819" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v8M8 12h8"/>
                </svg>
                Agregar otro operador ({operators.length}/3)
              </button>
            )}
          </div>
        )}

        {sameAsOwner && (
          <div style={{
            background: '#363636',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            flex: 1
          }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', margin: 0, marginBottom: 10 }}>
              Se usarán tus datos de registro
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', margin: 0, fontSize: 13 }}>
              Podrás agregar más operadores después
            </p>
          </div>
        )}

        {/* Saltar para pruebas - solo en desarrollo */}
        {import.meta.env.DEV && !isValid && (
          <button
            onClick={() => {
              localStorage.setItem('operatorsData', JSON.stringify([{
                nombre: 'Operador',
                apellido: 'Demo',
                rut: '12.345.678-5',
                licenseType: '',
                photo: null,
                isOwner: true
              }]));
              localStorage.setItem('providerOnboardingStep', '6');
              navigate('/provider/review');
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 13,
              padding: '16px 0',
              marginTop: 8,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Saltar para pruebas (modo demo)
          </button>
        )}
      </div>

      {/* Botón fijo - Siguiente, igual que otras pantallas */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
          data-testid="continue-button"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default OperatorDataScreen;
