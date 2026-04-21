import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';

function validateNewPassword(pw) {
  if (!pw || pw.length < 8 || pw.length > 64) return 'La nueva contraseña debe tener 8-64 caracteres.';
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  if (!hasLetter || !hasNumber) return 'La nueva contraseña debe incluir letras y números.';
  return '';
}

function AdminChangePasswordScreen() {
  const navigate = useNavigate();
  const email = localStorage.getItem('userEmail') || '';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const validationError = useMemo(() => {
    const msg = validateNewPassword(newPassword);
    if (msg) return msg;
    if (newPassword2 && newPassword !== newPassword2) return 'Las contraseñas no coinciden.';
    if (currentPassword && newPassword && currentPassword === newPassword) {
      return 'La nueva contraseña debe ser distinta.';
    }
    return '';
  }, [currentPassword, newPassword, newPassword2]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setOk(false);
    const msg = validateNewPassword(newPassword);
    if (msg) {
      setError(msg);
      return;
    }
    if (newPassword !== newPassword2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!currentPassword) {
      setError('Ingresa tu contraseña actual.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('La nueva contraseña debe ser distinta.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        },
        15000
      );

      if (!res.ok) {
        let detail = 'No pudimos cambiar tu contraseña.';
        try {
          const json = await res.json();
          if (typeof json?.detail === 'string') detail = json.detail;
        } catch {
          /* ignore */
        }
        setError(detail);
        return;
      }

      localStorage.removeItem('adminMustChangePassword');
      setOk(true);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err?.message || 'No pudimos cambiar tu contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--maqgo-bg)', color: '#fff', padding: 24 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '12px 0 8px' }}>Cambio obligatorio de contraseña</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5 }}>
          Para activar tu acceso al panel MAQGO, define una nueva contraseña.
          {email ? ` (${email})` : ''}
        </p>

        <form onSubmit={submit} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            Contraseña actual
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={loading}
              style={{
                marginTop: 6,
                width: '100%',
                padding: '12px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                outline: 'none',
              }}
            />
          </label>

          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            Nueva contraseña (8-64, letras y números)
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              style={{
                marginTop: 6,
                width: '100%',
                padding: '12px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                outline: 'none',
              }}
            />
          </label>

          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            Repite la nueva contraseña
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              disabled={loading}
              style={{
                marginTop: 6,
                width: '100%',
                padding: '12px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                outline: 'none',
              }}
            />
          </label>

          {(validationError || error) && (
            <div style={{ color: '#E57373', fontSize: 13, lineHeight: 1.4 }}>
              {error || validationError}
            </div>
          )}
          {ok && (
            <div style={{ color: '#66BB6A', fontSize: 13, lineHeight: 1.4 }}>
              Contraseña actualizada.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="maqgo-btn-primary"
            style={{ marginTop: 6 }}
          >
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminChangePasswordScreen;
