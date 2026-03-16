/**
 * Indicador de progreso del onboarding proveedor
 * Muestra "Paso X de 6" y nombre del paso (como cliente)
 * UX_REGLAS: Progreso numerado en todos los flujos
 */
const PROVIDER_STEPS = [
  { label: 'Datos empresa' },
  { label: 'Datos máquina' },
  { label: 'Fotos' },
  { label: 'Tarifas' },
  { label: 'Operador' },
  { label: 'Revisión' },
];

function ProviderOnboardingProgress({ currentStep }) {
  if (!currentStep || currentStep < 1 || currentStep > 6) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
      padding: '0 8px'
    }}>
      <p
        style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: 12,
          fontWeight: 500,
          margin: 0
        }}
        aria-live="polite"
      >
        Paso {currentStep} de {PROVIDER_STEPS.length}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {PROVIDER_STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isPast = stepNum < currentStep;
          return (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: index < PROVIDER_STEPS.length - 1 ? 0 : undefined }}>
              <div
                style={{
                  width: isActive ? 24 : 10,
                  height: 10,
                  borderRadius: 5,
                  background: isPast || isActive ? '#EC6819' : 'rgba(255,255,255,0.12)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
              />
              {index < PROVIDER_STEPS.length - 1 && (
                <div style={{ width: 12, height: 2, background: isPast ? '#EC6819' : 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProviderOnboardingProgress;
