/**
 * Kubernetes resource types (ADR-0022 §1). Upstream kinds come from `kubernetes-types` (types only, no runtime code);
 * OpenShift kinds it lacks are written by hand. In `kubernetes-types` every field is optional, so code reading these
 * objects must handle missing fields — just as with a real API server.
 */
export type { ConfigMap, Event, Namespace, Pod, Service } from 'kubernetes-types/core/v1';
export type { Deployment, ReplicaSet } from 'kubernetes-types/apps/v1';
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
