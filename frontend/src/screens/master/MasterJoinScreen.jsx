import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import BackToPortadaButton from '../../components/BackToPortadaButton';
import BACKEND_URL from '../../utils/api';
import { getDeviceId } from '../../utils/deviceId';
import { getHttpErrorMessage } from '../../utils/httpErrors';
import {
  formatRut,
  normalizeChileanMobileDraft,
  normalizeChileanMobileE164,
  sanitizeRutInput,
  validatePersonRut,
} from '../../utils/chileanValidation';

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function base64UrlDecodeToJson(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
    const json = atob(normalized + pad);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persistRegisterDataPhoneDigits(phoneE164) {
  const d = String(phoneE164 || '').replace(/\D/g, '');
  const last9 = d.length >= 9 ? d.slice(-9) : '';
  if (!/^9\d{8}$/.test(last9)) return;
  try {
    const next = { celular: last9 };
    localStorage.setItem('registerData', JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function loadInvitePermissionsByCode() {
  try {
    return safeJsonParse(localStorage.getItem('masterInvitePermissionsByCode') || '{}', {});
  } catch {
    return {};
  }
}

function storeMasterPermissionsForUser(userId, permissions) {
  if (!userId || !permissions || typeof permissions !== 'object') return;
  try {
    const raw = localStorage.getItem('masterPermissionsByUserId') || '{}';
    const map = safeJsonParse(raw, {});
    map[String(userId)] = permissions;
    localStorage.setItem('masterPermissionsByUserId', JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function normalizeMasterPermissions(input) {
  const p = input && typeof input === 'object' ? input : {};
  const bool = (k) => (typeof p[k] === 'boolean' ? p[k] : false);
  return {
    can_view_finance: bool('can_view_finance'),
    can_manage_machines: bool('can_manage_machines'),
    can_manage_operators: bool('can_manage_operators'),
    can_create_work: bool('can_create_work'),
    can_assign_operator: bool('can_assign_operator'),
    can_view_work_details: bool('can_view_work_details'),
    can_edit_master_profile: bool('can_edit_master_profile'),
    can_delete_master: bool('can_delete_master'),
    can_delete_machines: bool('can_delete_machines'),
  };
}

function joinDisplayName(...parts) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function MasterJoinScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromUrlCode = String(searchParams.get('code') || '').trim().toUpperCase();
  const permsParam = searchParams.get('p');

  const [code, setCode] = useState(fromUrlCode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState('+569');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resolvedPerms = useMemo(() => {
    const fromParam = base64UrlDecodeToJson(permsParam);
    if (fromParam) return normalizeMasterPermissions(fromParam);
    const byCode = loadInvitePermissionsByCode();
    const stored = byCode[String(fromUrlCode || code || '').toUpperCase()];
    return stored ? normalizeMasterPermissions(stored) : null;
  }, [permsParam, fromUrlCode, code]);

  const handleJoin = async () => {
    if (loading) return;
    const c = String(code || '').trim().toUpperCase();
    if (c.length < 4) {
      setError('Ingresa el código completo');
      return;
    }
    const name = joinDisplayName(firstName, lastName);
    const phoneE164 = normalizeChileanMobileE164(phone);
    if (!firstName.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
    if (!lastName.trim()) {
      setError('Ingresa tu apellido');
      return;
    }
    if (!rut.trim()) {
      setError('Ingresa tu RUT');
      return;
    }
    if (!validatePersonRut(rut)) {
      setError('Ingresa un RUT de persona válido. No se acepta RUT empresa.');
      return;
    }
    if (!phoneE164) {
      setError('Ingresa un celular válido');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        code: c,
        master_name: firstName.trim(),
        master_last_name: lastName.trim(),
        master_rut: formatRut(rut.trim()),
        master_phone: phoneE164,
        ...(String(email || '').trim() ? { master_email: String(email).trim() } : {}),
      };
      const res = await axios.post(`${BACKEND_URL}/api/operators/masters/join`, payload, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = res.data || {};
      const masterId = data.master_id;
      if (masterId && resolvedPerms) {
        storeMasterPermissionsForUser(masterId, resolvedPerms);
      }
      persistRegisterDataPhoneDigits(phoneE164);
      try {
        localStorage.setItem('desiredRole', 'provider');
        localStorage.setItem('maqgo_device_id', getDeviceId());
      } catch {
        /* ignore */
      }
      navigate('/login', {
        replace: true,
        state: { entry: 'provider', redirect: '/provider/home' },
      });
    } catch (e) {
      setError(
        getHttpErrorMessage(e, {
          fallback: 'No pudimos validar el código. Verifica y vuelve a intentar.',
          statusMessages: {
            400: 'Código expirado o inválido.',
            404: 'Código inválido o ya utilizado.',
            429: 'Demasiados intentos. Espera un momento.',
          },
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen maqgo-screen--scroll maqgo-funnel-scroll-compact">
        <div className="maqgo-back-portada-wrap">
          <BackToPortadaButton onClick={() => navigate('/welcome')} />
        </div>
        <MaqgoLogo size="medium" style={{ marginBottom: 24 }} />
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 10px' }}>
          Creación de usuario Master
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', margin: '0 0 22px', lineHeight: 1.45 }}>
          Ingresa el código y completa tu identidad para crear tu usuario master. Luego iniciarás sesión con tu celular usando un código SMS (MAQGO).
        </p>

        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
          Código
        </label>
        <input
          value={code}
          onChange={(e) => {
            setError('');
            setCode(String(e.target.value || '').toUpperCase().slice(0, 6));
          }}
          placeholder="CÓDIGO"
          className="maqgo-input"
          style={{ width: '100%', marginBottom: 12, letterSpacing: 6, textAlign: 'center', fontWeight: 700 }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
              Nombre
            </label>
            <input
              value={formatRut(rut)}
              onChange={(e) => {
                setError('');
                setRut(sanitizeRutInput(e.target.value));
              }}
              placeholder="Tu nombre"
              className="maqgo-input"
              style={{
                width: '100%',
                marginBottom: 0,
                borderColor: rut && !validatePersonRut(rut) ? 'var(--maqgo-orange)' : undefined,
              }}
            />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
              Apellido
            </label>
            <input
              value={lastName}
              onChange={(e) => {
                setError('');
                setLastName(e.target.value);
              }}
              placeholder="Tu apellido"
              className="maqgo-input"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
        </div>

        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
          RUT
        </label>
        <input
          value={formatRut(rut)}
          onChange={(e) => {
            setError('');
            setRut(sanitizeRutInput(e.target.value));
          }}
          placeholder="12.345.678-9"
          className="maqgo-input"
          style={{
            width: '100%',
            marginBottom: 12,
            borderColor: rut && !validatePersonRut(rut) ? 'var(--maqgo-orange)' : undefined,
          }}
        />

        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
          Celular
        </label>
        <input
          value={phone}
          onChange={(e) => {
            setError('');
            setPhone(normalizeChileanMobileDraft(e.target.value));
          }}
          placeholder="+56 9 1234 5678"
          className="maqgo-input"
          style={{
            width: '100%',
            marginBottom: 12,
            borderColor: phone !== '+569' && !normalizeChileanMobileE164(phone) ? 'var(--maqgo-orange)' : undefined,
          }}
          inputMode="tel"
        />
        <label style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 6, display: 'block' }}>
          Correo (opcional)
        </label>
        <input
          value={email}
          onChange={(e) => {
            setError('');
            setEmail(e.target.value);
          }}
          placeholder="tu@correo.cl"
          className="maqgo-input"
          style={{ width: '100%', marginBottom: 14 }}
          inputMode="email"
        />

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleJoin}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Verificando…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

export default MasterJoinScreen;
