import React, { useEffect, useMemo, useState } from 'react';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminServices } from './adminDomainData';

function formatPrice(value) {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
  } catch {
    return '$0';
  }
}

export default function AdminReservationsDomainScreen({ mode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ services: [], stats: {}, finances: {}, sla: {}, total: 0 });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const status = mode === 'payments' ? 'invoiced' : mode === 'facturacion' ? 'approved' : 'all';
        const json = await fetchAdminServices(status, 50, 0);
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
  }, [mode]);

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
    if (mode === 'payments') {
      return [
        { label: 'Servicios facturados', value: String(payload?.stats?.invoiced || 0), tone: 'brand' },
        { label: 'Pendientes de pago', value: String(payload?.sla?.facturados_sin_pago || 0), tone: 'warning' },
        { label: 'Venta neta', value: formatPrice(payload?.finances?.totalNet || 0), tone: 'success' },
      ];
    }
    if (mode === 'facturacion') {
      return [
        { label: 'Aprobados', value: String(payload?.stats?.approved || 0), tone: 'brand' },
        { label: 'Invoiced', value: String(payload?.stats?.invoiced || 0), tone: 'success' },
        { label: 'Sin factura', value: String(payload?.sla?.aprobado_sin_facturar || 0), tone: 'warning' },
      ];
    }
    return [
      { label: 'Total visible', value: String(payload?.total || 0), tone: 'brand' },
      { label: 'Pendientes de revision', value: String(payload?.stats?.pending_review || 0), tone: 'warning' },
      { label: 'Disputas', value: String(payload?.stats?.disputed || 0), tone: 'neutral' },
    ];
  }, [mode, payload]);

  const statusBreakdown = useMemo(() => {
    const raw = payload?.stats || {};
    return [
      { title: 'Pendiente revision', value: String(raw.pending_review || 0), subtitle: 'Servicios por aprobar', tone: 'warning' },
      { title: 'Approved', value: String(raw.approved || 0), subtitle: 'Listos para avanzar a documento', tone: 'neutral' },
      { title: 'Invoiced', value: String(raw.invoiced || 0), subtitle: 'Factura proveedor ya subida', tone: 'success' },
      { title: 'Disputed', value: String(raw.disputed || 0), subtitle: 'Excepciones a resolver', tone: 'warning' },
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
        right={<AdminActionLink to={legacyTo} label="Abrir superficie legado" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stats.map((item) => (
            <AdminStatChip key={`${mode}-${item.label}`} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      </AdminSurface>

      <AdminSurface
        title="Bandeja actual"
        subtitle="La vista ya trabaja con la fuente operativa actual, pero la presenta desde el dominio oficial y no desde el dashboard monolitico."
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
