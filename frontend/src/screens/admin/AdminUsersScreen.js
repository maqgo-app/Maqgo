import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';

import BACKEND_URL from '../../utils/api';

function AdminUsersScreen() {
  const navigate = useNavigate();
  const [data, setData] = useState({ clients: [], providers: [], total_clients: 0, total_providers: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients'); // 'clients' | 'providers'

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/users`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
      setData({ clients: [], providers: [], total_clients: 0, total_providers: 0 });
    }
    setLoading(false);
  };

  const formatDate = (str) => {
    if (!str) return '-';
    try {
      return new Date(str).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return str;
    }
  };

  const users = tab === 'clients' ? data.clients : data.providers;
  const columns = tab === 'clients'
    ? ['name', 'email', 'phone', 'createdAt']
    : ['name', 'email', 'phone', 'machineryType', 'isAvailable', 'provider_role', 'createdAt'];

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: '#2A2A2A',
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#EC6819', fontFamily: "'Space Grotesk', sans-serif" }}>
              Usuarios registrados
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>
              Clientes y proveedores en la plataforma
            </p>
          </div>
          <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/admin')}>
            Volver al admin
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setTab('clients')}
            style={{
              padding: '10px 20px',
              background: tab === 'clients' ? '#EC6819' : '#363636',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Clientes ({data.total_clients})
          </button>
          <button
            onClick={() => setTab('providers')}
            style={{
              padding: '10px 20px',
              background: tab === 'providers' ? '#EC6819' : '#363636',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Proveedores ({data.total_providers})
          </button>
        </div>

        {/* Tabla */}
        <div style={{ background: '#2A2A2A', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.3)', borderTopColor: '#EC6819', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Cargando usuarios...</p>
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 40, margin: '0 0 12px' }}>👥</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 }}>
                {tab === 'clients' ? 'No hay clientes registrados' : 'No hay proveedores registrados'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>
                Los usuarios aparecerán aquí cuando se registren desde la app
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a1a1a' }}>
                    <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Nombre</th>
                    <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Email</th>
                    <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Teléfono</th>
                    {tab === 'providers' && (
                      <>
                        <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Maquinaria</th>
                        <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Disponible</th>
                        <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Rol</th>
                      </>
                    )}
                    <th style={{ padding: 14, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id || i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: 14, color: '#fff', fontSize: 13 }}>{u.name || '-'}</td>
                      <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.email || '-'}</td>
                      <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{u.phone || '-'}</td>
                      {tab === 'providers' && (
                        <>
                          <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{u.machineryType || '-'}</td>
                          <td style={{ padding: 14 }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: u.isAvailable ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.1)',
                              color: u.isAvailable ? '#4CAF50' : 'rgba(255,255,255,0.6)'
                            }}>
                              {u.isAvailable ? 'Sí' : 'No'}
                            </span>
                          </td>
                          <td style={{ padding: 14, color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                            {u.provider_role === 'super_master' ? 'Titular' : u.provider_role === 'master' ? 'Gerente' : u.provider_role === 'operator' ? 'Operador' : u.provider_role || '-'}
                          </td>
                        </>
                      )}
                      <td style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
          Los datos se almacenan en MongoDB (colección <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>users</code>).
          El registro se realiza desde la app (Empezar ahora / Ya tengo cuenta).
        </p>
      </div>
    </div>
  );
}

export default AdminUsersScreen;
