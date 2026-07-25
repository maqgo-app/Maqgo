import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminMatching } from './adminDomainData';

export default function AdminMatchingDomainScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const json = await fetchAdminMatching(100);
        if (active) setItems(Array.isArray(json) ? json : []);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar matching.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const matching = list.filter((item) => String(item?.status || '') === 'matching').length;
    const offers = list.filter((item) => String(item?.status || '') === 'offer_sent').length;
    const active = list.filter((item) => ['confirmed', 'in_progress', 'last_30'].includes(String(item?.status || ''))).length;
    return { total: list.length, matching, offers, active };
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Matching"
        subtitle="Cola oficial de asignacion de oferta. Esta vista separa matching de reservas y lo hace visible como proceso operativo."
        right={<AdminActionLink to="/admin/legacy/area/system" label="Abrir superficie legado" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Solicitudes activas" value={String(stats.total)} tone="brand" />
          <AdminStatChip label="Buscando oferta" value={String(stats.matching)} tone="warning" />
          <AdminStatChip label="Ofertas enviadas" value={String(stats.offers)} tone="neutral" />
          <AdminStatChip label="Asignadas" value={String(stats.active)} tone="success" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Cola visible"
        subtitle="La cola de matching ya queda separada del dashboard y puede observar intentos activos sin confundirse con el servicio completo."
      >
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando matching…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {items.slice(0, 24).map((item, index) => (
              <AdminDomainCard
                key={`${item?.id || item?._id || index}`}
                title={item?.locationName || item?.location?.address || 'Solicitud activa'}
                subtitle={`${item?.machineryType || 'Sin maquinaria'} · ${item?.status || 'matching'}`}
                bullets={[
                  `Cliente: ${item?.clientName || item?.clientId || '-'}`,
                  `Intentos: ${Array.isArray(item?.matchingAttempts) ? item.matchingAttempts.length : 0}`,
                  `Creada: ${item?.createdAt ? new Date(item.createdAt).toLocaleString('es-CL') : '-'}`,
                ]}
              />
            ))}
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
