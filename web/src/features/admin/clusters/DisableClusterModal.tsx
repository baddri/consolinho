import { Content } from '@patternfly/react-core';
import { ConfirmModal, EnvironmentLabel, useToast } from '@/shared/ui';
import { useDisableCluster } from './api';
import { plural, type ClusterTarget } from './clusterTarget';
import { useClusterGoneHandler } from './useClusterGone';

/** Props of the cluster lifecycle dialogs. Mount them only while open; they close themselves after success. */
export interface ClusterModalProps {
  cluster: ClusterTarget;
  onClose: () => void;
  /** Called instead of the "no longer exists" toast when the cluster turns out to be deleted (404). */
  onGone?: () => void;
}

/**
 * CLU-5 disable confirmation in OCP wording ("Disable cluster?" with the environment label, bold name): states how
 * many users lose it from their switcher (`grantCount`). Danger variant for production. Sends the given
 * representation's `version`; failures stay inline, except a 404 (deleted meanwhile, `useClusterGoneHandler`).
 */
export function DisableClusterModal({ cluster, onClose, onGone }: ClusterModalProps) {
  const mutation = useDisableCluster();
  const toast = useToast();
  const { name, environment, grantCount, version } = cluster;
  const onError = useClusterGoneHandler(name, onClose, onGone);
  const confirm = () =>
    mutation.mutate(
      { name, version },
      {
        onSuccess: () => {
          toast.success(`Cluster ${name} disabled`);
          onClose();
        },
        onError,
      },
    );
  return (
    <ConfirmModal
      isOpen
      title="Disable cluster?"
      titleLabel={<EnvironmentLabel environment={environment} isCompact />}
      confirmLabel="Disable"
      variant={environment === 'production' ? 'danger' : 'primary'}
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Content component="p">
        Are you sure you want to disable <strong>{name}</strong>?{' '}
        {`${plural(grantCount, 'user')} will no longer see it in the cluster switcher. Grants and credentials are kept.`}
      </Content>
    </ConfirmModal>
  );
}
