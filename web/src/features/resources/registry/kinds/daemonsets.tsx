import { DaemonSetModel, type DaemonSet, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed DaemonSet (`metadata` always present). */
export type DaemonSetResource = DaemonSet & K8sResource;

/**
 * DaemonSets (WL-1, OCP `daemon-set.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0191.
 */
export const daemonSetDescriptor: ResourceDescriptor<DaemonSetResource> = {
  model: DaemonSetModel,
  nav: { section: 'workloads', order: 90 },
  columns: [nameColumn(DaemonSetModel), namespaceColumn(DaemonSetModel), ageColumn()],
};
