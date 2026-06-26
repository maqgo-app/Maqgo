import React, { useState } from 'react';
import { BackArrowIcon } from '../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import { MAQGO_BILLING } from '../utils/commissions';
import { useAuth } from '../context/authHooks';

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
        a: 'El precio final que ves en la app es el total a pagar por el servicio. Siempre verás el total antes de confirmar una reserva.'
      },
      {
        q: '¿Cómo calcula MAQGO el costo de traslado?',
        a: 'MAQGO calcula el traslado automáticamente según la comuna y región de origen declaradas para la maquinaria y la ubicación del servicio. Si el destino está en la misma comuna, aplica la tarifa "misma comuna"; si cambia la comuna pero se mantiene la región, aplica "comuna distinta, misma región"; y si cambia la región, solo aplica el tramo "región colindante" cuando la región destino colinda con la región origen y está dentro de 150 km.'
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
        a: 'Sí. Cancelación cliente (desde la aceptación): 0–60 min = 0% · 60–120 min = 20% · +120 min = 40%. Presencia confirmada en obra: a partir de este punto ya no puedes cancelar. Se considera presencia confirmada cuando existe evidencia suficiente, por ejemplo: llegada verificada, cliente autoriza ingreso, auto-start con llegada verificada o servicio iniciado. El sistema nunca cancela automáticamente un servicio; si no hay llegada registrada, se generan avisos críticos a 120, 180 y 240 minutos.'
      },
      {
        q: '¿Cómo me comunico con el operador?',
        a: 'Durante el servicio, revisa el estado del servicio y los avisos dentro de la app.'
      },
      {
        q: '¿Recibiré factura?',
        a: 'Sí. MAQGO te emite la factura por la reserva. El proveedor factura a MAQGO (no al cliente). También recibirás un Resumen de Servicio con el detalle del servicio.'
      },
      {
        q: '¿Qué pasa si el operador llega y no estoy?',
        a: 'Cuando el operador llega a tu obra, tienes 30 minutos para autorizar su ingreso a través de la app. Si no respondes en ese tiempo, el servicio comienza automáticamente.'
      },
      {
        q: '¿Qué pasa si el operador no llega (no-show)?',
        a: 'No hay cancelación automática por tiempo. Si no se registra llegada, se generan avisos críticos a 120, 180 y 240 minutos. Opciones: seguir esperando, contactar MAQGO o cancelar.'
      },
      {
        q: '¿MAQGO es dueño de las máquinas?',
        a: 'No. MAQGO es un marketplace que conecta tu empresa con proveedores. Las máquinas y operadores pertenecen a las empresas proveedoras registradas en la plataforma.'
      },
      {
        q: '¿Cómo contacto a soporte?',
        a: 'Desde la sección de soporte disponible en la aplicación. Respondemos en horario hábil de lunes a viernes.'
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
        q: '¿Cómo invito operadores?',
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
        q: '¿Cómo configuro el traslado de una máquina?',
        a: 'Para cada máquina declaras una base de origen y tres valores netos de traslado: misma comuna, comuna distinta pero misma región y región colindante (máx. 150 km). MAQGO usa esa base para calcular automáticamente lo que verá el cliente.'
      },
      {
        q: '¿Cómo declara MAQGO la ubicación de mi maquinaria?',
        a: 'Cada máquina queda con una base declarada de origen. Además puedes indicar si su ubicación en vivo viene desde una API de telemetría. El GPS del operador no se usa como ubicación base de la maquinaria, porque el operador puede estar lejos del equipo.'
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
        a: 'Puedes ver tu disponibilidad, recibir solicitudes de reserva, aceptar o rechazar trabajos, marcar llegada, reportar incidentes y ver tu historial de servicios realizados. El término del servicio ocurre automáticamente al cumplirse el endTime.'
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

const ROLE_GROUPS = {
  client: [
    {
      title: 'Sobre MAQGO',
      questions: ['¿Qué es MAQGO?', '¿MAQGO es dueño de las máquinas?'],
    },
    {
      title: 'Reservas',
      questions: [
        '¿Cómo solicito una maquinaria?',
        '¿Cuál es la tarifa por servicio?',
        '¿Cómo calcula MAQGO el costo de traslado?',
        '¿Qué es la bonificación por alta demanda?',
      ],
    },
    {
      title: 'Servicio',
      questions: ['¿Cómo me comunico con el operador?', '¿Qué pasa si el operador llega y no estoy?'],
    },
    {
      title: 'Pagos',
      questions: ['¿Cuándo se cobra mi tarjeta?', '¿Recibiré factura?'],
    },
    {
      title: 'Cancelaciones',
      questions: ['¿Puedo cancelar una reserva?', '¿Qué pasa si el operador no llega (no-show)?'],
    },
  ],
  provider: [
    {
      title: 'Registro y Roles',
      questions: [
        '¿Cómo registro mi empresa?',
        '¿Qué roles existen en mi cuenta?',
        '¿Cómo invito operadores?',
        '¿Qué ve cada rol en la app?',
      ],
    },
    {
      title: 'Maquinarias',
      questions: ['¿Cómo configuro el traslado de una máquina?', '¿Cómo declara MAQGO la ubicación de mi maquinaria?'],
    },
    {
      title: 'Cobros y Facturación',
      questions: [
        '¿Cuál es la tarifa por servicio?',
        '¿Cuándo recibo mi pago?',
        '¿Cómo emito la factura a MAQGO?',
        '¿A qué datos debe ir emitida la factura?',
      ],
    },
  ],
  operator: [
    {
      title: 'Activación',
      questions: ['¿Qué es "Soy operador (tengo código)"?', '¿Cómo me uno con mi código?'],
    },
    {
      title: 'Servicios',
      questions: [
        '¿Qué puedo hacer como operador?',
        '¿Qué NO puedo ver como operador?',
        '¿Cómo sé cuándo tengo un servicio?',
      ],
    },
  ],
};

function FAQScreen() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [openIndex, setOpenIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Clientes');

  const session = (() => {
    const isAuthenticated = Boolean(!auth.loading && auth.user?.id);
    const role =
      isAuthenticated && auth.user?.role === 'provider'
        ? auth.providerRole === 'operator'
          ? 'operator'
          : 'provider'
        : isAuthenticated && auth.user?.role === 'client'
          ? 'client'
          : null;
    return { isAuthenticated, role };
  })();

  const roleCategory = session.role === 'provider' ? 'Proveedores' : session.role === 'operator' ? 'Operadores' : 'Clientes';

  const selectedCategory = session.isAuthenticated ? roleCategory : activeCategory;
  const currentFAQ = FAQ_DATA.find((f) => f.category === selectedCategory);

  const grouped = (() => {
    if (!session.isAuthenticated || !session.role) return null;
    const groups = ROLE_GROUPS[session.role] || [];
    const byQuestion = new Map((currentFAQ?.questions ?? []).map((q) => [q.q, q]));
    return groups
      .map((g) => ({
        title: g.title,
        items: g.questions.map((qq) => byQuestion.get(qq)).filter(Boolean),
      }))
      .filter((g) => g.items.length > 0);
  })();

  const isAuthLoading = Boolean(auth.loading);

  return (
    <div className="maqgo-app maqgo-client-funnel" style={{ minHeight: '100vh', background: 'var(--maqgo-bg)' }}>
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 24, paddingBottom: 100, background: 'var(--maqgo-bg)' }}>
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
            <BackArrowIcon />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <h1 className="maqgo-h1" style={{ margin: 0, color: '#EC6819' }}>
              Preguntas frecuentes
            </h1>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, lineHeight: 1.25 }}>
              Respuestas claras para clientes, proveedores y operadores
            </div>
          </div>
        </div>

        {isAuthLoading ? (
          <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 800 }}>Cargando…</div>
          </div>
        ) : (
          <>

            {!session.isAuthenticated && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 24,
                  overflowX: 'auto',
                  paddingBottom: 4,
                }}
              >
                {FAQ_DATA.map((cat) => (
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
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped
                ? (() => {
                    let globalIndex = 0;
                    return grouped.flatMap((g, gi) => {
                      const header = (
                        <div
                          key={`h-${gi}`}
                          style={{
                            marginTop: gi === 0 ? 0 : 10,
                            padding: '10px 12px',
                            borderRadius: 12,
                            background: 'rgba(236, 104, 25, 0.10)',
                            border: '1px solid rgba(236, 104, 25, 0.22)',
                          }}
                        >
                          <div
                            style={{
                              color: '#EC6819',
                              fontSize: 13,
                              fontWeight: 900,
                              letterSpacing: 0.2,
                            }}
                          >
                            {g.title}
                          </div>
                        </div>
                      );

                      const items = g.items.map((item) => {
                        const idx = globalIndex;
                        globalIndex += 1;
                        return (
                          <div
                            key={`${g.title}-${item.q}`}
                            style={{
                              background: '#2A2A2A',
                              borderRadius: 12,
                              overflow: 'hidden',
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
                                gap: 12,
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
                                  marginTop: 2,
                                }}
                              >
                                <path d="M6 9L12 15L18 9" stroke="#888" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>

                            {openIndex === idx && (
                              <div
                                style={{
                                  padding: '0 16px 16px',
                                  color: 'rgba(255,255,255,0.8)',
                                  fontSize: 14,
                                  lineHeight: 1.6,
                                }}
                              >
                                {item.a}
                              </div>
                            )}
                          </div>
                        );
                      });

                      return [header, ...items];
                    });
                  })()
                : (currentFAQ?.questions ?? []).map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#2A2A2A',
                        borderRadius: 12,
                        overflow: 'hidden',
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
                          gap: 12,
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
                            marginTop: 2,
                          }}
                        >
                          <path d="M6 9L12 15L18 9" stroke="#888" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>

                      {openIndex === idx && (
                        <div
                          style={{
                            padding: '0 16px 16px',
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: 14,
                            lineHeight: 1.6,
                          }}
                        >
                          {item.a}
                        </div>
                      )}
                    </div>
                  ))}
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}

export default FAQScreen;
