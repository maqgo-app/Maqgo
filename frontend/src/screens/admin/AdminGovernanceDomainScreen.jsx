import React from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';

const CONFIG = {
  logs: {
    title: 'Actividad',
    subtitle: 'Eventos y seguimiento del Admin.',
    chips: [
      { label: 'Disponible', value: 'Si', tone: 'brand' },
      { label: 'Base', value: 'Eventos del sistema', tone: 'neutral' },
      { label: 'Estado', value: 'Base inicial', tone: 'success' },
    ],
    bullets: [
      'Relacionar actor, entidad, accion y severidad',
      'Evitar depender de memoria humana para investigar',
      'Servir a negocio, soporte y seguimiento interno',
    ],
    action: null,
  },
  configuracion: {
    title: 'Configuración',
    subtitle: 'Integraciones y ajustes globales, separados de las reglas de negocio.',
    chips: [
      { label: 'Disponible', value: 'Si', tone: 'brand' },
      { label: 'Alcance', value: 'Global', tone: 'warning' },
      { label: 'Tamano esperado', value: 'Pequeno', tone: 'success' },
    ],
    bullets: [
      'Controlar integraciones y ajustes globales',
      'Evitar absorber reglas variables del negocio',
      'Mantener toda modificacion sensible bajo control',
    ],
    action: null,
  },
  parametros: {
    title: 'Reglas de negocio',
    subtitle: 'Reglas variables del negocio y precios de referencia, separadas de Configuracion.',
    chips: [
      { label: 'Disponible', value: 'Si', tone: 'brand' },
      { label: 'Fuente actual', value: 'Precios', tone: 'neutral' },
      { label: 'Impacta', value: 'Operacion', tone: 'success' },
    ],
    bullets: [
      'Centralizar reglas ajustables del negocio',
      'Separar precios y criterios de seleccion del codigo',
      'Servir como espacio central de reglas variables',
    ],
    action: { to: '/admin/pricing', label: 'Abrir reglas actuales' },
  },
  'roles-permisos': {
    title: 'Equipo y accesos',
    subtitle: 'Accesos del equipo por area y accion.',
    chips: [
      { label: 'Disponible', value: 'Si', tone: 'brand' },
      { label: 'Estado', value: 'Base lista', tone: 'success' },
      { label: 'Dependencia', value: 'Areas del panel', tone: 'neutral' },
    ],
    bullets: [
      'Separar quien ve, decide y ejecuta',
      'Hacer crecer el equipo sin dar acceso total a todos',
      'Alinear permisos con areas reales y no con rutas heredadas',
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

      <AdminSurface title="Base del area" subtitle="Resumen claro del rol que cumple esta area dentro del Admin.">
        <AdminDomainCard title={meta.title} subtitle={meta.subtitle} bullets={meta.bullets} />
      </AdminSurface>
    </div>
  );
}
