import { useActiveCluster } from '@/features/cluster-context';
import { RouteModel, useK8sDiscovery, useK8sList, type K8sResource, type Route } from '@/shared/k8s';
import { DASH, DetailsItem } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';

/** A listed route (`metadata` always present). */
type RouteResource = Route & K8sResource;

/**
 * The routes that send traffic to Service `serviceName`: its `spec.to` or one of its `spec.alternateBackends` is that
 * Service. Pure, so callers filter one shared namespace list instead of asking per route.
 */
export function routesForService<T extends Route>(routes: readonly T[], serviceName: string): T[] {
  return routes.filter((route) =>
    [route.spec.to, ...(route.spec.alternateBackends ?? [])].some(
      (backend) => backend.kind === 'Service' && backend.name === serviceName,
    ),
  );
}

/**
 * "Routes" item of a Service's Details (SVC-2): a link per route that targets the Service, from the namespace's shared
 * Routes watch. Not rendered where the cluster doesn't serve `route.openshift.io` (Kubernetes) or outside a cluster
 * route; no routes or a failed list show a dash, as the item is secondary.
 */
export function ServiceRoutesItem({ obj }: { obj: K8sResource }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return null;
  return <ServedServiceRoutesItem cluster={cluster} obj={obj} />;
}

/** {@link ServiceRoutesItem} once the cluster is known: hides itself unless Routes are served. */
function ServedServiceRoutesItem({ cluster, obj }: { cluster: string; obj: K8sResource }) {
  const discovery = useK8sDiscovery(cluster);
  if (!discovery.isServed(RouteModel)) return null;
  return <RouteLinks cluster={cluster} obj={obj} />;
}

/** The item itself: one `ResourceLink` per matching route, or a dash. */
function RouteLinks({ cluster, obj }: { cluster: string; obj: K8sResource }) {
  const { namespace, name = '' } = obj.metadata;
  const list = useK8sList<RouteResource>(cluster, RouteModel, { namespace });
  const routes = list.error || !list.data ? [] : routesForService(list.data, name);
  return (
    <DetailsItem label="Routes">
      {routes.length === 0
        ? DASH
        : routes.map((route) => (
            <div key={route.metadata.uid ?? route.metadata.name}>
              <ResourceLink model={RouteModel} name={route.metadata.name ?? ''} namespace={namespace} />
            </div>
          ))}
    </DetailsItem>
  );
}
