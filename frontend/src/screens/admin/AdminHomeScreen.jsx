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
      subtitle: 'Cerrar Proveedores, Operadores y Maquinarias como base operativa del marketplace.',
      bullets: [
        `Proveedores visibles: ${stats.providers}`,
        `Operadores visibles: ${stats.operators}`,
        `Maquinarias visibles: ${stats.machines}`,
      ],
      to: '/admin/proveedores',
      actionLabel: 'Abrir base de oferta',
    },
    {
      title: 'Servicio',
      subtitle: 'Separar Reservas de Matching para observar servicio y asignacion como procesos distintos.',
      bullets: [
        `Pendientes de revision: ${stats.pendingReview}`,
        `Disputas: ${stats.disputes}`,
        `Solicitudes en matching: ${stats.matching}`,
      ],
      to: '/admin/reservas',
      actionLabel: 'Abrir dominio de servicio',
    },
    {
      title: 'Dinero',
      subtitle: 'Separar Pagos y Facturacion para que el equipo entienda dinero y documentos sin ambiguedad.',
      bullets: [
        `Servicios invoiced: ${stats.invoiced}`,
        `Tickets soporte: ${stats.tickets}`,
        `Telefonos bloqueados: ${stats.blockedPhones}`,
      ],
      to: '/admin/pagos',
      actionLabel: 'Abrir dominio financiero',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface title="Dashboard oficial" subtitle="Entrada del sistema y torre de control del marketplace. Resume prioridades, deja visible la salud del negocio y deriva a los dominios oficiales sin volver a mezclar operacion profunda.">
        <div style={{ fontSize: 12, fontWeight: 900, color: theme.brand, textTransform: 'uppercase', letterSpacing: 0.45 }}>
          Dashboard
        </div>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Entrada operativa del Admin
        </div>
        <p style={{ marginTop: 10, maxWidth: 860, fontSize: 14, lineHeight: 1.55, color: theme.textMuted }}>
          Esta vista reemplaza el acceso ambiguo al panel antiguo y organiza el trabajo por dominios oficiales. El panel
          legado sigue disponible como puente controlado mientras se materializan los modulos definitivos del MVP.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <AdminActionLink to="/admin/legacy/dashboard" label="Abrir panel legado actual" tone="primary" />
          <AdminActionLink to="/admin/growth-ai" label="Abrir Growth AI" tone="secondary" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Salud del sistema"
        subtitle="Resumen ejecutivo de las prioridades que esta arquitectura busca hacer visibles desde el primer nivel."
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
        title="Work queues del MVP"
        subtitle="Secuencia priorizada para construir el Admin definitivo sin volver a concentrar trabajo profundo en el Dashboard."
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
        <AdminSurface key={group.label} title={group.label} subtitle="Accesos oficiales del shell y dominios ya reservados para el MVP.">
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
