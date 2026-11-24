import { IngressModel, type K8sResource, type Ingress } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Ingress (`metadata` always present). */
export type IngressResource = Ingress & K8sResource;

/**
 * Ingresses (OCP networking-console-plugin `IngressesList`). Minimal descriptor from the CP5a foundation (T-0300): Name, Namespace, Created; columns,
 * details and actions are filled in by T-0304.
 */
export const ingressDescriptor: ResourceDescriptor<IngressResource> = {
  model: IngressModel,
  nav: { section: 'networking', order: 30 },
  columns: [nameColumn(IngressModel), namespaceColumn(IngressModel), ageColumn()],
};
