import type { Deployment, K8sResource } from '@/shared/k8s';
import { DEFAULT_BOUND, toDeploymentStrategy, type DeploymentStrategy } from '../deploymentStrategy';
import type { DeploymentFormValues } from './deploymentFormSchema';

/** A Deployment as the proxy returns it (`apiVersion`, `kind` and `metadata` always set). */
export type DeploymentObject = Deployment & K8sResource;

type DeploymentSpec = NonNullable<Deployment['spec']>;
type Containers = NonNullable<DeploymentSpec['template']['spec']>['containers'];

/** `spec.replicas` when unset, as the API server defaults it. */
const DEFAULT_REPLICAS = 1;

type StrategyValues = Pick<DeploymentFormValues, 'strategyType' | 'maxUnavailable' | 'maxSurge'>;

function strategyValues(strategy: DeploymentStrategy | undefined): StrategyValues {
  const rolling = strategy?.rollingUpdate;
  return {
    strategyType: strategy?.type === 'Recreate' ? 'Recreate' : 'RollingUpdate',
    maxUnavailable: String(rolling?.maxUnavailable ?? DEFAULT_BOUND),
    maxSurge: String(rolling?.maxSurge ?? DEFAULT_BOUND),
  };
}

/**
 * The form values of `deployment` (OCP `convertDeploymentToEditForm`): unset fields show what the API server
 * applies (Rolling Update with 25% bounds, `paused` false, one replica). Images are listed per container by name.
 */
export function toFormValues(deployment: DeploymentObject): DeploymentFormValues {
  const { spec } = deployment;
  return {
    ...strategyValues(spec?.strategy),
    images: (spec?.template.spec?.containers ?? []).map(({ name, image }) => ({ name, image: image ?? '' })),
    paused: spec?.paused ?? false,
    replicas: spec?.replicas ?? DEFAULT_REPLICAS,
  };
}

/**
 * `spec.strategy` with the strategy values written in (OCP `convertEditFormToDeployment`): the bounds are parsed by
 * the update-strategy modal's `toDeploymentStrategy` (`25%` stays a string, `1` becomes a number, blank is 25%).
 * Recreate drops `rollingUpdate` (the API rejects it there); other strategy fields pass through.
 */
function applyStrategy(strategy: DeploymentStrategy | undefined, values: StrategyValues): DeploymentStrategy {
  const next = toDeploymentStrategy({
    type: values.strategyType,
    maxUnavailable: values.maxUnavailable.trim(),
    maxSurge: values.maxSurge.trim(),
  });
  if (next.rollingUpdate === undefined) {
    const rest = { ...strategy };
    delete rest.rollingUpdate;
    return { ...rest, ...next };
  }
  return { ...strategy, ...next, rollingUpdate: { ...strategy?.rollingUpdate, ...next.rollingUpdate } };
}

/** `containers` with the changed images written in, matched by container name; other fields are untouched. */
function applyImages(containers: Containers, images: DeploymentFormValues['images']): Containers {
  const byName = new Map(images.map(({ name, image }) => [name, image.trim()]));
  return containers.map((container) => {
    const image = byName.get(container.name);
    return image === undefined || image === container.image ? container : { ...container, image };
  });
}

/**
 * `deployment` with the form `values` written in (OCP `convertEditFormToDeployment`). The form only overwrites the
 * fields it owns, so everything else — unknown fields included — passes through unchanged. A field whose value equals
 * what the form showed for it is left as it was (absent stays absent), so unchanged values round-trip to the identical
 * object and the YAML view never gains noise like `paused: false`. Keys keep their order; a newly set field is appended.
 */
export function applyFormValues(
  deployment: DeploymentObject,
  values: DeploymentFormValues,
): DeploymentObject {
  const { spec } = deployment;
  // A Deployment always has a spec (selector and template are required); without one there is nothing to edit.
  if (spec === undefined) return deployment;
  const current = toFormValues(deployment);
  const changes: Partial<DeploymentSpec> = {};
  if (
    values.strategyType !== current.strategyType ||
    values.maxUnavailable.trim() !== current.maxUnavailable ||
    values.maxSurge.trim() !== current.maxSurge
  ) {
    changes.strategy = applyStrategy(spec.strategy, values);
  }
  const podSpec = spec.template.spec;
  if (podSpec !== undefined) {
    const containers = applyImages(podSpec.containers, values.images);
    if (containers.some((container, index) => container !== podSpec.containers[index])) {
      changes.template = { ...spec.template, spec: { ...podSpec, containers } };
    }
  }
  if (values.paused !== current.paused) changes.paused = values.paused;
  if (values.replicas !== current.replicas) changes.replicas = values.replicas;
  if (Object.keys(changes).length === 0) return deployment;
  return { ...deployment, spec: { ...spec, ...changes } };
}
