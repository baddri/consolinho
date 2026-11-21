import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Pagination,
  type PerPageOptions,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { useDeferredValue, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { apiVersionOf, useK8sDiscovery, useK8sList, type K8sResource } from '@/shared/k8s';
import { TableEmptyRow, useClientSort, type SortValue } from '@/shared/table';
import { PageBody, PageHeading } from '@/shared/ui';
import { ResourceRowActions } from '../actions/ResourceRowActions';
import { ProjectBar } from '../components/ProjectBar';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { descriptorForPlural } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceRoute, type ListScope } from '../resourceRoute';
import { LiveIndicator } from './LiveIndicator';
import { ResourceListToolbar } from './ResourceListToolbar';
import { ResourceTable } from './ResourceTable';
import { useFilteredRows, useResourceFilters } from './useResourceFilters';

const DEFAULT_PER_PAGE = 50;
const PER_PAGE_OPTIONS: PerPageOptions[] = [20, 50, 100].map((value) => ({ title: String(value), value }));
const NO_ROWS: K8sResource[] = [];

type SortAccessors = Record<string, (obj: K8sResource) => SortValue>;

/** `useClientSort` wants stable accessors; derive them once per (module-level) descriptor. */
const sortAccessorsCache = new WeakMap<ResourceDescriptor, SortAccessors>();

function sortAccessors(descriptor: ResourceDescriptor): SortAccessors {
  let accessors = sortAccessorsCache.get(descriptor);
  if (!accessors) {
    accessors = {};
    for (const column of descriptor.columns) {
      if (column.sortValue) accessors[column.id] = (obj) => column.sortValue?.(obj) ?? null;
    }
    sortAccessorsCache.set(descriptor, accessors);
  }
  return accessors;
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
 * Project bar, heading, toolbar, table and pagination of one live list (or the `EmptyBox`-style empty state); data
 * from `useK8sList`, filters from the URL.
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
  const defaultSort = descriptor.defaultSort ?? { columnId: 'name', direction: 'asc' };
  const { sorted, sortProps } = useClientSort(filtered, sortAccessors(descriptor), {
    by: defaultSort.columnId,
    direction: defaultSort.direction,
  });

  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  // Back to page 1 whenever the filters change (the namespace remounts the whole list).
  const filterKey = JSON.stringify([deferredName, filters.labelSelector, filters.selected]);
  const [paging, setPaging] = useState({ page: 1, filterKey });
  const page = paging.filterKey === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ page: next, filterKey });
  const lastPage = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(page, lastPage);
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * perPage, currentPage * perPage),
    [sorted, currentPage, perPage],
  );

  const columns = useMemo(
    () =>
      scope === 'all'
        ? descriptor.columns.map((column) =>
            column.allNamespacesVisibility ? { ...column, visibility: column.allNamespacesVisibility } : column,
          )
        : descriptor.columns.filter((column) => !column.allNamespacesOnly),
    [descriptor, scope],
  );

  // Nothing in the list and no filter: OCP's `EmptyBox` alone — no headers, no "0 - 0 of 0" pagination.
  const isEmpty = !list.isPending && !list.error && sorted.length === 0 && !filters.isFiltered;

  const pagination = (variant: 'top' | 'bottom') => (
    <Pagination
      variant={variant}
      isCompact={variant === 'top'}
      itemCount={sorted.length}
      perPage={perPage}
      page={currentPage}
      perPageOptions={PER_PAGE_OPTIONS}
      onSetPage={(_event, next) => setPage(next)}
      onPerPageSelect={(_event, next) => {
        setPerPage(next);
        setPage(1);
      }}
      titles={{ paginationAriaLabel: `${model.labelPlural} pagination (${variant})` }}
    />
  );

  return (
    <>
      {model.namespaced && <ProjectBar descriptor={descriptor} cluster={cluster} namespace={namespace} />}
      <PageHeading
        title={model.labelPlural}
        status={list.liveStatus === 'paused' ? <LiveIndicator status={list.liveStatus} /> : undefined}
      />
      <PageBody>
        <ResourceListToolbar
          descriptor={descriptor}
          filters={filters}
          actions={isEmpty ? undefined : pagination('top')}
        />
        {list.error ? (
          <ResourceErrorState
            error={list.error}
            cluster={cluster}
            model={model}
            namespace={namespace}
            onRetry={() => list.refetch()}
          />
        ) : isEmpty ? (
          <EmptyState variant="sm" titleText={`No ${model.labelPlural} found`} headingLevel="h2" />
        ) : (
          <>
            <ResourceTable
              ariaLabel={model.labelPlural}
              columns={columns}
              rows={pageRows}
              sortProps={sortProps}
              isPending={list.isPending}
              rowActions={(obj) => <ResourceRowActions cluster={cluster} descriptor={descriptor} obj={obj} />}
              emptyRow={
                sorted.length === 0 && (
                  <FilteredEmptyRow colSpan={columns.length + 1} onClearFilters={filters.clearAll} />
                )
              }
            />
            {sorted.length > 0 && pagination('bottom')}
          </>
        )}
      </PageBody>
    </>
  );
}

/** Filters matched nothing (OCP copy): "No results match the filter criteria" + Clear all filters, under the headers. */
function FilteredEmptyRow({ colSpan, onClearFilters }: { colSpan: number; onClearFilters: () => void }) {
  return (
    <TableEmptyRow
      colSpan={colSpan}
      title="No results match the filter criteria"
      icon={SearchIcon}
      actions={
        <Button variant="link" onClick={onClearFilters}>
          Clear all filters
        </Button>
      }
    />
  );
}
