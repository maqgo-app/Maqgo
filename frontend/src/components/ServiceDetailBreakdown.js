import React from 'react';

/**
 * Detalle de Servicio — Desglose completo
 * 
 * Variantes:
 * - client: desglose completo (servicio, bonificación, traslado, tarifa por servicio, IVA, total)
 * - provider: solo su parte (servicio, bonificación, traslado, subtotal, monto a recibir) — sin tarifa plataforma ni total cliente
 * - admin: todo (incluye info interna MAQGO)
 */
const rowStyleBase = (compact) => ({ display: 'flex', justifyContent: 'space-between', marginBottom: compact ? 4 : 8 });
const sectionStyleBase = (compact) => ({ marginBottom: compact ? 8 : 12 });

const Row = ({ label, value, highlight = false, compact = false }) => (
  <div style={rowStyleBase(compact)}>
    <span style={{ color: highlight ? '#fff' : 'rgba(255,255,255,0.9)', fontSize: compact ? 12 : 13, fontWeight: highlight ? 600 : 400 }}>
      {label}
    </span>
    <span style={{ color: highlight ? '#EC6819' : '#fff', fontSize: compact ? 12 : 13, fontWeight: highlight ? 700 : 500 }}>
      {value}
    </span>
  </div>
);

const Divider = () => (
  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 8 }} />
);

