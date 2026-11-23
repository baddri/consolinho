import { ReplicationControllerModel, type ReplicationController, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed ReplicationController (`metadata` always present). */
export type ReplicationControllerResource = ReplicationController & K8sResource;

/**
 * ReplicationControllers (WL-1, OCP `replication-controller.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0192.
 */
export const replicationControllerDescriptor: ResourceDescriptor<ReplicationControllerResource> = {
  model: ReplicationControllerModel,
  nav: { section: 'workloads', order: 110 },
  columns: [nameColumn(ReplicationControllerModel), namespaceColumn(ReplicationControllerModel), ageColumn()],
};
