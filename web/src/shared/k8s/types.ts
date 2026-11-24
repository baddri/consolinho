/**
 * Kubernetes resource types (ADR-0022 §1). Upstream kinds come from `kubernetes-types` (types only, no runtime code);
 * OpenShift kinds it lacks are written by hand. In `kubernetes-types` every field is optional, so code reading these
 * objects must handle missing fields — just as with a real API server.
 */
export type {
  ConfigMap,
  Event,
  Namespace,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicationController,
  Secret,
  Service,
} from 'kubernetes-types/core/v1';
export type { DaemonSet, Deployment, ReplicaSet, StatefulSet } from 'kubernetes-types/apps/v1';
export type { CronJob, Job } from 'kubernetes-types/batch/v1';
export type { HorizontalPodAutoscaler } from 'kubernetes-types/autoscaling/v2';
export type { Ingress, NetworkPolicy } from 'kubernetes-types/networking/v1';
export type { StorageClass } from 'kubernetes-types/storage/v1';
export type {
  SelfSubjectAccessReview,
  SelfSubjectAccessReviewSpec,
  SubjectAccessReviewStatus,
} from 'kubernetes-types/authorization/v1';
export type {
  APIGroupList,
  APIVersions,
  ListMeta,
  ObjectMeta,
  OwnerReference,
  Status,
} from 'kubernetes-types/meta/v1';

import type { PodTemplateSpec } from 'kubernetes-types/core/v1';
import type { ListMeta, ObjectMeta, Status } from 'kubernetes-types/meta/v1';

/**
 * The minimum every object the console handles generically has. Note that the API server omits `apiVersion`/`kind`
 * on the items of a list response; only single-object responses and watch events carry them.
 */
export interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
}

/** A list response page: `metadata.resourceVersion` starts a watch, `metadata.continue` fetches the next page. */
export interface K8sList<T> {
  apiVersion: string;
  kind: string;
  metadata: ListMeta;
  items: T[];
}

/** Types of the lines of a watch stream. */
export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';

/** One NDJSON line of a watch stream; `ERROR` carries a `Status` (e.g. `code: 410` → relist). */
export interface WatchEvent<T> {
  type: WatchEventType;
  object: T | Status;
}

/** Annotations OpenShift stores project metadata in (set by `oc new-project` / project requests). */
export const PROJECT_ANNOTATIONS = {
  displayName: 'openshift.io/display-name',
  description: 'openshift.io/description',
  requester: 'openshift.io/requester',
} as const;

/** OpenShift `project.openshift.io/v1` Project: a namespace view; display name etc. live in {@link PROJECT_ANNOTATIONS}. */
export interface Project extends K8sResource {
  apiVersion: 'project.openshift.io/v1';
  kind: 'Project';
  spec?: { finalizers?: string[] };
  status?: { phase?: 'Active' | 'Terminating' };
}

/** Parameters of a DeploymentConfig's `Rolling` strategy (the subset the console shows and edits). */
export interface DeploymentConfigRollingParams {
  maxSurge?: number | string;
  maxUnavailable?: number | string;
  timeoutSeconds?: number;
  updatePeriodSeconds?: number;
  intervalSeconds?: number;
}

/** A DeploymentConfig trigger: `ConfigChange`, or `ImageChange` with its image stream tag. */
export interface DeploymentConfigTrigger {
  type: 'ConfigChange' | 'ImageChange';
  imageChangeParams?: {
    automatic?: boolean;
    containerNames?: string[];
    from: { kind: string; name: string; namespace?: string };
    lastTriggeredImage?: string;
  };
}

/** A condition of a DeploymentConfig's status (`Available`, `Progressing`). */
export interface DeploymentConfigCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastUpdateTime?: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

/**
 * OpenShift `apps.openshift.io/v1` DeploymentConfig, hand-written because `kubernetes-types` lacks it: a minimal
 * counterpart of OCP's `DeploymentConfigKind` (`public/module/k8s/types.ts`) with only the fields the console reads.
 * Unlike a Deployment, its `selector` is a plain label map and each rollout (`status.latestVersion`) is a
 * ReplicationController named `<name>-<version>`.
 */
export interface DeploymentConfig extends K8sResource {
  apiVersion: 'apps.openshift.io/v1';
  kind: 'DeploymentConfig';
  spec?: {
    replicas?: number;
    selector?: Record<string, string>;
    template?: PodTemplateSpec;
    strategy?: {
      type?: 'Rolling' | 'Recreate' | 'Custom';
      rollingParams?: DeploymentConfigRollingParams;
      recreateParams?: { timeoutSeconds?: number };
    };
    triggers?: DeploymentConfigTrigger[];
    paused?: boolean;
    minReadySeconds?: number;
  };
  status?: {
    latestVersion?: number;
    observedGeneration?: number;
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    unavailableReplicas?: number;
    conditions?: DeploymentConfigCondition[];
    details?: { message?: string };
  };
}

/** A backend of a Route: a Service (the only kind OpenShift routes to) and its share of traffic. */
export interface RouteTargetReference {
  kind: string;
  name: string;
  /** Relative weight 0–256 among `to` and `alternateBackends`. */
  weight?: number;
}

/** TLS settings of a Route; certificates and keys are PEM text. */
export interface RouteTLSConfig {
  termination: 'edge' | 'passthrough' | 'reencrypt';
  insecureEdgeTerminationPolicy?: 'Allow' | 'Disable' | 'Redirect' | 'None';
  certificate?: string;
  key?: string;
  caCertificate?: string;
  destinationCACertificate?: string;
}

/** A condition of a router's admission of a Route (`Admitted`). */
export interface RouteIngressCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/** One router's view of a Route; no entries = not yet admitted by any router. */
export interface RouteIngress {
  host: string;
  routerName: string;
  routerCanonicalHostname?: string;
  wildcardPolicy?: string;
  conditions?: RouteIngressCondition[];
}

/**
 * OpenShift `route.openshift.io/v1` Route (the fields the console reads), after OCP `RouteKind`
 * (`public/module/k8s/types.ts`). Not in `kubernetes-types`, so written by hand.
 */
export interface Route extends K8sResource {
  spec: {
    host?: string;
    path?: string;
    subdomain?: string;
    to: RouteTargetReference;
    alternateBackends?: RouteTargetReference[];
    port?: { targetPort: number | string };
    tls?: RouteTLSConfig;
    wildcardPolicy?: 'None' | 'Subdomain';
  };
  status?: { ingress?: RouteIngress[] };
}

/**
 * OpenShift `project.openshift.io/v1` ProjectRequest: POSTed to create a project as a self-provisioner; the server
 * answers the created {@link Project}. Display name and description become its annotations.
 */
export interface ProjectRequest extends K8sResource {
  apiVersion: 'project.openshift.io/v1';
  kind: 'ProjectRequest';
  metadata: ObjectMeta & { name: string };
  displayName?: string;
  description?: string;
}
