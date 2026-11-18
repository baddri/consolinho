const CLUSTER_PATH = /^\/c\/[^/]+(\/.*)?$/;

/**
 * Path to navigate to when switching to `cluster` from `pathname`.
 *
 * Keeps the current page type (`/c/a/ns/x/pods` → `/c/b/ns/x/pods`) so operators can compare clusters quickly;
 * from pages outside a cluster (admin, 404) it goes to the target cluster's overview.
 */
export function clusterSwitchPath(pathname: string, cluster: string): string {
  const target = encodeURIComponent(cluster);
  const match = CLUSTER_PATH.exec(pathname);
  const rest = match?.[1];
  if (rest === undefined || rest === '/') {
    return `/c/${target}/overview`;
  }
  return `/c/${target}${rest}`;
}
