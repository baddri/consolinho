import { FormGroup, NumberInput } from '@patternfly/react-core';
import { useState } from 'react';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import { useScaleDeployment } from './useScaleDeployment';

/** Id of the count field, the modal's initial focus; one count modal is open at a time. */
const INPUT_ID = 'configure-count-input';

/** Props for {@link ConfigureCountModal}. */
export interface ConfigureCountModalProps {
  cluster: string;
  deployment: Deployment & K8sResource;
  onClose: () => void;
}

/** The field's text as a count: `''` while cleared, else a non-negative integer; `undefined` for anything else. */
function parseCount(text: string): number | '' | undefined {
  if (text.trim() === '') return '';
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * "Edit Pod count" (OCP `configure-count-modal.tsx`, DEP-3): a `NumberInput` (minimum 0) starting at the desired
 * replicas, focused on open, saved as a patch of the `scale` subresource; "Deployments maintain the desired number of
 * healthy pods." is the header description, as OCP. A cleared field saves 0, as OCP's `_.toInteger`. Closes on
 * success; a failure stays inline.
 */
export function ConfigureCountModal({ cluster, deployment, onClose }: ConfigureCountModalProps) {
  const [value, setValue] = useState<number | ''>(deployment.spec?.replicas ?? 1);
  const scale = useScaleDeployment(cluster);
  const namespace = deployment.metadata.namespace;
  const name = deployment.metadata.name ?? '';

  const save = () =>
    scale.mutate({ namespace, name, replicas: value === '' ? 0 : value }, { onSuccess: onClose });

  return (
    <ResourceMutationModal
      title="Edit Pod count"
      cluster={cluster}
      namespace={namespace}
      objectName={name}
      kindLabel={DeploymentModel.label}
      isSaving={scale.isPending}
      error={scale.error}
      onSave={save}
      onClose={onClose}
      description={`${DeploymentModel.labelPlural} maintain the desired number of healthy pods.`}
      elementToFocus={`#${INPUT_ID}`}
    >
      <FormGroup>
        <NumberInput
          value={value}
          min={0}
          inputAriaLabel="Pod count"
          minusBtnAriaLabel="Decrement"
          plusBtnAriaLabel="Increment"
          inputProps={{ id: INPUT_ID }}
          onMinus={() => setValue((count) => Math.max((count || 0) - 1, 0))}
          onPlus={() => setValue((count) => (count || 0) + 1)}
          onChange={(event) => {
            const count = parseCount(event.currentTarget.value);
            if (count !== undefined) setValue(count);
          }}
        />
      </FormGroup>
    </ResourceMutationModal>
  );
}
