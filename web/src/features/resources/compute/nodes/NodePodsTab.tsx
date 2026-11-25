import { Button, Content, Popover } from '@patternfly/react-core';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useDeferredValue, useMemo, type ReactNode } from 'react';
import { PodModel, useK8sList, type K8sResource, type OwnerReference, type Pod } from '@/shared/k8s';
import {
  ConsoleDataView,
  DataViewLabelFilter,
  DataViewTextFilter,
  StatusIconText,
  type DataViewFilterValue,
} from '@/shared/ui';
import { ResourceRowActions } from '../../actions/ResourceRowActions';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { ResourceErrorState } from '../../components/ResourceErrorState';
import { useFilteredRows, useResourceFilters } from '../../list/useResourceFilters';
import { podColumns, podDescriptor, type PodResource } from '../../registry/kinds/pods';
import type { ColumnDef, ResourceDescriptor } from '../../registry/types';
import type { NodeResource } from './NodeDetails';

/** Popover body of a bare pod's Owner cell *(fleet)*: drain deletes such pods for good. */
export const BARE_POD_POPOVER =
  'This pod is not managed by a controller. Draining the node deletes it and nothing recreates it.';

/** The pod's controller (`ownerReferences[].controller`), what `oc adm drain` checks. */
export function podController(pod: Pod): OwnerReference | undefined {
  return pod.metadata?.ownerReferences?.find((ref) => ref.controller === true);
}

/** Whether a DaemonSet controls the pod (drain skips those with `--ignore-daemonsets`). */
export function isDaemonSetPod(pod: Pod): boolean {
  return podController(pod)?.kind === 'DaemonSet';
}

/**
 * Owner: the controller as a kind-badge link, or for a bare pod *(fleet)* OCP's `PopoverStatus` pattern (as
 * `PodStatusPopover`): a warning "No owner" inline link button opening a popover on the right that explains drain.
 */
function NodePodOwner({ pod }: { pod: PodResource }) {
  const owner = podController(pod);
  if (!owner) {
    return (
      <Popover position="right" headerContent="No owner" bodyContent={BARE_POD_POPOVER}>
        <Button variant="link" isInline data-test="popover-status-button">
          <StatusIconText status="warning" text="No owner" />
        </Button>
      </Popover>
    );
  }
  return (
    <ObjectReferenceLink
      apiVersion={owner.apiVersion}
      kind={owner.kind}
      name={owner.name}
      namespace={pod.metadata.namespace}
    />
  );
}

/** Value of the Owner filter's one option. */
const EXCLUDE_DAEMONSET = 'exclude-daemonset';

/** Descriptor, columns and filter elements of the node's Pods tab, from {@link nodePodsView}. */
interface NodePodsView {
  descriptor: ResourceDescriptor<PodResource>;
  columns: ColumnDef<PodResource>[];
  filterNodes: ReactNode[];
}

/**
 * The Pods descriptor of the node's Pods tab: the Pods list columns (Namespace always shown: the columns are passed
 * as they are, without the namespace-scope hiding) with the controller-only Owner cell at OCP's pod-list breakpoint
 * (≥ lg; not the all-projects 2xl), and after Status the *(fleet)* Owner filter "Exclude DaemonSet pods". Built in
 * the component (memoised), not at import: the registry imports this module while `pods.tsx` may still be
 * initialising.
 */
function nodePodsView(): NodePodsView {
  const columns = podColumns({ showNodes: false }).map((column) =>
    column.id === 'owner'
      ? { ...column, cell: (pod: PodResource) => <NodePodOwner pod={pod} /> }
      : column,
  );
  const descriptor: ResourceDescriptor<PodResource> = {
    ...podDescriptor,
    columns,
    filters: [
      ...(podDescriptor.filters ?? []),
      {
        id: 'owner',
        title: 'Owner',
        options: [{ value: EXCLUDE_DAEMONSET, label: 'Exclude DaemonSet pods' }],
        matches: (pod) => !isDaemonSetPod(pod),
      },
    ],
  };
  const filterNodes = [
    <DataViewTextFilter key="name" filterId="name" title="Name" placeholder="Filter by name" />,
    <DataViewLabelFilter key="label" filterId="label" title="Label" />,
    ...(descriptor.filters ?? []).map((filter) => (
      <DataViewCheckboxFilter
        key={filter.id}
        filterId={filter.id}
        title={filter.title}
        placeholder={`Filter by ${filter.title.toLowerCase()}`}
        options={filter.options}
      />
    )),
  ];
  return { descriptor, columns, filterNodes };
}

