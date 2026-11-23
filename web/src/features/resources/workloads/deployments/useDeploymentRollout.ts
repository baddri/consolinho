import { k8sPatch, type K8sModel } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useTogglePaused} writes: the workload and its new `spec.paused`. */
export interface TogglePausedVars extends MutationTarget {
  paused: boolean;
}

/** A pausable workload (Deployment, DeploymentConfig), as far as the pause action reads it. */
export interface PausableWorkload {
  spec?: { paused?: boolean };
}

/** "Pause rollouts" / "Resume rollouts" for a workload's current state, as OCP labels the action. */
export function pauseActionLabel(workload: PausableWorkload): string {
  return workload.spec?.paused ? 'Resume rollouts' : 'Pause rollouts';
}

/**
 * Pauses or resumes a Deployment's or DeploymentConfig's rollouts (OCP `workload-pause.tsx` `togglePaused`): JSON
 * Patch `add /spec/paused` (`add` also replaces an existing member). Modal-less, so failures toast. Shared by the
 * actions menu and the paused alert's "Resume rollouts" link. A failure toasts "<Pause|Resume> rollouts failed" for
 * `workload`'s current state.
 */
export function useTogglePaused(cluster: string, model: K8sModel, workload: PausableWorkload) {
  return useResourceMutation(cluster, {
    model,
    mutationFn: ({ namespace, name, paused }: TogglePausedVars) =>
      k8sPatch(cluster, model, { namespace, name }, [{ op: 'add', path: '/spec/paused', value: paused }]),
    successMessage: ({ name, paused }) => `Rollouts ${paused ? 'paused' : 'resumed'} for ${name}`,
    toastErrors: { action: pauseActionLabel(workload) },
  });
}
