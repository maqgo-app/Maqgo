import React from 'react';
import { BackArrowIcon } from '../components/BackArrowIcon';
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

function PrivacyScreen() {
  const navigate = useNavigate();

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 24, paddingBottom: 60 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <button 
            onClick={() => navigate("/client/home")}
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
          <h1 className="maqgo-h1">
            Política de Privacidad
          </h1>
        </div>

        <Section title="1. Qué datos guardamos">
          <p style={{ marginBottom: 12 }}>
            <strong>Datos de registro:</strong> nombre, RUT, correo electrónico, número de 
            teléfono y dirección.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong>Datos de facturación:</strong> razón social, giro tributario y dirección 
            comercial para clientes y proveedores.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong>Datos de ubicación:</strong> coordenadas de la obra para clientes y 
            ubicación durante servicios activos para operadores.
          </p>
          <p>
            <strong>Datos de uso:</strong> historial de servicios, preferencias de búsqueda 
            y mensajes del chat.
          </p>
        </Section>

        <Section title="2. Para qué usamos tu info">
          <p style={{ marginBottom: 8 }}>Usamos tu información para:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Conectarte con proveedores cerca de ti</li>
            <li>Procesar pagos de forma segura</li>
            <li>Coordinar el servicio</li>
            <li>Emitir facturas cuando las necesites</li>
            <li>Avisarte del estado de tus servicios</li>
            <li>Mejorar la app</li>
          </ul>
        </Section>

        <Section title="3. Datos compartidos para facturación">
          <p>
            El proveedor factura a MAQGO (no al cliente) por: neto + IVA menos la tarifa por servicio. 
            Para ello, le facilitamos los datos tributarios de MAQGO. El cliente proporciona 
            sus datos para que MAQGO emita su factura. Los datos se comparten únicamente 
            cuando corresponde para cada facturación.
          </p>
        </Section>

        <Section title="4. Mensajería y comunicaciones">
          <p style={{ marginBottom: 12 }}>
            Los mensajes intercambiados a través del chat de MAQGO se almacenan para 
            facilitar la coordinación del servicio y resolver eventuales disputas.
          </p>
          <p>
            Los mensajes se eliminan automáticamente 30 días después de completado el 
            servicio, salvo que exista una disputa activa que requiera su conservación.
          </p>
        </Section>

        <Section title="5. Pagos y datos financieros">
          <p style={{ marginBottom: 12 }}>
            Los pagos van por Transbank Webpay. Tu tarjeta queda segura con ellos; nosotros 
            solo vemos que el pago se hizo.
          </p>
          <p>
            Los datos bancarios de los proveedores (para depósito de pagos) se almacenan 
            de forma encriptada y son accesibles únicamente para el procesamiento de pagos.
          </p>
        </Section>

        <Section title="6. Ubicación">
          <p style={{ marginBottom: 12 }}>
            <strong>Clientes:</strong> la ubicación de la obra se utiliza para asignar 
            proveedores cercanos y calcular tiempos de llegada estimados.
          </p>
          <p>
            <strong>Operadores:</strong> usamos tu ubicación solo cuando tienes un servicio 
            activo, para avisar al cliente cuánto falta para llegar.
          </p>
        </Section>

        <Section title="7. Seguridad">
          <p>
            Implementamos medidas técnicas y organizativas para proteger tu información 
            contra acceso no autorizado, alteración o destrucción. Esto incluye encriptación 
            de datos sensibles, acceso restringido a información personal y monitoreo 
            continuo de nuestros sistemas.
          </p>
        </Section>

        <Section title="8. Tus derechos">
          <p style={{ marginBottom: 12 }}>
            Puedes:
          </p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Acceder a tus datos personales almacenados</li>
            <li>Solicitar la rectificación de datos inexactos</li>
            <li>Solicitar la eliminación de tus datos</li>
            <li>Oponerte al tratamiento de tu información</li>
            <li>Solicitar la portabilidad de tus datos</li>
          </ul>
        </Section>

        <Section title="9. Contacto">
          <p>
            Para ejercer tus derechos o realizar consultas sobre el tratamiento de tus 
            datos personales, contáctanos a través del chat de soporte disponible en 
            la aplicación.
          </p>
        </Section>

        <p style={{ 
          color: 'rgba(255,255,255,0.5)', 
          fontSize: 12, 
          textAlign: 'center',
          marginTop: 32 
        }}>
          Última actualización: Enero 2026
        </p>
      </div>
    </div>
  );
}

export default PrivacyScreen;
