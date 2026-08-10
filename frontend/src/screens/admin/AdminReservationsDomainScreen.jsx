import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminMonthlyReport, fetchAdminServices } from './adminDomainData';
import { ADMIN_RANGE_PRESETS, buildRecentRange, persistAdminRange, readAdminRange } from './adminTimeContext';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ services: [], stats: {}, finances: {}, sla: {}, total: 0 });
  const [range, setRange] = useState(() => readAdminRange('operations', searchParams, 30));
  const monthOptions = useMemo(() => buildRecentMonthOptions(12), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => buildRecentMonthOptions(12)[0]?.key || '');
  const [monthlyFinance, setMonthlyFinance] = useState(null);
  const [monthlyFinanceLoading, setMonthlyFinanceLoading] = useState(false);
  const [monthlyFinanceError, setMonthlyFinanceError] = useState('');
  const [focus, setFocus] = useState(() => String(searchParams.get('focus') || 'all'));

  useEffect(() => {
    persistAdminRange('operations', range);
    const next = new URLSearchParams(searchParams);
    next.set('from', range.fromDate);
    next.set('to', range.toDate);
    if (focus && focus !== 'all') next.set('focus', focus);
    else next.delete('focus');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [focus, range, searchParams, setSearchParams]);

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
    facturacion: 'Vista de facturas y documentos tributarios del servicio, separada del dinero.',
  };

  const filteredServices = useMemo(() => {
    const list = Array.isArray(payload.services) ? payload.services : [];
    if (!focus || focus === 'all') return list;
    return list.filter((service) => String(service?.status || '').trim() === focus);
  }, [focus, payload.services]);

  const cards = useMemo(() => {
    return filteredServices.slice(0, 24).map((service) => ({
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
  }, [filteredServices, mode]);

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
      { title: 'Aprobados', value: String(raw.approved || 0), subtitle: 'Listos para avanzar a documento', tone: 'neutral' },
      { title: 'Facturados', value: String(raw.invoiced || 0), subtitle: 'Factura proveedor ya subida', tone: 'success' },
      { title: 'Disputados', value: String(raw.disputed || 0), subtitle: 'Excepciones dentro del rango', tone: 'warning' },
    ];
  }, [payload]);

  const linkedTo =
    mode === 'reservas'
      ? '/admin/matching'
      : mode === 'payments'
        ? '/admin/reportes'
        : '/admin/reportes';

  const focusOptions =
    mode === 'payments'
      ? [
          { value: 'all', label: 'Todo el rango' },
          { value: 'paid', label: 'Solo pagados' },
          { value: 'invoiced', label: 'Solo facturados' },
          { value: 'disputed', label: 'Solo disputados' },
        ]
      : mode === 'facturacion'
        ? [
            { value: 'all', label: 'Todo el rango' },
            { value: 'approved', label: 'Aprobados' },
            { value: 'invoiced', label: 'Facturados' },
            { value: 'paid', label: 'Pagados' },
          ]
        : [
            { value: 'all', label: 'Todo el rango' },
            { value: 'pending_review', label: 'Pendientes revisión' },
            { value: 'approved', label: 'Aprobados' },
            { value: 'disputed', label: 'Disputas' },
          ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title={titleMap[mode]}
        subtitle={subtitleMap[mode]}
        right={<AdminActionLink to={linkedTo} label={mode === 'reservas' ? 'Ver matching' : 'Abrir reportes'} tone="secondary" />}
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
          <select value={focus} onChange={(e) => setFocus(e.target.value)} style={INPUT_STYLE}>
            {focusOptions.map((option) => (
              <option key={`${mode}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {ADMIN_RANGE_PRESETS.map((preset) => (
            <button
              key={`${mode}-preset-${preset.days}`}
              type="button"
              onClick={() => setRange(buildRecentRange(preset.days))}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            >
              {preset.label}
            </button>
          ))}
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
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando area…</div>
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

    </div>
  );
}
