import React from 'react';
import MaqgoCard from '../base/MaqgoCard';

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4" style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 10 }}>
      <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'right', maxWidth: '62%' }}>{value}</span>
    </div>
  );
}

function ServiceSummaryCard({
  title = 'Resumen del servicio',
  machinery,
  operatorName,
  operatorRut,
  licensePlate,
  location,
  duration,
  extraRows = [],
}) {
  const rows = [
    { label: 'Maquinaria', value: machinery || 'Por confirmar' },
    { label: 'Operador', value: operatorName || 'Operador asignado' },
    { label: 'RUT', value: operatorRut || 'Información no disponible' },
    { label: 'Patente', value: licensePlate ? String(licensePlate).toUpperCase() : 'Patente pendiente de confirmar' },
    { label: 'Ubicación', value: location || 'Por confirmar' },
    ...(duration ? [{ label: 'Duración', value: duration }] : []),
    ...extraRows,
  ];

  return (
    <MaqgoCard style={{ borderRadius: 14, padding: 16 }}>
      <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
        {title}
      </div>
      <div>
        {rows.map((r, idx) => (
          <div key={`${r.label}-${idx}`}>{r.value ? <Row label={r.label} value={r.value} /> : null}</div>
        ))}
      </div>
    </MaqgoCard>
  );
}

export default ServiceSummaryCard;
