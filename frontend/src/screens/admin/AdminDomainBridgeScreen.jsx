import React from 'react';
import { ADMIN_DOMAIN_META, ADMIN_SHELL_THEME } from './adminShellConfig';
import { AdminActionLink, AdminDomainCard, AdminSurface, AdminStatChip } from './AdminShellBlocks.jsx';

export default function AdminDomainBridgeScreen({ domainKey }) {
  const theme = ADMIN_SHELL_THEME;
  const meta = ADMIN_DOMAIN_META[domainKey];

  if (!meta) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface title={meta.title} subtitle={meta.subtitle}>
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${theme.border}`,
            background: 'linear-gradient(135deg, rgba(236,104,25,0.10), rgba(15,23,42,0.96) 42%, rgba(143,179,201,0.08))',
            padding: 18,
            boxShadow: '0 20px 40px rgba(0,0,0,0.16)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: theme.brand, textTransform: 'uppercase', letterSpacing: 0.45 }}>
            Dominio oficial
          </div>
          <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>{meta.title}</h2>
          <p style={{ marginTop: 10, maxWidth: 860, fontSize: 14, lineHeight: 1.55, color: theme.textMuted }}>{meta.summary}</p>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <AdminStatChip label="Estándar MAQGO" value="Oficial" tone="brand" />
            <AdminStatChip label="Experiencia" value="Unificada" tone="success" />
            <AdminStatChip label="Siguiente paso" value={meta.actions?.length ? 'Operar' : 'Completar'} tone="warning" />
          </div>
        </div>
      </AdminSurface>

      {meta.responsibilities?.length ? (
        <AdminSurface
          title="Claves del dominio"
          subtitle="Puntos que este módulo debe resolver con claridad para el equipo."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {meta.responsibilities.map((item, index) => (
              <AdminDomainCard
                key={`${domainKey}-${index}`}
                title={`Regla ${index + 1}`}
                subtitle={item}
                bullets={[]}
              />
            ))}
          </div>
        </AdminSurface>
      ) : null}

      <AdminSurface
        title="Estado del módulo"
        subtitle="Resumen del avance y del alcance disponible hoy para este dominio."
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Dominio activo" value="Si" tone="success" />
          <AdminStatChip label="Cobertura actual" value={meta.actions?.length ? 'Operable' : 'En preparacion'} tone="warning" />
          <AdminStatChip label="Base oficial" value="Si" tone="brand" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Accesos disponibles"
        subtitle="Entradas que hoy ya puedes usar para operar este dominio."
      >
        {meta.actions?.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {meta.actions.map((action) => (
              <AdminActionLink key={`${domainKey}-${action.to}`} to={action.to} label={action.label} tone={action.tone} />
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: `1px solid ${theme.border}`,
              background: theme.panelBgSoft,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.5,
              color: theme.textMuted,
            }}
          >
            Este dominio ya tiene su lugar dentro del Admin. La siguiente etapa es completar herramientas y flujos sin
            mezclar responsabilidades con otras áreas.
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
