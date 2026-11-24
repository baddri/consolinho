import { RouteModel, type K8sResource, type Route } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Route (`metadata` always present). */
export type RouteResource = Route & K8sResource;

/**
 * Routes (OCP networking-console-plugin `RoutesList`). Minimal descriptor from the CP5a foundation (T-0300): Name, Namespace, Created; columns,
 * details and actions are filled in by T-0302 (list) and T-0303 (details).
 */
export const routeDescriptor: ResourceDescriptor<RouteResource> = {
  model: RouteModel,
  nav: { section: 'networking', order: 20 },
  columns: [nameColumn(RouteModel), namespaceColumn(RouteModel), ageColumn()],
};
