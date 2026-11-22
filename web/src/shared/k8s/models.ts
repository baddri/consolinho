/**
 * Model descriptors of the Kubernetes kinds the console knows (ADR-0022 §1, FRONTEND.md "Kubernetes resources").
 * Generic list/detail/YAML pages, URL building, query keys and access checks are all driven by these; a new kind is a
 * new descriptor, not new plumbing.
 */
export interface K8sModel {
  /** API group; `''` is the core (legacy) group served under `/api`. */
  readonly group: string;
  readonly version: string;
  readonly kind: string;
  /** Resource name in URLs and RBAC rules (`pods`, `deployments`). */
  readonly plural: string;
  readonly namespaced: boolean;
  /** Singular display name ("Pod"). */
  readonly label: string;
  /** Plural display name ("Pods"). */
  readonly labelPlural: string;
  /** Badge abbreviation shown next to names, as in the OpenShift console. */
  readonly abbr: string;
}

export const ProjectModel: K8sModel = {
  group: 'project.openshift.io',
  version: 'v1',
  kind: 'Project',
  plural: 'projects',
  namespaced: false,
  label: 'Project',
  labelPlural: 'Projects',
  abbr: 'PR',
};

export const NamespaceModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'Namespace',
  plural: 'namespaces',
  namespaced: false,
  label: 'Namespace',
  labelPlural: 'Namespaces',
  abbr: 'NS',
};

export const PodModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'Pod',
  plural: 'pods',
  namespaced: true,
  label: 'Pod',
  labelPlural: 'Pods',
  abbr: 'P',
};

export const DeploymentModel: K8sModel = {
  group: 'apps',
  version: 'v1',
  kind: 'Deployment',
  plural: 'deployments',
  namespaced: true,
  label: 'Deployment',
  labelPlural: 'Deployments',
  abbr: 'D',
};

/** Owner of a deployment's pods (pod Owner column and links). */
export const ReplicaSetModel: K8sModel = {
  group: 'apps',
  version: 'v1',
  kind: 'ReplicaSet',
  plural: 'replicasets',
  namespaced: true,
  label: 'ReplicaSet',
  labelPlural: 'ReplicaSets',
  abbr: 'RS',
};

export const ServiceModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'Service',
  plural: 'services',
  namespaced: true,
  label: 'Service',
  labelPlural: 'Services',
  abbr: 'S',
};

export const ConfigMapModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'ConfigMap',
  plural: 'configmaps',
  namespaced: true,
  label: 'ConfigMap',
  labelPlural: 'ConfigMaps',
  abbr: 'CM',
};

/** Core `v1` events (what `oc get events` and the OpenShift console show), not `events.k8s.io`. */
export const EventModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'Event',
  plural: 'events',
  namespaced: true,
  label: 'Event',
  labelPlural: 'Events',
  abbr: 'E',
};

/** Only ever POSTed (access checks, ADR-0022 §9); never listed. */
export const SelfSubjectAccessReviewModel: K8sModel = {
  group: 'authorization.k8s.io',
  version: 'v1',
  kind: 'SelfSubjectAccessReview',
  plural: 'selfsubjectaccessreviews',
  namespaced: false,
  label: 'SelfSubjectAccessReview',
  labelPlural: 'SelfSubjectAccessReviews',
  abbr: 'SSAR',
};

/** Every known model, e.g. to resolve a model from an object's `apiVersion` + `kind`. */
export const K8S_MODELS: readonly K8sModel[] = [
  ProjectModel,
  NamespaceModel,
  PodModel,
  DeploymentModel,
  ReplicaSetModel,
  ServiceModel,
  ConfigMapModel,
  EventModel,
  SelfSubjectAccessReviewModel,
];

/** The `apiVersion` of objects of `model`: `v1` for the core group, `<group>/<version>` otherwise. */
export function apiVersionOf(model: K8sModel): string {
  return model.group === '' ? model.version : `${model.group}/${model.version}`;
}

/** Stable identity of a model in query keys (ADR-0022 §7): `"<group>/<version>/<plural>"`, e.g. `"/v1/pods"`. */
export function modelKey(model: K8sModel): string {
  return `${model.group}/${model.version}/${model.plural}`;
}

/** The known model of an object with this `apiVersion` and `kind`, if any. */
export function findModel(apiVersion: string, kind: string): K8sModel | undefined {
  return K8S_MODELS.find((model) => apiVersionOf(model) === apiVersion && model.kind === kind);
}
