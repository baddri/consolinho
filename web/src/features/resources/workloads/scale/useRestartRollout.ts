import { k8sPatch, type JsonPatchOp, type K8sModel, type K8sResource } from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useActionAccess } from '../../actions/useActionAccess';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';
import type { KindActionArgs, ResourceActionItem } from '../../registry/types';

/** The pod-template annotation whose change makes the controller roll out new pods (`kubectl rollout restart`). */
export const RESTARTED_AT_ANNOTATION = 'kubectl.kubernetes.io/restartedAt';

/** A workload with a pod template, as far as the restart patch reads it. */
export interface TemplatedWorkload {
  spec?: { template?: { metadata?: { annotations?: Record<string, string> } } };
}

/** What {@link useRestartRollout} writes; `workload` (as last read) tells whether its template has annotations. */
export interface RestartRolloutVars extends MutationTarget {
  workload: TemplatedWorkload;
}

/**
 * The restart patch (OCP `useDeploymentActions.ts` `restartRollout`): sets the restartedAt annotation of the pod
 * template to `now`, creating `/spec/template/metadata/annotations` first when the template has none (a JSON Patch
 * `add` into a missing parent fails).
 */
// Generic so callers may pass any workload literal (e.g. with `spec.selector`) without excess-property errors.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function restartRolloutPatch<T extends TemplatedWorkload>(workload: T, now: Date): JsonPatchOp[] {
  const patch: JsonPatchOp[] = [];
  if (workload.spec?.template?.metadata?.annotations === undefined) {
    patch.push({ op: 'add', path: '/spec/template/metadata/annotations', value: {} });
  }
  patch.push({
    op: 'add',
    path: `/spec/template/metadata/annotations/${RESTARTED_AT_ANNOTATION.replace('/', '~1')}`,
    value: now.toISOString(),
  });
  return patch;
}

/**
 * Restarts a workload's rollout (OCP "Restart rollout") by patching its pod template; works for any kind with
 * `spec.template` (Deployment, StatefulSet, DaemonSet). Success toasts "Rollout restarted for <name> on <cluster>".
 */
export function useRestartRollout(cluster: string, model: K8sModel) {
  return useResourceMutation(cluster, {
    model,
    mutationFn: ({ namespace, name, workload }: RestartRolloutVars) =>
      k8sPatch(cluster, model, { namespace, name }, restartRolloutPatch(workload, new Date())),
    successMessage: ({ name }) => `Rollout restarted for ${name}`,
    toastErrors: { action: 'Restart rollout' },
  });
}

/** Options of {@link useRestartAction}. */
export interface RestartActionOptions {
  /** Why the restart is impossible despite access (e.g. a paused Deployment); access reasons win over it. */
  blockedReason?: string;
}

/**
 * The "Restart rollout" menu item for `model`: gated on `patch <plural>`, writes at once without a modal. A
 * `blockedReason` disables it with that tooltip once access is granted, so a denied user learns why they cannot write
 * at all rather than e.g. that the deployment is paused.
 */
export function useRestartAction(
  { cluster, obj, reviewByName }: KindActionArgs<TemplatedWorkload & K8sResource>,
  model: K8sModel,
  { blockedReason }: RestartActionOptions = {},
): ResourceActionItem {
  const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
  const access = useActionAccess(cluster, { verb: 'patch', model, ...target }, reviewByName);
  const restart = useRestartRollout(cluster, model);
  const props =
    blockedReason !== undefined && !access.isAriaDisabled ? disabledActionProps(blockedReason) : access;
  return {
    itemKey: 'restart-rollout',
    title: 'Restart rollout',
    onClick: () => {
      if (!props.isAriaDisabled) restart.mutate({ ...target, workload: obj });
    },
    ...props,
  };
}
