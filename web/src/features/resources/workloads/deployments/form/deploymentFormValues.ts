import type { Deployment, K8sResource } from '@/shared/k8s';
import { DEFAULT_BOUND, toDeploymentStrategy, type DeploymentStrategy } from '../deploymentStrategy';
import type { DeploymentFormValues, EnvRow, EnvVar } from './deploymentFormSchema';

/** A Deployment as the proxy returns it (`apiVersion`, `kind` and `metadata` always set). */
export type DeploymentObject = Deployment & K8sResource;

type DeploymentSpec = NonNullable<Deployment['spec']>;
type PodSpec = NonNullable<DeploymentSpec['template']['spec']>;
type Containers = PodSpec['containers'];
type Container = Containers[number];

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

/** The editor's empty row: OCP's `NameValueEditor` always shows at least one. */
export const blankValueRow = (): Extract<EnvRow, { type: 'value' }> => ({
  type: 'value',
  name: '',
  value: '',
});
/** The row "Add from ConfigMap or Secret" adds. */
export const blankRefRow = (): Extract<EnvRow, { type: 'ref' }> => ({
  type: 'ref',
  name: '',
  refKind: '',
  refName: '',
  key: '',
});

/** One `env` entry as an editor row; refs other than ConfigMap/Secret keys are read-only (OCP `ValueFromPair`). */
function toEnvRow(entry: EnvVar): EnvRow {
  const { name, value, valueFrom } = entry;
  if (valueFrom === undefined) return { type: 'value', name, value: value ?? '', source: entry };
  const ref = valueFrom.configMapKeyRef ?? valueFrom.secretKeyRef;
  if (ref === undefined) return { type: 'fixed', name, source: entry };
  const refKind = valueFrom.configMapKeyRef ? 'ConfigMap' : 'Secret';
  return { type: 'ref', name, refKind, refName: ref.name ?? '', key: ref.key, source: entry };
}

/** A container's `env` as editor rows, or the one empty row when it has none. */
const toEnvRows = (env: EnvVar[] | undefined): EnvRow[] =>
  env && env.length > 0 ? env.map(toEnvRow) : [blankValueRow()];

/**
 * The `env` entry a row writes, or `undefined` for a blank row (dropped, as OCP's `EnvironmentField`). A row still
 * equal to the entry it was read from returns (its copy of) that entry, so unknown fields (`optional`) and key order
 * survive.
 */
function toEnvVar(row: EnvRow): EnvVar | undefined {
  const name = row.name.trim();
  const { source } = row;
  if (row.type === 'fixed') return row.source.name === name ? row.source : { ...row.source, name };
  if (row.type === 'value') {
    if (name === '' && row.value === '') return undefined;
    if (source && !source.valueFrom && source.name === name && (source.value ?? '') === row.value)
      return source;
    return row.value === '' ? { name } : { name, value: row.value };
  }
  if (name === '' && row.refName === '' && row.key === '') return undefined;
  const refKey = row.refKind === 'Secret' ? 'secretKeyRef' : 'configMapKeyRef';
  const previous = source?.valueFrom?.[refKey];
  if (source?.name === name && previous?.name === row.refName && previous.key === row.key) return source;
  return { name, valueFrom: { [refKey]: { ...previous, name: row.refName, key: row.key } } };
}

/**
 * The form values of `deployment` (OCP `convertDeploymentToEditForm`): unset fields show what the API server
 * applies (Rolling Update with 25% bounds, `paused` false, one replica). Image and `env` are listed per container.
 */
export function toFormValues(deployment: DeploymentObject): DeploymentFormValues {
  const { spec } = deployment;
  return {
    ...strategyValues(spec?.strategy),
    containers: (spec?.template.spec?.containers ?? []).map(({ name, image, env }) => ({
      name,
      image: image ?? '',
      env: toEnvRows(env),
    })),
    imagePullSecret: spec?.template.spec?.imagePullSecrets?.[0]?.name ?? '',
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

/**
 * Whether two `env` entries are equal by value. Rows hold a copy of their source entry (react-hook-form clones form
 * values), so identity can't tell; entries are small JSON, and an unchanged row writes its source's keys in order.
 */
const sameEntry = (a: EnvVar, b: EnvVar | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** `container.env` with the rows written in; the same container object when every entry is unchanged by value. */
function applyEnv(container: Container, rows: EnvRow[]): Container {
  const original = container.env ?? [];
  const env = rows.map(toEnvVar).filter((entry) => entry !== undefined);
  if (env.length === original.length && env.every((entry, index) => sameEntry(entry, original[index])))
    return container;
  if (env.length > 0) return { ...container, env };
  const next = { ...container };
  delete next.env;
  return next;
}

/**
 * `containers` with the changed image and `env` written in, matched by container name; other fields (`envFrom`
 * included) are untouched, and an unchanged container stays the same object.
 */
function applyContainers(containers: Containers, values: DeploymentFormValues['containers']): Containers {
  const byName = new Map(values.map((value) => [value.name, value]));
  return containers.map((container) => {
    const value = byName.get(container.name);
    if (value === undefined) return container;
    const image = value.image.trim();
    const imaged = image === container.image ? container : { ...container, image };
    return applyEnv(imaged, value.env);
  });
}

/**
 * `imagePullSecrets` with the picked secret appended unless already listed (OCP `convertEditFormToDeployment`): the
 * form never removes a pull secret, so picking another one adds it after the existing ones.
 */
function applyPullSecret(
  pullSecrets: PodSpec['imagePullSecrets'],
  name: string,
): PodSpec['imagePullSecrets'] {
  const current = pullSecrets ?? [];
  if (name === '' || current.some((secret) => secret.name === name)) return pullSecrets;
  return [...current, { name }];
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
    const podChanges: Partial<PodSpec> = {};
    const containers = applyContainers(podSpec.containers, values.containers);
    if (containers.some((container, index) => container !== podSpec.containers[index])) {
      podChanges.containers = containers;
    }
    const imagePullSecrets = applyPullSecret(podSpec.imagePullSecrets, values.imagePullSecret);
    if (imagePullSecrets !== podSpec.imagePullSecrets) podChanges.imagePullSecrets = imagePullSecrets;
    if (Object.keys(podChanges).length > 0) {
      changes.template = { ...spec.template, spec: { ...podSpec, ...podChanges } };
    }
  }
  if (values.paused !== current.paused) changes.paused = values.paused;
  if (values.replicas !== current.replicas) changes.replicas = values.replicas;
  if (Object.keys(changes).length === 0) return deployment;
  return { ...deployment, spec: { ...spec, ...changes } };
}
