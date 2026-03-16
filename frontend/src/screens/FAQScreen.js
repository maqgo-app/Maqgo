import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAQGO_BILLING } from '../utils/commissions';

const FAQ_DATA = [
  {
    category: 'Clientes',
    questions: [
      {
        q: '¿Qué es MAQGO?',
        a: 'MAQGO es el marketplace que conecta empresas que necesitan maquinaria pesada con proveedores que la ofrecen. Encuentras disponibilidad y precios en minutos, arriendas por horas, días o semanas. MAQGO no es dueño de las máquinas: conectamos tu empresa directamente con proveedores verificados.'
      },
      {
        q: '¿Cómo solicito una maquinaria?',
        a: 'Selecciona el tipo de maquinaria que necesitas, elige cuándo la requieres (hoy, mañana o fecha específica), indica la cantidad de horas, marca la ubicación de tu obra en el mapa y elige entre los proveedores disponibles. Tu tarjeta solo se carga cuando un operador confirma tu solicitud.'
      },
      {
        q: '¿Cuál es la tarifa por servicio?',
        a: 'MAQGO cobra una tarifa por servicio sobre el valor del arriendo. Este monto ya está incluido en el precio que ves en la app.'
      },
      {
        q: '¿Qué es la bonificación por alta demanda?',
        a: 'Cuando solicitas una reserva para el mismo día, se aplica un porcentaje adicional sobre el precio por hora. Este monto se muestra claramente antes de confirmar.'
      },
      {
        q: '¿Cuándo se cobra mi tarjeta?',
        a: 'El cobro se realiza únicamente cuando un operador acepta tu solicitud. Mientras buscamos disponibilidad, no se realiza ningún cargo.'
      },
      {
        q: '¿Puedo cancelar una reserva?',
        a: 'Sí. Tienes una ventana para cancelar gratis según la urgencia (15 min a 1 hora). Después: asignado 20%, en camino 40%, en obra 60%. Si el operador no llega (no-show), puedes reportar y cancelar sin cargo con reembolso completo. El servicio iniciado no se puede cancelar.'
      },
      {
        q: '¿Cómo me comunico con el operador?',
        a: 'Una vez confirmada tu solicitud, puedes comunicarte con el operador a través del chat de MAQGO. El chat incluye mensajes rápidos para facilitar la coordinación.'
      },
      {
        q: '¿Recibiré factura?',
        a: 'Sí. MAQGO te emite la factura por la reserva. El proveedor factura a MAQGO (no a ti) por: neto + IVA menos la tarifa por servicio de la plataforma. También recibirás un Resumen de Servicio con el detalle completo.'
      },
      {
        q: '¿Qué pasa si el operador llega y no estoy?',
        a: 'Cuando el operador llega a tu obra, tienes 30 minutos para autorizar su ingreso a través de la app. Si no respondes en ese tiempo, el servicio comienza automáticamente.'
      },
      {
        q: '¿Qué pasa si el operador no llega (no-show)?',
        a: 'Si el operador no se presenta en el tiempo acordado, puedes reportar el no-show desde la app. La cancelación será sin cargo y recibirás reembolso completo.'
      },
      {
        q: '¿MAQGO es dueño de las máquinas?',
        a: 'No. MAQGO es un marketplace que conecta tu empresa con proveedores. Las máquinas y operadores pertenecen a las empresas proveedoras registradas en la plataforma.'
      },
      {
        q: '¿Cómo contacto a soporte?',
        a: 'A través del botón de WhatsApp disponible en toda la app. Respondemos en horario hábil de lunes a viernes.'
      }
    ]
  },
  {
    category: 'Proveedores',
    questions: [
      {
        q: '¿Cómo registro mi empresa?',
        a: 'Selecciona "Soy Proveedor", verifica tu número, completa los datos de tu empresa (razón social, RUT, giro), agrega tus maquinarias (fotos opcionales) y tarifas, configura tus datos bancarios y registra a tus operadores. Una vez completado, comenzarás a recibir solicitudes.'
      },
      {
        q: '¿Qué roles existen en mi cuenta?',
        a: 'Existen tres roles: Titular (dueño de la empresa, acceso completo), Gerente (gestiona servicios y operadores, sin acceso a datos bancarios) y Operador (solo ve y ejecuta los servicios asignados a él).'
      },
      {
        q: '¿Cómo invito operadores a mi equipo?',
        a: 'Desde la sección Máquinas, selecciona una maquinaria y usa "Agregar operador". Ingresa su nombre y teléfono. El operador recibirá un código de 6 dígitos por SMS y tú recibirás una confirmación. Cuando el operador ingrese el código, ambos recibirán un mensaje confirmando que está activo y asociado a la maquinaria.'
      },
      {
        q: '¿Qué ve cada rol en la app?',
        a: 'Titular y Gerente ven: Inicio, Máquinas, Cobros y Perfil. El Operador solo ve: Inicio (su disponibilidad y servicios asignados) y Perfil básico.'
      },
      {
        q: '¿Cuál es la tarifa por servicio?',
        a: 'MAQGO cobra una tarifa por servicio sobre el valor neto de cada arriendo. En tu Resumen de Servicio verás el desglose completo.'
      },
      {
        q: '¿Cuándo recibo mi pago?',
        a: 'Puedes subir la factura 24 horas después de terminado el servicio. El pago se deposita en tu cuenta en 2 días hábiles tras subir la factura.'
      },
      {
        q: '¿Cómo emito la factura a MAQGO?',
        a: 'La factura debe ser emitida a MAQGO y cargada en el sistema (Mis Cobros → subir factura). Incluye en la factura el ID de transacción de la reserva. El pago se realiza en 2 días hábiles tras subirla.'
      },
      {
        q: '¿A qué datos debe ir emitida la factura?',
        a: `La factura debe ser emitida a: Razón Social ${MAQGO_BILLING.razonSocial}, RUT ${MAQGO_BILLING.rut}, Giro ${MAQGO_BILLING.giro}, Dirección ${MAQGO_BILLING.direccion}. Indica el ID de transacción en la factura. Luego cárgala en la app (Mis Cobros).`
      }
    ]
  },
  {
    category: 'Operadores',
    questions: [
      {
        q: '¿Qué es "Soy operador (tengo código)"?',
        a: 'Cuando una empresa te asocia como operador de una maquinaria, recibes un código de 6 dígitos por SMS. Usa esta opción para ingresar ese código y quedar activo en MAQGO.'
      },
      {
        q: '¿Cómo me uno con mi código?',
        a: 'En la pantalla de inicio, toca "Soy operador (tengo código)", ingresa el código de 6 dígitos que recibiste por SMS, y quedarás activo y asociado a la maquinaria. Tanto tú como la empresa recibirán confirmación.'
      },
      {
        q: '¿Qué puedo hacer como operador?',
        a: 'Puedes ver tu disponibilidad, recibir solicitudes de reserva, aceptar o rechazar trabajos, marcar llegada y salida de obras, chatear con el cliente y ver tu historial de servicios realizados.'
      },
      {
        q: '¿Qué NO puedo ver como operador?',
        a: 'No tienes acceso a información financiera de la empresa, cobros, listado de otras máquinas ni datos bancarios. Solo ves lo relacionado a tus servicios asignados.'
      },
      {
        q: '¿Cómo sé cuándo tengo un servicio?',
        a: 'Recibirás una notificación en la app cuando te asignen un servicio. Verás los datos del cliente, ubicación de la obra, horario y duración estimada.'
      }
    ]
  }
];

