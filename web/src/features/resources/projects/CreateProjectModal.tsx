import { Content } from '@patternfly/react-core';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { fieldIdFor, TextAreaField, TextField } from '@/shared/forms';
import { ProjectModel } from '@/shared/k8s';
import { ResourceMutationModal } from '../actions/ResourceMutationModal';
import { resourcePath } from '../paths';
import { createProjectSchema, PROJECT_NAME_HELP, type CreateProjectValues } from './createProjectSchema';
import { useCreateProject } from './useCreateProject';

/** Props for {@link CreateProjectModal}. */
export interface CreateProjectModalProps {
  cluster: string;
  onClose: () => void;
}

/**
 * "Create Project" (OCP `CreateProjectModal.tsx`, PRJ-2): Name (required, focused on open), Display name and
 * Description on the shared {@link ResourceMutationModal}, whose context line names the typed project and the cluster
 * with its environment label (SAFE5-1). On success it closes and opens the new project's details; a server failure
 * (409 name taken, 403) stays inline. OCP's "Learn more about working with projects" doc link is left out.
 */
export function CreateProjectModal({ cluster, onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const create = useCreateProject(cluster);
  const { control, handleSubmit } = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '', displayName: '', description: '' },
  });
  const name = useWatch({ control, name: 'name' });

  const save = handleSubmit((values) =>
    create.mutate(
      { ...values, namespace: undefined },
      {
        onSuccess: (project) => {
          onClose();
          void navigate(resourcePath(cluster, ProjectModel, { name: project.metadata.name ?? values.name }));
        },
      },
    ),
  );

  return (
    <ResourceMutationModal
      title="Create Project"
      cluster={cluster}
      namespace={undefined}
      objectName={name}
      kindLabel={ProjectModel.label}
      isSaving={create.isPending}
      error={create.error}
      onSave={() => void save()}
      onClose={onClose}
      saveLabel="Create"
      elementToFocus={`#${fieldIdFor('name')}`}
    >
      {/* OCP puts this sentence in the modal body at body size, not in the header description. */}
      <Content component="p">An OpenShift project is an alternative representation of a Kubernetes namespace.</Content>
      <TextField control={control} name="name" label="Name" isRequired helperText={PROJECT_NAME_HELP} />
      <TextField control={control} name="displayName" label="Display name" />
      <TextAreaField control={control} name="description" label="Description" resizeOrientation="vertical" />
    </ResourceMutationModal>
  );
}
