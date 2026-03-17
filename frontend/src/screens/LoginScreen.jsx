import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL from '../utils/api';

/**
 * Pantalla C8 - Login
 */
function LoginScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirect || null;
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!form.email || !form.password) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/login`, form, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      setUserRole(res.data.role);
      setUserId(res.data.id);
      localStorage.setItem('userId', res.data.id);
      localStorage.setItem('userRole', res.data.role);
      localStorage.setItem('providerRole', res.data.provider_role || 'super_master');
      if (res.data.token) localStorage.setItem('token', res.data.token);
      // Admin → /admin; si venía con redirect a admin → /admin; cliente → /client/home; proveedor → /provider/home
      if (res.data.role === 'admin' || redirectTo === '/admin') {
        navigate('/admin', { replace: true });
      } else if (res.data.role === 'client') {
        navigate('/client/home', { replace: true });
      } else {
        navigate('/provider/home', { replace: true });
      }
    } catch (e) {
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        setError('El servidor no responde. ¿Está el backend corriendo en el puerto 8002?');
      } else if (e.response?.status === 401) {
        setError('Correo o contraseña incorrectos');
      } else if (e.response?.status >= 500) {
        setError('Error del servidor. Intenta más tarde.');
      } else if (!e.response) {
        setError('Error de conexión. Verifica tu internet.');
      } else {
        setError('Error al iniciar sesión. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid = form.email && form.password;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />

        <h2 style={{
          color: '#fff',
          fontSize: 24,
          fontWeight: 600,
          textAlign: 'center',
          marginBottom: redirectTo === '/admin' ? 8 : 35
        }}>
          Iniciar sesión
        </h2>
        {redirectTo === '/admin' && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 27 }}>
            Acceso al panel de administración MAQGO
          </p>
        )}

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          <input
            className="maqgo-input"
            placeholder="Correo electrónico"
            type="email"
            value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
          />
          <input
            className="maqgo-input"
            placeholder="Contraseña"
            type="password"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
          />

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: 14, textAlign: 'center', marginTop: 10 }}>
              {error}
            </p>
          )}

          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            textAlign: 'center',
            marginTop: 20
          }}>
            <button
              type="button"
              className="maqgo-link"
              onClick={() => navigate('/forgot-password')}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
              aria-label="Recuperar contraseña"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        </div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleLogin}
          disabled={!isValid || loading}
          style={{ opacity: isValid ? 1 : 0.5, marginBottom: 15 }}
          aria-label={loading ? 'Iniciando sesión' : 'Iniciar sesión'}
        >
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>

        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            textAlign: 'center'
          }}
        >
          ¿No tienes cuenta?{' '}
          <button
            type="button"
            className="maqgo-link"
            onClick={() => navigate('/register')}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
            aria-label="Crear cuenta"
          >
            Regístrate
          </button>
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;
