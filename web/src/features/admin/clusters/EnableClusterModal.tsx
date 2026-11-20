import { Content } from '@patternfly/react-core';
import { ConfirmModal, EnvironmentLabel, useToast } from '@/shared/ui';
import { useEnableCluster } from './api';
import { plural } from './clusterTarget';
import type { ClusterModalProps } from './DisableClusterModal';
import { useClusterGoneHandler } from './useClusterGone';

/**
 * CLU-5 enable confirmation: the cluster reappears in the switcher of its granted users (`grantCount`). Sends the
 * given representation's `version`; failures stay inline, except a 404 (deleted meanwhile,
 * `useClusterGoneHandler`).
 */
export function EnableClusterModal({ cluster, onClose, onGone }: ClusterModalProps) {
  const mutation = useEnableCluster();
  const toast = useToast();
  const { name, environment, grantCount, version } = cluster;
  const onError = useClusterGoneHandler(name, onClose, onGone);
  const confirm = () =>
    mutation.mutate(
      { name, version },
      {
        onSuccess: () => {
          toast.success(`Cluster ${name} enabled`);
          onClose();
        },
        onError,
      },
    );
  return (
    <ConfirmModal
      isOpen
      title={`Enable ${name}`}
      titleLabel={<EnvironmentLabel environment={environment} isCompact />}
      confirmLabel="Enable"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Content component="p">
        {`Enable ${name} (${environment})? ${plural(grantCount, 'user')} will see it in the cluster switcher again.`}
      </Content>
    </ConfirmModal>
  );
}
