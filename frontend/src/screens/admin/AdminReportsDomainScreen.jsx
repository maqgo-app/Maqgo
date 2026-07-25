import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminReportsSummary } from './adminDomainData';

export default function AdminReportsDomainScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ subscriptions: {}, weekly: {}, monthly: {} });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const json = await fetchAdminReportsSummary();
        if (active) setData(json);
      } catch (err) {
        if (active) setError(err?.message || 'No se pudieron cargar los reportes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const weeklyEmails = Array.isArray(data?.subscriptions?.weekly_emails) ? data.subscriptions.weekly_emails.length : 0;
    const monthlyEmails = Array.isArray(data?.subscriptions?.monthly_emails) ? data.subscriptions.monthly_emails.length : 0;
    const totalServices = data?.weekly?.resumen?.total_servicios_creados_semana ?? data?.weekly?.resumen?.total_solicitudes ?? 0;
    const margin = data?.monthly?.contribution?.margin ?? 0;
    return { weeklyEmails, monthlyEmails, totalServices, margin };
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Reportes"
        subtitle="Dominio oficial de informes semanales y mensuales, suscriptores e historial. El Dashboard solo resume su estado."
        right={<AdminActionLink to="/admin/legacy/dashboard" label="Abrir panel legado" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Suscriptores semanal" value={String(stats.weeklyEmails)} tone="brand" />
          <AdminStatChip label="Suscriptores mensual" value={String(stats.monthlyEmails)} tone="neutral" />
          <AdminStatChip label="Servicios semanales" value={String(stats.totalServices)} tone="success" />
          <AdminStatChip label="Margen mensual" value={String(stats.margin || 0)} tone="warning" />
        </div>
      </AdminSurface>

      <AdminSurface title="Resumen actual" subtitle="Esta vista ya centraliza la lectura de reportes sobre las capacidades existentes del sistema.">
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando reportes…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Informe semanal"
              subtitle={data?.weekly?.periodo?.semana || 'Semana anterior'}
              bullets={[
                `Servicios: ${data?.weekly?.resumen?.total_servicios_creados_semana ?? data?.weekly?.resumen?.total_solicitudes ?? 0}`,
                `Pagados: ${data?.weekly?.resumen?.servicios_pagados_cerrados_semana ?? 0}`,
                `GMV: ${data?.weekly?.resumen?.gmv_pagado_semana_clp ?? 0}`,
              ]}
            />
            <AdminDomainCard
              title="Informe mensual"
              subtitle="Finanzas consolidadas del mes"
              bullets={[
                `IVA debito: ${data?.monthly?.iva?.debito ?? 0}`,
                `IVA credito: ${data?.monthly?.iva?.credito_estimado ?? 0}`,
                `Margen: ${data?.monthly?.contribution?.margin ?? 0}`,
              ]}
            />
            <AdminDomainCard
              title="Distribucion"
              subtitle="Suscriptores y continuidad del workflow"
              bullets={[
                `Semanal: ${stats.weeklyEmails}`,
                `Mensual: ${stats.monthlyEmails}`,
                'El Dashboard solo resume el estado de este dominio',
              ]}
            />
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
