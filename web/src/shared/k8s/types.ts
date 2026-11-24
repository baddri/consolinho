/**
 * Kubernetes resource types (ADR-0022 §1). Upstream kinds come from `kubernetes-types` (types only, no runtime code);
 * OpenShift kinds it lacks are written by hand. In `kubernetes-types` every field is optional, so code reading these
 * objects must handle missing fields — just as with a real API server.
 */
export type {
  ConfigMap,
  Event,
  Namespace,
  Node,
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

import type { NodeAddress, ObjectReference, PodTemplateSpec } from 'kubernetes-types/core/v1';
import type { LabelSelector, ListMeta, ObjectMeta, Status } from 'kubernetes-types/meta/v1';

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

/** A status condition as OpenShift config and OLM objects report them (`metav1.Condition`-like). */
export interface K8sCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/** A release image + version (ClusterVersion `desired`, `availableUpdates`, `desiredUpdate`). */
export interface ClusterRelease {
  version?: string;
  image?: string;
  channels?: string[];
  url?: string;
}

/** One entry of a ClusterVersion's update history; newest first. `Partial` = not (yet) fully applied. */
export interface ClusterUpdateHistory {
  state: 'Completed' | 'Partial';
  version: string;
  image?: string;
  startedTime?: string;
  completionTime?: string | null;
  verified?: boolean;
}

/**
 * OpenShift `config.openshift.io/v1` ClusterVersion (singleton `version`): a minimal counterpart of OCP
 * `ClusterVersionKind` (`public/module/k8s/types.ts`) with the fields the console reads. Conditions of interest:
 * `Available`, `Progressing` (update running), `Failing`, `RetrievedUpdates`, `Upgradeable`.
 */
export interface ClusterVersion extends K8sResource {
  spec?: {
    channel?: string;
    clusterID?: string;
    desiredUpdate?: ClusterRelease;
    upstream?: string;
  };
  status?: {
    desired?: ClusterRelease;
    history?: ClusterUpdateHistory[];
    conditions?: K8sCondition[];
    availableUpdates?: ClusterRelease[] | null;
    conditionalUpdates?: { release: ClusterRelease; conditions?: K8sCondition[] }[];
    observedGeneration?: number;
  };
}

/** A version an operator reports for itself (`name: operator`) or one of its operands. */
export interface OperandVersion {
  name: string;
  version: string;
}

/** OpenShift `config.openshift.io/v1` ClusterOperator, after OCP `ClusterOperator` (`public/module/k8s/types.ts`). */
export interface ClusterOperator extends K8sResource {
  spec?: Record<string, never>;
  status?: {
    conditions?: K8sCondition[];
    versions?: OperandVersion[];
    relatedObjects?: { group: string; resource: string; namespace?: string; name: string }[];
  };
}

/**
 * OpenShift `config.openshift.io/v1` Infrastructure (singleton `cluster`), after OCP `InfrastructureKind`
 * (`public/module/k8s/types.ts`): platform and API server URLs.
 */
export interface Infrastructure extends K8sResource {
  spec?: { platformSpec?: { type?: string } };
  status?: {
    platform?: string;
    platformStatus?: { type?: string };
    infrastructureName?: string;
    apiServerURL?: string;
    apiServerInternalURI?: string;
    controlPlaneTopology?: string;
    infrastructureTopology?: string;
  };
}

/** The provider-specific part of a Machine spec; only the fields OCP shows (instance type, placement). */
export interface MachineProviderSpec {
  value?: {
    instanceType?: string;
    vmSize?: string;
    machineType?: string;
    flavor?: string;
    placement?: { availabilityZone?: string; region?: string };
    [key: string]: unknown;
  };
}

/**
 * OpenShift Machine API `machine.openshift.io/v1beta1` Machine, after OCP `MachineKind` (`public/module/k8s/types.ts`).
 * `status.nodeRef` links it to its Node; role/type come from `machine.openshift.io/cluster-api-machine-role|type` labels.
 */
export interface Machine extends K8sResource {
  spec?: { providerSpec?: MachineProviderSpec; providerID?: string };
  status?: {
    phase?: string;
    addresses?: NodeAddress[];
    lastUpdated?: string;
    nodeRef?: { kind?: string; name: string; uid?: string };
    errorReason?: string;
    errorMessage?: string;
    providerStatus?: { conditions?: K8sCondition[] };
  };
}

/** OpenShift Machine API `machine.openshift.io/v1beta1` MachineSet, after OCP `MachineSetKind`. */
export interface MachineSet extends K8sResource {
  spec?: {
    replicas?: number;
    selector?: LabelSelector;
    template?: { metadata?: ObjectMeta; spec?: { providerSpec?: MachineProviderSpec } };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    fullyLabeledReplicas?: number;
  };
}

/** Phase of a ClusterServiceVersion (OCP `ClusterServiceVersionPhase`, `packages/operator-lifecycle-manager/src/types.ts`). */
export type ClusterServiceVersionPhase =
  'Pending' | 'Installing' | 'Succeeded' | 'Failed' | 'Unknown' | 'Replacing' | 'Deleting';

/**
 * OLM `operators.coreos.com/v1alpha1` ClusterServiceVersion: an installed operator, after OCP
 * `ClusterServiceVersionKind` (`packages/operator-lifecycle-manager/src/types.ts`), reduced to what the console reads.
 */
export interface ClusterServiceVersion extends K8sResource {
  spec?: {
    displayName?: string;
    description?: string;
    version?: string;
    provider?: { name?: string };
    replaces?: string;
    icon?: { base64data: string; mediatype: string }[];
    installModes?: { type: string; supported: boolean }[];
  };
  status?: {
    phase?: ClusterServiceVersionPhase;
    reason?: string;
    message?: string;
    conditions?: { phase?: string; reason?: string; message?: string; lastTransitionTime?: string }[];
  };
}

/** Whether OLM applies an operator's InstallPlans by itself or waits for approval. */
export type InstallPlanApproval = 'Automatic' | 'Manual';

/**
 * OLM `operators.coreos.com/v1alpha1` Subscription, after OCP `SubscriptionKind`
 * (`packages/operator-lifecycle-manager/src/types.ts`). `status.state` e.g. `AtLatestKnown`, `UpgradePending`.
 */
export interface Subscription extends K8sResource {
  spec?: {
    name?: string;
    source?: string;
    sourceNamespace?: string;
    channel?: string;
    startingCSV?: string;
    installPlanApproval?: InstallPlanApproval;
  };
  status?: {
    state?: string;
    currentCSV?: string;
    installedCSV?: string;
    installPlanRef?: ObjectReference;
    conditions?: K8sCondition[];
    lastUpdated?: string;
  };
}

/** Phase of an InstallPlan (OCP `InstallPlanPhase`); `RequiresApproval` waits for a Manual approval. */
export type InstallPlanPhase = '' | 'Planning' | 'RequiresApproval' | 'Installing' | 'Complete' | 'Failed';

/** OLM `operators.coreos.com/v1alpha1` InstallPlan, after OCP `InstallPlanKind` (`packages/operator-lifecycle-manager/src/types.ts`). */
export interface InstallPlan extends K8sResource {
  spec?: {
    clusterServiceVersionNames?: string[];
    approval?: InstallPlanApproval;
    approved?: boolean;
  };
  status?: {
    phase?: InstallPlanPhase;
    catalogSources?: string[];
    conditions?: K8sCondition[];
  };
}
