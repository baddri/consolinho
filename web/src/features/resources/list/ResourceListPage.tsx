import { Bullseye, EmptyState, EmptyStateBody, PageSection } from '@patternfly/react-core';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useDeferredValue, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router';
import { apiVersionOf, useK8sDiscovery, useK8sList, type K8sResource } from '@/shared/k8s';
import {
  ConsoleDataView,
  DataViewLabelFilter,
  DataViewTextFilter,
  PageBody,
  PageHeading,
  type DataViewFilterValue,
} from '@/shared/ui';
import { ResourceRowActions } from '../actions/ResourceRowActions';
import { ProjectBar } from '../components/ProjectBar';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { descriptorForPlural } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceRoute, type ListScope } from '../resourceRoute';
import { LiveIndicator } from './LiveIndicator';
import { useFilteredRows, useResourceFilters } from './useResourceFilters';

const NO_ROWS: K8sResource[] = [];

/** Stable React key of a listed object. */
function rowId(obj: K8sResource): string {
  return obj.metadata.uid ?? `${obj.metadata.namespace ?? ''}/${obj.metadata.name ?? ''}`;
}

function objectLabels(obj: K8sResource): Record<string, string> | undefined {
  return obj.metadata.labels;
}

/** Full-page empty state (unsupported or unserved kind). */
function PageEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <PageSection>
      <Bullseye>
        <EmptyState titleText={title} headingLevel="h1">
          <EmptyStateBody>{body}</EmptyStateBody>
        </EmptyState>
      </Bullseye>
    </PageSection>
  );
}

/**
 * Generic live list page (ADR-0023, UI-1..3, UI-10) for `k8s/all-namespaces/:plural`, `k8s/ns/:namespace/:plural` and
 * `k8s/cluster/:plural`. Resolves the descriptor and discovery first: unknown plural → "Kind not supported yet", kind
 * not served by the cluster → "… aren't available", a plural under the wrong scope → redirect to the right shape.
 * Lazy-loaded by `routes.tsx`.
 */
export function ResourceListPage() {
  const { cluster, plural, scope, namespace } = useResourceRoute();
  const { search } = useLocation();
  const discovery = useK8sDiscovery(cluster);
  const descriptor = descriptorForPlural(plural);

  if (!descriptor) {
    return (
      <PageEmptyState title="Kind not supported yet" body={`The console has no page for "${plural}" yet.`} />
    );
  }
  const { model } = descriptor;
  if (model.namespaced && scope === 'cluster') {
    return <Navigate replace to={resourcePath(cluster, model, { namespace: ALL_NAMESPACES, search })} />;
  }
  if (!model.namespaced && scope !== 'cluster') {
    return <Navigate replace to={resourcePath(cluster, model, { search })} />;
  }
  if (!discovery.isServed(model)) {
    return discovery.isPending ? (
      <ResourcePageSkeleton />
    ) : (
      <PageEmptyState
        title={`${model.labelPlural} aren't available on ${cluster}`}
        body={`This cluster doesn't serve ${apiVersionOf(model)}.`}
      />
    );
  }
  // Remount per list so sort, page and the label draft start fresh on another kind, namespace or cluster.
  return (
    <ResourceList
      key={`${cluster}|${plural}|${namespace ?? ''}`}
      descriptor={descriptor}
      cluster={cluster}
      scope={scope}
      namespace={namespace}
    />
  );
}

interface ResourceListProps {
  descriptor: ResourceDescriptor;
  cluster: string;
  scope: ListScope;
  /** A namespace, {@link ALL_NAMESPACES}, or `undefined` (cluster-scoped). */
  namespace: string | undefined;
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
 * Project bar, heading and the shared `ConsoleDataView` of one live list; data from `useK8sList`, filters from the
 * URL (`?name=` client-side, `?label=` sent as `labelSelector`, descriptor filters such as `?status=`).
 */
function ResourceList({ descriptor, cluster, scope, namespace }: ResourceListProps) {
  const { model } = descriptor;
  const filters = useResourceFilters(descriptor);
  const list = useK8sList<K8sResource>(cluster, model, {
    namespace: namespace === ALL_NAMESPACES ? undefined : namespace,
    labelSelector: filters.labelSelector,
  });

  const deferredName = useDeferredValue(filters.name);
  const filtered = useFilteredRows(descriptor, list.data ?? NO_ROWS, deferredName, filters.selected);
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
            column.allNamespacesVisibility ? { ...column, visibility: column.allNamespacesVisibility } : column,
          )
        : // Still listed in "Manage columns", as OCP does, but only rendered for all projects.
          descriptor.columns.map((column) => (column.allNamespacesOnly ? { ...column, isHidden: true } : column)),
    [descriptor, scope],
  );
  const rowActions = useCallback(
    (obj: K8sResource) => <ResourceRowActions cluster={cluster} descriptor={descriptor} obj={obj} />,
    [cluster, descriptor],
  );
  const defaultSort = descriptor.defaultSort ?? { columnId: 'name', direction: 'asc' };

  return (
    <>
      {model.namespaced && <ProjectBar descriptor={descriptor} cluster={cluster} namespace={namespace} />}
      <PageHeading
        title={model.labelPlural}
        status={list.liveStatus === 'paused' ? <LiveIndicator status={list.liveStatus} /> : undefined}
      />
      <PageBody>
        <ConsoleDataView
          id={model.plural}
          label={model.labelPlural}
          data={list.data}
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
          rowActions={rowActions}
          hasNamespaceHint={model.namespaced}
        />
      </PageBody>
    </>
  );
}
