import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminUsersAndMachines } from './adminDomainData';

function getTimeMs(value) {
  const raw = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(raw) ? raw : 0;
}

export default function AdminSupplyDomainScreen({ mode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ providers: [], operators: [], machines: [], machinesByProvider: new Map(), operatorsByOwner: new Map() });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const next = await fetchAdminUsersAndMachines();
        if (active) setData(next);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar el dominio.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const content = useMemo(() => {
    if (mode === 'providers') {
      return data.providers.map((provider) => {
        const providerId = String(provider?.id || '');
        const machines = data.machinesByProvider.get(providerId) || [];
        const operators = data.operators.filter((op) => String(op?.owner_id || '') === providerId);
        return {
          title: provider?.name || provider?.email || 'Proveedor sin nombre',
          subtitle: `${provider?.email || 'Sin email'} · ${provider?.phone || 'Sin telefono'}`,
          bullets: [
            `Estado: ${provider?.status || 'active'}`,
            `Operadores vinculados: ${operators.length}`,
            `Maquinarias vinculadas: ${machines.length}`,
          ],
        };
      });
    }
    if (mode === 'operators') {
      return data.operators.map((operator) => ({
        title: operator?.name || operator?.email || 'Operador sin nombre',
        subtitle: `${operator?.email || 'Sin email'} · ${operator?.phone || 'Sin telefono'}`,
        bullets: [
          `Titular: ${operator?.owner_id || 'Sin owner_id'}`,
          `Rol operativo: ${operator?.provider_role || 'operator'}`,
          `Estado: ${operator?.status || 'active'}`,
        ],
      }));
    }
    return data.machines.map((machine) => ({
      title: machine?.licensePlate || machine?.license_plate || machine?.machineryType || 'Maquinaria',
      subtitle: `${machine?.type || machine?.machineryType || 'Sin tipo'} · ${machine?.providerName || machine?.provider?.name || 'Sin proveedor'}`,
      bullets: [
        `Publicada: ${machine?.published ? 'Si' : 'No'}`,
        `Disponible: ${machine?.available ? 'Si' : 'No'}`,
        `Operadores: ${Array.isArray(machine?.operators) ? machine.operators.length : 0}`,
      ],
    }));
  }, [data, mode]);

  const stats = useMemo(() => {
    const last30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (mode === 'providers') {
      const newProviders = data.providers.filter((item) => getTimeMs(item?.createdAt || item?.created_at) >= last30d).length;
      return [
        { label: 'Cuentas proveedoras', value: String(data.providers.length), tone: 'brand' },
        { label: 'Altas 30 dias', value: String(newProviders), tone: 'warning' },
        { label: 'Operadores vinculados', value: String(data.operators.length), tone: 'neutral' },
        { label: 'Maquinarias', value: String(data.machines.length), tone: 'success' },
      ];
    }
    if (mode === 'operators') {
      const withOwner = data.operators.filter((item) => String(item?.owner_id || '').trim()).length;
      const newOperators = data.operators.filter((item) => getTimeMs(item?.createdAt || item?.created_at) >= last30d).length;
      return [
        { label: 'Operadores', value: String(data.operators.length), tone: 'brand' },
        { label: 'Altas 30 dias', value: String(newOperators), tone: 'warning' },
        { label: 'Con proveedor', value: String(withOwner), tone: 'success' },
        { label: 'Sin proveedor visible', value: String(Math.max(0, data.operators.length - withOwner)), tone: 'warning' },
      ];
    }
    const published = data.machines.filter((item) => item?.published).length;
    const available = data.machines.filter((item) => item?.available).length;
    const newMachines = data.machines.filter((item) => getTimeMs(item?.createdAt || item?.created_at) >= last30d).length;
    return [
      { label: 'Maquinarias', value: String(data.machines.length), tone: 'brand' },
      { label: 'Altas 30 dias', value: String(newMachines), tone: 'warning' },
      { label: 'Publicadas', value: String(published), tone: 'success' },
      { label: 'Disponibles', value: String(available), tone: 'neutral' },
    ];
  }, [data, mode]);

  const risks = useMemo(() => {
    const providersWithoutMachines = data.providers.filter((provider) => {
      const providerId = String(provider?.id || '');
      return (data.machinesByProvider.get(providerId) || []).length === 0;
    }).length;
    const operatorsWithoutOwner = data.operators.filter((item) => !String(item?.owner_id || '').trim()).length;
    const machinesWithoutOperators = data.machines.filter((item) => !Array.isArray(item?.operators) || item.operators.length === 0).length;
    const unpublishedMachines = data.machines.filter((item) => !item?.published).length;
    return { providersWithoutMachines, operatorsWithoutOwner, machinesWithoutOperators, unpublishedMachines };
  }, [data]);

  const legacyLink =
    mode === 'providers'
      ? '/admin/users?tab=providers'
      : mode === 'operators'
        ? '/admin/users?tab=providers'
        : '/admin/users?tab=machines';

  const title = mode === 'providers' ? 'Base de oferta: Proveedores' : mode === 'operators' ? 'Base de oferta: Operadores' : 'Base de oferta: Maquinarias';
  const subtitle =
    mode === 'providers'
      ? 'Cuenta empresarial, relaciones y salud de la oferta por proveedor.'
      : mode === 'operators'
        ? 'Entidad operativa del ejecutor humano, visible por primera vez como dominio propio.'
        : 'Catalogo operativo y publicable de maquinarias, separado del resto de usuarios.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title={title}
        subtitle={subtitle}
        right={<AdminActionLink to={legacyLink} label="Abrir gestion" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stats.map((item) => (
            <AdminStatChip key={`${mode}-${item.label}`} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      </AdminSurface>

      <AdminSurface
        title="Superficie operativa"
        subtitle="Esta vista separa la lectura por area usando datos reales del Admin oficial, sin volver a mezclar oferta en una sola pantalla."
      >
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando dominio…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {content.slice(0, 24).map((card, index) => (
              <AdminDomainCard
                key={`${mode}-${index}-${card.title}`}
                title={card.title}
                subtitle={card.subtitle}
                bullets={card.bullets}
              />
            ))}
          </div>
        )}
      </AdminSurface>

      <AdminSurface
        title="Riesgos visibles"
        subtitle="El shell oficial expone riesgos estructurales de la oferta sin volver a esconderlos dentro de otras áreas."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <AdminDomainCard
            title="Cuenta proveedora"
            subtitle="Salud de la cuenta de oferta"
            bullets={[
              `Proveedores sin maquinaria visible: ${risks.providersWithoutMachines}`,
              'La cuenta proveedora ya se lee separada del resto de usuarios',
            ]}
          />
          <AdminDomainCard
            title="Equipo operativo"
            subtitle="Visibilidad del operador como ejecutor real"
            bullets={[
              `Operadores sin proveedor visible: ${risks.operatorsWithoutOwner}`,
              `Maquinarias sin operadores declarados: ${risks.machinesWithoutOperators}`,
            ]}
          />
          <AdminDomainCard
            title="Catalogo"
            subtitle="Preparacion y publicacion del activo"
            bullets={[
              `Maquinarias no publicadas: ${risks.unpublishedMachines}`,
              'La etapa comercial de cada maquinaria debe quedar clara antes de abrirla al mercado',
            ]}
          />
        </div>
      </AdminSurface>

      {mode === 'maquinarias' ? (
        <AdminSurface
          title="Regla activa"
          subtitle="Maquinarias ya queda separada de Reglas de negocio y de Usuarios, mientras la gestion detallada se mantiene centralizada sin romper la experiencia oficial."
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <AdminStatChip label="Etapa comercial" value="Visible" tone="brand" />
            <AdminStatChip label="Puente a precios" value="Si" tone="neutral" />
            <AdminStatChip label="Puente a reglas" value="Si" tone="neutral" />
          </div>
        </AdminSurface>
      ) : null}
    </div>
  );
}
