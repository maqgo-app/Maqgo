import React from 'react';

/**
 * Segmentos conectados — misma línea visual continua en flujo cliente y onboarding proveedor.
 * Paso activo = segmento ancho; completados = color marca; pendientes = tenue.
 */
function StepProgressSegments({
  totalSteps,
  currentStep,
  sublabel,
  labels = [],
  compact = false,
  className = '',
  showSublabel = false,
  /** (stepNum) => true si el segmento es clicable (p. ej. volver a un paso ya visitado) */
  stepClickable,
  onStepClick,
  ariaLabel,
}) {
  const total = Math.max(1, totalSteps);
  const cs = Math.min(total, Math.max(1, currentStep || 1));
  
  // Diseño de círculos pequeños y uniformes
  const circleSize = compact ? 6 : 8;
  const connectorW = compact ? 4 : 6;

  const resolvedSublabel =
    sublabel != null && sublabel !== ''
      ? sublabel
      : labels[cs - 1] || '';

  const items = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className={`maqgo-step-progress ${compact ? 'maqgo-step-progress--compact' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
      style={{ alignItems: 'center' }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div className="maqgo-step-progress__segments-row" aria-hidden style={{ margin: 0, gap: '4px' }}>
          {items.map((stepNum, index) => {
            const isActive = stepNum === cs;
            const isPast = stepNum < cs;
            const clickable = typeof stepClickable === 'function' && stepClickable(stepNum);
            const title = labels[stepNum - 1] || `Paso ${stepNum}`;

            return (
              <div key={stepNum} className="maqgo-step-progress__seg-group">
                <div
                  className={`maqgo-step-progress__seg ${
                    isActive ? 'maqgo-step-progress__seg--active' : isPast ? 'maqgo-step-progress__seg--past' : 'maqgo-step-progress__seg--todo'
                  }`}
                  style={{
                    width: circleSize,
                    height: circleSize,
                    borderRadius: '50%',
                    cursor: clickable ? 'pointer' : 'default',
                    // El activo tiene un brillo sutil
                    boxShadow: isActive ? '0 0 8px rgba(236, 104, 25, 0.4)' : 'none',
                    opacity: isActive || isPast ? 1 : 0.3
                  }}
                  title={title}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : -1}
                  onClick={() => {
                    if (clickable && typeof onStepClick === 'function') onStepClick(stepNum);
                  }}
                />
                {index < total - 1 && (
                  <div
                    className={`maqgo-step-progress__connector ${stepNum < cs ? 'maqgo-step-progress__connector--past' : ''}`}
                    style={{ 
                      width: connectorW, 
                      height: '1px', 
                      margin: '0 2px',
                      opacity: 0.3
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="maqgo-step-progress__title" aria-live="polite" style={{ whiteSpace: 'nowrap' }}>
          P{cs}/{total}
        </p>
      </div>

      {showSublabel && resolvedSublabel ? (
        <p className="maqgo-step-progress__sublabel" style={{ marginTop: '4px' }}>{resolvedSublabel}</p>
      ) : null}
    </div>
  );
}

export default StepProgressSegments;
