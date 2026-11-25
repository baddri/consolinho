import type { K8sModel } from '@/shared/k8s';

/** `namespace` value of {@link resourcePath} meaning "all namespaces" (`k8s/all-namespaces/<plural>`). */
export const ALL_NAMESPACES = 'all';

/**
 * Details tab segments; the Details tab itself has none. `replicasets`, `replicationcontrollers`, `machines`,
 * `subscription`, `related-objects`, `jobs`, `logs` and `terminal` exist only for kinds that opt in
 * (`ResourceDescriptor.extraTabs`, ADR-0037 §2).
 */
export type DetailsTab =
  | 'yaml'
  | 'replicasets'
  | 'replicationcontrollers'
  | 'machines'
  | 'subscription'
  | 'related-objects'
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
   * A full page of the object outside the details tabs: `form` is the kind's edit form
   * (`ResourceDescriptor.hasEditForm`, OCP `…/deployments/<name>/form`). Ignored when `tab` is set.
   */
  page?: 'form';
  /**
   * Query string to keep (`?label=app%3Dweb` or without the `?`), or parameters to encode (`{ container: 'web' }`,
   * e.g. the Logs tab's deep link, LOG-1).
   */
  search?: string | Readonly<Record<string, string>>;
}

const enc = encodeURIComponent;

/**
 * The one builder of SPA resource paths (ADR-0023 §1, FRONTEND.md "Routing"):
 * - cluster-scoped: `/c/<cluster>/k8s/cluster/<plural>[/<name>[/<tab>|/form]]`;
 * - namespaced: `/c/<cluster>/k8s/ns/<ns>/<plural>[/<name>[/<tab>|/form]]`, `/c/<cluster>/k8s/all-namespaces/<plural>`, or
 *   `/c/<cluster>/k8s/<plural>` without a namespace.
 *
 * Takes only `plural` and `namespaced` of the model so an unregistered plural from the URL can be routed too.
 */
export function resourcePath(
  cluster: string,
  model: Pick<K8sModel, 'plural' | 'namespaced'>,
  { namespace, name, tab, page, search }: ResourcePathOptions = {},
): string {
  const base = `/c/${enc(cluster)}/k8s`;
  let path: string;
  if (!model.namespaced) {
    path = `${base}/cluster/${enc(model.plural)}${objectSuffix(name, tab ?? page)}`;
  } else if (namespace === undefined) {
    path = `${base}/${enc(model.plural)}`;
  } else if (namespace === ALL_NAMESPACES) {
    path = `${base}/all-namespaces/${enc(model.plural)}`;
  } else {
    path = `${base}/ns/${enc(namespace)}/${enc(model.plural)}${objectSuffix(name, tab ?? page)}`;
  }
  const query = typeof search === 'object' ? new URLSearchParams(search).toString() : search;
  if (!query || query === '?') return path;
  return query.startsWith('?') ? `${path}${query}` : `${path}?${query}`;
}

function objectSuffix(name: string | undefined, tab: DetailsTab | 'form' | undefined): string {
  if (name === undefined) return '';
  return tab === undefined ? `/${enc(name)}` : `/${enc(name)}/${tab}`;
}

/** Home → Overview of `cluster` (OCP `/dashboards`, T-0335): `/c/<cluster>/overview`. */
export function clusterOverviewPath(cluster: string): string {
  return `/c/${enc(cluster)}/overview`;
}

/**
 * Administration → Cluster Settings of `cluster` (OCP `/settings/cluster`, T-0336): `/c/<cluster>/settings/cluster`,
 * or its ClusterOperators tab.
 */
export function clusterSettingsPath(cluster: string, tab?: 'clusteroperators'): string {
  const path = `/c/${enc(cluster)}/settings/cluster`;
  return tab === undefined ? path : `${path}/${tab}`;
}
