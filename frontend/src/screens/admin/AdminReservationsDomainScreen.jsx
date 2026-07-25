import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminMonthlyReport, fetchAdminServices } from './adminDomainData';

function formatPrice(value) {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
  } catch {
    return '$0';
  }
}

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

function toDateInputValue(date) {
  const safe = date instanceof Date ? date : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
}

function buildRecentRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { fromDate: toDateInputValue(start), toDate: toDateInputValue(end) };
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

export default function AdminReservationsDomainScreen({ mode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ services: [], stats: {}, finances: {}, sla: {}, total: 0 });
  const [range, setRange] = useState(() => buildRecentRange(30));
  const monthOptions = useMemo(() => buildRecentMonthOptions(12), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => buildRecentMonthOptions(12)[0]?.key || '');
  const [monthlyFinance, setMonthlyFinance] = useState(null);
  const [monthlyFinanceLoading, setMonthlyFinanceLoading] = useState(false);
  const [monthlyFinanceError, setMonthlyFinanceError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const status = mode === 'payments' || mode === 'facturacion' ? 'all' : 'all';
        const dateField = mode === 'facturacion' ? 'invoice_uploaded_at' : mode === 'payments' ? 'paid_at' : 'created_at';
        const json = await fetchAdminServices(status, 200, 0, {
          fromDate: range.fromDate,
          toDate: range.toDate,
          dateField,
        });
        if (active) setPayload(json || {});
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar la vista.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, range.fromDate, range.toDate]);

  const selectedMonth = useMemo(
    () => monthOptions.find((item) => item.key === selectedMonthKey) || monthOptions[0] || null,
    [monthOptions, selectedMonthKey]
  );

  useEffect(() => {
    if (mode !== 'payments' || !selectedMonth) return () => {};
    let active = true;
    (async () => {
      try {
        setMonthlyFinanceLoading(true);
        setMonthlyFinanceError('');
        const report = await fetchAdminMonthlyReport(selectedMonth.year, selectedMonth.month);
        if (active) setMonthlyFinance(report);
      } catch (err) {
        if (active) setMonthlyFinanceError(err?.message || 'No se pudo cargar el histórico de ingresos.');
      } finally {
        if (active) setMonthlyFinanceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, selectedMonth]);

  const titleMap = {
    reservas: 'Reservas',
    payments: 'Pagos',
    facturacion: 'Facturacion',
  };

  const subtitleMap = {
    reservas: 'Servicio, contexto transaccional y estados del flujo operacional.',
    payments: 'Vista monetaria del servicio, separada de la documentacion tributaria.',
    facturacion: 'Vista documental y fiscal del servicio, separada del dinero.',
  };

  const cards = useMemo(() => {
    return (Array.isArray(payload.services) ? payload.services : []).slice(0, 24).map((service) => ({
      title: service?.client_name || service?.clientName || 'Reserva',
      subtitle: `${service?.machinery_type || service?.machineryType || 'Sin maquinaria'} · ${service?.location || 'Sin ubicacion'}`,
      bullets:
        mode === 'payments'
          ? [
              `Estado: ${service?.status || '-'}`,
              `Neto: ${formatPrice(service?.net_total)}`,
              `Comision: ${formatPrice(service?.service_fee)}`,
            ]
          : mode === 'facturacion'
            ? [
                `Estado: ${service?.status || '-'}`,
                `Factura proveedor: ${service?.invoice_number || 'Pendiente'}`,
                `Subida: ${service?.invoice_uploaded_at ? 'Si' : 'No'}`,
              ]
            : [
                `Estado: ${service?.status || '-'}`,
                `Proveedor: ${service?.provider_id || '-'}`,
                `Creada: ${service?.created_at ? new Date(service.created_at).toLocaleDateString('es-CL') : '-'}`,
              ],
    }));
  }, [mode, payload.services]);

  const stats = useMemo(() => {
    const rangeSummary = payload?.range_summary || {};
    if (mode === 'payments') {
      return [
        { label: 'Pagados en rango', value: String(rangeSummary?.paid || 0), tone: 'brand' },
        { label: 'Neto en rango', value: formatPrice(rangeSummary?.net_total || 0), tone: 'success' },
        { label: 'Comisión en rango', value: formatPrice(rangeSummary?.service_fee_total || 0), tone: 'warning' },
      ];
    }
    if (mode === 'facturacion') {
      return [
        { label: 'Facturas subidas', value: String(rangeSummary?.invoiced || 0), tone: 'brand' },
        { label: 'Monto neto', value: formatPrice(rangeSummary?.net_total || 0), tone: 'success' },
        { label: 'Pendientes documento', value: String(payload?.sla?.aprobado_sin_facturar || 0), tone: 'warning' },
      ];
    }
    return [
      { label: 'Creadas en rango', value: String(payload?.range_summary?.total || payload?.total || 0), tone: 'brand' },
      { label: 'Pendientes de revision', value: String(payload?.range_summary?.pending_review || 0), tone: 'warning' },
      { label: 'Disputas en rango', value: String(payload?.range_summary?.disputed || 0), tone: 'neutral' },
    ];
  }, [mode, payload]);

  const statusBreakdown = useMemo(() => {
    const raw = payload?.range_summary || payload?.stats || {};
    return [
      { title: 'Pendiente revision', value: String(raw.pending_review || 0), subtitle: 'Servicios por aprobar en el rango', tone: 'warning' },
      { title: 'Approved', value: String(raw.approved || 0), subtitle: 'Listos para avanzar a documento', tone: 'neutral' },
      { title: 'Invoiced', value: String(raw.invoiced || 0), subtitle: 'Factura proveedor ya subida', tone: 'success' },
      { title: 'Disputed', value: String(raw.disputed || 0), subtitle: 'Excepciones dentro del rango', tone: 'warning' },
    ];
  }, [payload]);

  const legacyTo =
    mode === 'reservas'
      ? '/admin/legacy/area/today'
      : mode === 'payments'
        ? '/admin/legacy/area/money'
        : '/admin/legacy/area/money';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title={titleMap[mode]}
        subtitle={subtitleMap[mode]}
        right={<AdminActionLink to={legacyTo} label="Ver herramienta actual" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input
            type="date"
            value={range.fromDate}
            onChange={(e) => setRange((current) => ({ ...current, fromDate: e.target.value }))}
            style={INPUT_STYLE}
          />
          <input
            type="date"
            value={range.toDate}
            onChange={(e) => setRange((current) => ({ ...current, toDate: e.target.value }))}
            style={INPUT_STYLE}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stats.map((item) => (
            <AdminStatChip key={`${mode}-${item.label}`} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      </AdminSurface>

      <AdminSurface
        title="Casos del rango"
        subtitle="Bandeja operativa filtrada por el período seleccionado."
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
            {cards.map((card, index) => (
              <AdminDomainCard key={`${mode}-${index}-${card.title}`} title={card.title} subtitle={card.subtitle} bullets={card.bullets} />
            ))}
          </div>
        )}
      </AdminSurface>

      {mode === 'payments' ? (
        <AdminSurface
          title="Ingresos por periodo"
          subtitle="Consulta meses anteriores para revisar ventas, ingreso MAQGO y margen sin depender solo del dato spot."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <select value={selectedMonthKey} onChange={(e) => setSelectedMonthKey(e.target.value)} style={INPUT_STYLE}>
              {monthOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {monthlyFinanceLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando histórico de ingresos…</div>
          ) : monthlyFinanceError ? (
            <div style={{ color: '#E8A34B', fontSize: 13 }}>{monthlyFinanceError}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <AdminDomainCard
                title="Ventas netas"
                subtitle={monthlyFinance?.periodo?.label || 'Periodo seleccionado'}
                bullets={[
                  `Ventas netas: ${formatPrice(monthlyFinance?.sales?.net || 0)}`,
                  `Servicios pagados: ${monthlyFinance?.sales?.services_paid ?? 0}`,
                  `Ingreso MAQGO: ${formatPrice(monthlyFinance?.maqgo_revenue?.total_net || 0)}`,
                ]}
              />
              <AdminDomainCard
                title="Contribución"
                subtitle="Lectura financiera del periodo"
                bullets={[
                  `Margen: ${formatPrice(monthlyFinance?.contribution?.margin || 0)}`,
                  `Costo de venta: ${formatPrice(monthlyFinance?.contribution?.cost_of_sales || 0)}`,
                  `Take rate: ${monthlyFinance?.maqgo_revenue?.take_rate_pct ?? 0}%`,
                ]}
              />
              <AdminDomainCard
                title="Documentos e IVA"
                subtitle="Contexto de cierre mensual"
                bullets={[
                  `IVA débito: ${formatPrice(monthlyFinance?.iva?.debito || 0)}`,
                  `IVA crédito: ${formatPrice(monthlyFinance?.iva?.credito_estimado || 0)}`,
                  `IVA neto: ${formatPrice(monthlyFinance?.iva?.neto_estimado || 0)}`,
                ]}
              />
            </div>
          )}
        </AdminSurface>
      ) : null}

      {mode === 'reservas' ? (
        <AdminSurface
          title="Lectura histórica"
          subtitle="Cómo se movió la creación y resolución de reservas dentro del rango."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Volumen"
              subtitle="Actividad del periodo"
              bullets={[
                `Reservas creadas: ${payload?.range_summary?.total || 0}`,
                `Pendientes revisión: ${payload?.range_summary?.pending_review || 0}`,
                `Aprobadas: ${payload?.range_summary?.approved || 0}`,
              ]}
            />
            <AdminDomainCard
              title="Escalaciones"
              subtitle="Señales que requieren seguimiento"
              bullets={[
                `Disputas: ${payload?.range_summary?.disputed || 0}`,
                `Tiempo prom. revisión actual: ${payload?.sla?.revision_horas_promedio || 0} h`,
                `Máx. revisión actual: ${payload?.sla?.revision_horas_max || 0} h`,
              ]}
            />
            <AdminDomainCard
              title="Conversión del flujo"
              subtitle="Qué parte del rango avanza aguas abajo"
              bullets={[
                `Invoiced: ${payload?.range_summary?.invoiced || 0}`,
                `Paid: ${payload?.range_summary?.paid || 0}`,
                'Permite ver si la reserva se transforma o se estanca',
              ]}
            />
          </div>
        </AdminSurface>
      ) : null}

      {mode === 'facturacion' ? (
        <AdminSurface
          title="Documentos por rango"
          subtitle="Seguimiento de facturas proveedor y avance documental dentro del período."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <AdminDomainCard
              title="Carga documental"
              subtitle="Volumen de documentos en el rango"
              bullets={[
                `Facturas subidas: ${payload?.range_summary?.invoiced || 0}`,
                `Monto neto asociado: ${formatPrice(payload?.range_summary?.net_total || 0)}`,
                `Comisión visible: ${formatPrice(payload?.range_summary?.service_fee_total || 0)}`,
              ]}
            />
            <AdminDomainCard
              title="Pendientes"
              subtitle="Lo que aún falta cerrar"
              bullets={[
                `Aprobado sin factura: ${payload?.sla?.aprobado_sin_facturar || 0}`,
                `Facturado sin pago: ${payload?.sla?.facturados_sin_pago || 0}`,
                'Sirve para anticipar cuello documental y caja',
              ]}
            />
            <AdminDomainCard
              title="Cobertura del flujo"
              subtitle="Cómo avanza la documentación después de aprobar"
              bullets={[
                `Approved en rango: ${payload?.range_summary?.approved || 0}`,
                `Invoiced en rango: ${payload?.range_summary?.invoiced || 0}`,
                `Paid en rango: ${payload?.range_summary?.paid || 0}`,
              ]}
            />
          </div>
        </AdminSurface>
      ) : null}

      <AdminSurface
        title="Lectura por estados"
        subtitle="Esta capa ayuda a decidir desde el dominio correcto antes de entrar al caso puntual."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {statusBreakdown.map((item) => (
            <AdminDomainCard
              key={`${mode}-${item.title}`}
              title={item.title}
              subtitle={item.subtitle}
              bullets={[`Visible ahora: ${item.value}`, mode === 'reservas' ? 'La reserva sigue siendo el centro del servicio' : mode === 'payments' ? 'El dinero ya no se confunde con la documentacion' : 'La documentacion ya no se confunde con el flujo monetario']}
            />
          ))}
        </div>
      </AdminSurface>
    </div>
  );
}
