import { useState } from 'react';
import { DeploymentModel, ReplicaSetModel, type K8sResource, type ReplicaSet } from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useResourceAccess } from '../../actions/useResourceAccess';
import type { KindActionArgs, KindActions, ResourceActionItem } from '../../registry/types';
import { useEditCountAction } from '../scale/useEditCountAction';
import { RollbackModal } from './RollbackModal';
import { owningDeploymentName } from './revision';

/**
 * The ReplicaSet's own actions (ADR-0037 §3, OCP `useReplicaSetActions` + `replicaset-provider.ts`), kind items
 * first: "Rollback", then "Edit Pod count" (`patch replicasets/scale`, T-0192; hidden under an HPA).
 *
 * "Rollback" is listed only for a ReplicaSet owned by a Deployment that has no pods (`status.replicas` 0) — OCP's
 * test for "not the current revision". Gated by `patch deployments` on the owner; opens {@link RollbackModal}. A
 * ReplicaSet without an owning Deployment sends no `deployments` access review at all.
 */
export function useReplicaSetActions(args: KindActionArgs<ReplicaSet & K8sResource>): KindActions {
  const { cluster, obj, reviewByName, checkAccess } = args;
  const deploymentName = owningDeploymentName(obj);
  const rollbackAccess = useResourceAccess(
    cluster,
    {
      verb: 'patch',
      model: DeploymentModel,
      namespace: obj.metadata.namespace,
      // List rows share one namespace-level review (ADR-0022 §9), as `useActionAccess` does.
      name: reviewByName ? deploymentName : undefined,
    },
    { enabled: checkAccess && deploymentName !== undefined },
  );
  const editCount = useEditCountAction(args, ReplicaSetModel);
  const [isRollbackOpen, setRollbackOpen] = useState(false);
  const isCurrent = (obj.status?.replicas ?? 0) > 0;

  const items: ResourceActionItem[] = [];
  if (deploymentName !== undefined && !isCurrent) {
    // While checking there is no reason to give yet, so no tooltip (the `useActionAccess` mapping).
    const access = rollbackAccess.isChecking
      ? { isAriaDisabled: true }
      : disabledActionProps(rollbackAccess.disabledReason);
    items.push({
      itemKey: 'rollback-deployment',
      title: 'Rollback',
      onClick: () => {
        if (!access.isAriaDisabled) setRollbackOpen(true);
      },
      ...access,
    });
  }
  if (editCount.item) items.push(editCount.item);

  const rollbackDialog =
    isRollbackOpen && deploymentName !== undefined ? (
      <RollbackModal
        cluster={cluster}
        replicaSet={obj}
        deploymentName={deploymentName}
        onClose={() => setRollbackOpen(false)}
      />
    ) : null;
  return { items, dialog: rollbackDialog ?? editCount.dialog };
}
