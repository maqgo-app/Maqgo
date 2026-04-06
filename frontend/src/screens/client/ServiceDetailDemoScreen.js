import React, { useState } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ServiceDetailBreakdown from '../../components/ServiceDetailBreakdown';

/**
 * Pantalla de demostración: Detalle de Servicio
 * Muestra el componente ServiceDetailBreakdown en las 3 variantes
 * Acceso: /client/detalle-servicio
 */
// Ejemplo: Retro 5h + 1 día (subtotal 1.145.000)
const EXAMPLE_SERVICE = {
  serviceAmount: 400000,   // Base hoy 5h
  bonusAmount: 70000,      // Alta demanda
  transportAmount: 35000,
  additionalDays: 1,
  additionalCost: 640000,  // 8h × 80.000
  todayHours: 5,
  net_total: 1008745      // Lo que recibe el proveedor
};

function ServiceDetailDemoScreen() {
  const navigate = useNavigate();
  const [variant, setVariant] = useState('client');

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 100px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Detalle de Servicio</span>
          </div>
          

        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          Ejemplo: Retro 5h + 1 día · $1.145.000 subtotal
        </p>

        {/* Selector de vista */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['client', 'provider', 'admin'].map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              style={{
                flex: 1,
                padding: 12,
                background: variant === v ? '#EC6819' : '#2A2A2A',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {v === 'client' ? 'Cliente' : v === 'provider' ? 'Proveedor' : 'Admin'}
            </button>
          ))}
        </div>

        {/* Etiqueta de la vista */}
        <p style={{ color: '#90BDD3', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
          Vista: {variant === 'client' ? 'Cliente (ve total a pagar)' : variant === 'provider' ? 'Proveedor (no ve total cliente ni % MAQGO)' : 'Admin (ve todo)'}
        </p>

        {/* Componente */}
        <ServiceDetailBreakdown
          service={EXAMPLE_SERVICE}
          variant={variant}
          needsInvoice={variant !== 'provider'}
        />
      </div>
    </div>
  );
}

export default ServiceDetailDemoScreen;
