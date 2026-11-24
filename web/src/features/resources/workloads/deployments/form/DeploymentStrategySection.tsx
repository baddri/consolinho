import { useController } from 'react-hook-form';
import { TextField } from '@/shared/forms';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';
import type { DeploymentFormValues } from './deploymentFormSchema';
import { DropdownField } from './DropdownField';

type StrategyType = DeploymentFormValues['strategyType'];

/** OCP `getDeploymentStrategyItems` for Deployments, in its order. */
const STRATEGY_ITEMS: readonly { value: StrategyType; label: string }[] = [
  { value: 'Recreate', label: 'Recreate' },
  { value: 'RollingUpdate', label: 'Rolling Update' },
];

/** OCP `getDeploymentStrategyHelpText` for Deployments. */
const STRATEGY_HELP: Record<StrategyType, string> = {
  Recreate: 'The recreate strategy has basic rollout behavior.',
  RollingUpdate:
    'The rolling strategy will wait for pods to pass their readiness check, scale down old components and then scale up.',
};

const isStrategyType = (value: string): value is StrategyType =>
  value === 'Recreate' || value === 'RollingUpdate';

/**
 * "Deployment strategy" (OCP `DeploymentStrategySection` + `RollingStrategy`): the Strategy type dropdown with its
 * help, then for Rolling Update the two bounds (a percentage or a whole number). Recreate has no fields for
 * Deployments. The bounds keep their values while Recreate is picked, so switching back restores them.
 */
export function DeploymentStrategySection({ control }: DeploymentSectionProps) {
  // `deps` re-validates the bounds on a type change, so Recreate clears their errors and Rolling Update restores them.
  const { field } = useController({
    control,
    name: 'strategyType',
    rules: { deps: ['maxUnavailable', 'maxSurge'] },
  });
  return (
    <DeploymentFormSection title="Deployment strategy">
      <DropdownField
        id="deployment-strategy-type"
        label="Strategy type"
        value={field.value}
        options={STRATEGY_ITEMS}
        helperText={STRATEGY_HELP[field.value]}
        isDisabled={field.disabled}
        onChange={(value) => {
          if (isStrategyType(value)) field.onChange(value);
        }}
      />
      {field.value === 'RollingUpdate' && (
        // One plain block, as OCP `RollingStrategy`: the two bounds stack without the form's row gap.
        <div>
          <TextField
            control={control}
            name="maxUnavailable"
            label="Maximum number of unavailable Pods"
            helperText="The maximum number of pods that can be unavailable during the rolling deployment. This can be either a percentage (10%) or a whole number (1)."
          />
          <TextField
            control={control}
            name="maxSurge"
            label="Maximum number of surge Pods"
            helperText="The maximum number of pods that can be scheduled above the original number of pods while the rolling deployment is in progress. This can be either a percentage (10%) or a whole number (1)."
          />
        </div>
      )}
    </DeploymentFormSection>
  );
}
