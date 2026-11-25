import type { Route, RouteIngress } from '@/shared/k8s';

/**
 * The router status shown in the Route details' right column (networking-plugin `getIngressStatusForHost`): the
 * `status.ingress` entry whose host is `spec.host`, if any.
 */
export function primaryIngress(route: Route): RouteIngress | undefined {
  return route.status?.ingress?.find((ingress) => ingress.host === route.spec.host);
}

/**
 * Whether to offer the custom-DNS help under a router canonical hostname (networking-plugin `showCustomRouteHelp`):
 * only for an admitted ingress with a host and a canonical hostname, on a route whose host the cluster didn't generate.
 */
export function needsCustomDnsHelp(route: Route, ingress: RouteIngress | undefined): boolean {
  if (!ingress?.conditions?.some((c) => c.type === 'Admitted' && c.status === 'True')) return false;
  if (route.metadata.annotations?.['openshift.io/host.generated'] === 'true') return false;
  return Boolean(ingress.host && ingress.routerCanonicalHostname);
}

/**
 * The share of `route`'s traffic a backend with `weight` receives, as networking-plugin `calcTrafficPercentage`:
 * `weight` over the sum of `spec.to` and `alternateBackends` weights, one decimal and `%`; `-` without a weight.
 */
export function trafficPercentage(route: Route, weight: number | undefined): string {
  if (!weight) return '-';
  const total = (route.spec.alternateBackends ?? []).reduce(
    (sum, backend) => sum + (backend.weight ?? 0),
    route.spec.to.weight ?? 0,
  );
  return `${((weight / total) * 100).toFixed(1)}%`;
}
