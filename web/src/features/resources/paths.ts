import type { K8sModel } from '@/shared/k8s';

/** `namespace` value of {@link resourcePath} meaning "all namespaces" (`k8s/all-namespaces/<plural>`). */
export const ALL_NAMESPACES = 'all';

/**
 * Details tab segments; the Details tab itself has none. `replicasets`, `replicationcontrollers`, `jobs`, `logs` and
 * `terminal` exist only for kinds that opt in (`ResourceDescriptor.extraTabs`, ADR-0037 §2).
 */
export type DetailsTab =
  | 'yaml'
  | 'replicasets'
  | 'replicationcontrollers'
  | 'pods'
  | 'jobs'
  | 'logs'
  | 'events'
  | 'terminal';

/** Options of {@link resourcePath}. */
export interface ResourcePathOptions {
  /**
   * Namespaced kinds: a namespace, {@link ALL_NAMESPACES}, or omitted for `k8s/<plural>` (the redirect that picks the
   * user's namespace). Ignored for cluster-scoped kinds.
   */
  namespace?: string;
  /** Object name → details page. Namespaced kinds need a concrete `namespace` for it. */
  name?: string;
  tab?: DetailsTab;
  /**
   * Query string to keep (`?label=app%3Dweb` or without the `?`), or parameters to encode (`{ container: 'web' }`,
   * e.g. the Logs tab's deep link, LOG-1).
   */
  search?: string | Readonly<Record<string, string>>;
}

const enc = encodeURIComponent;

/**
 * The one builder of SPA resource paths (ADR-0023 §1, FRONTEND.md "Routing"):
 * - cluster-scoped: `/c/<cluster>/k8s/cluster/<plural>[/<name>[/<tab>]]`;
 * - namespaced: `/c/<cluster>/k8s/ns/<ns>/<plural>[/<name>[/<tab>]]`, `/c/<cluster>/k8s/all-namespaces/<plural>`, or
 *   `/c/<cluster>/k8s/<plural>` without a namespace.
 *
 * Takes only `plural` and `namespaced` of the model so an unregistered plural from the URL can be routed too.
 */
export function resourcePath(
  cluster: string,
  model: Pick<K8sModel, 'plural' | 'namespaced'>,
  { namespace, name, tab, search }: ResourcePathOptions = {},
): string {
  const base = `/c/${enc(cluster)}/k8s`;
  let path: string;
  if (!model.namespaced) {
    path = `${base}/cluster/${enc(model.plural)}${objectSuffix(name, tab)}`;
  } else if (namespace === undefined) {
    path = `${base}/${enc(model.plural)}`;
  } else if (namespace === ALL_NAMESPACES) {
    path = `${base}/all-namespaces/${enc(model.plural)}`;
  } else {
    path = `${base}/ns/${enc(namespace)}/${enc(model.plural)}${objectSuffix(name, tab)}`;
  }
  const query = typeof search === 'object' ? new URLSearchParams(search).toString() : search;
  if (!query || query === '?') return path;
  return query.startsWith('?') ? `${path}${query}` : `${path}?${query}`;
}

function objectSuffix(name: string | undefined, tab: DetailsTab | undefined): string {
  if (name === undefined) return '';
  return tab === undefined ? `/${enc(name)}` : `/${enc(name)}/${tab}`;
}
