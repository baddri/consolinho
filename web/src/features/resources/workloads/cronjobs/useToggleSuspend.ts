import { CronJobModel, k8sPatch } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useToggleSuspend} writes: the CronJob and its new `spec.suspend`. */
export interface ToggleSuspendVars extends MutationTarget {
  suspend: boolean;
}

/** "Suspend" or "Resume" for a CronJob's current `spec.suspend`. */
export function suspendActionLabel(suspended: boolean): string {
  return suspended ? 'Resume' : 'Suspend';
}

/**
 * Suspends or resumes a CronJob (CJ-3, a fleet addition: OCP has no such action): JSON Patch `replace /spec/suspend`
 * (the API server defaults the field, so it always exists). Modal-less, so success toasts "Suspended <name>" /
 * "Resumed <name>" and a failure toasts "<Suspend|Resume> failed" for the current state.
 */
export function useToggleSuspend(cluster: string, suspended: boolean) {
  return useResourceMutation(cluster, {
    model: CronJobModel,
    mutationFn: ({ namespace, name, suspend }: ToggleSuspendVars) =>
      k8sPatch(cluster, CronJobModel, { namespace, name }, [
        { op: 'replace', path: '/spec/suspend', value: suspend },
      ]),
    successMessage: ({ name, suspend }) => `${suspend ? 'Suspended' : 'Resumed'} ${name}`,
    toastErrors: { action: suspendActionLabel(suspended) },
  });
}
