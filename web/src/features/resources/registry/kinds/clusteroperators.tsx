import { ClusterOperatorModel, type ClusterOperator } from '@/shared/k8s';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/**
 * ClusterOperators (OCP `cluster-operator.tsx`), cluster-scoped and read-only. No sidebar entry: OCP reaches them
 * from Administration → Cluster Settings → ClusterOperators (`clusterSettingsPath(cluster, 'clusteroperators')`).
 * Minimal CP5b foundation descriptor (T-0331): Name and Created; columns, details and the Related objects tab are
 * filled in by T-0336.
 */
export const clusterOperatorDescriptor: ResourceDescriptor<ClusterOperator> = {
  model: ClusterOperatorModel,
  readOnly: true,
  columns: [nameColumn(ClusterOperatorModel), ageColumn()],
};
