import { RouteModel, ServiceModel, type K8sResource, type Route } from '@/shared/k8s';
import { Status } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { RouteLocation } from '../../networking/routes/RouteLocation';
import { ROUTE_STATUSES, routeHost, routeStatus } from '../../networking/routes/routeStatus';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Route (`metadata` always present). */
export type RouteResource = Route & K8sResource;

/**
 * Routes (RT-1, networking-console-plugin `RoutesList` / `useRouteColumns`): Name, Namespace, Status (admission),
 * Location (link-out with copy, RT-2) and Service; a Status row filter. OCP's Backend health column is omitted (it
 * needs every Service's Endpoints). Details are T-0303.
 */
export const routeDescriptor: ResourceDescriptor<RouteResource> = {
  model: RouteModel,
  nav: { section: 'networking', order: 20 },
  status: (route) => ({ title: routeStatus(route) }),
  columns: [
    nameColumn(RouteModel),
    namespaceColumn(RouteModel),
    {
      id: 'status',
      title: 'Status',
      visibility: ['hidden', 'visibleOnLg'],
      cell: (route) => <Status status={routeStatus(route)} />,
      sortValue: routeStatus,
    },
    {
      id: 'location',
      title: 'Location',
      visibility: ['hidden', 'visibleOnXl'],
      cell: (route) => <RouteLocation route={route} />,
      sortValue: (route) => routeHost(route) ?? null,
    },
    {
      id: 'service',
      title: 'Service',
      visibility: ['hidden', 'visibleOnXl'],
      cell: (route) => (
        <ResourceLink model={ServiceModel} name={route.spec.to.name} namespace={route.metadata.namespace} />
      ),
      sortValue: (route) => route.spec.to.name,
    },
  ],
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: ROUTE_STATUSES.map((value) => ({ value, label: value })),
      matches: (route, values) => values.includes(routeStatus(route)),
    },
  ],
};
