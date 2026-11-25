import { DeploymentConfigModel, k8sCreateSubresource, type DeploymentConfig } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { pauseActionLabel, useTogglePaused } from '../deployments/useDeploymentRollout';
import { useEditCountAction } from '../scale/useEditCountAction';
import { disabledActionProps } from '@/shared/ui';
import { RETRY_ROLLOUT_DISABLED_REASON, useLatestFailedRC, useRetryRollout } from './useRetryRollout';

/**
 * Starts a new rollout of a DeploymentConfig (OCP `deploymentConfigRollout`): POST `…/instantiate` with a
 * `DeploymentRequest` (`latest`, `force`), which bumps `status.latestVersion` and creates the next
 * ReplicationController. Modal-less, so failures toast "Start rollout failed".
 */
export function useStartRollout(cluster: string) {
  return useResourceMutation(cluster, {
    model: DeploymentConfigModel,
    mutationFn: ({ namespace, name }: MutationTarget) =>
      k8sCreateSubresource<DeploymentConfig>(
        cluster,
        DeploymentConfigModel,
        { namespace, name, subresource: 'instantiate' },
        { kind: 'DeploymentRequest', apiVersion: 'apps.openshift.io/v1', name, latest: true, force: true },
      ),
    successMessage: ({ name }) => `Started rollout of ${name}`,
    toastErrors: { action: 'Start rollout' },
  });
}

/**
 * The DeploymentConfig's own actions (ADR-0037 §3), in OCP `deploymentconfig-provider.ts` order: "Edit Pod count"
 * (`patch deploymentconfigs/scale`; hidden under an HPA), "Start rollout" (`create deploymentconfigs/instantiate`),
 * "Retry rollout" (`patch deploymentconfigs`; disabled unless the latest RC failed), "Pause rollouts" / "Resume rollouts" (`patch deploymentconfigs`). The common Edit / Delete items follow them.
 */
export function useDeploymentConfigActions(args: KindActionArgs<DeploymentConfig>): KindActions {
  const { cluster, obj, reviewByName, checkAccess } = args;
  const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
  const patchAccess = useActionAccess(
    cluster,
    { verb: 'patch', model: DeploymentConfigModel, ...target },
    reviewByName,
    checkAccess,
  );
  const instantiateAccess = useActionAccess(
    cluster,
    { verb: 'create', model: DeploymentConfigModel, subresource: 'instantiate', ...target },
    reviewByName,
    checkAccess,
  );
  const editCount = useEditCountAction(args, DeploymentConfigModel);
  const startRollout = useStartRollout(cluster);
  const togglePaused = useTogglePaused(cluster, DeploymentConfigModel, obj);
  const paused = obj.spec?.paused === true;
  const latestRC = useLatestFailedRC(cluster, obj);
  const retryRollout = useRetryRollout(cluster);
  const retryAccess = latestRC.canRetry ? patchAccess : disabledActionProps(RETRY_ROLLOUT_DISABLED_REASON);

  return {
    items: [
      ...(editCount.item ? [editCount.item] : []),
      {
        itemKey: 'start-rollout',
        title: 'Start rollout',
        onClick: () => {
          if (!instantiateAccess.isAriaDisabled) startRollout.mutate(target);
        },
        ...instantiateAccess,
      },
      {
        itemKey: 'retry-rollout',
        title: 'Retry rollout',
        onClick: () => {
          if (!retryAccess.isAriaDisabled && latestRC.rcName)
            retryRollout.mutate({ namespace: target.namespace, name: latestRC.rcName });
        },
        ...retryAccess,
      },
      {
        itemKey: 'pause-rollout',
        title: pauseActionLabel(obj),
        onClick: () => {
          if (!patchAccess.isAriaDisabled) togglePaused.mutate({ ...target, paused: !paused });
        },
        ...patchAccess,
      },
    ],
    dialog: editCount.dialog,
  };
}
