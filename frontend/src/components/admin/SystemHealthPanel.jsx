import React, { useMemo, useState } from 'react';

/** Umbrales operativos — ajustar aquí según volumen real en producción */
const HEALTH_THRESHOLDS = {
  DISPUTES_CRITICAL: 5,
  DISPUTES_ELEVATED: 2,
  PENDING_CRITICAL: 35,
  PENDING_HIGH: 22,
  PENDING_MEDIUM: 10,
  INVOICED_NOTABLE: 5,
  RESERVATIONS_VOLUME_HIGH: 200
};

/**
 * Panel operativo de salud / riesgos para MAQGO Admin.
 * Deriva estado solo de stats/finances ya cargados (sin endpoints nuevos).
 */
function deriveHealth(stats, finances) {
  const T = HEALTH_THRESHOLDS;
  const pending = stats.pending_review || 0;
  const invoiced = stats.invoiced || 0;
  const maqgoInv = stats.maqgo_to_invoice || 0;
  const disputed = stats.disputed || 0;
  const total = stats.total || 0;

  const isCritical =
    disputed >= T.DISPUTES_CRITICAL || pending >= T.PENDING_CRITICAL;
  const hasOperationalQueue =
    disputed > 0 || pending > 0 || invoiced > 0 || maqgoInv > 0;

  let status = 'STABLE';
  if (isCritical) status = 'CRITICAL';
  else if (hasOperationalQueue) status = 'WARNING';

  const lenses = {
    stability: [
      pending ? `${pending} reserva(s) en revisión (cola operativa).` : 'Sin cola de revisión pendiente.',
      disputed ? `${disputed} reclamo(s) activo(s) — priorizar resolución.` : 'Sin reclamos abiertos en este snapshot.'
    ],
    performance: [
      'Latencia y SLO: el detalle está en el informe semanal (botón «Operación» en la barra superior de este panel).'
    ],
    security: [
      'Panel solo para rol admin; revisar permisos y auditoría en backend ante nuevas rutas admin.'
    ],
    scalability: [
      total > T.RESERVATIONS_VOLUME_HIGH
        ? `Volumen elevado de reservas (${total}). Revisar índices DB, paginación admin e informes.`
        : 'Volumen manejable; seguir monitoreando crecimiento e informes de operación.'
    ]
  };

  const risks = { critical: [], high: [], medium: [], low: [] };

  if (disputed >= T.DISPUTES_CRITICAL) {
    risks.critical.push(
      `Disputas elevadas (${disputed}) — riesgo de churn y carga en soporte.`
    );
  }
  if (pending >= T.PENDING_CRITICAL) {
    risks.critical.push(
      `Cola de revisión crítica (${pending}) — riesgo de retraso operativo y fricción con proveedores.`
    );
  }
  if (disputed >= T.DISPUTES_ELEVATED && disputed < T.DISPUTES_CRITICAL) {
    risks.high.push(
      `${disputed} reclamo(s) activo(s) — resolver antes de que escalen.`
    );
  }
  if (pending >= T.PENDING_HIGH && pending < T.PENDING_CRITICAL) {
    risks.high.push(
      `Cola de revisión alta (${pending}) — posible cuello de botella operativo.`
    );
  }
  if (pending > 0 && pending < T.PENDING_HIGH && pending >= T.PENDING_MEDIUM) {
    risks.medium.push(`Cola de revisión moderada (${pending}).`);
  }
  if (pending > 0 && pending < T.PENDING_MEDIUM) {
    risks.low.push(`Cola de revisión baja (${pending}) — mantener ritmo de revisión.`);
  }
  if (invoiced > T.INVOICED_NOTABLE) {
    risks.medium.push(`${invoiced} factura(s) en estado por pagar — seguimiento de cobros.`);
  }
  if (maqgoInv > 0) {
    risks.medium.push(`MAQGO debe facturar al cliente en ${maqgoInv} caso(s).`);
  }
  if (finances.disputed > 0 && disputed === 0) {
    risks.low.push('Contador de reclamos en métricas: verificar consistencia con filtros.');
  }

  const actions = [];
  if (pending > 0) actions.push('Revisar y aprobar/rechazar reservas pendientes.');
  if (invoiced > 0) actions.push('Revisar facturas subidas y marcar pagos según proceso.');
  if (maqgoInv > 0) actions.push('Emitir facturación MAQGO → cliente donde corresponda.');
  if (disputed > 0) actions.push('Gestionar disputas antes de que escalen.');
  if (actions.length === 0) actions.push('Mantener monitoreo con informe semanal y métricas financieras.');

  return { status, lenses, risks, actions };
}

