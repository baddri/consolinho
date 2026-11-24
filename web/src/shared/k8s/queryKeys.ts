import type { ListOptions } from './client';
import { modelKey, type K8sModel } from './models';

/** Verbs an access check can ask about (UI-9). */
export type AccessVerb = 'get' | 'list' | 'watch' | 'update' | 'patch' | 'delete' | 'create';

/** What {@link useCanI} asks the cluster: may the grant's ServiceAccount `verb` on `model` (in `namespace`, `name`)? */
export interface AccessReview {
  verb: AccessVerb;
  model: K8sModel;
  namespace?: string | undefined;
  name?: string | undefined;
  /** Subresource (`scale`, `exec`, `log`): `patch deployments/scale` is narrower than `patch deployments`. */
  subresource?: string | undefined;
}

/**
 * Query key factories of the Kubernetes data layer (ADR-0022 §7) — never build these keys inline. Every key starts
 * with `['k8s', cluster]`, so switching cluster can never show another cluster's data and `all(cluster)` drops a
 * cluster's whole cache.
 */
export const k8sQueryKeys = {
  /** Prefix of every Kubernetes query of `cluster`. */
  all: (cluster: string) => ['k8s', cluster] as const,
  /** A live list; the namespace is ignored for cluster-scoped kinds. */
  list: (cluster: string, model: K8sModel, opts: ListOptions = {}) =>
    [
      'k8s',
      cluster,
      'list',
      modelKey(model),
      model.namespaced && opts.namespace ? opts.namespace : '',
      opts.labelSelector ?? '',
      opts.fieldSelector ?? '',
    ] as const,
  /** One object. */
  get: (cluster: string, model: K8sModel, namespace: string | undefined, name: string) =>
    ['k8s', cluster, 'get', modelKey(model), model.namespaced && namespace ? namespace : '', name] as const,
  /** The served `group/version`s (DATA-2). */
  discovery: (cluster: string) => ['k8s', cluster, 'discovery'] as const,
  /** The OpenAPI v3 index (ADR-0038 §2); a prefix of every {@link openapiDocument} key of the cluster. */
  openapiIndex: (cluster: string) => ['k8s', cluster, 'openapi'] as const,
  /** One parsed OpenAPI v3 group-version document, `gvPath` = `api/v1` or `apis/<group>/<version>`. */
  openapiDocument: (cluster: string, gvPath: string) => ['k8s', cluster, 'openapi', gvPath] as const,
  /** One access check (UI-9). */
  access: (cluster: string, review: AccessReview) =>
    [
      'k8s',
      cluster,
      'access',
      review.verb,
      review.model.group,
      review.model.plural,
      review.subresource ?? '',
      review.namespace ?? '',
      review.name ?? '',
    ] as const,
};
