import React from 'react';
import { useNavigate } from 'react-router-dom';

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        color: '#EC6819',
        fontSize: 15,
        fontWeight: 600,
        marginBottom: 12
      }}>
        {title}
      </h2>
      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

function TermsScreen() {
  const navigate = useNavigate();

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 24, paddingBottom: 60 }}>
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
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 className="maqgo-h1">
            Términos y Condiciones
          </h1>
        </div>

        <Section title="1. Sobre MAQGO">
          <p style={{ marginBottom: 12 }}>
            MAQGO es una plataforma tecnológica que conecta a clientes que requieren maquinaria pesada 
            con proveedores que ofrecen estos servicios.
          </p>
          <p style={{ marginBottom: 12, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
            Es importante que queden claros los siguientes puntos:
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
            <li><strong>MAQGO actúa como intermediario de cobro.</strong> Facilita la coordinación, 
            facturación y pago entre las partes. El cobro al cliente y el pago al proveedor se gestionan 
            a través de la plataforma.</li>
            <li><strong>MAQGO no es dueño de la maquinaria.</strong> No es propietario de las 
            maquinarias ni empleador de los operadores. Los proveedores son independientes y 
            ofrecen sus propios equipos.</li>
            <li><strong>El proveedor es responsable de la ejecución.</strong> La prestación del 
            servicio, el funcionamiento de la maquinaria y el cumplimiento de los acuerdos son 
            responsabilidad exclusiva del proveedor.</li>
          </ul>
          <p>
            MAQGO facilita la conexión entre las partes; la relación contractual y la ejecución 
            del trabajo son entre cliente y proveedor.
          </p>
        </Section>

        <Section title="2. Precios y facturación">
          <p style={{ marginBottom: 12 }}>
            Todos los precios mostrados en MAQGO incluyen IVA. El valor que ves es el valor final 
            que pagarás como cliente.
          </p>
          <p style={{ marginBottom: 12 }}>
            El cliente paga a MAQGO. Si solicita factura, esta se emite dentro de los plazos legales 
            correspondientes al mes en que fue contratado y pagado el servicio, y se envía al correo 
            electrónico que indique.
          </p>
          <p style={{ marginBottom: 12 }}>
            El proveedor debe facturar a MAQGO por el servicio realizado. MAQGO pone a su 
            disposición los datos de facturación una vez completado el servicio. La factura debe 
            considerar <strong>neto + IVA menos la tarifa por servicio</strong> de la plataforma, 
            e incluir el número de reserva único del servicio (ejemplo: MAQGO-2026-00001) para 
            su correcta identificación.
          </p>
          <p>
            MAQGO actúa como intermediario de cobro entre cliente y proveedor.
          </p>
        </Section>

        <Section title="3. Tarifa por Servicio">
          <p style={{ marginBottom: 12 }}>
            MAQGO cobra una Tarifa por Servicio sobre cada transacción completada. Esta tarifa 
            se muestra de forma transparente en el desglose del precio antes de confirmar 
            cualquier reserva.
          </p>
          <p>
            Los pagos a proveedores se realizan mediante depósito bancario. El proveedor 
            puede subir su factura 24 horas después de terminado el servicio; el pago se 
            efectúa en 2 días hábiles tras la subida de la factura.
          </p>
        </Section>

        <Section title="4. Bonificación por alta demanda">
          <p style={{ marginBottom: 12 }}>
            Para reservas solicitadas con inicio el mismo día, se aplica una bonificación 
            que incentiva la disponibilidad inmediata de los proveedores.
          </p>
          <p style={{ marginBottom: 12 }}>
            El porcentaje de bonificación varía según el tipo de maquinaria, las horas 
            contratadas y la urgencia del servicio. Este monto se muestra claramente 
            en el desglose antes de confirmar la reserva.
          </p>
          <p>
            La bonificación se traslada al proveedor como ingreso adicional por su 
            disponibilidad, descontando la tarifa de servicio correspondiente.
          </p>
        </Section>

        <Section title="5. Comunicación">
          <p>
            Una vez confirmado el servicio, cliente y operador pueden coordinarse a través 
            del chat integrado de MAQGO. El chat incluye mensajes predefinidos para 
            facilitar la comunicación durante el desplazamiento del operador.
          </p>
        </Section>

        <Section title="6. Cancelaciones">
          <p style={{ marginBottom: 12 }}>
            Cuando el operador acepta, tu reserva queda confirmada. Tienes un tiempo para cancelar 
            gratis (depende de la urgencia):
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
            <li><strong>Urgente</strong> (menos de 2 h): si cancelas, hay cargo desde que acepten</li>
            <li><strong>Express</strong> (2 a 4 h): 15 min para cancelar gratis</li>
            <li><strong>Hoy</strong> (más de 4 h): 30 min para cancelar gratis</li>
            <li><strong>Programado</strong> (otro día): 1 hora para cancelar gratis</li>
          </ul>
          <p style={{ marginBottom: 12 }}>
            Si cancelas después de ese tiempo:
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
            <li>Asignado: 20%</li>
            <li>En camino: 40%</li>
            <li>En obra: 60%</li>
            <li>Ya empezó: el servicio sigue en curso</li>
          </ul>
          <p style={{ marginBottom: 12 }}>
            <strong>No-show del operador:</strong> Si el operador no llega (no se presenta), 
            puedes reportar el no-show y cancelar sin cargo. La ventana para hacerlo depende de 
            si el operador informó algo en ruta (ej. tráfico): si no informó nada, puedes 
            cancelar sin cargo después de 60 minutos desde la hora de llegada indicada (ETA); 
            si sí informó en ruta, después de 90 minutos desde la ETA. Recibirás reembolso completo.
          </p>
          <p>
            Las reservas programadas (varios días) deben ser días consecutivos. El domingo no 
            está disponible. Viernes y lunes se consideran consecutivos (algunos proveedores 
            no trabajan sábado); si el proveedor trabaja sábado, puedes incluir sábado entre 
            viernes y lunes.
          </p>
        </Section>

        <Section title="7. Regla de los 30 minutos e inicio automático">
          <p>
            Cuando el operador llega a la obra, tienes 30 min para autorizar su ingreso en la app. 
            Si no lo dejas entrar en ese plazo, aplica la regla de negocio de inicio automático: 
            el servicio se inicia solo y se cobra según lo acordado. Así cuidamos el tiempo del operador.
          </p>
        </Section>

        <Section title="8. Roles y permisos">
          <p style={{ marginBottom: 12 }}>
            Las cuentas de proveedor tienen tres niveles de acceso:
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>Titular:</strong> Dueño de la empresa con acceso completo. Puede ver y 
            administrar máquinas, operadores, cobros, datos bancarios y toda la configuración.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>Gerente:</strong> Puede gestionar servicios, ver cobros y administrar 
            operadores. No puede modificar datos bancarios ni información crítica de la empresa.
          </p>
          <p>
            <strong>Operador:</strong> Ejecuta los servicios asignados. Solo puede ver su 
            estado de disponibilidad y los servicios que tiene asignados. No tiene acceso 
            a información financiera, listado de máquinas ni datos de otros operadores.
          </p>
        </Section>

        <Section title="9. Responsabilidades">
          <p style={{ marginBottom: 12 }}>
            <strong>Del proveedor:</strong> El proveedor es responsable de la ejecución del servicio. 
            Debe garantizar el correcto funcionamiento de su maquinaria, contar con todos los permisos, 
            seguros y certificaciones exigidos por la normativa vigente, y cumplir con los horarios 
            acordados. MAQGO no es propietario de la maquinaria ni responsable de su operación.
          </p>
          <p>
            <strong>Del cliente:</strong> Proporcionar acceso seguro al lugar de trabajo, 
            asegurar condiciones adecuadas para la operación de la maquinaria, y estar 
            disponible para coordinar el servicio.
          </p>
        </Section>

        <Section title="10. Contacto">
          <p>
            Para consultas, reclamos o sugerencias, contáctanos a través del chat de soporte 
            disponible en la aplicación.
          </p>
        </Section>

        <p style={{ 
          color: 'rgba(255,255,255,0.5)', 
          fontSize: 12, 
          textAlign: 'center',
          marginTop: 32 
        }}>
          Última actualización: Marzo 2026
        </p>
      </div>
    </div>
  );
}

export default TermsScreen;
