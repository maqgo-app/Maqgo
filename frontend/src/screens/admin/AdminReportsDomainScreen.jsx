import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import {
  downloadAdminReportPdf,
  fetchAdminMonthlyReport,
  fetchAdminReportsSummary,
  fetchAdminWeeklyReport,
} from './adminDomainData';

function buildRecentMonthOptions(total = 12) {
  const now = new Date();
  const options = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    options.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 700,
};

const BUTTON_STYLE = {
  background: '#EC6819',
  border: '1px solid transparent',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
};

const SECONDARY_BUTTON_STYLE = {
  ...BUTTON_STYLE,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.16)',
};

export default function AdminReportsDomainScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ subscriptions: {}, weekly: {}, monthly: {} });
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');
  const [monthlyError, setMonthlyError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [weeksAgo, setWeeksAgo] = useState(1);
  const monthOptions = useMemo(() => buildRecentMonthOptions(12), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => buildRecentMonthOptions(12)[0]?.key || '');

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

  const selectedMonth = useMemo(
    () => monthOptions.find((item) => item.key === selectedMonthKey) || monthOptions[0] || null,
    [monthOptions, selectedMonthKey]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setWeeklyLoading(true);
        setWeeklyError('');
        const report = await fetchAdminWeeklyReport(weeksAgo);
        if (active) setWeeklyReport(report);
      } catch (err) {
        if (active) setWeeklyError(err?.message || 'No se pudo cargar el reporte semanal.');
      } finally {
        if (active) setWeeklyLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [weeksAgo]);

  useEffect(() => {
    if (!selectedMonth) return () => {};
    let active = true;
    (async () => {
      try {
        setMonthlyLoading(true);
        setMonthlyError('');
        const report = await fetchAdminMonthlyReport(selectedMonth.year, selectedMonth.month);
        if (active) setMonthlyReport(report);
      } catch (err) {
        if (active) setMonthlyError(err?.message || 'No se pudo cargar el reporte mensual.');
      } finally {
        if (active) setMonthlyLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedMonth]);

  const handleDownload = async (kind) => {
    if (downloading) return;
    setDownloadError('');
    setDownloading(kind);
    try {
      if (kind === 'weekly') {
        await downloadAdminReportPdf('weekly', { weeksAgo });
      } else if (selectedMonth) {
        await downloadAdminReportPdf('monthly', { year: selectedMonth.year, month: selectedMonth.month });
      }
    } catch (err) {
      setDownloadError(err?.message || 'No se pudo descargar el PDF.');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Reportes"
        subtitle="Consulta informes semanales y mensuales, revisa destinatarios y descarga los PDF ejecutivos desde una sola vista."
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Destinatarios semanales" value={String(stats.weeklyEmails)} tone="brand" />
          <AdminStatChip label="Destinatarios mensuales" value={String(stats.monthlyEmails)} tone="neutral" />
          <AdminStatChip label="Servicios semanales" value={String(stats.totalServices)} tone="success" />
          <AdminStatChip label="Margen mensual" value={String(stats.margin || 0)} tone="warning" />
        </div>
      </AdminSurface>

      <AdminSurface title="Plantillas activas" subtitle="Los reportes semanales y mensuales mantienen el formato MAQGO ya desarrollado y siguen disponibles como PDF para distribución interna.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <AdminDomainCard
            title="Informe semanal"
            subtitle="Misma lógica del reporte operativo que ya venía usando el equipo"
            bullets={[
              'Incluye resumen, negocio, operación, demanda e insights',
              'Disponible en JSON y PDF',
              'Sirve para revisión interna y envío por correo',
            ]}
          />
          <AdminDomainCard
            title="Informe mensual"
            subtitle="Mantiene la lectura financiera consolidada del mes"
            bullets={[
              'Incluye ventas, contribución, IVA, ingresos MAQGO y volumen',
              'Disponible en JSON y PDF',
              'Sirve como base del cierre mensual y seguimiento ejecutivo',
            ]}
          />
          <AdminDomainCard
            title="Destinatarios"
            subtitle="La distribución semanal y mensual sigue vigente"
            bullets={[
              `Informe semanal: ${stats.weeklyEmails}`,
              `Informe mensual: ${stats.monthlyEmails}`,
              'La distribucion vigente mantiene el control de destinatarios y del flujo de envio',
            ]}
          />
        </div>
      </AdminSurface>

      <AdminSurface title="Reporte semanal" subtitle="Busca la semana que necesitas, revisa el resumen y descarga el PDF en el mismo flujo.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <select value={weeksAgo} onChange={(e) => setWeeksAgo(Number(e.target.value))} style={INPUT_STYLE}>
            <option value={0}>Semana actual</option>
            <option value={1}>Semana anterior</option>
            <option value={2}>Hace 2 semanas</option>
            <option value={3}>Hace 3 semanas</option>
            <option value={4}>Hace 4 semanas</option>
            <option value={8}>Hace 8 semanas</option>
          </select>
          <button type="button" onClick={() => handleDownload('weekly')} style={BUTTON_STYLE} disabled={downloading === 'weekly'}>
            {downloading === 'weekly' ? 'Descargando PDF...' : 'Descargar PDF semanal'}
          </button>
        </div>
        {weeklyLoading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando reporte semanal…</div>
        ) : weeklyError ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{weeklyError}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Periodo"
              subtitle={weeklyReport?.periodo?.semana || 'Semana seleccionada'}
              bullets={[
                `Inicio: ${String(weeklyReport?.periodo?.inicio || '-').slice(0, 10)}`,
                `Fin: ${String(weeklyReport?.periodo?.fin || '-').slice(0, 10)}`,
                `Generado: ${weeklyReport?.generado_el ? new Date(weeklyReport.generado_el).toLocaleString('es-CL') : '-'}`,
              ]}
            />
            <AdminDomainCard
              title="Resumen"
              subtitle="Lectura operativa de la semana"
              bullets={[
                `Servicios: ${weeklyReport?.resumen?.total_servicios_creados_semana ?? weeklyReport?.resumen?.total_solicitudes ?? 0}`,
                `Pagados: ${weeklyReport?.resumen?.servicios_pagados_cerrados_semana ?? 0}`,
                `GMV pagado: ${weeklyReport?.resumen?.gmv_pagado_semana_clp ?? 0}`,
              ]}
            />
            <AdminDomainCard
              title="Alertas"
              subtitle="Señales que requieren seguimiento"
              bullets={(weeklyReport?.alertas || []).slice(0, 3).map((item) => item?.mensaje || 'Alerta detectada')}
            />
          </div>
        )}
      </AdminSurface>

      <AdminSurface title="Reporte mensual" subtitle="Revisa cualquier mes reciente, manteniendo la lectura financiera y el template mensual del equipo.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <select value={selectedMonthKey} onChange={(e) => setSelectedMonthKey(e.target.value)} style={INPUT_STYLE}>
            {monthOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => handleDownload('monthly')} style={BUTTON_STYLE} disabled={downloading === 'monthly'}>
            {downloading === 'monthly' ? 'Descargando PDF...' : 'Descargar PDF mensual'}
          </button>
        </div>
        {monthlyLoading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando reporte mensual…</div>
        ) : monthlyError ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{monthlyError}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Periodo"
              subtitle={monthlyReport?.periodo?.label || 'Mes seleccionado'}
              bullets={[
                `Ventas netas: ${monthlyReport?.sales?.net || 0}`,
                `Servicios pagados: ${monthlyReport?.sales?.services_paid ?? 0}`,
                `Ingreso MAQGO: ${monthlyReport?.maqgo_revenue?.net ?? 0}`,
              ]}
            />
            <AdminDomainCard
              title="Finanzas"
              subtitle="Lectura consolidada del mes"
              bullets={[
                `Margen: ${monthlyReport?.contribution?.margin ?? 0}`,
                `IVA débito: ${monthlyReport?.iva?.debito ?? 0}`,
                `IVA crédito: ${monthlyReport?.iva?.credito_estimado ?? 0}`,
              ]}
            />
            <AdminDomainCard
              title="Crecimiento"
              subtitle="Actividad base del periodo"
              bullets={[
                `Clientes nuevos: ${monthlyReport?.volume?.new_clients ?? 0}`,
                `Proveedores nuevos: ${monthlyReport?.volume?.new_providers ?? 0}`,
                `Maquinarias nuevas: ${monthlyReport?.volume?.new_machines ?? 0}`,
              ]}
            />
          </div>
        )}
      </AdminSurface>

      <AdminSurface title="Destinatarios y envíos" subtitle="Control visible de quién recibe cada informe y qué pantalla sigue gestionando el envio actual.">
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando reportes…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Distribución semanal"
              subtitle="Destinatarios del informe semanal"
              bullets={[
                `Destinatarios: ${stats.weeklyEmails}`,
                'El envío sigue utilizando la plantilla MAQGO semanal',
                'La distribucion vigente permite administrar continuidad y envio',
              ]}
            />
            <AdminDomainCard
              title="Distribución mensual"
              subtitle="Destinatarios del informe mensual"
              bullets={[
                `Destinatarios: ${stats.monthlyEmails}`,
                'El envío sigue utilizando la plantilla MAQGO mensual',
                'Conserva el flujo ejecutivo ya desarrollado',
              ]}
            />
            <AdminDomainCard
              title="Acceso complementario"
              subtitle="Superficie disponible para la operación actual"
              bullets={[
                'La pantalla vigente concentra las acciones auxiliares de distribucion',
                'Reportes queda como espacio de consulta y descarga',
                'El panel resume, pero no reemplaza esta area',
              ]}
              to="/admin/marketing"
              actionLabel="Abrir distribucion vigente"
            />
          </div>
        )}
      </AdminSurface>

      {downloadError ? (
        <div style={{ color: '#E8A34B', fontSize: 13, lineHeight: 1.45 }}>{downloadError}</div>
      ) : null}
    </div>
  );
}
