import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { PodModel, type K8sModel, type K8sResource } from '@/shared/k8s';
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

/**
 * Name column: kind badge + link to the object's details page. Sort key `name`. A quarter of the table, so generated
 * pod names (`web-7d4b9c8f6d-2xkqp`) stay on one line next to badge at 1280 instead of breaking at every hyphen.
 */
export function nameColumn<T extends K8sResource>(model: K8sModel): ColumnDef<T> {
  return {
    id: 'name',
    title: 'Name',
    width: 25,
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

/** `matchLabels` as a label-selector string (`app=web,tier=front`); empty string without labels. */
export function labelSelectorString(matchLabels: Record<string, string> | undefined): string {
  return Object.entries(matchLabels ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/** Props for {@link PodSelectorLink}. */
export interface PodSelectorLinkProps {
  /** Namespace of the selecting object (Deployment, Service); the pods are in the same one. */
  namespace: string | undefined;
  matchLabels: Record<string, string> | undefined;
}

/**
 * A pod selector as a link to the Pods list filtered by it (`?label=app%3Dweb`, ADR-0023 §2); "—" without a selector,
 * plain text outside a cluster or namespace.
 */
export function PodSelectorLink({ namespace, matchLabels }: PodSelectorLinkProps) {
  const cluster = useActiveCluster();
  const selector = labelSelectorString(matchLabels);
  if (selector === '') return <>—</>;
  if (cluster === undefined || namespace === undefined) return <>{selector}</>;
  const search = new URLSearchParams({ label: selector }).toString();
  return <Link to={resourcePath(cluster, PodModel, { namespace, search })}>{selector}</Link>;
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
