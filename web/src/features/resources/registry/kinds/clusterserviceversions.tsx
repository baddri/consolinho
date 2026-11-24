import { ClusterServiceVersionModel, type ClusterServiceVersion } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/**
 * ClusterServiceVersions as OCP's Operators → Installed Operators (OLM `ClusterServiceVersionsPage`), read-only
 * (OLM-5). On all namespaces the copies OLM places in each target namespace are left out (`!olm.copiedFrom`, OLM-1),
 * so each operator is listed once. Minimal CP5b foundation descriptor (T-0331): Name, Namespace and Created; columns,
 * details, status and the Subscription tab are filled in by T-0337.
 */
export const clusterServiceVersionDescriptor: ResourceDescriptor<ClusterServiceVersion> = {
  model: ClusterServiceVersionModel,
  nav: { section: 'operators', order: 10, label: 'Installed Operators' },
  readOnly: true,
  allNamespacesLabelSelector: {
    matchExpressions: [{ key: 'olm.copiedFrom', operator: 'DoesNotExist' }],
  },
  columns: [nameColumn(ClusterServiceVersionModel), namespaceColumn(ClusterServiceVersionModel), ageColumn()],
};
