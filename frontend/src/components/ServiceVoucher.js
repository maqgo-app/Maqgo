import React from 'react';
import { MAQGO_BILLING } from '../utils/commissions';
import { isPerTripMachineryType } from '../utils/machineryNames';

/**
 * Componente: Voucher de Servicio para Proveedor
 * Muestra el desglose de lo que debe facturar y los datos de facturación
 */
const ServiceVoucher = ({ service, onDownload, onUploadInvoice }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      maximumFractionDigits: 0 
    }).format(price || 0);
  };

  // Cálculos (solo lo que el proveedor necesita saber para facturar)
  const serviceAmount = service.serviceAmount || 0;
  const bonusAmount = service.bonusAmount || 0;
  const transportAmount = service.transportAmount || 0;
  const grossTotal = serviceAmount + bonusAmount + transportAmount;
  const commission = Math.round(grossTotal * 0.10 * 1.19);
  const providerNet = grossTotal - commission;

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div style={{
      background: '#1A1A1F',
      borderRadius: 16,
      padding: 20,
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Header */}
      <div style={{ 
        textAlign: 'center', 
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: 16,
        marginBottom: 16
      }}>
        <p style={{ color: '#90BDD3', fontSize: 12, margin: '0 0 4px', fontWeight: 600 }}>
          DETALLE DE SERVICIO
        </p>
        <p style={{ color: '#fff', fontSize: 18, margin: '0 0 4px', fontWeight: 700 }}>
          {service.transactionId || `#${service.id?.slice(-6) || '000000'}`}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
          {formatDate(service.date)}
        </p>
      </div>

      {/* Info del servicio */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
          {service.machineryType} · {service && isPerTripMachineryType(service.machinery_type || service.machineryType) ? 'Valor viaje' : `${service.hours} horas`}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
          Operador: {service.operatorName || 'Sin asignar'}
        </p>
      </div>

      {/* Desglose de lo que debe facturar */}
      <div style={{
        background: '#2A2A2A',
        borderRadius: 10,
        padding: 14,
        marginBottom: 16
      }}>
        <p style={{ 
          color: '#90BDD3', 
          fontSize: 12, 
          fontWeight: 600, 
          margin: '0 0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          📄 TU DESGLOSE
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
            {service && isPerTripMachineryType(service.machinery_type || service.machineryType) ? 'Servicio (viaje)' : `Servicio (${service.hours}h)`}
          </span>
          <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(serviceAmount)}</span>
        </div>
        
        {bonusAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
              Bonificación alta demanda
            </span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(bonusAmount)}</span>
          </div>
        )}
        
        {transportAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Traslado</span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(transportAmount)}</span>
          </div>
        )}
        
        <div style={{ paddingTop: 8, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Subtotal</span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(grossTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Menos tarifa por servicio</span>
            <span style={{ color: '#F44336', fontSize: 13 }}>-{formatPrice(commission)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Subtotal neto a facturar</span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(providerNet)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>IVA (19%)</span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(Math.round(providerNet * 0.19))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Total a facturar (con IVA)</span>
            <span style={{ color: '#EC6819', fontSize: 16, fontWeight: 700 }}>{formatPrice(Math.round(providerNet * 1.19))}</span>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: '8px 0 0' }}>
          Basado en el detalle de servicios menos tarifa por servicio. Este total debe aparecer en tu factura. Incluye el ID de transacción. Sube 24 h después del servicio · Pago en 2 días hábiles tras subirla
        </p>
      </div>

      {/* Datos de MAQGO para facturar */}
      <div style={{ background: '#2A2A2A', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>Datos de MAQGO para facturar</p>
        <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, lineHeight: 1.8 }}>
          <p style={{ margin: 0 }}><strong>Razón Social:</strong> {MAQGO_BILLING.razonSocial}</p>
          <p style={{ margin: 0 }}><strong>RUT:</strong> {MAQGO_BILLING.rut}</p>
          <p style={{ margin: 0 }}><strong>Giro:</strong> {MAQGO_BILLING.giro}</p>
          <p style={{ margin: 0 }}><strong>Dirección:</strong> {MAQGO_BILLING.direccion}</p>
          <p style={{ margin: '10px 0 0', color: '#EC6819', fontWeight: 600, fontSize: 12 }}>
            Indica en la factura el ID: {service.transactionId || `#${service.id?.slice(-6) || '000000'}`}
          </p>
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onDownload}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#2A2A2A',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Descargar PDF
        </button>
        <button
          onClick={onUploadInvoice}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#EC6819',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Subir factura a MAQGO
        </button>
      </div>
    </div>
  );
};

export default ServiceVoucher;
