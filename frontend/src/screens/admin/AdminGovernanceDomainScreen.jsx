import React from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';

const CONFIG = {
  logs: {
    title: 'Logs',
    subtitle: 'Dominio transversal de trazabilidad y eventos auditables del Admin.',
    chips: [
      { label: 'Dominio oficial', value: 'Si', tone: 'brand' },
      { label: 'Entidad base', value: 'Evento de Auditoria', tone: 'neutral' },
      { label: 'Fase', value: 'Gobierno inicial', tone: 'success' },
    ],
    bullets: [
      'Relacionar actor, entidad, accion y severidad',
      'Evitar depender de memoria humana para investigar',
      'Servir a negocio, soporte y gobierno',
    ],
    action: null,
  },
  configuracion: {
    title: 'Configuracion',
    subtitle: 'Settings globales y sensibles del sistema, separados de Parametros.',
    chips: [
      { label: 'Dominio oficial', value: 'Si', tone: 'brand' },
      { label: 'Alcance', value: 'Global', tone: 'warning' },
      { label: 'Tamano esperado', value: 'Pequeno', tone: 'success' },
    ],
    bullets: [
      'Gobernar integraciones y toggles estructurales',
      'Evitar absorber reglas variables del negocio',
      'Mantener toda modificacion sensible bajo control',
    ],
    action: { to: '/admin/growth-ai/config', label: 'Abrir config existente' },
  },
  parametros: {
    title: 'Parametros',
    subtitle: 'Reglas variables del negocio y pricing de referencia, separados de Configuracion.',
    chips: [
      { label: 'Dominio oficial', value: 'Si', tone: 'brand' },
      { label: 'Fuente actual', value: 'Pricing', tone: 'neutral' },
      { label: 'Impacta', value: 'Operacion', tone: 'success' },
    ],
    bullets: [
      'Centralizar reglas ajustables del negocio',
      'Separar pricing y criterios de elegibilidad del codigo',
      'Servir como casa oficial de reglas variables',
    ],
    action: { to: '/admin/pricing', label: 'Abrir parametros actuales' },
  },
  'roles-permisos': {
    title: 'Roles y permisos',
    subtitle: 'Gobierno de acceso por dominio y accion, construido sobre la arquitectura oficial.',
    chips: [
      { label: 'Dominio oficial', value: 'Si', tone: 'brand' },
      { label: 'Estado', value: 'Base lista', tone: 'success' },
      { label: 'Dependencia', value: 'Dominios oficiales', tone: 'neutral' },
    ],
    bullets: [
      'Separar quien ve, decide y ejecuta',
      'Crecimiento del equipo sin rol admin omnipotente',
      'Alinear permisos con modulos reales y no con rutas heredadas',
    ],
    action: null,
  },
};

export default function AdminGovernanceDomainScreen({ mode }) {
  const meta = CONFIG[mode];
  if (!meta) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title={meta.title}
        subtitle={meta.subtitle}
        right={meta.action ? <AdminActionLink to={meta.action.to} label={meta.action.label} tone="secondary" /> : null}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {meta.chips.map((chip) => (
            <AdminStatChip key={`${mode}-${chip.label}`} label={chip.label} value={chip.value} tone={chip.tone} />
          ))}
        </div>
      </AdminSurface>

      <AdminSurface title="Base del dominio" subtitle="Resumen claro del rol que cumple esta área dentro del Admin.">
        <AdminDomainCard title={meta.title} subtitle={meta.subtitle} bullets={meta.bullets} />
      </AdminSurface>
    </div>
  );
}
