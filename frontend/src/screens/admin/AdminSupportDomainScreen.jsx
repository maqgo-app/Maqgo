import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminSupport } from './adminDomainData';

export default function AdminSupportDomainScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ tickets: [], blockedPhones: [] });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const json = await fetchAdminSupport();
        if (active) setData(json);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar soporte.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => ({
    tickets: Array.isArray(data.tickets) ? data.tickets.length : 0,
    blocked: Array.isArray(data.blockedPhones) ? data.blockedPhones.length : 0,
    phoneIssues: Array.isArray(data.tickets) ? data.tickets.filter((item) => item?.phone9).length : 0,
  }), [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Soporte"
        subtitle="Incidencias, accesos y bloqueos visibles como dominio propio, separados del dashboard legado."
        right={<AdminActionLink to="/admin/legacy/area/access" label="Abrir superficie legado" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Tickets abiertos" value={String(stats.tickets)} tone="brand" />
          <AdminStatChip label="Telefonos bloqueados" value={String(stats.blocked)} tone="warning" />
          <AdminStatChip label="Casos con telefono" value={String(stats.phoneIssues)} tone="neutral" />
        </div>
      </AdminSurface>

      <AdminSurface title="Bandeja visible" subtitle="El dominio ya muestra sus casos principales desde una casa propia.">
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando soporte…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {(data.tickets || []).slice(0, 12).map((ticket, index) => (
              <AdminDomainCard
                key={`ticket-${ticket?.id || index}`}
                title={ticket?.reason || 'Ticket'}
                subtitle={`${ticket?.phone9 || 'Sin telefono'} · ${ticket?.requested_role || 'Sin rol solicitado'}`}
                bullets={[
                  `Estado: ${ticket?.status || 'open'}`,
                  `Email: ${ticket?.email || '-'}`,
                  `Creado: ${ticket?.created_at ? new Date(ticket.created_at).toLocaleString('es-CL') : '-'}`,
                ]}
              />
            ))}
            {(data.blockedPhones || []).slice(0, 8).map((item, index) => (
              <AdminDomainCard
                key={`blocked-${item?.id || index}`}
                title={`Bloqueado ${item?.phone9 || '-'}`}
                subtitle={item?.reason || 'Sin razon'}
                bullets={[
                  `Activo: ${item?.active ? 'Si' : 'No'}`,
                  `Notas: ${item?.notes || '-'}`,
                  `Actualizado: ${item?.updated_at ? new Date(item.updated_at).toLocaleString('es-CL') : '-'}`,
                ]}
              />
            ))}
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
