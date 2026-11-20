const CLUSTER_PATH = /^\/c\/[^/]+(\/.*)?$/;

/**
 * Where to navigate when switching to `cluster` from `location` (SW-9).
 *
 * Keeps the rest of the path and the query string (`/c/a/ns/x/pods?label=…` → `/c/b/ns/x/pods?label=…`) so operators
 * can compare clusters quickly. From the cluster root and from pages outside a cluster (admin, 404) it goes to the
 * target cluster's root, whose index route picks the landing page; filters of those pages are not carried over.
 */
export function clusterSwitchPath(location: { pathname: string; search: string }, cluster: string): string {
  const target = `/c/${encodeURIComponent(cluster)}`;
  const rest = CLUSTER_PATH.exec(location.pathname)?.[1];
  if (rest === undefined || rest === '/') {
    return target;
  }
  return `${target}${rest}${location.search}`;
}
