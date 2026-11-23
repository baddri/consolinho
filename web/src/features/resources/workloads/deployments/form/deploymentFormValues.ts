import type { Deployment, K8sResource } from '@/shared/k8s';
import type { DeploymentFormValues } from './deploymentFormSchema';

/** A Deployment as the proxy returns it (`apiVersion`, `kind` and `metadata` always set). */
export type DeploymentObject = Deployment & K8sResource;

/** `spec.replicas` when unset, as the API server defaults it. */
const DEFAULT_REPLICAS = 1;

/**
 * The form values of `deployment` (OCP `convertDeploymentToEditForm`): unset fields show what the API server
 * applies (`paused` false, one replica).
 */
export function toFormValues(deployment: DeploymentObject): DeploymentFormValues {
  return {
    paused: deployment.spec?.paused ?? false,
    replicas: deployment.spec?.replicas ?? DEFAULT_REPLICAS,
  };
}

/**
 * `deployment` with the form `values` written in (OCP `convertEditFormToDeployment`). The form only overwrites the
 * fields it owns, so everything else — unknown fields included — passes through unchanged. A field whose value equals
 * the shown default is left as it was (absent stays absent), so unchanged values round-trip to the identical object
 * and the YAML view never gains noise like `paused: false`. Keys keep their order; a newly set field is appended.
 */
export function applyFormValues(deployment: DeploymentObject, values: DeploymentFormValues): DeploymentObject {
  const { spec } = deployment;
  // A Deployment always has a spec (selector and template are required); without one there is nothing to edit.
  if (spec === undefined) return deployment;
  const current = toFormValues(deployment);
  const changes: Partial<DeploymentFormValues> = {};
  if (values.paused !== current.paused) changes.paused = values.paused;
  if (values.replicas !== current.replicas) changes.replicas = values.replicas;
  if (Object.keys(changes).length === 0) return deployment;
  return { ...deployment, spec: { ...spec, ...changes } };
}
