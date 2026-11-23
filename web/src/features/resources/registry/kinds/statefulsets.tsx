import { StatefulSetModel, type StatefulSet, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed StatefulSet (`metadata` always present). */
export type StatefulSetResource = StatefulSet & K8sResource;

/**
 * StatefulSets (WL-1, OCP `stateful-set.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0191.
 */
export const statefulSetDescriptor: ResourceDescriptor<StatefulSetResource> = {
  model: StatefulSetModel,
  nav: { section: 'workloads', order: 40 },
  columns: [nameColumn(StatefulSetModel), namespaceColumn(StatefulSetModel), ageColumn()],
};
