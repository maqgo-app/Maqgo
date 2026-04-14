import React from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { MAQGO_BILLING } from '../../utils/commissions';
import { useBackRoute } from '../../hooks/useBackRoute';

/**
 * Pantalla: Datos de MAQGO para facturar
 * El proveedor que emite factura debe facturar a MAQGO (no al cliente).
 * Estos datos se muestran también en onboarding y en la pantalla de subir factura.
 */
function MaqgoBillingScreen() {
  const navigate = useNavigate();
  const { back } = useBackRoute('provider', '/provider/profile');

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <button
            onClick={back}
            style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
        </div>

        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
          Facturación a MAQGO
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          La factura debe ser emitida a los datos indicados abajo y cargada en el sistema (Mis Cobros → subir factura).
        </p>

        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16
        }}>
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, lineHeight: 2 }}>
            <p style={{ margin: 0 }}><strong>Razón Social:</strong> {MAQGO_BILLING.razonSocial}</p>
            <p style={{ margin: 0 }}><strong>RUT:</strong> {MAQGO_BILLING.rut}</p>
            <p style={{ margin: 0 }}><strong>Giro:</strong> {MAQGO_BILLING.giro}</p>
            <p style={{ margin: 0 }}><strong>Dirección:</strong> {MAQGO_BILLING.direccion}</p>
          </div>
        </div>

        <div style={{
          background: 'rgba(236, 104, 25, 0.1)',
          borderRadius: 10,
          padding: 14,
          border: '1px solid rgba(236, 104, 25, 0.3)'
        }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Incluye en la factura el ID de transacción del servicio. Tras subirla, el pago se realiza en 2 días hábiles.
          </p>
        </div>
      </div>
    </div>
  );
}

export default MaqgoBillingScreen;