function FAQScreen() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Clientes');

  const currentFAQ = FAQ_DATA.find(f => f.category === activeCategory);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 24, paddingBottom: 100 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <button 
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 8,
              marginRight: 12
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className="maqgo-h1">
            Preguntas frecuentes
          </h1>
        </div>

        {/* Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 4
        }}>
          {FAQ_DATA.map(cat => (
            <button
              key={cat.category}
              onClick={() => {
                setActiveCategory(cat.category);
                setOpenIndex(null);
              }}
              style={{
                padding: '10px 18px',
                borderRadius: 20,
                border: 'none',
                background: activeCategory === cat.category ? '#EC6819' : '#2A2A2A',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {cat.category}
            </button>
          ))}
        </div>

        {/* Preguntas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(currentFAQ?.questions ?? []).map((item, idx) => (
            <div 
              key={idx}
              style={{
                background: '#2A2A2A',
                borderRadius: 12,
                overflow: 'hidden'
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                style={{
                  width: '100%',
                  padding: 16,
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 12
                }}
              >
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                  {item.q}
                </span>
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none"
                  style={{
                    transform: openIndex === idx ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                    flexShrink: 0,
                    marginTop: 2
                  }}
                >
                  <path d="M6 9L12 15L18 9" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              
              {openIndex === idx && (
                <div style={{
                  padding: '0 16px 16px',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 14,
                  lineHeight: 1.6
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Links */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 16 }}>
            ¿Aún tienes dudas? Escríbenos a <span style={{ fontWeight: 600 }}>soporte@maqgo.cl</span>. Atendemos en horario hábil de lunes a viernes.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button
              onClick={() => navigate('/terms')}
              style={{
                background: 'none',
                border: 'none',
                color: '#90BDD3',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Términos y Condiciones
            </button>
            <button
              onClick={() => navigate('/privacy')}
              style={{
                background: 'none',
                border: 'none',
                color: '#90BDD3',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Política de Privacidad
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FAQScreen;
