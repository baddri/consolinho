import type { K8sResource } from '@/shared/k8s';

/** The revision annotation the deployment controller stamps on a Deployment and on each of its ReplicaSets. */
export const REVISION_ANNOTATION = 'deployment.kubernetes.io/revision';

/** The object's deployment revision as written (`"4"`), or `undefined` when it has none. */
export function revisionOf(obj: K8sResource): string | undefined {
  return obj.metadata.annotations?.[REVISION_ANNOTATION];
}

/** The revision as a number for sorting; `null` (sorted last) when missing or not numeric. */
export function revisionNumber(obj: K8sResource): number | null {
  const revision = revisionOf(obj);
  if (revision === undefined) return null;
  const value = Number(revision);
  return Number.isNaN(value) ? null : value;
}

/** The name of the Deployment owning `obj` (OCP `getOwnerNameByKind(obj, DeploymentModel)`), if any. */
export function owningDeploymentName(obj: K8sResource): string | undefined {
  return obj.metadata.ownerReferences?.find((ref) => ref.kind === 'Deployment' && ref.apiVersion.startsWith('apps/'))
    ?.name;
}
