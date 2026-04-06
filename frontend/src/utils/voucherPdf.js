import { jsPDF } from 'jspdf';
import { MAQGO_BILLING } from './commissions';
import { isPerTripMachineryType } from './machineryNames';

const formatPrice = (price) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(price || 0);

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Genera y descarga un PDF con el voucher del servicio para el proveedor
 * @param {Object} service - Datos del servicio
 */
export function downloadVoucherPDF(service) {
  const serviceAmount = service?.serviceAmount ?? service?.service_amount ?? 0;
  const bonusAmount = service?.bonusAmount ?? service?.bonus_amount ?? 0;
  const transportAmount = service?.transportAmount ?? service?.transport_amount ?? 0;
  const grossTotal = serviceAmount + bonusAmount + transportAmount;
  const commission = Math.round(grossTotal * 0.10 * 1.19);
  const providerNet = grossTotal - commission;

  const transactionId =
    service?.transactionId ||
    service?.transaction_id ||
    (service?.id ? `#${String(service.id).slice(-6)}` : '000000') ||
    (service?._id ? `#${String(service._id).slice(-6)}` : '000000');

  const doc = new jsPDF();
  let y = 20;
  const margin = 20;
  const maxWidth = 170;

  // Título
  doc.setFontSize(10);
  doc.setTextColor(100, 150, 180);
  doc.text('DETALLE DE SERVICIO', margin, y);
  y += 8;

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(transactionId, margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(formatDate(service?.date), margin, y);
  y += 16;

  // Info del servicio
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  const machineryType = service?.machineryType || service?.machinery_type || 'Servicio';
  const hours = service?.hours ?? 0;
  const isPerTrip = service && isPerTripMachineryType(service.machinery_type || service.machineryType);
  doc.text(`${machineryType} · ${isPerTrip ? 'Valor viaje' : `${hours} horas`}`, margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const opLabel = service?.operatorName || service?.operator_name || 'Sin asignar';
  doc.text(`Operador: ${opLabel}`, margin, y);
  y += 5;
  const opRut = String(service?.operatorRut || service?.operator_rut || '').trim();
  if (opRut) {
    doc.text(`RUT operador: ${opRut}`, margin, y);
    y += 5;
  }
  y += 7;

  // Desglose
  doc.setFontSize(10);
  doc.setTextColor(100, 150, 180);
  doc.setFont('helvetica', 'bold');
  doc.text('TU DESGLOSE', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(isPerTrip ? 'Servicio (viaje)' : `Servicio (${hours}h)`, margin, y);
  doc.text(formatPrice(serviceAmount), margin + maxWidth - 40, y, { align: 'right' });
  y += 6;

  if (bonusAmount > 0) {
    doc.text('Bonificación alta demanda', margin, y);
    doc.text(formatPrice(bonusAmount), margin + maxWidth - 40, y, { align: 'right' });
    y += 6;
  }

  if (transportAmount > 0) {
    doc.text('Traslado', margin, y);
    doc.text(formatPrice(transportAmount), margin + maxWidth - 40, y, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + maxWidth, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Subtotal', margin, y);
  doc.text(formatPrice(grossTotal), margin + maxWidth - 40, y, { align: 'right' });
  y += 6;

  doc.text('Menos tarifa por servicio', margin, y);
  doc.setTextColor(236, 68, 68);
  doc.text('-' + formatPrice(commission), margin + maxWidth - 40, y, { align: 'right' });
  doc.setTextColor(60, 60, 60);
  y += 6;

  doc.text('Subtotal neto a facturar', margin, y);
  doc.text(formatPrice(providerNet), margin + maxWidth - 40, y, { align: 'right' });
  y += 6;

  doc.text('IVA (19%)', margin, y);
  doc.text(formatPrice(Math.round(providerNet * 0.19)), margin + maxWidth - 40, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Total a facturar (con IVA)', margin, y);
  doc.setTextColor(236, 104, 25);
  doc.text(formatPrice(Math.round(providerNet * 1.19)), margin + maxWidth - 40, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Basado en el detalle (servicio, bonificación, traslado) menos tarifa por servicio. Este total debe aparecer en tu factura. Incluye el ID de transacción. Sube 24 h después del servicio · Pago en 2 días hábiles tras subirla',
    margin,
    y,
    { maxWidth }
  );
  y += 14;

  // Datos de MAQGO
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Datos de MAQGO para facturar', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Razón Social: ${MAQGO_BILLING.razonSocial}`, margin, y);
  y += 5;
  doc.text(`RUT: ${MAQGO_BILLING.rut}`, margin, y);
  y += 5;
  doc.text(`Giro: ${MAQGO_BILLING.giro}`, margin, y);
  y += 5;
  doc.text(`Dirección: ${MAQGO_BILLING.direccion}`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(236, 104, 25);
  doc.text(`Indica en la factura el ID: ${transactionId}`, margin, y);

  // Nombre del archivo
  const safeId = String(transactionId).replace(/\D/g, '').slice(-8) || 'voucher';
  const filename = `MAQGO-voucher-${safeId}.pdf`;

  doc.save(filename);
}
