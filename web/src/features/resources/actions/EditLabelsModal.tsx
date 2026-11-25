import { Content, FormGroup } from '@patternfly/react-core';
import { useId, useState } from 'react';
import { k8sPatch, type K8sModel, type K8sResource } from '@/shared/k8s';
import { KindBadge } from '../components/KindBadge';
import { formatLabel } from './labelValidation';
import { LabelsInput, labelsToMap, labelsWithTyped, typedLabelError } from './LabelsInput';
import { ResourceMutationModal } from './ResourceMutationModal';
import { useResourceMutation, type MutationTarget } from './useResourceMutation';

/** Props shared by {@link EditLabelsModal} and `EditAnnotationsModal`. */
export interface EditMetadataModalProps {
  cluster: string;
  model: K8sModel;
  obj: K8sResource;
  onClose: () => void;
}

/** Variables of one metadata map write: the object and the whole new map. */
interface MetadataPatchVars extends MutationTarget {
  value: Record<string, string>;
}

/**
 * The write of "Edit labels" / "Edit annotations" (OCP `labels-modal.tsx`, `tags.tsx`): one JSON Patch replacing the
 * whole map at `path`, `add` when the object has none yet (a `replace` of a missing member fails), toasting
 * "<What> of <name> updated on <cluster>".
 */
export function useMetadataPatch(
  cluster: string,
  model: K8sModel,
  { path, exists, what }: { path: string; exists: boolean; what: string },
) {
  return useResourceMutation(cluster, {
    model,
    mutationFn: ({ value, ...target }: MetadataPatchVars) =>
      k8sPatch<K8sResource>(cluster, model, target, [{ op: exists ? 'replace' : 'add', path, value }]),
    successMessage: ({ name }) => `${what} of ${name} updated`,
  });
}

/** The object's target and context-line props for {@link ResourceMutationModal}. */
export function metadataTarget(model: K8sModel, obj: K8sResource): MutationTarget {
  return { namespace: model.namespaced ? obj.metadata.namespace : undefined, name: obj.metadata.name ?? '' };
}

/**
 * OCP's "Edit labels" modal (`labels-modal.tsx` + `SelectorInput`) on the shared {@link LabelsInput} chip input.
 * Invalid or duplicate typed text disables Save, as OCP's `isInputValid`. Save replaces `/metadata/labels` in one JSON
 * Patch; valid text still typed in the input is included.
 */
export function EditLabelsModal({ cluster, model, obj, onClose }: EditMetadataModalProps) {
  const initial = obj.metadata.labels ?? {};
  const [entries, setEntries] = useState<string[]>(() =>
    Object.entries(initial).map(([key, value]) => formatLabel(key, value)),
  );
  const [text, setText] = useState('');
  const inputId = useId();
  const target = metadataTarget(model, obj);
  const mutation = useMetadataPatch(cluster, model, {
    path: '/metadata/labels',
    exists: obj.metadata.labels !== undefined,
    what: 'Labels',
  });

  const isInvalid = typedLabelError(entries, text) !== undefined;

  const save = () => {
    mutation.mutate({ ...target, value: labelsToMap(labelsWithTyped(entries, text)) }, { onSuccess: onClose });
  };

  return (
    <ResourceMutationModal
      title="Edit labels"
      cluster={cluster}
      namespace={target.namespace}
      objectName={target.name}
      kindLabel={model.kind}
      isSaving={mutation.isPending}
      error={mutation.error}
      onSave={save}
      onClose={onClose}
      variant="medium"
      isSaveDisabled={isInvalid}
    >
      <Content component="p">
        Labels help you organize and select resources. Adding labels below will let you query for objects that
        have similar, overlapping or dissimilar labels.
      </Content>
      <FormGroup
        fieldId={inputId}
        label={
          <>
            Labels for <KindBadge model={model} /> {target.name}
          </>
        }
      >
        <LabelsInput
          id={inputId}
          entries={entries}
          onEntriesChange={setEntries}
          text={text}
          onTextChange={setText}
          focusOnOpen
        />
      </FormGroup>
    </ResourceMutationModal>
  );
}
