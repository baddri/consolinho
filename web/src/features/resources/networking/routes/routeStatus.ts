import type { Route } from '@/shared/k8s';

/** A Route's admission state, as OCP's `RoutesStatuses`. */
export type RouteStatus = 'Accepted' | 'Rejected' | 'Pending';

/** Every {@link RouteStatus}, in OCP's filter order. */
export const ROUTE_STATUSES: readonly RouteStatus[] = ['Accepted', 'Rejected', 'Pending'];

/** The `Admitted` conditions of every router that reported on `route`. */
function admittedConditions(route: Route) {
  return (route.status?.ingress ?? []).flatMap((ingress) =>
    (ingress.conditions ?? []).filter((condition) => condition.type === 'Admitted'),
  );
}

/**
 * Whether any router serves `route` (networking-plugin `getRouteStatus`): `Accepted` when one router admitted it,
 * else `Rejected` when one refused it, else `Pending` (no router has reported yet).
 */
export function routeStatus(route: Route): RouteStatus {
  const conditions = admittedConditions(route);
  if (conditions.some((condition) => condition.status === 'True')) return 'Accepted';
  if (conditions.some((condition) => condition.status === 'False')) return 'Rejected';
  return 'Pending';
}

/**
 * The host `route` is served at (networking-plugin `getRouteHost`): the host of the earliest admitting router, else
 * `spec.host` (unadmitted or rejected routes).
 */
export function routeHost(route: Route): string | undefined {
  let admittedHost: string | undefined;
  let admittedAt: string | undefined;
  for (const ingress of route.status?.ingress ?? []) {
    const admitted = ingress.conditions?.find((c) => c.type === 'Admitted' && c.status === 'True');
    if (admitted === undefined) continue;
    const time = admitted.lastTransitionTime ?? '';
    if (admittedHost === undefined || (admittedAt !== undefined && time < admittedAt)) {
      admittedHost = ingress.host;
      admittedAt = time;
    }
  }
  return admittedHost ?? route.spec.host;
}

/** True for a wildcard route, served on every host of a subdomain (`spec.wildcardPolicy: Subdomain`). */
export function isWildcardRoute(route: Route): boolean {
  return route.spec.wildcardPolicy === 'Subdomain';
}

/**
 * The Location text of a route that isn't a link (networking-plugin `getRouteLabel`): its host plus path, with a
 * wildcard route's first label shown as `*`; `undefined` without a host.
 */
export function routeLabel(route: Route): string | undefined {
  let label = routeHost(route);
  if (!label) return undefined;
  if (isWildcardRoute(route) && !label.startsWith('*.')) label = `*.${label.replace(/^[^.]*\./, '')}`;
  return `${label}${route.spec.path ?? ''}`;
}