function rowId(pod: K8sResource): string {
  return pod.metadata.uid ?? `${pod.metadata.namespace ?? ''}/${pod.metadata.name ?? ''}`;
}

function podLabels(pod: K8sResource): Record<string, string> | undefined {
  return pod.metadata.labels;
}

/** "N pods (M not managed by a DaemonSet)" *(fleet)*, the drain view's summary. */
export function nodePodsCountText(pods: Pod[]): string {
  const others = pods.filter((pod) => !isDaemonSetPod(pod)).length;
  return `${String(pods.length)} ${pods.length === 1 ? 'pod' : 'pods'} (${String(others)} not managed by a DaemonSet)`;
}

/**
 * Pods tab of a Node (NODE-4, OCP `NodeWorkload` `NodePodsPage`: `PodsPage` with `fieldSelector=spec.nodeName=<name>`
 * across all namespaces): the live Pods list with Namespace, the controller as Owner and Pod row actions. The drain
 * view *(fleet)*: a count line of the pods drain would evict, an "Exclude DaemonSet pods" filter and a warning on bare
 * pods. Built here rather than on `useResourceDataView`, which takes no field selector. No drain or evict (spec Q2).
 */
export function NodePodsTab({ cluster, obj }: { cluster: string; obj: NodeResource }) {
  const { descriptor: nodePodsDescriptor, columns, filterNodes } = useMemo(() => nodePodsView(), []);
  const filters = useResourceFilters(nodePodsDescriptor);
  const list = useK8sList<PodResource>(cluster, PodModel, {
    fieldSelector: `spec.nodeName=${obj.metadata.name ?? ''}`,
    labelSelector: filters.labelSelector,
  });
  const deferredName = useDeferredValue(filters.name);
  const filtered = useFilteredRows(nodePodsDescriptor, list.data ?? [], deferredName, filters.selected);
  const filterValues = useMemo(
    () => ({ name: filters.name, label: filters.labelSelector ?? '', ...filters.selected }),
    [filters.name, filters.labelSelector, filters.selected],
  );
  const { setName, setLabelSelector, setSelected } = filters;
  const onFilterChange = useCallback(
    (filterId: string, value: DataViewFilterValue) => {
      if (filterId === 'name') setName(typeof value === 'string' ? value : '');
      else if (filterId === 'label') setLabelSelector(typeof value === 'string' ? value : '');
      else setSelected(filterId, Array.isArray(value) ? value : []);
    },
    [setName, setLabelSelector, setSelected],
  );
  const rowActions = useCallback(
    (pod: K8sResource) => <ResourceRowActions cluster={cluster} descriptor={podDescriptor} obj={pod} />,
    [cluster],
  );

  return (
    <>
      {list.data !== undefined && list.data.length > 0 && (
        <Content component="p">{nodePodsCountText(list.data)}</Content>
      )}
      <ConsoleDataView
        id="node-pods"
        label={PodModel.labelPlural}
        data={list.data}
        filteredData={filtered}
        loaded={!list.isPending}
        error={
          list.error && (
            <ResourceErrorState
              error={list.error}
              cluster={cluster}
              model={PodModel}
              namespace={undefined}
              onRetry={() => list.refetch()}
            />
          )
        }
        columns={columns}
        getRowId={rowId}
        defaultSort={{ by: 'name', direction: 'asc' }}
        filterNodes={filterNodes}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
        onClearAllFilters={filters.clearAll}
        isFiltered={filters.isFiltered}
        getLabels={podLabels}
        rowActions={rowActions}
      />
    </>
  );
}
