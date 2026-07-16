import React, { useState } from 'react';
import { BackArrowIcon } from '../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import { MAQGO_BILLING } from '../utils/commissions';
import { useAuth } from '../context/authHooks';

const SERVICE_FEE_QA = {
  q: '¿Cuál es la tarifa por servicio?',
  a: 'El precio final que ves en la app es el total a pagar por el servicio. Siempre verás el total antes de confirmar una reserva.'
};

const FAQ_DATA = [
  {
    category: 'Clientes',
    questions: [
      {
        q: '¿Qué es MAQGO?',
        a: 'MAQGO es una plataforma tecnológica que conecta a clientes que requieren maquinaria pesada con proveedores que ofrecen estos servicios.'
      },
      {
        q: '¿MAQGO es dueño de las máquinas?',
        a: 'MAQGO no es dueño de la maquinaria. No es propietario de las maquinarias ni empleador de los operadores. Los proveedores son independientes y ofrecen sus propios equipos.'
      },
      {
        q: '¿Cómo solicito una maquinaria?',
        a: 'Selecciona el tipo de maquinaria, define cuándo la necesitas (hoy, mañana o una fecha específica), indica la duración y confirma la ubicación de tu obra. Luego revisa las opciones disponibles y confirma tu solicitud.'
      },
      SERVICE_FEE_QA,
      {
        q: '¿Cómo calcula MAQGO el costo de traslado?',
        a: 'MAQGO calcula el traslado automáticamente según la comuna y región de origen declaradas para la maquinaria y la ubicación del servicio. Si el destino está en la misma comuna, aplica la tarifa "misma comuna"; si cambia la comuna pero se mantiene la región, aplica "comuna distinta, misma región"; y si cambia la región, solo aplica el tramo "región colindante" cuando la región destino colinda con la región origen y está dentro de 150 km.'
      },
      {
        q: '¿Qué es la bonificación por alta demanda?',
        a: 'Cuando solicitas una reserva para el mismo día, se aplica un porcentaje adicional sobre el precio por hora. Este monto se muestra claramente antes de confirmar.'
      },
      {
        q: '¿Qué pasa si el operador no llega (no-show)?',
        a: 'No hay cancelación automática por tiempo. Para reservas del mismo día existe un límite máximo absoluto de atraso de 4 horas desde la hora comprometida. Si se supera ese límite, el cliente puede cancelar sin costo y MAQGO puede intentar reasignar el servicio.'
      },
      {
        q: '¿Recibiré factura?',
        a: 'Sí. MAQGO te emite la factura por la reserva. El proveedor factura a MAQGO (no al cliente). También recibirás un Resumen de Servicio con el detalle del servicio.'
      },
      {
        q: '¿Cuándo se cobra mi tarjeta?',
        a: 'El cobro se realiza únicamente cuando un proveedor acepta tu solicitud. Mientras buscamos disponibilidad, no se realiza ningún cargo.'
      },
      {
        q: '¿Qué pasa si el operador llega y no estoy?',
        a: 'Cuando el operador llega a tu obra, tienes 30 minutos para autorizar su ingreso a través de la app. Si no respondes en ese tiempo, el servicio comienza automáticamente.'
      },
      {
        q: '¿Puedo cancelar una reserva?',
        a: 'Sí. La política depende del tipo de reserva. Reserva Programada: más de 48 horas antes = 0% · entre 48 y 24 horas = 10% · 24 horas o menos = 20% · autorizar ingreso = 100% · servicio iniciado = 100%. Reserva para Hoy: antes de aceptación del proveedor = 0% · después de aceptación del proveedor = 20% · autorizar ingreso = 100% · servicio iniciado = 100%. Para reservas del mismo día existe un límite máximo absoluto de atraso de 4 horas. Este límite no se modifica por nuevas ETA. Si se supera el límite, el cliente puede cancelar sin costo y MAQGO puede intentar reasignar el servicio.'
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
        a: 'Selecciona "Soy Proveedor", verifica tu número y completa los datos de tu empresa (razón social, RUT y giro). Luego registra tus maquinarias (fotos opcionales) y tarifas, configura los datos bancarios y agrega operadores. Al finalizar, podrás recibir solicitudes.'
      },
      {
        q: '¿Qué roles existen en mi cuenta?',
        a: 'Existen tres roles: Titular (dueño de la empresa, acceso completo), Gerente (gestiona servicios y operadores, sin acceso a datos bancarios) y Operador (solo ve y ejecuta los servicios asignados a él).'
      },
      {
        q: '¿Cómo invito operadores?',
        a: 'Desde Máquinas, selecciona una maquinaria y usa "Agregar operador". Ingresa nombre y RUT del operador para generar un código de invitación. Compártelo con tu operador para que lo ingrese en "Soy operador (tengo código)" y active su cuenta.'
      },
      {
        q: '¿Qué ve cada rol en la app?',
        a: 'Titular y Gerente ven: Inicio, Máquinas, Cobros y Perfil. El Operador solo ve: Inicio, Avisos e Historial.'
      },
      SERVICE_FEE_QA,
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
        a: 'Puedes subir la factura 24 horas después de finalizado el servicio. El pago se deposita en tu cuenta en 2 días hábiles desde la carga de la factura.'
      },
      {
        q: '¿Cómo emito la factura a MAQGO?',
        a: 'La factura debe ser emitida a MAQGO y cargada en el sistema (Mis Cobros → Subir factura). Incluye el ID de transacción de la reserva. El pago se realiza en 2 días hábiles desde la carga.'
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
        a: 'Cuando una empresa te asocia como operador, genera un código de invitación y te lo comparte. Usa esta opción para ingresar el código y activar tu cuenta.'
      },
      {
        q: '¿Cómo me uno con mi código?',
        a: 'En la pantalla de inicio, selecciona "Soy operador (tengo código)", ingresa el código de invitación y quedarás activo y asociado a la empresa. Luego iniciarás sesión con tu código SMS de MAQGO.'
      },
      {
        q: '¿Qué puedo hacer como operador?',
        a: 'Puedes ver y ejecutar los servicios asignados a ti, notificar tu llegada, reportar incidentes, revisar avisos y consultar tu historial. El término del servicio ocurre automáticamente al cumplirse la hora de término programada.'
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
      questions: ['¿Qué pasa si el operador no llega (no-show)?', '¿Qué pasa si el operador llega y no estoy?'],
    },
    {
      title: 'Pagos',
      questions: ['¿Cuándo se cobra mi tarjeta?', '¿Recibiré factura?'],
    },
    {
      title: 'Cancelaciones',
      questions: ['¿Puedo cancelar una reserva?'],
    },
    {
      title: 'Ayuda',
      questions: ['¿Cómo contacto a soporte?'],
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
              Información para clientes, proveedores y operadores
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
                      background: activeCategory === cat.category ? '#EC6819' : 'rgba(255,255,255,0.06)',
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
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              borderRadius: 14,
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
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 14,
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
