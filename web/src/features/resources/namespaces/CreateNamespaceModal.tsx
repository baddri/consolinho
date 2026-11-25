import { Content, FormGroup } from '@patternfly/react-core';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { FieldLevelHelp, fieldIdFor, TextField } from '@/shared/forms';
import { NamespaceModel } from '@/shared/k8s';
import { LabelsInput, labelsWithTyped, typedLabelError } from '../actions/LabelsInput';
import { ResourceMutationModal } from '../actions/ResourceMutationModal';
import { resourcePath } from '../paths';
import {
  createNamespaceSchema,
  NAMESPACE_NAME_HELP,
  NAMESPACE_NAME_PREFIX_HELP,
  type CreateNamespaceValues,
} from './createNamespaceSchema';
import { useCreateNamespace } from './useCreateNamespace';

/** Props for {@link CreateNamespaceModal}. */
export interface CreateNamespaceModalProps {
  cluster: string;
  onClose: () => void;
}

/**
 * "Create Namespace" (OCP `CreateNamespaceModal.tsx`, NSC-1) for clusters without Projects: Name (required, focused
 * on open, OCP's rules in the label help popover) and Labels (the shared {@link LabelsInput} chip input) on the shared
 * {@link ResourceMutationModal}, whose context line names the typed namespace and the cluster. Valid text still typed
 * in the labels input is included; invalid text disables Create. On success it closes and opens the namespace's
 * details; a server failure (409 name taken, 403) stays inline. OCP's "Default network policy" field is out of scope.
 */
export function CreateNamespaceModal({ cluster, onClose }: CreateNamespaceModalProps) {
  const navigate = useNavigate();
  const create = useCreateNamespace(cluster);
  const labelsId = useId();
  const [labelText, setLabelText] = useState('');
  const { control, handleSubmit } = useForm<CreateNamespaceValues>({
    resolver: zodResolver(createNamespaceSchema),
    defaultValues: { name: '', labels: [] },
  });
  const name = useWatch({ control, name: 'name' });
  const { field: labels } = useController({ control, name: 'labels' });

  const save = handleSubmit((values) =>
    create.mutate(
      { name: values.name, labels: labelsWithTyped(values.labels, labelText), namespace: undefined },
      {
        onSuccess: (namespace) => {
          onClose();
          void navigate(resourcePath(cluster, NamespaceModel, { name: namespace.metadata.name ?? values.name }));
        },
      },
    ),
  );

  return (
    <ResourceMutationModal
      title="Create Namespace"
      cluster={cluster}
      namespace={undefined}
      objectName={name}
      kindLabel={NamespaceModel.label}
      isSaving={create.isPending}
      error={create.error}
      onSave={() => void save()}
      onClose={onClose}
      saveLabel="Create"
      isSaveDisabled={typedLabelError(labels.value, labelText) !== undefined}
      elementToFocus={`#${fieldIdFor('name')}`}
    >
      <TextField
        control={control}
        name="name"
        label="Name"
        isRequired
        labelHelp={
          <FieldLevelHelp>
            <Content component="p">{NAMESPACE_NAME_HELP}</Content>
            <Content component="p">{NAMESPACE_NAME_PREFIX_HELP}</Content>
          </FieldLevelHelp>
        }
      />
      <FormGroup label="Labels" fieldId={labelsId}>
        <LabelsInput
          id={labelsId}
          entries={labels.value}
          onEntriesChange={labels.onChange}
          text={labelText}
          onTextChange={setLabelText}
        />
      </FormGroup>
    </ResourceMutationModal>
  );
}
