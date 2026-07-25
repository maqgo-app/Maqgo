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
        <div style={{ fontSize: 12, fontWeight: 900, color: theme.brand, textTransform: 'uppercase', letterSpacing: 0.45 }}>
          Dominio oficial
        </div>
        <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>{meta.title}</h2>
        <p style={{ marginTop: 10, maxWidth: 860, fontSize: 14, lineHeight: 1.55, color: theme.textMuted }}>{meta.summary}</p>
      </AdminSurface>

      {meta.responsibilities?.length ? (
        <AdminSurface
          title="Responsabilidad del dominio"
          subtitle="Estas reglas ya quedan fijadas desde el shell y deben preservarse cuando el modulo se implemente en profundidad."
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
        title="Estado de materializacion"
        subtitle="El dominio ya existe arquitectonicamente. Esta vista mantiene la frontera oficial mientras la implementacion profunda se completa en los siguientes lotes."
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Dominio oficial" value="Si" tone="success" />
          <AdminStatChip label="Modulo profundo" value={meta.actions?.length ? 'En transicion' : 'Pendiente'} tone="warning" />
          <AdminStatChip label="Frontera fija" value="Activa" tone="brand" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Puente de transicion"
        subtitle="Las capacidades existentes se exponen desde aqui mientras se construye el modulo definitivo. El puente mantiene acceso sin renunciar a la arquitectura oficial."
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
            Este dominio ya queda reservado y visible dentro del shell. Su implementacion profunda continua en los lotes
            siguientes sin volver a mezclar responsabilidades con otros modulos.
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
