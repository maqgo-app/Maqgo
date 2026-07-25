import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminUsersAndMachines } from './adminDomainData';

function getTimeMs(value) {
  const raw = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(raw) ? raw : 0;
}

export default function AdminClientsDomainScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const json = await fetchAdminUsersAndMachines();
        if (active) setClients(Array.isArray(json?.clients) ? json.clients : []);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudieron cargar los clientes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    const active = list.filter((item) => ['active', ''].includes(String(item?.status || 'active')) && !item?.deleted).length;
    const inactive = list.filter((item) => ['inactive', 'suspended'].includes(String(item?.status || ''))).length;
    const test = list.filter((item) => String(item?.status || '') === 'test').length;
    const last30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = list.filter((item) => getTimeMs(item?.createdAt || item?.created_at) >= last30d).length;
    return { total: list.length, active, inactive, test, recent };
  }, [clients]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Clientes"
        subtitle="Dominio oficial de la demanda, separado de Proveedores y del contenedor generico de usuarios."
        right={<AdminActionLink to="/admin/users?tab=clients" label="Abrir herramienta actual" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Clientes" value={String(stats.total)} tone="brand" />
          <AdminStatChip label="Activos" value={String(stats.active)} tone="success" />
          <AdminStatChip label="Inactivos" value={String(stats.inactive)} tone="warning" />
          <AdminStatChip label="Alta 30 dias" value={String(stats.recent)} tone="neutral" />
          <AdminStatChip label="Test" value={String(stats.test)} tone="neutral" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Lectura actual"
        subtitle="La demanda ya tiene casa oficial dentro del shell. La ficha canonica profunda puede construirse despues sin volver a esconder clientes dentro del modulo generico."
      >
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando clientes…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {clients.slice(0, 24).map((client, index) => (
              <AdminDomainCard
                key={`${client?.id || index}`}
                title={client?.name || client?.email || 'Cliente'}
                subtitle={`${client?.email || 'Sin email'} · ${client?.phone || 'Sin telefono'}`}
                bullets={[
                  `Estado: ${client?.status || 'active'}`,
                  `RUT: ${client?.rut || '-'}`,
                  `Creado: ${client?.createdAt ? new Date(client.createdAt).toLocaleDateString('es-CL') : '-'}`,
                ]}
              />
            ))}
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