const statusStyle = {
  STABLE: { bg: 'rgba(102, 187, 106, 0.12)', border: 'rgba(102, 187, 106, 0.4)', color: '#81C784' },
  WARNING: { bg: 'rgba(232, 163, 75, 0.12)', border: 'rgba(232, 163, 75, 0.4)', color: '#E8A34B' },
  CRITICAL: { bg: 'rgba(229, 115, 115, 0.12)', border: 'rgba(229, 115, 115, 0.4)', color: '#E57373' }
};

function RiskBlock({ title, items, emptyLabel }) {
  const list = items && items.length ? items : null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ color: '#EC6819', fontSize: 11, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </p>
      {list ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 1.5 }}>
          {list.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{emptyLabel}</p>
      )}
    </div>
  );
}

export default function SystemHealthPanel({ stats, finances, isDemoData = false }) {
  const h = useMemo(() => deriveHealth(stats || {}, finances || {}), [stats, finances]);
  const st = statusStyle[h.status] || statusStyle.STABLE;
  const [detailOpen, setDetailOpen] = useState(true);

  const scrollToOperacion = (e) => {
    e.preventDefault();
    const el = document.getElementById('admin-operacion');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus?.();
    }
  };

  return (
    <div
      style={{
        background: '#2A2A2A',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        border: `1px solid ${st.border}`
      }}
    >
      {isDemoData && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(232, 163, 75, 0.18)',
            border: '1px solid rgba(232, 163, 75, 0.5)',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: '#E8A34B', letterSpacing: 0.4 }}>DATOS DE DEMOSTRACIÓN</strong>
          {' — '}
          Las métricas, riesgos y acciones sugeridas se calculan sobre filas de ejemplo, no sobre producción. No usar
          para decisiones operativas hasta reconectar el API.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <h2
            style={{
              color: '#EC6819',
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          >
            MAQGO System Health
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '6px 0 0' }}>
            Resumen operativo y riesgos (derivado del estado actual del dashboard)
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '8px 0 0', lineHeight: 1.45 }}>
            Solo lectura: no hay menús ocultos. El texto de las tarjetas ya está expuesto. La etiqueta de estado (derecha) indica el nivel calculado;{' '}
            <strong style={{ color: 'rgba(255,255,255,0.75)' }}>no es un botón</strong>.
          </p>
        </div>
        <div
          role="status"
          aria-label={`Estado operativo: ${h.status}`}
          title="Estado automático según colas y disputas; no es interactivo"
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: st.bg,
            border: `1px solid ${st.border}`,
            color: st.color,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: 'default',
            userSelect: 'none'
          }}
        >
          {h.status}
        </div>
      </div>

      <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          style={{
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer'
          }}
          aria-expanded={detailOpen}
        >
          {detailOpen ? 'Ocultar detalle (riesgos y acciones)' : 'Mostrar detalle (riesgos y acciones)'}
        </button>
        <a
          href="#admin-operacion"
          onClick={scrollToOperacion}
          style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600 }}
        >
          Ir al botón «Operación» (informe semanal)
        </a>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16
        }}
      >
        {[
          { key: 'stability', label: 'Estabilidad', lines: h.lenses.stability },
          { key: 'performance', label: 'Rendimiento', lines: h.lenses.performance },
          { key: 'security', label: 'Seguridad', lines: h.lenses.security },
          { key: 'scalability', label: 'Escalabilidad', lines: h.lenses.scalability }
        ].map((block) => (
          <div
            key={block.key}
            style={{
              background: '#1a1a1a',
              borderRadius: 10,
              padding: 12,
              border: '1px solid rgba(255,255,255,0.06)',
              cursor: 'default'
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: '0 0 8px', textTransform: 'uppercase' }}>{block.label}</p>
            {block.lines.map((line, i) => (
              <p key={i} style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, margin: i ? '8px 0 0' : 0, lineHeight: 1.45 }}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      {detailOpen && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
            <RiskBlock title="Riesgos críticos" items={h.risks.critical} emptyLabel="Ninguno en este snapshot." />
            <RiskBlock title="Riesgos altos" items={h.risks.high} emptyLabel="Ninguno en este snapshot." />
            <RiskBlock title="Riesgos medios" items={h.risks.medium} emptyLabel="Ninguno destacado." />
            <RiskBlock title="Riesgos bajos" items={h.risks.low} emptyLabel="Ninguno." />
          </div>

          <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#EC6819', fontSize: 11, fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase' }}>Acciones sugeridas</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 1.55 }}>
              {h.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
