import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObject } from '../utils/safeStorage';

/**
 * Pantalla de Perfil de Usuario
 * Permite ver y editar datos personales
 */
function ProfileScreen() {
  const navigate = useNavigate();
  const [user, setUser] = useState({
    nombre: '',
    apellido: '',
    email: '',
    celular: '',
    role: 'client'
  });
  const [editing, setEditing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    // Cargar datos del usuario
    const registerData = getObject('registerData', {});
    const role = localStorage.getItem('userRole') || 'client';
    setUser({
      nombre: registerData.nombre || 'Usuario',
      apellido: registerData.apellido || 'MAQGO',
      email: registerData.email || 'usuario@ejemplo.com',
      celular: registerData.celular || '+56 9 1234 5678',
      role
    });
  }, []);

  const handleSave = () => {
    localStorage.setItem('registerData', JSON.stringify(user));
    setEditing(false);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 90px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 30
        }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className="maqgo-h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>
            Mi Perfil
          </h1>
          <button 
            onClick={() => setEditing(!editing)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#EC6819',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {/* Avatar */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: '#EC6819',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: 36,
            fontWeight: 700,
            color: '#fff'
          }}>
            {user.nombre.charAt(0)}{user.apellido.charAt(0)}
          </div>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
            {user.nombre} {user.apellido}
          </p>
          <p style={{ 
            color: '#EC6819', 
            fontSize: 13, 
            margin: '4px 0 0',
            textTransform: 'capitalize'
          }}>
            {user.role === 'client' ? 'Cliente' : 'Proveedor'}
          </p>
        </div>

        {/* Campos */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Nombre
            </label>
            {editing ? (
              <input
                className="maqgo-input"
                value={user.nombre}
                onChange={e => setUser({...user, nombre: e.target.value})}
                style={{ marginBottom: 0 }}
              />
            ) : (
              <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '12px 0', borderBottom: '1px solid #444' }}>
                {user.nombre}
              </p>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Apellido
            </label>
            {editing ? (
              <input
                className="maqgo-input"
                value={user.apellido}
                onChange={e => setUser({...user, apellido: e.target.value})}
                style={{ marginBottom: 0 }}
              />
            ) : (
              <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '12px 0', borderBottom: '1px solid #444' }}>
                {user.apellido}
              </p>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Correo electrónico
            </label>
            <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '12px 0', borderBottom: '1px solid #444' }}>
              {user.email}
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Celular
            </label>
            {editing ? (
              <input
                className="maqgo-input"
                value={user.celular}
                onChange={e => setUser({...user, celular: e.target.value})}
                style={{ marginBottom: 0 }}
              />
            ) : (
              <p style={{ color: '#fff', fontSize: 16, margin: 0, padding: '12px 0', borderBottom: '1px solid #444' }}>
                {user.celular}
              </p>
            )}
          </div>
        </div>

        {/* Botones */}
        {editing ? (
          <button 
            className="maqgo-btn-primary"
            onClick={handleSave}
          >
            Guardar cambios
          </button>
        ) : (
          <>
            {/* Links de ayuda */}
            <div style={{ marginBottom: 24 }}>
              <button 
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
                  marginBottom: 10
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
                    <path d="M9 9C9 7.34 10.34 6 12 6C13.66 6 15 7.34 15 9C15 10.31 14.17 11.42 13 11.83V13" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="12" cy="17" r="1" fill="#90BDD3"/>
                  </svg>
                  Preguntas frecuentes
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6L15 12L9 18" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              <button 
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
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#EC6819" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2V8H20" stroke="#EC6819" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 13H16M8 17H16" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Términos y condiciones
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6L15 12L9 18" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <button 
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
                cursor: 'pointer'
              }}
            >
              Cerrar sesión
            </button>
          </>
        )}

        {/* Modal de confirmación de logout */}
        {showLogoutConfirm && (
          <div style={{
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
            padding: 24
          }}>
            <div style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
                ¿Cerrar sesión?
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 24px' }}>
                Tendrás que volver a iniciar sesión para continuar.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
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
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
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
                    cursor: 'pointer'
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
