/** How the API server treats an object's dependents on delete (`DeleteOptions.propagationPolicy`). */
export type PropagationPolicy = 'Foreground' | 'Background' | 'Orphan';

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
  /**
   * Cascade policy for deleting dependents (OCP `K8sKind.propagationPolicy`, `public/models/index.ts`). When set, the
   * delete dialog offers "Delete dependent objects of this resource"; unchecked sends `Orphan`.
   */
  readonly propagationPolicy?: Exclude<PropagationPolicy, 'Orphan'>;
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
  propagationPolicy: 'Foreground',
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
  propagationPolicy: 'Foreground',
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

export const StatefulSetModel: K8sModel = {
  group: 'apps',
  version: 'v1',
  kind: 'StatefulSet',
  plural: 'statefulsets',
  namespaced: true,
  label: 'StatefulSet',
  labelPlural: 'StatefulSets',
  abbr: 'SS',
  propagationPolicy: 'Foreground',
};

export const DaemonSetModel: K8sModel = {
  group: 'apps',
  version: 'v1',
  kind: 'DaemonSet',
  plural: 'daemonsets',
  namespaced: true,
  label: 'DaemonSet',
  labelPlural: 'DaemonSets',
  abbr: 'DS',
  propagationPolicy: 'Foreground',
};

/** Core replication controller; also what an OpenShift DeploymentConfig rolls out (one per version). */
export const ReplicationControllerModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'ReplicationController',
  plural: 'replicationcontrollers',
  namespaced: true,
  label: 'ReplicationController',
  labelPlural: 'ReplicationControllers',
  abbr: 'RC',
  propagationPolicy: 'Foreground',
};

/** OpenShift-only (`apps.openshift.io`): hidden where discovery lacks the group. */
export const DeploymentConfigModel: K8sModel = {
  group: 'apps.openshift.io',
  version: 'v1',
  kind: 'DeploymentConfig',
  plural: 'deploymentconfigs',
  namespaced: true,
  label: 'DeploymentConfig',
  labelPlural: 'DeploymentConfigs',
  abbr: 'DC',
  propagationPolicy: 'Foreground',
};

export const JobModel: K8sModel = {
  group: 'batch',
  version: 'v1',
  kind: 'Job',
  plural: 'jobs',
  namespaced: true,
  label: 'Job',
  labelPlural: 'Jobs',
  abbr: 'J',
  propagationPolicy: 'Foreground',
};

export const CronJobModel: K8sModel = {
  group: 'batch',
  version: 'v1',
  kind: 'CronJob',
  plural: 'cronjobs',
  namespaced: true,
  label: 'CronJob',
  labelPlural: 'CronJobs',
  abbr: 'CJ',
  propagationPolicy: 'Foreground',
};

/** `autoscaling/v2`, as OCP: metrics are a list of typed sources, not v1's single CPU target. */
export const HorizontalPodAutoscalerModel: K8sModel = {
  group: 'autoscaling',
  version: 'v2',
  kind: 'HorizontalPodAutoscaler',
  plural: 'horizontalpodautoscalers',
  namespaced: true,
  label: 'HorizontalPodAutoscaler',
  labelPlural: 'HorizontalPodAutoscalers',
  abbr: 'HPA',
};

export const SecretModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'Secret',
  plural: 'secrets',
  namespaced: true,
  label: 'Secret',
  labelPlural: 'Secrets',
  abbr: 'S',
};

/** OpenShift-only (`route.openshift.io`): hidden where discovery lacks the group (vanilla Kubernetes). */
export const RouteModel: K8sModel = {
  group: 'route.openshift.io',
  version: 'v1',
  kind: 'Route',
  plural: 'routes',
  namespaced: true,
  label: 'Route',
  labelPlural: 'Routes',
  abbr: 'RT',
};

export const IngressModel: K8sModel = {
  group: 'networking.k8s.io',
  version: 'v1',
  kind: 'Ingress',
  plural: 'ingresses',
  namespaced: true,
  label: 'Ingress',
  labelPlural: 'Ingresses',
  abbr: 'I',
};

export const NetworkPolicyModel: K8sModel = {
  group: 'networking.k8s.io',
  version: 'v1',
  kind: 'NetworkPolicy',
  plural: 'networkpolicies',
  namespaced: true,
  label: 'NetworkPolicy',
  labelPlural: 'NetworkPolicies',
  abbr: 'NP',
};

export const PersistentVolumeClaimModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'PersistentVolumeClaim',
  plural: 'persistentvolumeclaims',
  namespaced: true,
  label: 'PersistentVolumeClaim',
  labelPlural: 'PersistentVolumeClaims',
  abbr: 'PVC',
};

export const PersistentVolumeModel: K8sModel = {
  group: '',
  version: 'v1',
  kind: 'PersistentVolume',
  plural: 'persistentvolumes',
  namespaced: false,
  label: 'PersistentVolume',
  labelPlural: 'PersistentVolumes',
  abbr: 'PV',
};

export const StorageClassModel: K8sModel = {
  group: 'storage.k8s.io',
  version: 'v1',
  kind: 'StorageClass',
  plural: 'storageclasses',
  namespaced: false,
  label: 'StorageClass',
  labelPlural: 'StorageClasses',
  abbr: 'SC',
};

/**
 * Only ever POSTed (Create Project, T-0309): the API server creates the Namespace + Project and answers the Project.
 * No descriptor, no nav; known here so the audit label map and access checks can name it.
 */
export const ProjectRequestModel: K8sModel = {
  group: 'project.openshift.io',
  version: 'v1',
  kind: 'ProjectRequest',
  plural: 'projectrequests',
  namespaced: false,
  label: 'ProjectRequest',
  labelPlural: 'ProjectRequests',
  abbr: '',
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
  StatefulSetModel,
  DaemonSetModel,
  ReplicationControllerModel,
  DeploymentConfigModel,
  JobModel,
  CronJobModel,
  HorizontalPodAutoscalerModel,
  SecretModel,
  RouteModel,
  IngressModel,
  NetworkPolicyModel,
  PersistentVolumeClaimModel,
  PersistentVolumeModel,
  StorageClassModel,
  ProjectRequestModel,
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
