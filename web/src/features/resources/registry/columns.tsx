import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import { LabelList, RelativeTime } from '@/shared/ui';
import { ResourceLink } from '../components/ResourceLink';
import { resourcePath } from '../paths';
import type { ColumnDef } from './types';

/** Milliseconds since epoch of an ISO timestamp, `null` when absent or unparseable (sorts last). */
export function timestampValue(value: string | undefined): number | null {
  if (value === undefined) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Name column: kind badge + link to the object's details page. Sort key `name`. */
export function nameColumn<T extends K8sResource>(model: K8sModel): ColumnDef<T> {
  return {
    id: 'name',
    title: 'Name',
    cell: (obj) => (
      <ResourceLink model={model} name={obj.metadata.name ?? ''} namespace={obj.metadata.namespace} />
    ),
    sortValue: (obj) => obj.metadata.name ?? null,
  };
}

/** Link to `model`'s list in one namespace of the active cluster. */
function NamespaceListLink({ model, namespace }: { model: K8sModel; namespace: string }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return <>{namespace}</>;
  return <Link to={resourcePath(cluster, model, { namespace })}>{namespace}</Link>;
}

/** Namespace column, shown only in all-namespaces mode; links to the same kind's list in that namespace. */
export function namespaceColumn<T extends K8sResource>(model: K8sModel): ColumnDef<T> {
  return {
    id: 'namespace',
    title: 'Namespace',
    allNamespacesOnly: true,
    cell: (obj) =>
      obj.metadata.namespace === undefined ? (
        '—'
      ) : (
        <NamespaceListLink model={model} namespace={obj.metadata.namespace} />
      ),
    sortValue: (obj) => obj.metadata.namespace ?? null,
  };
}

/** "Created" column: relative time with the absolute time in a tooltip; sorts by timestamp. */
export function ageColumn<T extends K8sResource>(): ColumnDef<T> {
  return {
    id: 'created',
    title: 'Created',
    cell: (obj) => <RelativeTime value={obj.metadata.creationTimestamp ?? null} />,
    sortValue: (obj) => timestampValue(obj.metadata.creationTimestamp),
  };
}

/** Labels column: `key=value` labels, collapsed after three. Not sortable. */
export function labelsColumn<T extends K8sResource>(): ColumnDef<T> {
  return {
    id: 'labels',
    title: 'Labels',
    cell: (obj) => (
      <LabelList
        aria-label="Labels"
        labels={Object.entries(obj.metadata.labels ?? {}).map(([key, value]) => `${key}=${value}`)}
      />
    ),
  };
}
