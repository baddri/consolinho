import {
  Content,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { useId, useState, type KeyboardEvent } from 'react';
import { k8sPatch, type K8sModel, type K8sResource } from '@/shared/k8s';
import { KindBadge } from '../components/KindBadge';
import styles from './EditLabelsModal.module.css';
import { formatLabel, labelEntryErrors, parseLabel } from './labelValidation';
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
 * OCP's "Edit labels" modal (`labels-modal.tsx` + `SelectorInput`): plain closable PF labels and the input in one
 * multi-line text-input group (OCP `.co-tags-input`). Enter, comma or space adds the typed `key=value` (`key` alone
 * means an empty value), Backspace on an empty input removes the last label. Invalid or duplicate text turns the group
 * red with the reason below and disables Save, as OCP's `isInputValid`. Save replaces `/metadata/labels` in one JSON
 * Patch; valid text still typed in the input is included.
 */
export function EditLabelsModal({ cluster, model, obj, onClose }: EditMetadataModalProps) {
  const initial = obj.metadata.labels ?? {};
  const [entries, setEntries] = useState<string[]>(() =>
    Object.entries(initial).map(([key, value]) => formatLabel(key, value)),
  );
  const [text, setText] = useState('');
  const inputId = useId();
  const helperId = useId();
  const target = metadataTarget(model, obj);
  const mutation = useMetadataPatch(cluster, model, {
    path: '/metadata/labels',
    exists: obj.metadata.labels !== undefined,
    what: 'Labels',
  });

  const typed = text.trim();
  // Entries are only added when valid, so only the typed text can be in error.
  const textError = typed === '' ? undefined : labelEntryErrors([...entries, typed]).get(entries.length);
  const isInvalid = textError !== undefined;

  const addTyped = () => {
    if (typed === '' || isInvalid) return;
    setEntries([...entries, typed]);
    setText('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      // Enter must not submit the form; comma and space are separators, never part of a label.
      event.preventDefault();
      addTyped();
    } else if (event.key === 'Backspace' && text === '' && entries.length > 0) {
      setEntries(entries.slice(0, -1));
    }
  };

  const save = () => {
    const all = typed === '' ? entries : [...entries, typed];
    const value = Object.fromEntries(
      all.map((entry) => {
        const { key, value: labelValue } = parseLabel(entry);
        return [key, labelValue];
      }),
    );
    mutation.mutate({ ...target, value }, { onSuccess: onClose });
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
        <TextInputGroup className={styles.tagsInput} validated={isInvalid ? 'error' : 'default'}>
          <TextInputGroupMain
            inputId={inputId}
            aria-label="Labels"
            value={text}
            placeholder={entries.length === 0 ? 'app=frontend' : undefined}
            onChange={(_event, value) => setText(value)}
            onBlur={addTyped}
            inputProps={{
              onKeyDown: handleKeyDown,
              spellCheck: false,
              autoComplete: 'off',
              autoFocus: true,
              'aria-invalid': isInvalid,
              'aria-describedby': isInvalid ? helperId : undefined,
            }}
          >
            {entries.length > 0 && (
              <LabelGroup numLabels={entries.length} aria-label="Labels">
                {entries.map((entry) => (
                  <Label
                    key={entry}
                    onClose={() => setEntries(entries.filter((other) => other !== entry))}
                    closeBtnAriaLabel={`Remove ${entry}`}
                  >
                    {entry}
                  </Label>
                ))}
              </LabelGroup>
            )}
          </TextInputGroupMain>
        </TextInputGroup>
        {isInvalid && (
          <FormHelperText>
            <HelperText id={helperId}>
              <HelperTextItem variant="error">{textError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </ResourceMutationModal>
  );
}
