import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { MAQGO_BILLING } from '../../utils/commissions';
import { fetchWithTimeout } from '../../utils/api';

import BACKEND_URL from '../../utils/api';
import { getObject } from '../../utils/safeStorage';
import { getMachineryId } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';

/**
 * Pantalla: Subir Factura (Proveedor)
 * Basada en el desglose del servicio: Servicio, Traslado, Bonificación, Neto, IVA, Total
 * 
 * Acceso desde:
 * - Mis Cobros: servicio en state
 * - Historial: /provider/upload-invoice/:serviceId
 */
function UploadInvoiceScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { serviceId } = useParams();
  const fileInputRef = useRef(null);
  const serviceFromState = location.state?.service;

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceImage, setInvoiceImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    loadService();
  }, [serviceId, serviceFromState]);

  const loadService = async () => {
    if (serviceFromState) {
      setService(normalizeServiceFromVoucher(serviceFromState));
      setLoading(false);
      return;
    }

    try {
      if (serviceId) {
        try {
          const response = await fetchWithTimeout(`${BACKEND_URL}/api/services/${serviceId}`, {}, 6000);
          const data = await response.json();
          setService(normalizeServiceFromApi(data));
        } catch (error) {
          setService(getDemoService(serviceId));
        }
      } else {
        const lastService = getObject('lastCompletedService', {});
        if (lastService.id || lastService._id) {
          setService(normalizeServiceFromVoucher(lastService));
        } else {
          setService(getDemoService('demo'));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const normalizeServiceFromVoucher = (s) => {
    const serviceAmount = s.serviceAmount || 0;
    const bonusAmount = s.bonusAmount || 0;
    const transportAmount = s.transportAmount || 0;
    const grossTotal = serviceAmount + bonusAmount + transportAmount;
    const commission = Math.round(grossTotal * 0.10 * 1.19);
    const providerNet = grossTotal - commission;
    const transactionId = s.transactionId || s.transaction_id || s.orderNumber || 
      (s.id ? `MQ-${String(s.id).replace(/\D/g, '').slice(-8) || s.id}` : null) ||
      (s._id ? `MQ-${String(s._id).slice(-8)}` : null) ||
      `MQ-${Date.now().toString().slice(-8)}`;
    return {
      id: s.id || s._id,
      transactionId,
      machineryType: s.machineryType || s.machinery_type,
      hours: s.hours || 0,
      clientName: s.clientName || s.client_name,
      serviceAmount,
      bonusAmount,
      transportAmount,
      grossTotal,
      commission,
      netTotal: grossTotal,
      net_total: s.net_total ?? providerNet,
      date: s.date || new Date().toISOString()
    };
  };

  const normalizeServiceFromApi = (data) => {
    const grossTotal = (data.service_amount || 0) + (data.transport_amount || 0) + (data.bonus_amount || 0) || data.gross_total;
    const commission = Math.round((grossTotal || 0) * 0.10 * 1.19);
    const providerNet = (grossTotal || 0) - commission;
    const transactionId = data.transaction_id || data.order_number || data.service_id || 
      (data._id ? `MQ-${String(data._id).slice(-8)}` : null) || `MQ-${Date.now().toString().slice(-8)}`;
    return {
      id: data._id,
      transactionId,
      machineryType: data.machinery_type,
      hours: data.hours || 0,
      clientName: data.client_name,
      serviceAmount: data.service_amount || data.invoice_amount,
      bonusAmount: data.bonus_amount || 0,
      transportAmount: data.transport_amount || 0,
      grossTotal: grossTotal || data.invoice_amount,
      commission,
      netTotal: grossTotal || data.invoice_amount,
      net_total: data.net_total ?? providerNet,
      date: data.created_at
    };
  };

  const getDemoService = (id) => {
    return normalizeServiceFromVoucher({
      id,
      transactionId: `MQ-${Date.now().toString().slice(-8)}`,
      machineryType: 'Retroexcavadora',
      hours: 4,
      clientName: 'Carlos González',
      serviceAmount: 180000,
      bonusAmount: 36000,
      transportAmount: 25000
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen no debe superar 5MB');
        return;
      }
      setInvoiceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) {
      alert('Ingresa el número de factura');
      return;
    }
    if (!invoiceImage) {
      alert('Debes adjuntar la imagen de la factura');
      return;
    }

    setSubmitting(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        if (serviceId) {
          const response = await fetch(`${BACKEND_URL}/api/services/${serviceId}/invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoice_number: invoiceNumber,
              invoice_image: base64,
              transaction_id: service?.transactionId
            })
          });
          if (response.ok) {
            alert('✅ Factura registrada. Pago en 2 días hábiles.');
            navigate('/provider/cobros');
          } else {
            alert('Error al registrar factura');
          }
        } else {
          alert('✅ Factura registrada (demo). Pago en 2 días hábiles.');
          navigate('/provider/cobros');
        }
        setSubmitting(false);
      };
      reader.readAsDataURL(invoiceImage);
    } catch (error) {
      alert('✅ Factura registrada (demo). Pago en 2 días hábiles.');
      navigate('/provider/cobros');
      setSubmitting(false);
    }
  };

  const formatPrice = (amount) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount || 0);

  if (loading) {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.95)' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  const isDesktop = window.innerWidth >= 768;

  return (
    <div className="maqgo-app" style={{ background: '#0F0F12', minHeight: '100vh' }}>
      <div style={{ maxWidth: isDesktop ? 600 : 500, margin: '0 auto', padding: isDesktop ? '24px 40px' : '20px', paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>
            Subir Factura
          </h1>
          <div style={{ width: 40 }}></div>
        </div>

        {/* ID de transacción */}
        {service?.transactionId && (
          <div style={{ background: '#2A2A2A', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>ID de transacción</span>
              <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{service.transactionId}</span>
            </div>
            <p style={{ color: '#EC6819', fontSize: 11, margin: '8px 0 0', fontWeight: 600 }}>
              ⚠️ Debes indicar este ID en tu factura para identificar el cobro
            </p>
          </div>
        )}

        {/* Desglose del proveedor — detalle menos tarifa por servicio */}
        <div style={{ background: '#1A1A1F', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>
            📄 TU DESGLOSE · Factura a MAQGO por:
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{service && MACHINERY_PER_TRIP.includes(getMachineryId(service.machinery_type || service.machineryType)) ? 'Servicio (viaje)' : `Servicio (${service?.hours}h)`}</span>
            <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(service?.serviceAmount)}</span>
          </div>
          {(service?.bonusAmount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Bonificación</span>
              <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(service?.bonusAmount)}</span>
            </div>
          )}
          {(service?.transportAmount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Traslado</span>
              <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(service?.transportAmount)}</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Subtotal</span>
              <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(service?.netTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Menos tarifa por servicio</span>
              <span style={{ color: '#F44336', fontSize: 13 }}>-{formatPrice(service?.commission || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Subtotal neto a facturar</span>
              <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(service?.net_total ?? 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>IVA (19%)</span>
              <span style={{ color: '#fff', fontSize: 13 }}>{formatPrice(Math.round((service?.net_total || 0) * 0.19))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Total a facturar (con IVA)</span>
              <span style={{ color: '#EC6819', fontSize: 16, fontWeight: 700 }}>{formatPrice(Math.round((service?.net_total || 0) * 1.19))}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: '8px 0 0' }}>
              Basado en el detalle de servicios menos tarifa por servicio. Este total debe aparecer en tu factura. Incluye el ID de transacción. Sube 24 h después del servicio · Pago en 2 días hábiles tras subirla
            </p>
          </div>
        </div>

        {/* La factura debe ser emitida a MAQGO y cargada aquí */}
        <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>La factura debe ser emitida a:</p>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, lineHeight: 1.8 }}>
            <p style={{ margin: 0 }}><strong>Razón Social:</strong> {MAQGO_BILLING.razonSocial}</p>
            <p style={{ margin: 0 }}><strong>RUT:</strong> {MAQGO_BILLING.rut}</p>
            <p style={{ margin: 0 }}><strong>Giro:</strong> {MAQGO_BILLING.giro}</p>
            <p style={{ margin: 0 }}><strong>Dirección:</strong> {MAQGO_BILLING.direccion}</p>
            {service?.transactionId && (
              <p style={{ margin: '10px 0 0', color: '#EC6819', fontWeight: 600 }}>
                Indica en la factura el ID: {service.transactionId}
              </p>
            )}
          </div>
        </div>

        {/* Número de factura */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 8, display: 'block' }}>
            N° de Factura <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: 12345"
            value={invoiceNumber}
            onChange={e => setInvoiceNumber(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>

        {/* Upload imagen */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 8, display: 'block' }}>
            Imagen de Factura <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input type="file" accept="image/*,.pdf" capture="environment" onChange={handleFileSelect} ref={fileInputRef} style={{ display: 'none' }} aria-label="Tomar foto o subir imagen de la factura" />
          {imagePreview ? (
            <div style={{ position: 'relative' }}>
              <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 12, background: '#1a1a1a' }} />
              <button onClick={() => { setInvoiceImage(null); setImagePreview(null); }} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: 30, background: '#2A2A2A', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" stroke="#666" strokeWidth="2"/><path d="M17 8L12 3L7 8" stroke="#666" strokeWidth="2"/><path d="M12 3V15" stroke="#666" strokeWidth="2"/></svg>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>Toca para subir foto de la factura</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>JPG, PNG o PDF (máx. 5MB)</span>
            </button>
          )}
        </div>
      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={!invoiceNumber.trim() || !invoiceImage || submitting}
          aria-busy={submitting}
          aria-label={submitting ? 'Subiendo factura' : 'Confirmar y enviar factura'}
          style={{ opacity: (invoiceNumber.trim() && invoiceImage && !submitting) ? 1 : 0.5 }}
        >
          {submitting ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Subiendo...
            </span>
          ) : (
            'Confirmar y Enviar Factura'
          )}
        </button>
      </div>
    </div>
  );
}

export default UploadInvoiceScreen;
