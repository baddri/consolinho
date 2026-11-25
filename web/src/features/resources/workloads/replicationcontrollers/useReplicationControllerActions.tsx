import { useState } from 'react';
import { DeploymentConfigModel, ReplicationControllerModel } from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useResourceAccess } from '../../actions/useResourceAccess';
import type { KindActionArgs, KindActions, ResourceActionItem } from '../../registry/types';
import { DeploymentConfigRollbackModal } from '../deploymentconfigs/DeploymentConfigRollbackModal';
import { owningDeploymentConfigName } from '../deploymentconfigs/useRollbackDeploymentConfig';
import { useEditCountAction } from '../scale/useEditCountAction';
import { CancelRolloutModal } from './CancelRolloutModal';
import { deploymentPhaseOf, type ReplicationControllerResource } from './replicationControllerDetails';

/**
 * Deployment phases of a rollout still in progress: OCP offers "Cancel rollout" and disables Rollback on such an RC
 * (`INACTIVE_STATUSES`).
 */
const IN_PROGRESS_PHASES = ['New', 'Pending', 'Running'];

/**
 * The ReplicationController's own actions (ADR-0037 §3, OCP `replication-controllers-provider.ts`): "Edit Pod count"
 * (`patch replicationcontrollers/scale`; hidden under an HPA), "Cancel rollout" (T-0219) and "Rollback" (T-0193). The
 * common Edit / Delete items follow them.
 *
 * "Cancel rollout" is listed, as OCP, only while the RC's deployment phase is New/Pending/Running; gated by `patch` on
 * the RC, it opens {@link CancelRolloutModal}.
 *
 * "Rollback" is listed, as OCP, only for an RC with a deployment phase, no pods (`status.replicas` 0) and an owning
 * DeploymentConfig; it is disabled (no tooltip, as OCP) while that rollout is New/Pending/Running. Gated by `update
 * deploymentconfigs` on the owner; opens {@link DeploymentConfigRollbackModal}. An RC without an owning
 * DeploymentConfig sends no `deploymentconfigs` access review at all.
 */
export function useReplicationControllerActions(args: KindActionArgs<ReplicationControllerResource>): KindActions {
  const { cluster, obj, reviewByName, checkAccess } = args;
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
    { enabled: checkAccess && dcName !== undefined },
  );
  const editCount = useEditCountAction(args, ReplicationControllerModel);
  const phase = deploymentPhaseOf(obj);
  const inProgress = phase !== undefined && IN_PROGRESS_PHASES.includes(phase);
  // Reviewed only while the item is listed, so a list of finished RCs sends no extra access review.
  const cancelAccess = useResourceAccess(
    cluster,
    {
      verb: 'patch',
      model: ReplicationControllerModel,
      namespace: obj.metadata.namespace,
      name: reviewByName ? obj.metadata.name : undefined,
    },
    { enabled: checkAccess && inProgress },
  );
  const [openDialog, setOpenDialog] = useState<'rollback' | 'cancel-rollout' | null>(null);
  const close = () => setOpenDialog(null);

  const items: ResourceActionItem[] = editCount.item ? [editCount.item] : [];
  if (inProgress) {
    const access = cancelAccess.isChecking
      ? { isAriaDisabled: true }
      : disabledActionProps(cancelAccess.disabledReason);
    items.push({
      itemKey: 'cancel-rollout',
      title: 'Cancel rollout',
      onClick: () => {
        if (!access.isAriaDisabled) setOpenDialog('cancel-rollout');
      },
      ...access,
    });
  }
  if (phase !== undefined && (obj.status?.replicas ?? 0) === 0 && dcName !== undefined) {
    // While checking, or while the rollout runs, there is no reason to show (the `useActionAccess` mapping; OCP).
    const access =
      rollbackAccess.isChecking || inProgress
        ? { isAriaDisabled: true }
        : disabledActionProps(rollbackAccess.disabledReason);
    items.push({
      itemKey: 'rollback-deployment-config',
      title: 'Rollback',
      onClick: () => {
        if (!access.isAriaDisabled) setOpenDialog('rollback');
      },
      ...access,
    });
  }

  if (openDialog === 'rollback' && dcName !== undefined) {
    return {
      items,
      dialog: (
        <DeploymentConfigRollbackModal cluster={cluster} replicationController={obj} dcName={dcName} onClose={close} />
      ),
    };
  }
  if (openDialog === 'cancel-rollout') {
    return { items, dialog: <CancelRolloutModal cluster={cluster} replicationController={obj} onClose={close} /> };
  }
  return { items, dialog: editCount.dialog };
}
