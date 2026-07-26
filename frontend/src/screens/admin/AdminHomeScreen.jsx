import React, { useEffect, useMemo, useState } from 'react';
import { ADMIN_DOMAIN_META, ADMIN_NAV_GROUPS, ADMIN_SHELL_THEME } from './adminShellConfig';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminDashboardSnapshot } from './adminDomainData';
import { buildAdminQuery, buildRecentRange } from './adminTimeContext';

export default function AdminHomeScreen() {
  const theme = ADMIN_SHELL_THEME;
  const [loading, setLoading] = useState(true);
  const [dashboardState, setDashboardState] = useState(null);
  const [error, setError] = useState('');
  const sharedRange = useMemo(() => buildRecentRange(30), []);
  const reservationsQuery = buildAdminQuery(sharedRange);
  const paymentsQuery = buildAdminQuery(sharedRange);
  const matchingQuery = buildAdminQuery(sharedRange, { scope: 'all' });
  const reviewsQuery = buildAdminQuery(sharedRange, { focus: 'pending_review' });
  const disputesQuery = buildAdminQuery(sharedRange, { focus: 'disputed' });
  const invoicedQuery = buildAdminQuery(sharedRange, { focus: 'invoiced' });
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
        if (active) setDashboardState(data);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar el estado actual del Admin.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const users = dashboardState?.users || {};
    const services = dashboardState?.services || {};
    const matching = Array.isArray(dashboardState?.matching) ? dashboardState.matching : [];
    const support = dashboardState?.support || {};
    const officialDomains = topGroups.reduce((count, group) => count + (Array.isArray(group.items) ? group.items.length : 0), 0);
    return {
      domains: officialDomains,
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
  }, [dashboardState, topGroups]);

  const queueCards = [
    {
      title: 'Oferta',
      subtitle: 'Monitorea la calidad y avance de la base proveedora.',
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
        `Solicitudes en asignacion: ${stats.matching}`,
      ],
      to: `/admin/reservas${reviewsQuery}`,
      actionLabel: 'Revisar servicio',
    },
    {
      title: 'Dinero',
      subtitle: 'Controla pagos, documentos y señales financieras del marketplace.',
      bullets: [
        `Servicios facturados: ${stats.invoiced}`,
        `Tickets soporte: ${stats.tickets}`,
        `Telefonos bloqueados: ${stats.blockedPhones}`,
      ],
      to: `/admin/pagos${paymentsQuery}`,
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
          Aquí parte la operación diaria del equipo. La navegación está organizada por áreas claras para que cada tarea
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
          <AdminStatChip label="Areas oficiales" value={String(stats.domains)} tone="brand" />
          <AdminStatChip label="Asignacion activa" value={String(stats.matching)} tone="neutral" to={`/admin/matching${matchingQuery}`} />
          <AdminStatChip label="Pendientes revision" value={String(stats.pendingReview)} tone="warning" to={`/admin/reservas${reviewsQuery}`} />
          <AdminStatChip label="Soporte abierto" value={String(stats.tickets)} tone="success" to="/admin/soporte" />
        </div>
        {loading ? <div style={{ marginTop: 12, fontSize: 12, color: theme.textMuted }}>Actualizando estado actual…</div> : null}
        {error ? <div style={{ marginTop: 12, fontSize: 12, color: '#E8A34B' }}>{error}</div> : null}
      </AdminSurface>

      <AdminSurface
        title="Accion inmediata"
        subtitle="Entradas rápidas para abrir la bandeja correcta con un contexto operativo compartido."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          <AdminDomainCard
            title="Pendientes de revisión"
            subtitle="Reserva"
            bullets={[
              `Casos visibles: ${stats.pendingReview}`,
              'Abre la bandeja de reservas ya filtrada al foco correcto',
              'Usa el mismo rango base entre servicio, asignacion y dinero',
            ]}
            to={`/admin/reservas${reviewsQuery}`}
            actionLabel="Abrir pendientes"
          />
          <AdminDomainCard
            title="Disputas activas"
            subtitle="Reserva"
            bullets={[
              `Casos visibles: ${stats.disputes}`,
              'Lleva directo al segmento de excepciones del servicio',
              'Útil para operación y resolución diaria',
            ]}
            to={`/admin/reservas${disputesQuery}`}
            actionLabel="Abrir disputas"
          />
          <AdminDomainCard
            title="Asignacion del periodo"
            subtitle="Asignación"
            bullets={[
              `Solicitudes visibles: ${stats.matching}`,
              'Abre asignacion con el mismo rango operativo del Admin',
              'Permite revisar búsqueda, oferta y cierre sin perder contexto',
            ]}
            to={`/admin/matching${matchingQuery}`}
            actionLabel="Abrir asignacion"
          />
          <AdminDomainCard
            title="Facturación cargada"
            subtitle="Dinero"
            bullets={[
              `Servicios facturados: ${stats.invoiced}`,
              'Abre la capa documental con foco en facturas del periodo',
              'Ayuda a cerrar caja y documentación en el mismo flujo',
            ]}
            to={`/admin/facturacion${invoicedQuery}`}
            actionLabel="Abrir facturación"
          />
        </div>
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
