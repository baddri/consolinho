import { DeploymentModel, k8sPatch, type Deployment, type JsonPatchOp } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** The pod-template annotation whose change makes the controller roll out new pods (`kubectl rollout restart`). */
export const RESTARTED_AT_ANNOTATION = 'kubectl.kubernetes.io/restartedAt';

/** What {@link useTogglePaused} writes: the deployment and its new `spec.paused`. */
export interface TogglePausedVars extends MutationTarget {
  paused: boolean;
}

/** "Pause rollouts" / "Resume rollouts" for a deployment's current state, as OCP labels the action. */
export function pauseActionLabel(deployment: Deployment): string {
  return deployment.spec?.paused ? 'Resume rollouts' : 'Pause rollouts';
}

/**
 * Pauses or resumes a deployment's rollouts (OCP `workload-pause.tsx` `togglePaused`): JSON Patch `add /spec/paused`
 * (`add` also replaces an existing member). Modal-less, so failures toast. Shared by the actions menu and the paused
 * alert's "Resume rollouts" link. A failure toasts "<Pause|Resume> rollouts failed" for `deployment`'s current state.
 */
export function useTogglePaused(cluster: string, deployment: Deployment) {
  return useResourceMutation(cluster, {
    model: DeploymentModel,
    mutationFn: ({ namespace, name, paused }: TogglePausedVars) =>
      k8sPatch(cluster, DeploymentModel, { namespace, name }, [
        { op: 'add', path: '/spec/paused', value: paused },
      ]),
    successMessage: ({ name, paused }) => `Rollouts ${paused ? 'paused' : 'resumed'} for ${name}`,
    toastErrors: { action: pauseActionLabel(deployment) },
  });
}

/** What {@link useRestartRollout} writes; `deployment` (as last read) tells whether its template has annotations. */
export interface RestartRolloutVars extends MutationTarget {
  deployment: Deployment;
}

/**
 * The restart patch (OCP `useDeploymentActions.ts` `restartRollout`): sets the restartedAt annotation of the pod
 * template to `now`, creating `/spec/template/metadata/annotations` first when the template has none (a JSON Patch
 * `add` into a missing parent fails).
 */
export function restartRolloutPatch(deployment: Deployment, now: Date): JsonPatchOp[] {
  const patch: JsonPatchOp[] = [];
  if (deployment.spec?.template.metadata?.annotations === undefined) {
    patch.push({ op: 'add', path: '/spec/template/metadata/annotations', value: {} });
  }
  patch.push({
    op: 'add',
    path: `/spec/template/metadata/annotations/${RESTARTED_AT_ANNOTATION.replace('/', '~1')}`,
    value: now.toISOString(),
  });
  return patch;
}

/** Restarts a deployment's rollout (OCP "Restart rollout"); success toasts "Rollout restarted for <name> on <cluster>". */
export function useRestartRollout(cluster: string) {
  return useResourceMutation(cluster, {
    model: DeploymentModel,
    mutationFn: ({ namespace, name, deployment }: RestartRolloutVars) =>
      k8sPatch(cluster, DeploymentModel, { namespace, name }, restartRolloutPatch(deployment, new Date())),
    successMessage: ({ name }) => `Rollout restarted for ${name}`,
    toastErrors: { action: 'Restart rollout' },
  });
}
