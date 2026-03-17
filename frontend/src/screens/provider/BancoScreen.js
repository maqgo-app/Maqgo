import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import { getObject } from '../../utils/safeStorage';

/**
 * Sub-pantalla: Datos Bancarios
 * Con validación de RUT chileno
 */
const BANKS = [
  'Banco de Chile', 'Banco Estado', 'Banco Santander', 'BCI',
  'Banco Itaú', 'Banco Scotiabank', 'Banco BICE', 'Banco Falabella',
  'Banco Ripley', 'Banco Security', 'Banco Consorcio', 'Coopeuch'
];

const ACCOUNT_TYPES = [
  { id: 'corriente', name: 'Cuenta Corriente' },
  { id: 'vista', name: 'Cuenta Vista / RUT' },
  { id: 'ahorro', name: 'Cuenta de Ahorro' }
];

function BancoScreen() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [rutError, setRutError] = useState('');
  const [data, setData] = useState({
    bank: '',
    accountType: '',
    accountNumber: '',
    holderNombre: '',
    holderApellido: '',
    holderRut: ''
  });

  useEffect(() => {
    const savedBank = getObject('bankData', {});
    const provider = getObject('providerData', {});
    
    if (savedBank.bank) {
      const parts = (savedBank.holderName || '').trim().split(/\s+/);
      setData(prev => ({
        ...savedBank,
        holderNombre: parts[0] || '',
        holderApellido: parts.slice(1).join(' ') || '',
        holderRut: savedBank.holderRut || prev.holderRut
      }));
    } else {
      const biz = (provider.businessName || '').trim();
      const parts = biz.split(/\s+/);
      setData(prev => ({
        ...prev,
        holderNombre: parts[0] || '',
        holderApellido: parts.slice(1).join(' ') || '',
        holderRut: provider.rut || ''
      }));
    }
  }, []);

  const handleRutChange = (e) => {
    const value = e.target.value;
    const formatted = formatRut(value);
    setData(p => ({ ...p, holderRut: formatted }));
    
    // Clear error while typing
    if (rutError) setRutError('');
  };

  const handleRutBlur = () => {
    if (data.holderRut && !validateRut(data.holderRut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
    } else {
      setRutError('');
    }
  };

  const handleSave = () => {
    // Validate RUT before saving
    if (data.holderRut && !validateRut(data.holderRut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
      return;
    }
    
    const toSave = {
      bank: data.bank,
      accountType: data.accountType,
      accountNumber: data.accountNumber,
      holderName: `${(data.holderNombre || '').trim()} ${(data.holderApellido || '').trim()}`.trim(),
      holderRut: data.holderRut
    };
    localStorage.setItem('bankData', JSON.stringify(toSave));
    setSaved(true);
    setTimeout(() => navigate('/provider/profile'), 1000);
  };

  const isValid = data.bank && data.accountType && data.accountNumber && 
                  data.holderNombre?.trim() && 
                  data.holderRut && validateRut(data.holderRut);

  const inputStyle = {
    width: '100%',
    padding: 14,
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15
  };

  const inputErrorStyle = {
    ...inputStyle,
    border: '1px solid #f44336'
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center'
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <button 
            onClick={() => navigate('/provider/profile')}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 8,
              marginRight: 12
            }}
            data-testid="back-button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
            Datos bancarios
          </h1>
        </div>

        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          border: '1px solid rgba(144, 189, 211, 0.3)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 20
        }}>
          <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Aquí registras la cuenta donde MAQGO depositará tus pagos. Usa una cuenta a tu nombre o de tu empresa.
          </p>
        </div>

        {saved && (
          <div style={{
            background: 'rgba(76, 175, 80, 0.2)',
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            textAlign: 'center'
          }}>
            <span style={{ color: '#4CAF50', fontSize: 14 }}>✓ Guardado</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Banco */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Banco *
            </label>
            <select
              value={data.bank}
              onChange={(e) => setData(p => ({ ...p, bank: e.target.value }))}
              style={{
                ...selectStyle,
                color: data.bank ? '#fff' : 'rgba(255,255,255,0.5)'
              }}
              data-testid="bank-select"
            >
              <option value="">Seleccionar</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Tipo de cuenta */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Tipo de cuenta *
            </label>
            <select
              value={data.accountType}
              onChange={(e) => setData(p => ({ ...p, accountType: e.target.value }))}
              style={{
                ...selectStyle,
                color: data.accountType ? '#fff' : 'rgba(255,255,255,0.5)'
              }}
              data-testid="account-type-select"
            >
              <option value="">Seleccionar</option>
              {ACCOUNT_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Número de cuenta */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Número de cuenta *
            </label>
            <input
              type="text"
              value={data.accountNumber}
              onChange={(e) => setData(p => ({ ...p, accountNumber: e.target.value }))}
              placeholder="Ej: 12345678"
              style={inputStyle}
              data-testid="account-number-input"
            />
          </div>

          {/* Nombre del titular */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Nombre del titular *
            </label>
            <input
              type="text"
              value={data.holderNombre}
              onChange={(e) => setData(p => ({ ...p, holderNombre: e.target.value }))}
              placeholder="Ej: Juan"
              style={inputStyle}
              data-testid="holder-nombre-input"
            />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Apellido del titular <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>(opcional si es empresa)</span>
            </label>
            <input
              type="text"
              value={data.holderApellido}
              onChange={(e) => setData(p => ({ ...p, holderApellido: e.target.value }))}
              placeholder="Ej: Pérez"
              style={inputStyle}
              data-testid="holder-apellido-input"
            />
          </div>

          {/* RUT del titular con validación */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              RUT del titular *
            </label>
            <input
              type="text"
              value={data.holderRut}
              onChange={handleRutChange}
              onBlur={handleRutBlur}
              placeholder="12.345.678-9"
              maxLength={12}
              style={rutError ? inputErrorStyle : inputStyle}
              data-testid="holder-rut-input"
            />
            {rutError && (
              <p style={{ color: '#f44336', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                {rutError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button
          className="maqgo-btn-primary"
          onClick={handleSave}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
          data-testid="save-button"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

export default BancoScreen;
