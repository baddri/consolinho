import { useCallback, useMemo, useState } from 'react';
import { NamespaceModel, type ClusterOperator } from '@/shared/k8s';
import {
  ConsoleDataView,
  DASH,
  DataViewTextFilter,
  type DataViewColumn,
  type DataViewFilterValue,
} from '@/shared/ui';
import { ResourceLink } from '../components/ResourceLink';
import { descriptorForPlural } from '../registry/registry';

/** One `status.relatedObjects` entry of a ClusterOperator. */
type RelatedObject = NonNullable<NonNullable<ClusterOperator['status']>['relatedObjects']>[number];

/**
 * Name cell (OCP `related-objects.tsx` `Row`): a link when the registry knows the group/resource, text otherwise. The
 * registry is looked up by plural, so a plural shared by two groups resolves to one of them; the other shows as text.
 */
function RelatedObjectName({ row }: { row: RelatedObject }) {
  const model = descriptorForPlural(row.resource)?.model;
  return model?.group === row.group ? (
    <ResourceLink model={model} name={row.name} namespace={row.namespace} />
  ) : (
    <>{row.name}</>
  );
}

const COLUMNS: DataViewColumn<RelatedObject>[] = [
  {
    id: 'name',
    title: 'Name',
    type: 'name',
    cell: (row) => <RelatedObjectName row={row} />,
    sortValue: (row) => row.name,
  },
  { id: 'resource', title: 'Resource', cell: (row) => row.resource, sortValue: (row) => row.resource },
  { id: 'group', title: 'Group', cell: (row) => row.group || DASH, sortValue: (row) => row.group },
  {
    id: 'namespace',
    title: 'Namespace',
    cell: (row) => (row.namespace ? <ResourceLink model={NamespaceModel} name={row.namespace} /> : DASH),
    sortValue: (row) => row.namespace ?? null,
  },
];

/**
 * Related objects tab of a ClusterOperator (OCP `related-objects.tsx`): `status.relatedObjects` filterable by name,
 * columns Name, Resource, Group, Namespace. Entries without a resource are dropped, as OCP.
 */
export function RelatedObjectsTab({ obj }: { cluster: string; obj: ClusterOperator }) {
  const [name, setName] = useState('');
  const rows = useMemo(() => (obj.status?.relatedObjects ?? []).filter((row) => row.resource), [obj]);
  const filtered = useMemo(() => rows.filter((row) => row.name.includes(name.trim())), [rows, name]);
  const filterNodes = useMemo(
    () => [<DataViewTextFilter key="name" filterId="name" title="Name" placeholder="Filter by name" />],
    [],
  );
  const onFilterChange = useCallback((_filterId: string, value: DataViewFilterValue) => {
    setName(typeof value === 'string' ? value : '');
  }, []);
  return (
    <ConsoleDataView
      id="related-objects"
      label="Related objects"
      data={rows}
      filteredData={filtered}
      loaded
      columns={COLUMNS}
      getRowId={(row) => `${row.group}/${row.resource}/${row.namespace ?? ''}/${row.name}`}
      filterNodes={filterNodes}
      filterValues={{ name }}
      onFilterChange={onFilterChange}
      onClearAllFilters={() => setName('')}
      isFiltered={name !== ''}
    />
  );
}
