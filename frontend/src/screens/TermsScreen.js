import React, { useMemo, useState } from 'react';
import { BackArrowIcon } from '../components/BackArrowIcon';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth, hasPersistedSessionCredentials } from '../utils/api';
import { useAuth } from '../context/authHooks';

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const acceptMode = searchParams.get('accept') === '1';
  const nextPath = useMemo(() => {
    const raw =
      String(searchParams.get('next') || location.state?.next || '').trim() ||
      '';
    if (raw.startsWith('/')) return raw;
    if (auth.user?.role === 'provider') return auth.providerRole === 'operator' ? '/operator/home' : '/provider/home';
    return '/client/home';
  }, [searchParams, location.state, auth.user?.role, auth.providerRole]);

  const paddingBottom = acceptMode ? 160 : 60;

  const acceptAndContinue = async () => {
    if (saving) return;
    setSaveError('');
    if (!accepted) return;
    if (!hasPersistedSessionCredentials()) {
      navigate('/login', { replace: true, state: { redirect: nextPath, entry: 'client' } });
      return;
    }
    const userId = String(localStorage.getItem('userId') || '').trim();
    if (!userId) {
      navigate('/login', { replace: true, state: { redirect: nextPath, entry: 'client' } });
      return;
    }
    setSaving(true);
    try {
      const ts = new Date().toISOString();
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/users/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ legalAcceptedAt: ts }),
        },
        8000
      );
      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = String(j?.detail || '').trim();
        } catch {
          detail = '';
        }
        setSaveError(detail || `No pudimos guardar tu aceptación (${res.status}). Intenta nuevamente.`);
        return;
      }
      try {
        localStorage.setItem('legalAcceptedAt', ts);
      } catch {
        void 0;
      }
      navigate(nextPath, { replace: true });
    } catch (e) {
      setSaveError(e?.message || 'No pudimos guardar tu aceptación. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 24, paddingBottom }}>
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
            <li><strong>MAQGO actúa como intermediario de cobro.</strong> Facilita facturación y pago entre las partes. El cobro al cliente y el pago al proveedor se gestionan a través de la plataforma.</li>
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
            incluir el número de reserva único del servicio (ejemplo: MAQGO-2026-00001) para su correcta identificación.
          </p>
          <p>
            MAQGO actúa como intermediario de cobro entre cliente y proveedor.
          </p>
          <p style={{ marginTop: 12 }}>
            Cuando una maquinaria cobra traslado, MAQGO calcula ese valor automáticamente según la comuna y región de origen declaradas para la maquinaria y la ubicación del servicio ingresada por el cliente. Los tramos vigentes son: misma comuna, comuna distinta dentro de la misma región y región colindante dentro de 150 km.
          </p>
        </Section>

        <Section title="3. Pagos a proveedores">
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
          <p>La bonificación se traslada al proveedor como ingreso adicional por su disponibilidad.</p>
        </Section>

        <Section title="5. Comunicación">
          <p>
            Durante el servicio, revisa el estado del servicio y los avisos dentro de la app.
          </p>
        </Section>

        <Section title="6. Cancelaciones">
          <p style={{ marginBottom: 12 }}>
            MAQGO favorece la ejecución exitosa del servicio por sobre la cancelación. El sistema nunca cancela automáticamente un servicio.
          </p>
          <p style={{ marginBottom: 12 }}>
            Reserva Programada: más de 48 horas antes = 0% · entre 48 y 24 horas = 10% · 24 horas o menos = 20% · autorizar ingreso = 100% · servicio iniciado = 100%.
          </p>
          <p style={{ marginBottom: 12 }}>
            Reserva para Hoy: antes de aceptación del proveedor = 0% · después de aceptación del proveedor = 20% · autorizar ingreso = 100% · servicio iniciado = 100%.
          </p>
          <p style={{ marginBottom: 12 }}>
            Para reservas del mismo día existe un límite máximo absoluto de atraso de 4 horas desde la hora comprometida. Este límite no se modifica por nuevas ETA. Si se supera el límite, el cliente puede cancelar sin costo y MAQGO puede intentar reasignar el servicio.
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
          <p style={{ marginBottom: 12 }}>
            <strong>Ubicación declarada de la maquinaria:</strong> El proveedor debe mantener actualizada la base u origen declarado de cada máquina. Esa ubicación se usa para referencia logística y cálculo de traslado. Si la máquina cuenta con telemetría compatible, el proveedor puede informar esa fuente como ubicación en vivo.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong>GPS del operador:</strong> El GPS del operador no define por sí solo la ubicación base de la maquinaria, ya que el operador puede encontrarse en un punto distinto al equipo.
          </p>
          <p>
            <strong>Del cliente:</strong> Proporcionar acceso seguro al lugar de trabajo, 
            asegurar condiciones adecuadas para la operación de la maquinaria, y estar 
            disponible durante el servicio.
          </p>
        </Section>

        <Section title="10. Contacto">
          <p>
            Para consultas o sugerencias, contáctanos desde Ayuda y Soporte dentro de la app.
          </p>
          <p>Las disputas deben ingresarse dentro de las primeras 24 horas desde finalizado el servicio.</p>
        </Section>

      </div>
      {acceptMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(18, 21, 27, 0.96)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div className="maqgo-checkbox-row" style={{ marginBottom: 10 }}>
              <div
                className={`maqgo-checkbox ${accepted ? 'checked' : ''}`}
                onClick={() => {
                  setAccepted(!accepted);
                  if (saveError) setSaveError('');
                }}
                role="checkbox"
                aria-checked={accepted}
              >
                {accepted && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M2 6L4.5 8.5L10 3"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="maqgo-checkbox-label" style={{ lineHeight: 1.35 }}>
                Acepto los Términos y Condiciones y{' '}
                <button
                  type="button"
                  className="maqgo-link"
                  onClick={() => navigate('/privacy')}
                  style={{ padding: 0, border: 'none', background: 'none', font: 'inherit', cursor: 'pointer' }}
                >
                  Política de Privacidad
                </button>
              </span>
            </div>

            {saveError ? (
              <p style={{ margin: '0 0 10px', color: '#ffb182', fontSize: 12, lineHeight: 1.45 }}>
                {saveError}
              </p>
            ) : null}

            <button
              type="button"
              className="maqgo-btn-primary"
              onClick={acceptAndContinue}
              disabled={!accepted || saving}
              style={{ width: '100%', opacity: !accepted || saving ? 0.6 : 1 }}
            >
              {saving ? 'Guardando...' : 'Aceptar y continuar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TermsScreen;
