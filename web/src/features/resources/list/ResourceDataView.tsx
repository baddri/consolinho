import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useDeferredValue, useMemo, type ReactNode } from 'react';
import {
  labelSelectorString,
  useK8sList,
  type K8sResource,
  type LabelSelector,
  type LiveStatus,
} from '@/shared/k8s';
import {
  ConsoleDataView,
  DataViewLabelFilter,
  DataViewTextFilter,
  type DataViewFilterValue,
} from '@/shared/ui';
import { ResourceRowActions } from '../actions/ResourceRowActions';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { ALL_NAMESPACES } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import type { ListScope } from '../resourceRoute';
import { useFilteredRows, useResourceFilters } from './useResourceFilters';

const NO_ROWS: K8sResource[] = [];

/** Stable React key of a listed object. */
function rowId(obj: K8sResource): string {
  return obj.metadata.uid ?? `${obj.metadata.namespace ?? ''}/${obj.metadata.name ?? ''}`;
}

function objectLabels(obj: K8sResource): Record<string, string> | undefined {
  return obj.metadata.labels;
}

/** Options of {@link useResourceDataView}. */
export interface ResourceDataViewOptions {
  descriptor: ResourceDescriptor;
  cluster: string;
  scope: ListScope;
  /** A namespace, {@link ALL_NAMESPACES}, or `undefined` (cluster-scoped). */
  namespace: string | undefined;
  /**
   * Label selector every listed object must match (`matchExpressions` included), ANDed with the user's `?label=` filter
   * and not shown in it (a workload's Pods tab lists only its pods).
   */
  fixedSelector?: LabelSelector;
  /**
   * Client-side condition every listed object must meet, for what a label selector can't express (a Deployment's
   * ReplicaSets tab keeps only those it owns). Keep it referentially stable: it re-filters the list when it changes.
   */
  rowFilter?: (obj: K8sResource) => boolean;
}

/** Result of {@link useResourceDataView}. */
export interface ResourceDataView {
  /** The live list's watch status, for the page heading's paused indicator. */
  liveStatus: LiveStatus;
  /** The `ConsoleDataView` with toolbar, table and every state. */
  dataView: ReactNode;
}

/**
 * The filter elements of a kind's list (OCP `ConsoleDataView`): Name, Label, then the descriptor's checkbox filters.
 * Memoised per descriptor: `DataViewFilters` resets the selected category when the elements' props change.
 */
function useFilterNodes(descriptor: ResourceDescriptor) {
  return useMemo(
    () => [
      <DataViewTextFilter key="name" filterId="name" title="Name" placeholder="Filter by name" />,
      <DataViewLabelFilter key="label" filterId="label" title="Label" />,
      ...(descriptor.filters ?? []).map((filter) => (
        <DataViewCheckboxFilter
          key={filter.id}
          filterId={filter.id}
          title={filter.title}
          placeholder={`Filter by ${filter.title.toLowerCase()}`}
          options={filter.options.map((option) => ({ value: option.value, label: option.label }))}
        />
      )),
    ],
    [descriptor],
  );
}

/**
 * The shared `ConsoleDataView` of one live list of a kind (list pages and a workload's Pods tab): data from
 * `useK8sList`, filters from the URL (`?name=` client-side, `?label=` sent as `labelSelector` together with the
 * `fixedSelector`, descriptor filters such as `?status=`), the descriptor's columns and row actions (none for a
 * `readOnly` kind without `useKindActions`).
 */
export function useResourceDataView({
  descriptor,
  cluster,
  scope,
  namespace,
  fixedSelector,
  rowFilter,
}: ResourceDataViewOptions): ResourceDataView {
  const { model } = descriptor;
  const filters = useResourceFilters(descriptor);
  const fixed = labelSelectorString(fixedSelector);
  const labelSelector =
    [fixed, filters.labelSelector ?? ''].filter((part) => part !== '').join(',') || undefined;
  const list = useK8sList<K8sResource>(cluster, model, {
    namespace: namespace === ALL_NAMESPACES ? undefined : namespace,
    labelSelector,
  });

  const rows = useMemo(
    () => (rowFilter && list.data ? list.data.filter(rowFilter) : list.data),
    [list.data, rowFilter],
  );
  const deferredName = useDeferredValue(filters.name);
  const filtered = useFilteredRows(descriptor, rows ?? NO_ROWS, deferredName, filters.selected);
  const filterNodes = useFilterNodes(descriptor);
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

  const columns = useMemo(
    () =>
      scope === 'all'
        ? descriptor.columns.map((column) =>
            column.allNamespacesVisibility
              ? { ...column, visibility: column.allNamespacesVisibility }
              : column,
          )
        : // Still listed in "Manage columns", as OCP does, but only rendered for all projects.
          descriptor.columns.map((column) =>
            column.allNamespacesOnly ? { ...column, isHidden: true } : column,
          ),
    [descriptor, scope],
  );
  const rowActions = useCallback(
    (obj: K8sResource) => <ResourceRowActions cluster={cluster} descriptor={descriptor} obj={obj} />,
    [cluster, descriptor],
  );
  // A read-only kind without kind actions has nothing to put in a kebab: no Actions column, as OCP (ClusterOperators).
  const hasRowActions = !descriptor.readOnly || descriptor.useKindActions !== undefined;
  const defaultSort = descriptor.defaultSort ?? { columnId: 'name', direction: 'asc' };

  return {
    liveStatus: list.liveStatus,
    dataView: (
      <ConsoleDataView
        id={model.plural}
        label={model.labelPlural}
        data={rows}
        filteredData={filtered}
        loaded={!list.isPending}
        error={
          list.error && (
            <ResourceErrorState
              error={list.error}
              cluster={cluster}
              model={model}
              namespace={namespace}
              onRetry={() => list.refetch()}
            />
          )
        }
        columns={columns}
        getRowId={rowId}
        defaultSort={{ by: defaultSort.columnId, direction: defaultSort.direction }}
        filterNodes={filterNodes}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
        onClearAllFilters={filters.clearAll}
        isFiltered={filters.isFiltered}
        getLabels={objectLabels}
        rowActions={hasRowActions ? rowActions : undefined}
        hasNamespaceHint={model.namespaced}
      />
    ),
  };
}
