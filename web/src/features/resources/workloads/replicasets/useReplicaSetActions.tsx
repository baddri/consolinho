import { useState } from 'react';
import { DeploymentModel, type K8sResource, type ReplicaSet } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { RollbackModal } from './RollbackModal';
import { owningDeploymentName } from './revision';

/**
 * The ReplicaSet's own action (ADR-0037 §3, OCP `useReplicaSetActions` + `replicaset-provider.ts`): "Rollback",
 * listed only for a ReplicaSet owned by a Deployment that has no pods (`status.replicas` 0) — OCP's test for "not the
 * current revision". Gated by `patch deployments` on the owner; opens {@link RollbackModal}.
 */
export function useReplicaSetActions({
  cluster,
  obj,
  reviewByName,
}: KindActionArgs<ReplicaSet & K8sResource>): KindActions {
  const deploymentName = owningDeploymentName(obj);
  const access = useActionAccess(
    cluster,
    { verb: 'patch', model: DeploymentModel, namespace: obj.metadata.namespace, name: deploymentName ?? '' },
    reviewByName,
  );
  const [isOpen, setOpen] = useState(false);
  const isCurrent = (obj.status?.replicas ?? 0) > 0;

  if (deploymentName === undefined || isCurrent) return { items: [], dialog: null };
  return {
    items: [
      {
        itemKey: 'rollback-deployment',
        title: 'Rollback',
        onClick: () => {
          if (!access.isAriaDisabled) setOpen(true);
        },
        ...access,
      },
    ],
    dialog: isOpen ? (
      <RollbackModal
        cluster={cluster}
        replicaSet={obj}
        deploymentName={deploymentName}
        onClose={() => setOpen(false)}
      />
    ) : null,
  };
}
