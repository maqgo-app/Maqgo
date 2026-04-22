import React, { useState, useEffect, useCallback } from 'react';
import { BackArrowIcon } from '../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BACKEND_URL from '../utils/api';
import { clearAuthSessionPreservingDraft } from '../utils/sessionCleanup';
import { persistClientEmailToStorage } from '../utils/clientSessionForPayment';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Perfil cliente (ruta /profile): enrolamiento OTP + datos opcionales.
 * - Teléfono: identidad principal (sesión OTP).
 * - Nombre y correo: opcionales; el correo también se pide en el pago (OneClick) si aplica.
 * - RUT: solo si quedó guardado por facturación (lectura).
 * - Dirección del servicio: en la reserva (mapa), no aquí.
 */
function formatPhoneClDisplay(phone) {
  if (!phone) return '—';
  const d = String(phone).replace(/\D/g, '');
  const last9 = d.length >= 9 ? d.slice(-9) : d;
  if (last9.length !== 9) return String(phone);
  return `+56 ${last9[0]} ${last9.slice(1, 5)} ${last9.slice(5)}`;
}

function ProfileScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      traceRedirectToLogin('src/screens/ProfileScreen.js (loadMe no token)');
      navigate('/login', { replace: true });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/auth/me`, { timeout: 15000 });
      setMe(data);
      setEditName(data?.name || '');
      setEditEmail(data?.email || '');
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        clearAuthSessionPreservingDraft();
        traceRedirectToLogin('src/screens/ProfileScreen.js (loadMe 401)');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      if (status === 404) {
        setError('No pudimos cargar tu perfil (404). Revisa conexión o que la API esté actualizada.');
      } else {
        setError('No se pudo cargar tu perfil. Intenta de nuevo.');
      }
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const role = me?.role || localStorage.getItem('userRole') || 'client';
  const displayPhone = formatPhoneClDisplay(me?.phone || localStorage.getItem('userPhone'));

  const handleSave = async () => {
    setSaveLoading(true);
    setError('');
    try {
      const nameTrim = editName.trim();
      const emailTrim = editEmail.trim();
      await axios.post(
        `${BACKEND_URL}/api/auth/me/profile`,
        {
          name: nameTrim ? nameTrim : null,
          email: emailTrim ? emailTrim.toLowerCase() : null,
        },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );
      if (emailTrim) persistClientEmailToStorage(emailTrim);
      setEditing(false);
      await loadMe();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'No se pudo guardar. Revisa los datos.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthSessionPreservingDraft();
    navigate('/welcome');
  };

  const hasDisplayName = Boolean(me?.name?.trim());

  const initials = () => {
    const n = (me?.name || '').trim();
    if (n.length >= 2) return n.slice(0, 2).toUpperCase();
    if (n.length === 1) return n.toUpperCase();
    return '?';
  };

  const roleLabel =
    role === 'client' ? 'Cliente' : role === 'provider' ? 'Proveedor' : String(role || '');

  if (loading && !me) {
    return (
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 90px' }}>
          <p style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 40 }}>Cargando perfil…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <h1 className="maqgo-h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>
            Mi cuenta
          </h1>
          <button
            type="button"
            onClick={() => {
              if (editing) {
                setEditName(me?.name || '');
                setEditEmail(me?.email || '');
              }
              setEditing(!editing);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#EC6819',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            aria-hidden
            style={{
              width: 96,
              height: 96,
              margin: '0 auto 14px',
              borderRadius: '50%',
              padding: 3,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(236,104,25,0.45) 55%, rgba(212,90,16,0.65) 100%)',
              boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'linear-gradient(165deg, #f7931e 0%, #ec6819 48%, #c75a14 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {hasDisplayName ? (
                <span
                  style={{
                    fontSize: 27,
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                  }}
                >
                  {initials()}
                </span>
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="9" r="3.5" stroke="rgba(255,255,255,0.92)" strokeWidth="1.75" />
                  <path
                    d="M5 19.5c0-3 3.5-5 7-5s7 2 7 5"
                    stroke="rgba(255,255,255,0.92)"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: 0.15 }}>
            {me?.name?.trim() || 'Tu cuenta'}
          </p>
          {!hasDisplayName && (
            <p
              style={{
                color: 'rgba(255,255,255,0.52)',
                fontSize: 12,
                margin: '6px 12px 0',
                lineHeight: 1.35,
                maxWidth: 280,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Puedes añadir tu nombre más abajo cuando quieras.
            </p>
          )}
          <div style={{ marginTop: hasDisplayName ? 10 : 8 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '5px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: 'none',
                color: 'rgba(255,255,255,0.95)',
                background: 'rgba(236,104,25,0.22)',
                border: '1px solid rgba(236,104,25,0.45)',
              }}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {role === 'provider' && (
          <button
            type="button"
            className="maqgo-btn-primary"
            style={{ marginBottom: 20, width: '100%' }}
            onClick={() => navigate('/provider/profile')}
          >
            Ir a perfil de proveedor
          </button>
        )}

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Celular
            </label>
            <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              {displayPhone}
            </p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Nombre para comprobante <span style={{ color: 'rgba(255,255,255,0.45)' }}>(opcional)</span>
            </label>
            {editing ? (
              <input
                className="maqgo-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                autoComplete="name"
              />
            ) : (
              <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                {me?.name?.trim() || '—'}
              </p>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Correo <span style={{ color: 'rgba(255,255,255,0.45)' }}>(opcional hasta el pago)</span>
            </label>
            {editing ? (
              <input
                className="maqgo-input"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="tu@correo.cl"
                autoComplete="email"
              />
            ) : (
              <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                {me?.email?.trim() || '—'}
              </p>
            )}
          </div>

          {me?.rut ? (
            <div style={{ marginBottom: 18 }}>
              <label style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                RUT <span style={{ color: 'rgba(255,255,255,0.45)' }}>(facturación)</span>
              </label>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, margin: 0 }}>{me.rut}</p>
            </div>
          ) : null}
        </div>

        {editing ? (
          <button type="button" className="maqgo-btn-primary" onClick={handleSave} disabled={saveLoading}>
            {saveLoading ? 'Guardando…' : 'Guardar'}
          </button>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => navigate('/faq')}
                style={{
                  width: '100%',
                  padding: 16,
                  background: '#2A2A2A',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span>Preguntas frecuentes</span>
                <span aria-hidden>›</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/terms')}
                style={{
                  width: '100%',
                  padding: 16,
                  background: '#2A2A2A',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Términos y condiciones</span>
                <span aria-hidden>›</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              style={{
                width: '100%',
                padding: 14,
                background: 'transparent',
                border: '1px solid rgba(255,107,107,0.5)',
                borderRadius: 12,
                color: '#ff6b6b',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cerrar sesión
            </button>
          </>
        )}

        {showLogoutConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 24,
            }}
          >
            <div
              style={{
                background: '#2A2A2A',
                borderRadius: 16,
                padding: 24,
                maxWidth: 320,
                width: '100%',
                textAlign: 'center',
              }}
            >
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>¿Cerrar sesión?</h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 24px' }}>
                Tendrás que volver a iniciar sesión para continuar.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#444',
                    border: 'none',
                    borderRadius: 25,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#ff6b6b',
                    border: 'none',
                    borderRadius: 25,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileScreen;
