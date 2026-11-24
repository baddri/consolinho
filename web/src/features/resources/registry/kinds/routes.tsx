import { RouteModel, ServiceModel, type K8sResource, type Route } from '@/shared/k8s';
import { Status } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { RouteDetails, RouteSections, RouteSummaryExtra } from '../../networking/routes/RouteDetails';
import { RouteLocation } from '../../networking/routes/RouteLocation';
import { ROUTE_STATUSES, routeHost, routeStatus } from '../../networking/routes/routeStatus';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Route (`metadata` always present). */
export type RouteResource = Route & K8sResource;

/**
 * Routes (RT-1, networking-console-plugin `RoutesList` / `useRouteColumns`): Name, Namespace, Status (admission),
 * Location (link-out with copy, RT-2) and Service; a Status row filter. OCP's Backend health column is omitted (it
 * needs every Service's Endpoints). Details (RT-3, `RouteDetailsTab`): Service and Target port in the metadata column,
 * Location / Status / Host / Path / canonical hostname right, then TLS Settings, Traffic and per-router status; tabs
 * Details, YAML, Events and the common actions only (RT-4; no Metrics tab).
 */
export const routeDescriptor: ResourceDescriptor<RouteResource> = {
  model: RouteModel,
  nav: { section: 'networking', order: 20 },
  status: (route) => ({ title: routeStatus(route) }),
  summary: { Extra: RouteSummaryExtra },
  DetailsSection: RouteDetails,
  ExtraSections: RouteSections,
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
