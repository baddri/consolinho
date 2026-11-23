import { k8sPatch, ReplicationControllerModel, type JsonPatchOp } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/**
 * The JSON Patch (ADR-0037) that cancels a DeploymentConfig rollout, as OCP `useReplicationControllerActions`: the
 * deployer watches the RC's `openshift.io/deployment.cancelled` annotation. `add` also replaces an existing value;
 * `~1` escapes the `/` in the annotation keys (RFC 6901).
 */
export const CANCEL_ROLLOUT_PATCH: readonly JsonPatchOp[] = [
  { op: 'add', path: '/metadata/annotations/openshift.io~1deployment.cancelled', value: 'true' },
  {
    op: 'add',
    path: '/metadata/annotations/openshift.io~1deployment.status-reason',
    value: 'cancelled by the user',
  },
];

/**
 * Cancels the rollout an RC belongs to ("Cancel rollout"). Used from a confirm modal, so failures show inline there;
 * success toasts "Rollout of <name> cancelled on <cluster display name>".
 */
export function useCancelRollout(cluster: string) {
  return useResourceMutation(cluster, {
    model: ReplicationControllerModel,
    mutationFn: ({ namespace, name }: MutationTarget) =>
      k8sPatch(cluster, ReplicationControllerModel, { namespace, name }, [...CANCEL_ROLLOUT_PATCH]),
    successMessage: ({ name }) => `Rollout of ${name} cancelled`,
  });
}
