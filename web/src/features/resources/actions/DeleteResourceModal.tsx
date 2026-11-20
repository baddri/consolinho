import { Content } from '@patternfly/react-core';
import { useAccessibleClusters } from '@/features/cluster-context';
import { ConfirmModal, EnvironmentLabel } from '@/shared/ui';
import { useNamespaceModel } from '../details/useNamespaceModel';
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
 * UI-8 delete confirmation (ADR-0015 §7): a danger dialog titled "Delete <Kind> <name>?" with the cluster's
 * environment label, a body naming the project/namespace and the cluster, and type-to-confirm when the descriptor sets
 * `deleteRequiresName`. A failure (e.g. the proxy's 403 read-only detail or the cluster's RBAC `Status`) stays inline;
 * success toasts "<name> deleted from <cluster>".
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
  const namespaceModel = useNamespaceModel(cluster);
  const environment = useAccessibleClusters().data?.find((entry) => entry.name === cluster)?.environment;
  const scope = model.namespaced ? namespace : undefined;
  const confirm = () => mutation.mutate({ namespace: scope, name });

  const where =
    scope === undefined ? `on ${cluster}` : `in ${namespaceModel.label.toLowerCase()} ${scope} on ${cluster}`;
  return (
    <ConfirmModal
      isOpen
      title={`Delete ${model.label} ${name}?`}
      titleLabel={environment ? <EnvironmentLabel environment={environment} isCompact /> : undefined}
      confirmLabel="Delete"
      variant="danger"
      typeToConfirm={descriptor.deleteRequiresName ? name : undefined}
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Content component="p">{`${model.label} ${name} ${where} will be deleted.`}</Content>
    </ConfirmModal>
  );
}
