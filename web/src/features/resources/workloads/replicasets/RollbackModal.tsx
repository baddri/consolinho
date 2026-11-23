import { Alert, Spinner } from '@patternfly/react-core';
import { DeploymentModel, useK8sGet, type Deployment, type K8sResource } from '@/shared/k8s';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import { mutationErrorMessage } from '../../actions/useResourceMutation';
import type { ReplicaSetResource } from '../../registry/kinds/replicasets';
import { revisionOf } from './revision';
import { useRollbackDeployment } from './useRollbackDeployment';

/** OCP's message when the owning Deployment is paused (`rollback-modal.tsx` `deploymentError`). */
export const ROLLBACK_PAUSED_MESSAGE = `You cannot rollback a paused ${DeploymentModel.label}. You must resume it first.`;

/** Props for {@link RollbackModal}. */
export interface RollbackModalProps {
  cluster: string;
  replicaSet: ReplicaSetResource;
  /** Name of the Deployment owning {@link replicaSet}. */
  deploymentName: string;
  onClose: () => void;
}

/**
 * "Rollback" (OCP `rollback-modal.tsx`, DEP-10): watches the owning Deployment, asks "Are you sure you want to
 * rollback to <ReplicaSet>?" under the {@link ResourceMutationModal} cluster line, and patches the Deployment back to
 * the ReplicaSet's template. While the Deployment loads a spinner shows; if it can't load or is paused, OCP's danger
 * "Unable to Rollback" alert replaces the question and Rollback is disabled.
 */
export function RollbackModal({ cluster, replicaSet, deploymentName, onClose }: RollbackModalProps) {
  const namespace = replicaSet.metadata.namespace;
  const deployment = useK8sGet<Deployment & K8sResource>(cluster, DeploymentModel, namespace, deploymentName);
  const rollback = useRollbackDeployment(cluster);
  const revision = revisionOf(replicaSet) ?? replicaSet.metadata.name ?? '';
  const blocker = deployment.error
    ? mutationErrorMessage(deployment.error)
    : deployment.data?.spec?.paused === true
      ? ROLLBACK_PAUSED_MESSAGE
      : undefined;

  const save = () => {
    if (!deployment.data) return;
    rollback.mutate(
      { namespace, name: deploymentName, deployment: deployment.data, replicaSet, revision },
      { onSuccess: onClose },
    );
  };

  return (
    <ResourceMutationModal
      title="Rollback"
      cluster={cluster}
      namespace={namespace}
      objectName={deploymentName}
      kindLabel={DeploymentModel.label}
      isSaving={rollback.isPending}
      error={rollback.error}
      onSave={save}
      onClose={onClose}
      saveLabel="Rollback"
      isSaveDisabled={!deployment.data || blocker !== undefined}
    >
      {deployment.isPending && !deployment.error ? (
        <Spinner size="lg" aria-label={`Loading ${DeploymentModel.label}`} />
      ) : blocker === undefined ? (
        <p>
          Are you sure you want to rollback to <strong>{replicaSet.metadata.name}</strong>?
        </p>
      ) : (
        <Alert isInline variant="danger" title="Unable to Rollback">
          {blocker}
        </Alert>
      )}
    </ResourceMutationModal>
  );
}
