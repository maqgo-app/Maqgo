import React from 'react';
import MaqgoLogo from './MaqgoLogo';

/**
 * Componentes reutilizables MAQGO
 */

// Modal de Términos y Condiciones
export function TermsModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: '#2D2D2D',
        borderRadius: 16,
        maxWidth: 400,
        width: '100%',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>
            Términos y Condiciones
          </h3>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer'
          }}>×</button>
        </div>
        
        <div style={{
          padding: 20,
          overflowY: 'auto',
          flex: 1
        }}>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>1. Uso del Servicio</strong><br/>
            MAQGO es una plataforma que conecta clientes con proveedores de maquinaria pesada. Al usar nuestra app, aceptas estos términos.
          </p>
          
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>2. Responsabilidades</strong><br/>
            • El cliente es responsable de proporcionar acceso seguro al lugar de trabajo.<br/>
            • El proveedor es responsable de operar la maquinaria de forma segura y profesional.<br/>
            • MAQGO actúa como intermediario y no es responsable de daños durante el servicio.
          </p>
          
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>3. Pagos y Tarifa por Servicio</strong><br/>
            • MAQGO cobra una tarifa por servicio sobre cada arriendo.<br/>
            • Esta tarifa ya está incluida en el precio que ves en la app.<br/>
            • Los pagos se procesan de forma segura a través de nuestra plataforma.
          </p>
          
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>4. Cancelaciones</strong><br/>
            • Cancelación con más de 2 horas de anticipación: sin cargo.<br/>
            • Cancelación con menos de 2 horas: 20% del valor del servicio.<br/>
            • Si el operador no llega (no-show): cancelación sin cargo y reembolso completo.
          </p>
          
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>5. Regla de 30 Minutos</strong><br/>
            Si el cliente no da acceso al operador dentro de 30 minutos de su llegada, el servicio se inicia automáticamente y se cobra el tiempo completo.
          </p>
          
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
            <strong style={{ color: '#EC6819' }}>6. Disputas</strong><br/>
            Cualquier problema debe reportarse a través del soporte de la app.
          </p>
        </div>
        
        <div style={{ padding: 16, borderTop: '1px solid #444' }}>
          <button 
            onClick={onClose}
            style={{
              width: '100%',
              padding: 14,
              background: '#EC6819',
              border: 'none',
              borderRadius: 30,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// Botón de contacto (Chat in-app)
export function ContactButton({ onOpenChat, name }) {
  return (
    <button
      onClick={onOpenChat}
      style={{
        width: '100%',
        padding: '12px 14px',
        background: '#90BDD3',
        borderRadius: 10,
        border: 'none',
        color: '#1A1A1F',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Enviar mensaje a {name || 'operador'}
    </button>
  );
}

// Botones de contacto legacy (WhatsApp y Llamar) - DEPRECATED
export function ContactButtons({ phone, name }) {
  const phoneClean = phone?.replace(/\s/g, '') || '+56912345678';
  const whatsappMsg = encodeURIComponent(`Hola ${name || 'operador'}, te contacto por el servicio de MAQGO`);
  
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      marginTop: 12
    }}>
      <a 
        href={`https://wa.me/${phoneClean.replace('+', '')}?text=${whatsappMsg}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flex: 1,
          padding: '10px 14px',
          background: '#25D366',
          borderRadius: 10,
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </a>
      
      <a 
        href={`tel:${phoneClean}`}
        style={{
          flex: 1,
          padding: '10px 14px',
          background: '#363636',
          border: '1px solid #555',
          borderRadius: 10,
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        Llamar
      </a>
    </div>
  );
}

// Botón de favorito
export function FavoriteButton({ isFavorite, onToggle, size = 24 }) {
  return (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: 'pointer'
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={isFavorite ? '#EC6819' : 'none'} stroke="#EC6819" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  );
}

// Estimador de precio
export function PriceEstimator({ machineryType, hours }) {
  // Rangos de precio aproximados por tipo de maquinaria (CLP/hora)
  const PRICE_RANGES = {
    'retroexcavadora': { min: 40000, max: 55000 },
    'camion_tolva': { min: 35000, max: 50000 },
    'excavadora': { min: 55000, max: 75000 },
    'excavadora_hidraulica': { min: 55000, max: 75000 },
    'bulldozer': { min: 60000, max: 80000 },
    'motoniveladora': { min: 50000, max: 70000 },
    'grua': { min: 90000, max: 150000 },
    'grua_movil': { min: 90000, max: 150000 },
    'camion_pluma': { min: 45000, max: 60000 },
    'rodillo_compactador': { min: 38000, max: 52000 },
    'cargador_frontal': { min: 45000, max: 65000 },
    'compactadora': { min: 35000, max: 50000 },
    'camion_aljibe': { min: 30000, max: 45000 },
    'plataforma_elevadora': { min: 35000, max: 55000 },
    'telehandler': { min: 50000, max: 70000 },
    'minicargador': { min: 35000, max: 50000 },
  };
  
  const range = PRICE_RANGES[machineryType] || { min: 40000, max: 60000 };
  const minTotal = range.min * hours + 20000; // + traslado mínimo
  const maxTotal = range.max * hours + 35000; // + traslado máximo
  
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP',
      maximumFractionDigits: 0 
    }).format(price);
  };
  
  return (
    <div style={{
      background: 'rgba(236, 104, 25, 0.1)',
      border: '1px solid rgba(236, 104, 25, 0.3)',
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      textAlign: 'center'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        gap: 6,
        marginBottom: 6
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EC6819" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span style={{ color: '#EC6819', fontSize: 13, fontWeight: 600 }}>
          Precio estimado en tu zona
        </span>
      </div>
      <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>
        {formatPrice(minTotal)} - {formatPrice(maxTotal)}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, marginTop: 4 }}>
        Incluye traslado · Precio final puede variar
      </div>
    </div>
  );
}

// Header con perfil
export function HeaderWithProfile({ showBack = true, onBack, onProfile }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center',
      marginBottom: 20,
      padding: '0 4px'
    }}>
      {showBack ? (
        <button 
          onClick={onBack}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      ) : (
        <div style={{ width: 24 }} />
      )}
      
      <div style={{ flex: 1 }}><MaqgoLogo size="small" /></div>
      
      <button 
        onClick={onProfile}
        style={{ 
          background: '#363636', 
          border: 'none', 
          padding: 8,
          borderRadius: '50%',
          cursor: 'pointer'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
        </svg>
      </button>
    </div>
  );
}

export default {
  TermsModal,
  ContactButton,
  ContactButtons,
  FavoriteButton,
  PriceEstimator,
  HeaderWithProfile
};
