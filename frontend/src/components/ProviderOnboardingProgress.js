/**
 * Indicador de progreso del onboarding proveedor
 * Misma línea segmentada que el flujo de reserva cliente (`StepProgressSegments`).
 * Por defecto: 5 pasos (empresa → máquina → fotos+tarifas → operador → revisión)
 * Opcional: `steps` para subflujos (p. ej. machine-first 3 pasos, servicio terminado 2 pasos)
 */
import StepProgressSegments from './StepProgressSegments';

const DEFAULT_PROVIDER_STEPS = [
  { label: 'Datos empresa' },
  { label: 'Datos máquina' },
  { label: 'Fotos y tarifas' },
  { label: 'Operador' },
  { label: 'Revisión' },
];

function ProviderOnboardingProgress({ currentStep, steps: stepsOverride }) {
  const useCustomSteps = Array.isArray(stepsOverride) && stepsOverride.length > 0;
  const steps = useCustomSteps ? stepsOverride : DEFAULT_PROVIDER_STEPS;
  const total = steps.length;
  if (!currentStep || currentStep < 1 || currentStep > total) return null;

  const labels = steps.map((s) => s.label);
  const currentLabel = labels[currentStep - 1] || '';

  return (
    <div className="maqgo-provider-progress">
      <StepProgressSegments
        totalSteps={total}
        currentStep={currentStep}
        labels={labels}
        ariaLabel={
          currentLabel
            ? `Onboarding: paso ${currentStep} de ${total}, ${currentLabel}`
            : `Onboarding: paso ${currentStep} de ${total}`
        }
      />
    </div>
  );
}

export default ProviderOnboardingProgress;
