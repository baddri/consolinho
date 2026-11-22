import { RhUiSearchIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { NamespaceModel, PodModel, type K8sModel, type K8sResource } from '@/shared/k8s';
import { LabelList, Timestamp } from '@/shared/ui';
import { BadgedName, ResourceLink } from '../components/ResourceLink';
import { resourcePath } from '../paths';
import styles from './columns.module.css';
import type { ColumnDef } from './types';

/** Milliseconds since epoch of an ISO timestamp, `null` when absent or unparseable (sorts last). */
export function timestampValue(value: string | undefined): number | null {
  if (value === undefined) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Name column (`type: 'name'`): kind badge + link to the object's details page, sticky and `nowrap` like OCP, so
 * generated pod names (`web-7d4b9c8f6d-2xkqp`) stay on one line. Sort key `name`.
 */
export function nameColumn<T extends K8sResource>(model: K8sModel): ColumnDef<T> {
  return {
    id: 'name',
    title: 'Name',
    type: 'name',
    // Names don't wrap, so the column starts wide enough for a generated pod name; measured from the page width
    // while skeleton rows show, it would be too narrow and the rows would push the table past the page.
    width: 210,
    cell: (obj) => (
      <ResourceLink model={model} name={obj.metadata.name ?? ''} namespace={obj.metadata.namespace} />
    ),
    sortValue: (obj) => obj.metadata.name ?? null,
  };
}

/** `NS` badge + link to `model`'s list in one namespace of the active cluster (plain name outside a cluster). */
function NamespaceListLink({ model, namespace }: { model: K8sModel; namespace: string }) {
  const cluster = useActiveCluster();
  return (
    <BadgedName badge={NamespaceModel}>
      {cluster === undefined ? (
        namespace
      ) : (
        <Link to={resourcePath(cluster, model, { namespace })}>{namespace}</Link>
      )}
    </BadgedName>
  );
}

/** Namespace column, shown only in all-namespaces mode; links to the same kind's list in that namespace. */
export function namespaceColumn<T extends K8sResource>(model: K8sModel): ColumnDef<T> {
  return {
    id: 'namespace',
    title: 'Namespace',
    type: 'namespace',
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

/** "Created" column: OCP `Timestamp` (clock icon + absolute date, relative within 10.5 minutes); sorts by time. */
export function ageColumn<T extends K8sResource>(): ColumnDef<T> {
  return {
    id: 'created',
    title: 'Created',
    cell: (obj) => <Timestamp value={obj.metadata.creationTimestamp} />,
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
 * A pod selector as a link to the Pods list filtered by it (`?label=app%3Dweb`, ADR-0023 §2), with OCP `Selector`'s
 * search icon and ", "-joined terms; "No selector" in subtle text without one, plain text outside a cluster or namespace.
 */
export function PodSelectorLink({ namespace, matchLabels }: PodSelectorLinkProps) {
  const cluster = useActiveCluster();
  const selector = labelSelectorString(matchLabels);
  if (selector === '') return <div className="pf-v6-u-text-color-subtle">No selector</div>;
  if (cluster === undefined || namespace === undefined) return <>{selector}</>;
  const search = new URLSearchParams({ label: selector }).toString();
  return (
    <Link to={resourcePath(cluster, PodModel, { namespace, search })}>
      <RhUiSearchIcon className="pf-v6-u-mr-xs" />
      {selector.replace(/,/g, ', ')}
    </Link>
  );
}

/** Props for {@link ReplicasCountLink}. */
export interface ReplicasCountLinkProps {
  /** The workload's model (Deployment, ReplicaSet); it must have a Pods tab (`podsSelector`). */
  model: K8sModel;
  obj: K8sResource;
  /** "N of M pods". */
  title: string;
}

/**
 * OCP `ReplicasCount` (`workload-table.tsx`): a workload's "N of M pods" as a link to its Pods tab on the active
 * cluster; plain text outside a cluster.
 */
export function ReplicasCountLink({ model, obj, title }: ReplicasCountLinkProps) {
  const cluster = useActiveCluster();
  const { namespace, name } = obj.metadata;
  if (cluster === undefined || namespace === undefined || name === undefined) return <>{title}</>;
  return <Link to={resourcePath(cluster, model, { namespace, name, tab: 'pods' })}>{title}</Link>;
}

/**
 * Labels column (OCP `LabelList`): normal-size `key=value` labels, collapsed after 20, "No labels" in subtle text
 * without any. Not sortable. Labels wrap inside the cell and truncate when longer than it (`columns.module.css`), so
 * the column never pushes the table past the page. Start width like OCP's `getLabelsColumnWidthStyleProp` (200 px
 * there), 180 px here: the most our Deployments list in all projects leaves at 1280 next to its nowrap headers.
 */
export function labelsColumn<T extends K8sResource>(): ColumnDef<T> {
  return {
    id: 'labels',
    title: 'Labels',
    width: 180,
    cell: (obj) => {
      const labels = Object.entries(obj.metadata.labels ?? {}).map(([key, value]) => `${key}=${value}`);
      if (labels.length === 0) return <div className="pf-v6-u-text-color-subtle">No labels</div>;
      return (
        <div className={styles.labels}>
          <LabelList aria-label="Labels" max={20} isCompact={false} labels={labels} />
        </div>
      );
    },
  };
}
