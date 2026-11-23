import { useState } from 'react';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { ConfigureCountModal } from './ConfigureCountModal';
import { ConfigureUpdateStrategyModal } from './ConfigureUpdateStrategyModal';
import { pauseActionLabel, useRestartRollout, useTogglePaused } from './useDeploymentRollout';

/** OCP's tooltip on "Restart rollout" while the deployment is paused. */
export const RESTART_PAUSED_REASON = 'The deployment is paused and cannot be restarted.';

/**
 * The Deployment's own actions (ADR-0037 §3, OCP `deployment-provider.ts`): "Edit Pod count" (needs
 * `patch deployments/scale`), "Pause rollouts" / "Resume rollouts" and "Restart rollout" (need `patch deployments`;
 * restart is also disabled while paused, as OCP) and "Edit update strategy" (needs `patch deployments`). The common
 * Edit / Delete items follow them. Pause and restart write at once, without a modal; Edit Pod count opens
 * {@link ConfigureCountModal}, Edit update strategy {@link ConfigureUpdateStrategyModal}.
 */
export function useDeploymentActions({
  cluster,
  obj,
  reviewByName,
}: KindActionArgs<Deployment & K8sResource>): KindActions {
  const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
  const scaleAccess = useActionAccess(
    cluster,
    { verb: 'patch', model: DeploymentModel, subresource: 'scale', ...target },
    reviewByName,
  );
  const patchAccess = useActionAccess(cluster, { verb: 'patch', model: DeploymentModel, ...target }, reviewByName);
  const togglePaused = useTogglePaused(cluster, obj);
  const restart = useRestartRollout(cluster);
  const [dialog, setDialog] = useState<'count' | 'strategy' | null>(null);
  const close = () => setDialog(null);
  const paused = obj.spec?.paused === true;
  // Access comes first: a denied user learns why they can't write at all, not that the deployment is paused.
  const restartAccess =
    paused && !patchAccess.isAriaDisabled ? disabledActionProps(RESTART_PAUSED_REASON) : patchAccess;

  return {
    items: [
      {
        itemKey: 'edit-pod-count',
        title: 'Edit Pod count',
        onClick: () => {
          if (!scaleAccess.isAriaDisabled) setDialog('count');
        },
        ...scaleAccess,
      },
      {
        itemKey: 'pause-rollout',
        title: pauseActionLabel(obj),
        onClick: () => {
          if (!patchAccess.isAriaDisabled) togglePaused.mutate({ ...target, paused: !paused });
        },
        ...patchAccess,
      },
      {
        itemKey: 'restart-rollout',
        title: 'Restart rollout',
        onClick: () => {
          if (!restartAccess.isAriaDisabled) restart.mutate({ ...target, deployment: obj });
        },
        ...restartAccess,
      },
      {
        itemKey: 'edit-update-strategy',
        title: 'Edit update strategy',
        onClick: () => {
          if (!patchAccess.isAriaDisabled) setDialog('strategy');
        },
        ...patchAccess,
      },
    ],
    dialog:
      dialog === 'count' ? (
        <ConfigureCountModal cluster={cluster} deployment={obj} onClose={close} />
      ) : dialog === 'strategy' ? (
        <ConfigureUpdateStrategyModal cluster={cluster} deployment={obj} onClose={close} />
      ) : null,
  };
}
