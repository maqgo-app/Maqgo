import React from 'react';

/**
 * Segmentos conectados — misma línea visual continua en flujo cliente y onboarding proveedor.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │ ● ● ● ● ● ●  (izquierda)   P1/6 →  │
 *   │ sublabel opcional (ancho completo)   │
 *   └──────────────────────────────────────┘
 *
 * Paso activo = segmento ancho; completados = color marca; pendientes = tenue.
 */
function StepProgressSegments({
  totalSteps,
  currentStep,
  sublabel,
  labels = [],
  compact = false,
  className = '',
  /** (stepNum) => true si el segmento es clicable (p. ej. volver a un paso ya visitado) */
  stepClickable,
  onStepClick,
  ariaLabel,
}) {
  const total = Math.max(1, totalSteps);
  const cs = Math.min(total, Math.max(1, currentStep || 1));
  const activeW = compact ? 20 : 24;
  const inactiveW = compact ? 8 : 10;
  const segH = compact ? 8 : 10;
  const connectorW = compact ? 10 : 12;
  const resolvedSublabel =
    sublabel != null && sublabel !== ''
      ? sublabel
      : labels[cs - 1] || '';

  const items = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className={`maqgo-step-progress ${compact ? 'maqgo-step-progress--compact' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {/* Fila principal: círculos izquierda · contador derecha */}
      <div className="maqgo-step-progress__header">
        <div className="maqgo-step-progress__segments-row" aria-hidden>
          {items.map((stepNum, index) => {
            const isActive = stepNum === cs;
            const isPast = stepNum < cs;
            const clickable = typeof stepClickable === 'function' && stepClickable(stepNum);
            const title = labels[stepNum - 1] || `Paso ${stepNum}`;

            return (
              <div key={stepNum} className="maqgo-step-progress__seg-group">
                <div
                  className={`maqgo-step-progress__seg ${
                    isActive
                      ? 'maqgo-step-progress__seg--active'
                      : isPast
                        ? 'maqgo-step-progress__seg--past'
                        : 'maqgo-step-progress__seg--todo'
                  }`}
                  style={{
                    width: isActive ? activeW : inactiveW,
                    height: segH,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  title={title}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : -1}
                  onClick={() => {
                    if (clickable && typeof onStepClick === 'function') onStepClick(stepNum);
                  }}
                  onKeyDown={(e) => {
                    if (!clickable || typeof onStepClick !== 'function') return;
                    if (e.key === 'Enter' || e.key === ' ') onStepClick(stepNum);
                  }}
                />
                {index < total - 1 && (
                  <div
                    className={`maqgo-step-progress__connector ${stepNum < cs ? 'maqgo-step-progress__connector--past' : ''}`}
                    style={{ width: connectorW }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Contador P1/6 — esquina derecha */}
        <p className="maqgo-step-progress__counter" aria-live="polite">
          P{cs}/{total}
        </p>
      </div>

      {/* Sublabel (nombre del paso actual) — debajo, ancho completo */}
      {resolvedSublabel ? (
        <p className="maqgo-step-progress__sublabel">{resolvedSublabel}</p>
      ) : null}
    </div>
  );
}

export default StepProgressSegments;

