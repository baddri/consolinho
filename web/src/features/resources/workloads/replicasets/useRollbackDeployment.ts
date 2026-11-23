import { DeploymentModel, k8sPatch, type Deployment, type JsonPatchOp, type ReplicaSet } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/**
 * Deployment annotations a rollback keeps from the Deployment rather than taking from the ReplicaSet: controller
 * bookkeeping and the last-applied configuration (OCP `rollback-modal.tsx` `ANNOTATIONS_TO_SKIP`).
 */
const ANNOTATIONS_TO_SKIP = [
  'kubectl.kubernetes.io/last-applied-configuration',
  'deployment.kubernetes.io/revision',
  'deployment.kubernetes.io/revision-history',
  'deployment.kubernetes.io/desired-replicas',
  'deployment.kubernetes.io/max-replicas',
  'deprecated.deployment.rollback.to',
];

/**
 * The JSON Patch that rolls `deployment` back to `replicaSet` (OCP `submitDeploymentRollback`): replace
 * `/spec/template` with the ReplicaSet's pod template minus the controller's `pod-template-hash` label, and
 * `/metadata/annotations` with the Deployment's skipped annotations plus every other annotation of the ReplicaSet.
 * The controller then sees a template matching the old ReplicaSet and scales it back up as a new revision.
 */
export function rollbackPatch(deployment: Deployment, replicaSet: ReplicaSet): JsonPatchOp[] {
  const template = structuredClone(replicaSet.spec?.template ?? {});
  if (template.metadata?.labels) delete template.metadata.labels['pod-template-hash'];

  const current = deployment.metadata?.annotations ?? {};
  const annotations: Record<string, string> = {};
  for (const key of ANNOTATIONS_TO_SKIP) {
    if (current[key]) annotations[key] = current[key];
  }
  for (const [key, value] of Object.entries(replicaSet.metadata?.annotations ?? {})) {
    if (!ANNOTATIONS_TO_SKIP.includes(key)) annotations[key] = value;
  }

  return [
    { op: 'replace', path: '/spec/template', value: template },
    { op: 'replace', path: '/metadata/annotations', value: annotations },
  ];
}

/** What {@link useRollbackDeployment} writes: the Deployment, its live object, the ReplicaSet and its revision. */
export interface RollbackDeploymentVars extends MutationTarget {
  deployment: Deployment;
  replicaSet: ReplicaSet;
  revision: string;
}

/**
 * Rolls a Deployment back to one of its ReplicaSets with one PATCH of the Deployment ({@link rollbackPatch}, needs
 * `patch deployments`). Success toasts "Rolled back <deployment> to revision <n> on <cluster>"; failures stay inline in
 * the Rollback modal.
 */
export function useRollbackDeployment(cluster: string) {
  return useResourceMutation(cluster, {
    model: DeploymentModel,
    mutationFn: ({ namespace, name, deployment, replicaSet }: RollbackDeploymentVars) =>
      k8sPatch(cluster, DeploymentModel, { namespace, name }, rollbackPatch(deployment, replicaSet)),
    successMessage: ({ name, revision }) => `Rolled back ${name} to revision ${revision}`,
  });
}
