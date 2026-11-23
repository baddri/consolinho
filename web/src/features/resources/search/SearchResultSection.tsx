import { AccordionContent, AccordionItem, AccordionToggle } from '@patternfly/react-core';
import { useMemo } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { matchesText, TableEmptyRow, useClientSort, type SortValue } from '@/shared/table';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { ResourceTable } from '../list/ResourceTable';
import { ALL_NAMESPACES } from '../paths';
import { ageColumn, labelsColumn, nameColumn, namespaceColumn } from '../registry/columns';
import type { ColumnDef, ResourceDescriptor } from '../registry/types';
import styles from './SearchPage.module.css';
import { useSearchResults } from './useSearchResults';

/** Props for {@link SearchResultSection}. */
export interface SearchResultSectionProps {
  /** Kind reference (`group~version~Kind`); the toggle's id. */
  kindRef: string;
  descriptor: ResourceDescriptor;
  cluster: string;
  /** A namespace or {@link ALL_NAMESPACES}. */
  namespace: string;
  /** `?q=` joined: the label selector sent to the API server (`''` = none). */
  labelSelector: string;
  /** `?name=`: client-side name substring. */
  name: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const SEARCH_COLUMN_IDS = ['name', 'namespace', 'labels', 'created'] as const;

/**
 * The Search table's columns (SRCH-2): the descriptor's Name, Namespace (all projects only), Labels and Created
 * columns, falling back to the shared builders where a descriptor leaves one out.
 */
function searchColumns(descriptor: ResourceDescriptor, allNamespaces: boolean): ColumnDef<K8sResource>[] {
  const { model } = descriptor;
  const fallback: Record<(typeof SEARCH_COLUMN_IDS)[number], () => ColumnDef<K8sResource>> = {
    name: () => nameColumn(model),
    namespace: () => namespaceColumn(model),
    labels: () => labelsColumn(model),
    created: () => ageColumn(),
  };
  return SEARCH_COLUMN_IDS.filter((id) => id !== 'namespace' || (allNamespaces && model.namespaced)).map(
    (id) => descriptor.columns.find((column) => column.id === id) ?? fallback[id](),
  );
}

/**
 * One kind's result section of the Search page (OCP `search.tsx` accordion item): the toggle shows the plural label
 * with `group/version` under it; the body — fetched only while expanded — is a compact table of the kind's objects
 * matching the label selector and name, "No <kinds> found" when none do, or the error state.
 */
export function SearchResultSection({
  kindRef,
  descriptor,
  cluster,
  namespace,
  labelSelector,
  name,
  isExpanded,
  onToggle,
}: SearchResultSectionProps) {
  const { model } = descriptor;
  return (
    <AccordionItem isExpanded={isExpanded}>
      <AccordionToggle id={`${kindRef}-toggle`} onClick={onToggle}>
        <span className={styles.toggleText}>
          {model.labelPlural}{' '}
          <span className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle pf-v6-u-font-weight-normal pf-v6-u-ml-sm">
            {model.group || 'core'}/{model.version}
          </span>
        </span>
      </AccordionToggle>
      <AccordionContent>
        {isExpanded && (
          <SearchResultTable
            descriptor={descriptor}
            cluster={cluster}
            namespace={namespace}
            labelSelector={labelSelector}
            name={name}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

type SearchResultTableProps = Pick<
  SearchResultSectionProps,
  'descriptor' | 'cluster' | 'namespace' | 'labelSelector' | 'name'
>;

/** The fetched, name-filtered and sorted table of one section. */
function SearchResultTable({ descriptor, cluster, namespace, labelSelector, name }: SearchResultTableProps) {
  const { model } = descriptor;
  const allNamespaces = namespace === ALL_NAMESPACES;
  const query = useSearchResults(cluster, model, allNamespaces ? undefined : namespace, labelSelector);
  const columns = useMemo(() => searchColumns(descriptor, allNamespaces), [descriptor, allNamespaces]);
  const accessors = useMemo(
    () =>
      Object.fromEntries(
        columns.flatMap((column) =>
          column.sortValue ? [[column.id, (obj: K8sResource) => column.sortValue?.(obj) ?? null] as const] : [],
        ),
      ) as Record<string, (obj: K8sResource) => SortValue>,
    [columns],
  );
  const rows = useMemo(
    () => (query.data?.items ?? []).filter((obj) => matchesText(name, obj.metadata.name)),
    [query.data, name],
  );
  const { sorted, sortProps } = useClientSort(rows, accessors, { by: 'name', direction: 'asc' });

  if (query.isError) {
    return (
      <ResourceErrorState
        error={query.error}
        cluster={cluster}
        model={model}
        namespace={model.namespaced ? namespace : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <ResourceTable
      ariaLabel={model.labelPlural}
      columns={columns}
      rows={sorted}
      sortProps={sortProps}
      isPending={query.isPending}
      emptyRow={
        sorted.length === 0 ? (
          <TableEmptyRow colSpan={columns.length} title={`No ${model.labelPlural} found`} />
        ) : undefined
      }
    />
  );
}
