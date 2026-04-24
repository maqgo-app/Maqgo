import React, { useState } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import { getObject } from '../../utils/safeStorage';
import BACKEND_URL from '../../utils/api';
import { useToast } from '../../components/Toast';

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

const COMPANY_SUFFIX_TOKENS = [
  'spA', 'SpA', 'SPA',
  'ltda', 'LTDA',
  'eirl', 'EIRL',
  'limitada', 'Limitada',
  'ltda.', 'ltda ',
  's.a', 'S.A', 's.a.',
  'sa.', 'sa', 'sociedad anonima',
  'sociedad anonima', 'sociedad anonima.',
  'comercial', 'Comercial',
  'empresa', 'Empresa',
  'ir limitada', 'ingir limitada',
];

function looksLikeCompany(businessName) {
  const s = String(businessName || '').trim();
  if (!s) return false;
  const normalized = s.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  // Heurística simple MVP: si tiene sufijos/keywords típicos de razón social, asumir empresa.
  return (
    COMPANY_SUFFIX_TOKENS.some((t) => String(t).toLowerCase() === lower) ||
    COMPANY_SUFFIX_TOKENS.some((t) => lower.includes(String(t).toLowerCase()))
  );
}

function rutWithoutDv(rutFormatted) {
  if (!rutFormatted) return '';
  const clean = String(rutFormatted).replace(/[.\-\s]/g, '').toUpperCase();
  if (clean.length < 8 || clean.length > 9) return '';
  return clean.slice(0, -1); // cuerpo sin DV
}

function buildBancoFormInitial() {
  const empty = {
    bank: '',
    accountType: '',
    accountNumber: '',
    holderNombre: '',
    holderRut: ''
  };
  const savedBank = getObject('bankData', {});
  const provider = getObject('providerData', {});

  if (savedBank.bank) {
    return {
      ...savedBank,
      holderNombre: (savedBank.holderName || '').trim(),
      holderRut: savedBank.holderRut || ''
    };
  }
  const biz = (provider.businessName || '').trim();
  return {
    ...empty,
    holderNombre: biz,
    holderRut: provider.rut || ''
  };
}

function BancoScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [rutError, setRutError] = useState('');
  const [data, setData] = useState(buildBancoFormInitial);
  const provider = getObject('providerData', {});
  const [manualAccountEntry, setManualAccountEntry] = useState(false);
  const isNaturalPerson = !looksLikeCompany(provider.businessName);
  const activationEdit = Boolean(location.state?.activationEdit);
  const returnTo = String(location.state?.returnTo || '/provider/home');

  const shouldAutoVistaEstado =
    !manualAccountEntry && isNaturalPerson && data.bank === 'Banco Estado';

  // Cuando corresponde, precarga Cuenta Vista/RUT y deja la cuenta bloqueada.
  const applyAutoVistaEstado = (nextData) => {
    if (!isNaturalPerson || manualAccountEntry) return nextData;
    if (nextData.bank !== 'Banco Estado') return nextData;
    const bodyRut = rutWithoutDv(nextData.holderRut);
    if (!bodyRut) return nextData;
    return {
      ...nextData,
      accountType: 'vista',
      accountNumber: bodyRut,
    };
  };

  // Aplicación inicial y cada vez que cambia banco/holderRut (sin sobreescribir modo manual).
  // Nota: usamos comparación simple dentro de setState para evitar bucles.
  React.useEffect(() => {
    if (!shouldAutoVistaEstado) return;
    setData((prev) => {
      const next = applyAutoVistaEstado(prev);
      return next.accountType === prev.accountType && next.accountNumber === prev.accountNumber ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoVistaEstado, data.holderRut]);

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

  const handleSave = async () => {
    // Validate RUT before saving
    if (data.holderRut && !validateRut(data.holderRut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
      return;
    }
    
    const toSave = {
      bank: data.bank,
      accountType: data.accountType,
      accountNumber: data.accountNumber,
      holderName: (data.holderNombre || '').trim(),
      holderRut: data.holderRut
    };
    localStorage.setItem('bankData', JSON.stringify(toSave));

    // Fuente de verdad: persistir también en backend dentro de providerData.bankData.
    let backendSynced = true;
    try {
      const userId = localStorage.getItem('userId');
      if (userId && !userId.startsWith('provider-') && !userId.startsWith('demo-')) {
        const providerData = getObject('providerData', {});
        const nextProviderData = {
          ...providerData,
          bankData: toSave,
        };
        await axios.patch(
          `${BACKEND_URL}/api/users/${encodeURIComponent(userId)}`,
          { providerData: nextProviderData },
          { timeout: 8000 }
        );
        localStorage.setItem('providerData', JSON.stringify(nextProviderData));
      }
    } catch {
      backendSynced = false;
    }

    if (!backendSynced && import.meta.env.PROD) {
      toast.error('No pudimos guardar tus datos bancarios. Revisa tu conexión e intenta nuevamente.');
      return;
    }

    setSaved(true);
    setTimeout(() => navigate(activationEdit ? returnTo : '/provider/profile'), 800);
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
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <button 
            onClick={() => navigate(activationEdit ? returnTo : '/provider/profile')}
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
            <BackArrowIcon />
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
                color: data.accountType ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
              data-testid="account-type-select"
              disabled={shouldAutoVistaEstado}
            >
              <option value="">Seleccionar</option>
              {ACCOUNT_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {shouldAutoVistaEstado && (
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.4 }}>
                Prellenado para persona natural: Cuenta Vista/RUT con tu RUT sin DV.
              </p>
            )}
            {shouldAutoVistaEstado && (
              <button
                type="button"
                onClick={() => setManualAccountEntry(true)}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'transparent',
                  color: '#90BDD3',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                data-testid="manual-account-entry-btn"
              >
                Ingreso manual (mostrar campos)
              </button>
            )}
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
              readOnly={shouldAutoVistaEstado}
            />
            {shouldAutoVistaEstado && (
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.4 }}>
                Para Banco Estado (Cuenta Vista): usamos el RUT sin dígito verificador.
              </p>
            )}
          </div>

          {/* Nombre del titular */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              {isNaturalPerson ? 'Nombre completo del titular *' : 'Razón social (titular) *'}
            </label>
            <input
              type="text"
              value={data.holderNombre}
              onChange={(e) => setData(p => ({ ...p, holderNombre: e.target.value }))}
              placeholder={isNaturalPerson ? 'Ej: Juan Pérez' : 'Ej: Maquinarias Ejemplo SpA'}
              style={inputStyle}
              data-testid="holder-nombre-input"
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
