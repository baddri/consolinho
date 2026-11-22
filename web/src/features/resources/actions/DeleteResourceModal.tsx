import { Checkbox } from '@patternfly/react-core';
import { useState } from 'react';
import { useAccessibleClusters } from '@/features/cluster-context';
import { ConfirmModal, EnvironmentLabel } from '@/shared/ui';
import type { ResourceDescriptor } from '../registry/types';
import { useDeleteResource } from './useDeleteResource';

/** Props for {@link DeleteResourceModal}. */
export interface DeleteResourceModalProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  /** Namespace of a namespaced object; ignored for cluster-scoped kinds. */
  namespace: string | undefined;
  name: string;
  onClose: () => void;
  /**
   * Runs after a successful delete, before `onClose` (the details page returns to the list) — even if the dialog was
   * unmounted meanwhile by the watch's DELETED event.
   */
  onDeleted?: () => void;
}

/**
 * UI-8 delete confirmation (ADR-0015 §7, OCP `delete-modal.tsx`): a danger dialog titled "Delete <Kind>?" with the
 * cluster's environment label, a body naming object, namespace and cluster in bold ("in namespace", as OCP says even
 * for projects), and type-to-confirm when the descriptor sets `deleteRequiresName`. Kinds with a
 * `propagationPolicy` (Deployment, ReplicaSet) get OCP's checked "Delete dependent objects of this resource"; unchecked
 * sends `Orphan`. A failure (e.g. the proxy's 403
 * read-only detail or the cluster's RBAC `Status`) stays inline; success toasts "<name> deleted from <cluster>".
 */
export function DeleteResourceModal({
  cluster,
  descriptor,
  namespace,
  name,
  onClose,
  onDeleted,
}: DeleteResourceModalProps) {
  const { model } = descriptor;
  const mutation = useDeleteResource(cluster, model, {
    onDeleted: () => {
      onDeleted?.();
      onClose();
    },
  });
  const environment = useAccessibleClusters().data?.find((entry) => entry.name === cluster)?.environment;
  const scope = model.namespaced ? namespace : undefined;
  // OCP `delete-modal.tsx`: kinds with a cascade policy offer deleting their dependents (checked); unchecked orphans them.
  const [deleteDependents, setDeleteDependents] = useState(true);
  const propagationPolicy =
    model.propagationPolicy && (deleteDependents ? model.propagationPolicy : 'Orphan');
  const confirm = () => mutation.mutate({ namespace: scope, name, propagationPolicy });

  return (
    <ConfirmModal
      isOpen
      title={`Delete ${model.label}?`}
      titleLabel={environment ? <EnvironmentLabel environment={environment} isCompact /> : undefined}
      confirmLabel="Delete"
      variant="danger"
      typeToConfirm={descriptor.deleteRequiresName ? name : undefined}
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      {/* A plain block as OCP `delete-modal.tsx`: the checkbox follows without a paragraph margin. */}
      <div>
        Are you sure you want to delete <strong>{name}</strong>
        {scope !== undefined && (
          <>
            {' in namespace '}
            <strong>{scope}</strong>
          </>
        )}{' '}
        on cluster <strong>{cluster}</strong>?
      </div>
      {model.propagationPolicy && (
        <Checkbox
          id="delete-dependent-objects"
          label="Delete dependent objects of this resource"
          isChecked={deleteDependents}
          onChange={(_event, checked) => setDeleteDependents(checked)}
        />
      )}
    </ConfirmModal>
  );
}
