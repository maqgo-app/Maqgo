import React, { useEffect, useMemo, useState } from 'react';
import { ADMIN_DOMAIN_META, ADMIN_NAV_GROUPS, ADMIN_SHELL_THEME } from './adminShellConfig';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminDashboardSnapshot } from './adminDomainData';

export default function AdminHomeScreen() {
  const theme = ADMIN_SHELL_THEME;
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const topGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      meta: ADMIN_DOMAIN_META[item.key],
    })),
  }));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchAdminDashboardSnapshot();
        if (active) setSnapshot(data);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar el snapshot del Admin.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const users = snapshot?.users || {};
    const services = snapshot?.services || {};
    const matching = Array.isArray(snapshot?.matching) ? snapshot.matching : [];
    const support = snapshot?.support || {};
    return {
      domains: 16,
      providers: (users.providers || []).length,
      operators: (users.operators || []).length,
      machines: (users.machines || []).length,
      pendingReview: services?.stats?.pending_review || 0,
      invoiced: services?.stats?.invoiced || 0,
      disputes: services?.stats?.disputed || 0,
      matching: matching.length,
      tickets: Array.isArray(support?.tickets) ? support.tickets.length : 0,
      blockedPhones: Array.isArray(support?.blockedPhones) ? support.blockedPhones.length : 0,
    };
  }, [snapshot]);

  const queueCards = [
    {
      title: 'Oferta',
      subtitle: 'Monitorea la calidad y cobertura de la base proveedora.',
      bullets: [
        `Proveedores visibles: ${stats.providers}`,
        `Operadores visibles: ${stats.operators}`,
        `Maquinarias visibles: ${stats.machines}`,
      ],
      to: '/admin/proveedores',
      actionLabel: 'Revisar oferta',
    },
    {
      title: 'Servicio',
      subtitle: 'Sigue reservas, incidencias y solicitudes en asignación.',
      bullets: [
        `Pendientes de revision: ${stats.pendingReview}`,
        `Disputas: ${stats.disputes}`,
        `Solicitudes en matching: ${stats.matching}`,
      ],
      to: '/admin/reservas',
      actionLabel: 'Revisar servicio',
    },
    {
      title: 'Dinero',
      subtitle: 'Controla pagos, documentos y señales financieras del marketplace.',
      bullets: [
        `Servicios invoiced: ${stats.invoiced}`,
        `Tickets soporte: ${stats.tickets}`,
        `Telefonos bloqueados: ${stats.blockedPhones}`,
      ],
      to: '/admin/pagos',
      actionLabel: 'Revisar dinero',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface title="Dashboard" subtitle="Centro de control del marketplace para seguir operación, oferta, servicio y dinero desde una sola entrada.">
        <div style={{ fontSize: 12, fontWeight: 900, color: theme.brand, textTransform: 'uppercase', letterSpacing: 0.45 }}>
          Admin MAQGO
        </div>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Vista ejecutiva del día
        </div>
        <p style={{ marginTop: 10, maxWidth: 860, fontSize: 14, lineHeight: 1.55, color: theme.textMuted }}>
          Aquí parte la operación diaria del equipo. La navegación está organizada por dominios claros para que cada tarea
          tenga una casa propia y el panel sea entendible de principio a fin.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <AdminActionLink to="/admin/reportes" label="Abrir reportes" tone="primary" />
          <AdminActionLink to="/admin/growth-ai" label="Abrir Growth AI" tone="secondary" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Salud del sistema"
        subtitle="Indicadores clave para detectar qué requiere atención inmediata."
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Dominios oficiales" value={String(stats.domains)} tone="brand" />
          <AdminStatChip label="Matching activo" value={String(stats.matching)} tone="neutral" />
          <AdminStatChip label="Pendientes revision" value={String(stats.pendingReview)} tone="warning" />
          <AdminStatChip label="Soporte abierto" value={String(stats.tickets)} tone="success" />
        </div>
        {loading ? <div style={{ marginTop: 12, fontSize: 12, color: theme.textMuted }}>Actualizando snapshot…</div> : null}
        {error ? <div style={{ marginTop: 12, fontSize: 12, color: '#E8A34B' }}>{error}</div> : null}
      </AdminSurface>

      <AdminSurface
        title="Focos prioritarios"
        subtitle="Tres frentes que concentran el seguimiento operativo más sensible del día."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {queueCards.map((card) => (
            <AdminDomainCard key={card.title} {...card} />
          ))}
        </div>
      </AdminSurface>

      {topGroups.map((group) => (
        <AdminSurface key={group.label} title={group.label} subtitle="Accesos disponibles del Admin por área de trabajo.">
          <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: 0.45 }}>
            {group.label}
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 12,
            }}
          >
            {group.items.map((item) => (
              <AdminDomainCard
                key={item.key}
                title={item.label}
                subtitle={item.meta?.subtitle || ''}
                bullets={item.meta?.responsibilities ? item.meta.responsibilities.slice(0, 2) : []}
                to={item.path}
              />
            ))}
          </div>
        </AdminSurface>
      ))}
    </div>
  );
}
