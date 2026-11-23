import { useState } from 'react';
import { DeploymentConfigModel, ReplicationControllerModel } from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useResourceAccess } from '../../actions/useResourceAccess';
import type { KindActionArgs, KindActions, ResourceActionItem } from '../../registry/types';
import { DeploymentConfigRollbackModal } from '../deploymentconfigs/DeploymentConfigRollbackModal';
import { owningDeploymentConfigName } from '../deploymentconfigs/useRollbackDeploymentConfig';
import { useEditCountAction } from '../scale/useEditCountAction';
import { deploymentPhaseOf, type ReplicationControllerResource } from './replicationControllerDetails';

/** Deployment phases of a rollout still in progress; OCP disables Rollback on such an RC (`INACTIVE_STATUSES`). */
const IN_PROGRESS_PHASES = ['New', 'Pending', 'Running'];

/**
 * The ReplicationController's own actions (ADR-0037 §3, OCP `replication-controllers-provider.ts`): "Edit Pod count"
 * (`patch replicationcontrollers/scale`; hidden under an HPA), then "Rollback" (T-0193). The common Edit / Delete
 * items follow them.
 *
 * "Rollback" is listed, as OCP, only for an RC with a deployment phase, no pods (`status.replicas` 0) and an owning
 * DeploymentConfig; it is disabled (no tooltip, as OCP) while that rollout is New/Pending/Running. Gated by `update
 * deploymentconfigs` on the owner; opens {@link DeploymentConfigRollbackModal}. An RC without an owning
 * DeploymentConfig sends no `deploymentconfigs` access review at all. OCP's "Cancel rollout" is not implemented yet.
 */
export function useReplicationControllerActions(args: KindActionArgs<ReplicationControllerResource>): KindActions {
  const { cluster, obj, reviewByName } = args;
  const dcName = owningDeploymentConfigName(obj);
  const rollbackAccess = useResourceAccess(
    cluster,
    {
      verb: 'update',
      model: DeploymentConfigModel,
      namespace: obj.metadata.namespace,
      // List rows share one namespace-level review (ADR-0022 §9), as `useActionAccess` does.
      name: reviewByName ? dcName : undefined,
    },
    { enabled: dcName !== undefined },
  );
  const editCount = useEditCountAction(args, ReplicationControllerModel);
  const [isRollbackOpen, setRollbackOpen] = useState(false);
  const phase = deploymentPhaseOf(obj);

  const items: ResourceActionItem[] = editCount.item ? [editCount.item] : [];
  if (phase !== undefined && (obj.status?.replicas ?? 0) === 0 && dcName !== undefined) {
    // While checking, or while the rollout runs, there is no reason to show (the `useActionAccess` mapping; OCP).
    const access =
      rollbackAccess.isChecking || IN_PROGRESS_PHASES.includes(phase)
        ? { isAriaDisabled: true }
        : disabledActionProps(rollbackAccess.disabledReason);
    items.push({
      itemKey: 'rollback-deployment-config',
      title: 'Rollback',
      onClick: () => {
        if (!access.isAriaDisabled) setRollbackOpen(true);
      },
      ...access,
    });
  }

  const rollbackDialog =
    isRollbackOpen && dcName !== undefined ? (
      <DeploymentConfigRollbackModal
        cluster={cluster}
        replicationController={obj}
        dcName={dcName}
        onClose={() => setRollbackOpen(false)}
      />
    ) : null;
  return { items, dialog: rollbackDialog ?? editCount.dialog };
}