const ServiceDetailBreakdown = ({
  service = {},
  variant = 'client',
  needsInvoice = false,
  compact = false,
  showTitle = true
}) => {
  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price || 0);

  // Normalizar datos del servicio
  const serviceAmount = service.serviceAmount ?? service.service_amount ?? 0;
  const bonusAmount = service.bonusAmount ?? service.bonus_amount ?? 0;
  const transportAmount = service.transportAmount ?? service.transport_amount ?? 0;
  const additionalDays = service.additionalDays ?? service.additional_days ?? 0;
  const additionalCost = service.additionalCost ?? service.additional_cost ?? 0;
  const todayHours = service.todayHours ?? service.today_hours ?? service.hours ?? 0;

  const subtotal = service.subtotal ?? service.netTotal ?? (serviceAmount + bonusAmount + transportAmount + additionalCost);

  // Cálculos (solo para client y admin) — Tarifa por Servicio: 10% + IVA (no 15%)
  const maqgoFeeNeto = Math.round(subtotal * 0.10);
  const maqgoFeeIva = Math.round(maqgoFeeNeto * 0.19);
  const maqgoFeeConIva = maqgoFeeNeto + maqgoFeeIva;
  // Best practice: el total al cliente debe ser el mismo para boleta y factura.
  // El backend calcula el mismo bruto:
  //   total = subtotal + feeNeto + IVA sobre (subtotal + feeNeto)
  //
  // Para boleta (needsInvoice=false) la UI muestra "Tarifa por servicio (IVA incl.)",
  // por lo que la parte "feeNeto * 0.19" ya va incluida en `maqgoFeeConIva`.
  // Entonces, el IVA restante que falta para igualar el total es el IVA sobre el subtotal.
  const ivaTotalFactura = Math.round((subtotal + maqgoFeeNeto) * 0.19); // para factura
  const ivaSobreSubtotalBoleta = Math.round(subtotal * 0.19); // para boleta
  const totalCliente = needsInvoice
    ? subtotal + maqgoFeeNeto + ivaTotalFactura
    : subtotal + maqgoFeeConIva + ivaSobreSubtotalBoleta;

  // Cálculos proveedor
  const maqgoProviderFee = Math.round(subtotal * 0.10 * 1.19);
  const providerReceives = service.net_total ?? (subtotal - maqgoProviderFee);

  const containerStyle = compact ? {} : { background: '#2A2A2A', borderRadius: 12, padding: 16, marginBottom: 14 };
  const sectionStyle = sectionStyleBase(compact);

  return (
    <div style={containerStyle}>
      {showTitle && (
        <p style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Detalle del servicio
        </p>
      )}

      {/* Servicio — Caso inmediato */}
      {serviceAmount > 0 && (
        <div style={sectionStyle}>
          <Row label={`Servicio (${todayHours}h)`} value={formatPrice(serviceAmount)} compact={compact} />
        </div>
      )}

      {/* Bonificación */}
      {bonusAmount > 0 && (
        <div style={sectionStyle}>
          <Row label="Bonificación alta demanda" value={formatPrice(bonusAmount)} compact={compact} />
        </div>
      )}

      {/* Días adicionales (híbrido) */}
      {additionalDays > 0 && additionalCost > 0 && (
        <div style={sectionStyle}>
          <Row label={`${additionalDays} día${additionalDays > 1 ? 's' : ''} adicional${additionalDays > 1 ? 'es' : ''} (8h/día)`} value={formatPrice(additionalCost)} compact={compact} />
        </div>
      )}

      {/* Traslado */}
      {transportAmount > 0 && (
        <div style={sectionStyle}>
          <Row label="Traslado" value={formatPrice(transportAmount)} compact={compact} />
        </div>
      )}

      <Divider />

      {/* Subtotal */}
      <div style={sectionStyle}>
        <Row label="Subtotal" value={formatPrice(subtotal)} compact={compact} />
      </div>

      {/* === CLIENTE y ADMIN: Tarifa por Servicio, IVA, Total (sin mostrar % comisión) === */}
      {(variant === 'client' || variant === 'admin') && (
        <>
          <div style={sectionStyle}>
            <Row
              label={`Tarifa por Servicio ${!needsInvoice ? '(IVA incl.)' : ''}`}
              value={formatPrice(needsInvoice ? maqgoFeeNeto : maqgoFeeConIva)}
              compact={compact}
            />
          </div>
          {(
            needsInvoice
              ? (
                <div style={sectionStyle}>
                  <Row label="IVA (19%)" value={formatPrice(ivaTotalFactura)} compact={compact} />
                </div>
              )
              : (
                <div style={sectionStyle}>
                  <Row label="IVA (19%) sobre subtotal" value={formatPrice(ivaSobreSubtotalBoleta)} compact={compact} />
                </div>
              )
          )}
          <Divider />
          <div style={sectionStyle}>
            <Row label="TOTAL A PAGAR" value={formatPrice(totalCliente)} highlight compact={compact} />
          </div>
        </>
      )}

      {/* === PROVEEDOR: Desglose indicando lo que debe facturar === */}
      {variant === 'provider' && (
        <>
          <div style={sectionStyle}>
            <Row label="Subtotal" value={formatPrice(subtotal)} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="Menos tarifa por servicio" value={`-${formatPrice(maqgoProviderFee)}`} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="Subtotal neto a facturar" value={formatPrice(providerReceives)} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="IVA (19%)" value={formatPrice(Math.round(providerReceives * 0.19))} compact={compact} />
          </div>
          <Divider />
          <div style={sectionStyle}>
            <Row label="Total a facturar (con IVA)" value={formatPrice(Math.round(providerReceives * 1.19))} highlight compact={compact} />
          </div>
          <div style={{ ...sectionStyle, marginTop: 4 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0 }}>
              Basado en el detalle de servicios menos tarifa por servicio. Este total debe aparecer en tu factura. Incluye el ID de transacción. Sube 24 h después · Pago en 2 días hábiles
            </p>
          </div>
        </>
      )}

      {/* === ADMIN: Info interna MAQGO === */}
      {variant === 'admin' && (
        <>
          <Divider />
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '12px 0 8px', textTransform: 'uppercase' }}>
            Info interna MAQGO
          </p>
          <div style={sectionStyle}>
            <Row label="Cliente paga" value={formatPrice(totalCliente)} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="Tarifa por servicio (proveedor)" value={formatPrice(maqgoProviderFee)} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="Proveedor recibe" value={formatPrice(providerReceives)} compact={compact} />
          </div>
          <div style={sectionStyle}>
            <Row label="MAQGO ingresa (tarifas)" value={formatPrice(maqgoFeeConIva + maqgoProviderFee)} compact={compact} />
          </div>
        </>
      )}
    </div>
  );
};

export default ServiceDetailBreakdown;
