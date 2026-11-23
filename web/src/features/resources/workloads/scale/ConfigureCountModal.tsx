import { FormGroup, NumberInput } from '@patternfly/react-core';
import { useState } from 'react';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import { useScaleWorkload } from './useScaleWorkload';
import { useSetParallelism } from './useSetParallelism';

/** Id of the count field, the modal's initial focus; one count modal is open at a time. */
const INPUT_ID = 'configure-count-input';

/** The count a modal edits: `spec.replicas` through the `scale` subresource, or a Job's `spec.parallelism`. */
export type CountField = 'replicas' | 'parallelism';

/** A workload with the count fields the modal reads. */
export type CountedWorkload = K8sResource & { spec?: { replicas?: number; parallelism?: number } };

/** Props for {@link ConfigureCountModal}. */
export interface ConfigureCountModalProps {
  cluster: string;
  model: K8sModel;
  obj: CountedWorkload;
  /** Defaults to `replicas`. */
  field?: CountField;
  onClose: () => void;
}

/** The field's text as a count: `''` while cleared, else a non-negative integer; `undefined` for anything else. */
function parseCount(text: string): number | '' | undefined {
  if (text.trim() === '') return '';
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** OCP's title and header description of each field (`configure-count-modal.tsx`, `configureJobParallelismModal`). */
function copy(field: CountField, model: K8sModel): { title: string; description: string } {
  return field === 'parallelism'
    ? {
        title: 'Edit parallelism',
        description: `${model.labelPlural} create one or more pods and ensure that a specified number of them successfully terminate. When the specified number of completions is successfully reached, the job is complete.`,
      }
    : {
        title: 'Edit Pod count',
        description: `${model.labelPlural} maintain the desired number of healthy pods.`,
      };
}

/**
 * "Edit Pod count" / "Edit parallelism" (OCP `configure-count-modal.tsx`, DEP-3): a `NumberInput` (minimum 0)
 * starting at the current count (default 1, as the API server's), focused on open. `replicas` saves through the
 * `scale` subresource, `parallelism` as one `replace /spec/parallelism` patch. A cleared field saves 0, as OCP's
 * `_.toInteger`. Closes on success; a failure stays inline.
 */
export function ConfigureCountModal({
  cluster,
  model,
  obj,
  field = 'replicas',
  onClose,
}: ConfigureCountModalProps) {
  const [value, setValue] = useState<number | ''>(obj.spec?.[field] ?? 1);
  const scale = useScaleWorkload(cluster, model);
  const parallelism = useSetParallelism(cluster, model);
  const mutation = field === 'parallelism' ? parallelism : scale;
  const namespace = obj.metadata.namespace;
  const name = obj.metadata.name ?? '';
  const { title, description } = copy(field, model);

  const save = () => {
    const count = value === '' ? 0 : value;
    if (field === 'parallelism')
      parallelism.mutate({ namespace, name, parallelism: count }, { onSuccess: onClose });
    else scale.mutate({ namespace, name, replicas: count }, { onSuccess: onClose });
  };

  return (
    <ResourceMutationModal
      title={title}
      cluster={cluster}
      namespace={namespace}
      objectName={name}
      kindLabel={model.label}
      isSaving={mutation.isPending}
      error={mutation.error}
      onSave={save}
      onClose={onClose}
      description={description}
      elementToFocus={`#${INPUT_ID}`}
    >
      <FormGroup>
        <NumberInput
          value={value}
          min={0}
          inputAriaLabel={field === 'parallelism' ? 'Parallelism' : 'Pod count'}
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
