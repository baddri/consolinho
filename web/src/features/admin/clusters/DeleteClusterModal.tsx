import { Content } from '@patternfly/react-core';
import { ConfirmModal, EnvironmentLabel, useToast } from '@/shared/ui';
import { useDeleteCluster } from './api';
import { plural } from './clusterTarget';
import type { ClusterModalProps } from './DisableClusterModal';
import { useClusterGoneHandler } from './useClusterGone';

/** Props for {@link DeleteClusterModal}. */
export interface DeleteClusterModalProps extends ClusterModalProps {
  /** Called after the delete succeeded (before `onClose`), e.g. to leave the deleted cluster's detail page. */
  onDeleted?: () => void;
}

/**
 * CLU-6 delete confirmation in OCP wording ("Delete cluster?", warning icon, bold name): danger, the user must type
 * the cluster name, and the body states how many credentials and grants go with it. A 409 `Clusters.NotDisabled` (enabled meanwhile) is shown inline with the server's detail; a 404
 * (deleted meanwhile) closes the dialog via `useClusterGoneHandler`.
 */
export function DeleteClusterModal({ cluster, onClose, onDeleted, onGone }: DeleteClusterModalProps) {
  const mutation = useDeleteCluster();
  const toast = useToast();
  const { name, environment, credentialCount, grantCount } = cluster;
  const onError = useClusterGoneHandler(name, onClose, onGone);
  const confirm = () =>
    mutation.mutate(name, {
      onSuccess: () => {
        toast.success(`Cluster ${name} deleted`);
        onDeleted?.();
        onClose();
      },
      onError,
    });
  return (
    <ConfirmModal
      isOpen
      title="Delete cluster?"
      titleIconVariant="warning"
      titleLabel={<EnvironmentLabel environment={environment} isCompact />}
      confirmLabel="Delete"
      variant="danger"
      typeToConfirm={name}
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Content component="p">
        Are you sure you want to delete <strong>{name}</strong>?{' '}
        {`${plural(credentialCount, 'credential')} and ${plural(grantCount, 'grant')} will be removed. ` +
          'This cannot be undone.'}
      </Content>
    </ConfirmModal>
  );
}
