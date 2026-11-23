import { useState } from 'react';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { useEditCountAction } from '../scale/useEditCountAction';
import { useRestartAction } from '../scale/useRestartRollout';
import { ConfigureUpdateStrategyModal } from './ConfigureUpdateStrategyModal';
import { pauseActionLabel, useTogglePaused } from './useDeploymentRollout';

/** OCP's tooltip on "Restart rollout" while the deployment is paused. */
export const RESTART_PAUSED_REASON = 'The deployment is paused and cannot be restarted.';

/**
 * The Deployment's own actions (ADR-0037 §3, OCP `deployment-provider.ts`): "Edit Pod count" (needs
 * `patch deployments/scale`; hidden while an HPA scales the deployment), "Pause rollouts" / "Resume rollouts" and
 * "Restart rollout" (need `patch deployments`; restart is also disabled while paused, as OCP) and "Edit update
 * strategy" (needs `patch deployments`). The common Edit / Delete items follow them. Pause and restart write at once,
 * without a modal; Edit Pod count opens the shared count modal, Edit update strategy {@link ConfigureUpdateStrategyModal}.
 */
export function useDeploymentActions(args: KindActionArgs<Deployment & K8sResource>): KindActions {
  const { cluster, obj, reviewByName } = args;
  const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
  const patchAccess = useActionAccess(
    cluster,
    { verb: 'patch', model: DeploymentModel, ...target },
    reviewByName,
  );
  const editCount = useEditCountAction(args, DeploymentModel);
  const paused = obj.spec?.paused === true;
  const restart = useRestartAction(args, DeploymentModel, {
    blockedReason: paused ? RESTART_PAUSED_REASON : undefined,
  });
  const togglePaused = useTogglePaused(cluster, DeploymentModel, obj);
  const [strategyOpen, setStrategyOpen] = useState(false);

  return {
    items: [
      ...(editCount.item ? [editCount.item] : []),
      {
        itemKey: 'pause-rollout',
        title: pauseActionLabel(obj),
        onClick: () => {
          if (!patchAccess.isAriaDisabled) togglePaused.mutate({ ...target, paused: !paused });
        },
        ...patchAccess,
      },
      restart,
      {
        itemKey: 'edit-update-strategy',
        title: 'Edit update strategy',
        onClick: () => {
          if (!patchAccess.isAriaDisabled) setStrategyOpen(true);
        },
        ...patchAccess,
      },
    ],
    dialog: strategyOpen ? (
      <ConfigureUpdateStrategyModal
        cluster={cluster}
        deployment={obj}
        onClose={() => setStrategyOpen(false)}
      />
    ) : (
      editCount.dialog
    ),
  };
}
