import type { K8sModel } from './models';

/** Options of {@link resourceApiPath}. */
export interface ResourceApiPathOptions {
  /** Namespace of a namespaced kind; ignored for cluster-scoped kinds. Absent = all namespaces. */
  namespace?: string | undefined;
  /** Object name; absent = the collection. */
  name?: string | undefined;
  /** Subresource of the named object (`scale`, `log`, `exec`); requires `name`. */
  subresource?: string | undefined;
  /** Query parameters passed to the API server unchanged; `undefined` values are dropped. */
  query?: Record<string, string | undefined>;
}

/**
 * Path of the proxy root of `cluster` (contract §1): everything below it is the cluster's raw Kubernetes API.
 * The cluster name is URL-encoded so a name can never escape its path segment.
 */
export function proxyBasePath(cluster: string): string {
  return `/api/clusters/${encodeURIComponent(cluster)}/k8s`;
}

/**
 * Same-origin path of a resource collection or object of `model` through the proxy — the only place that knows the
 * core group lives under `/api/{version}` and every other group under `/apis/{group}/{version}` (ADR-0022 §1).
 *
 * @example resourceApiPath('dev-1', PodModel, { namespace: 'shop', query: { limit: '250' } })
 *   // → '/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods?limit=250'
 * @example resourceApiPath('dev-1', DeploymentModel, { namespace: 'shop', name: 'web', subresource: 'scale' })
 *   // → '/api/clusters/dev-1/k8s/apis/apps/v1/namespaces/shop/deployments/web/scale'
 * @throws Error when `subresource` is given without `name` (a programming error, not an API failure).
 */
export function resourceApiPath(cluster: string, model: K8sModel, opts: ResourceApiPathOptions = {}): string {
  const groupPath = model.group === '' ? `/api/${model.version}` : `/apis/${model.group}/${model.version}`;
  const namespacePath =
    model.namespaced && opts.namespace ? `/namespaces/${encodeURIComponent(opts.namespace)}` : '';
  if (opts.subresource && !opts.name) throw new Error('resourceApiPath: a subresource requires a name');
  const namePath = opts.name ? `/${encodeURIComponent(opts.name)}` : '';
  const subresourcePath = opts.subresource ? `/${encodeURIComponent(opts.subresource)}` : '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  const query = search ? `?${search}` : '';
  return `${proxyBasePath(cluster)}${groupPath}${namespacePath}/${model.plural}${namePath}${subresourcePath}${query}`;
}
