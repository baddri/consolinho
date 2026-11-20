import { EventModel, useK8sList, type K8sResource } from '@/shared/k8s';
import { TableEmptyRow, useClientSort, type SortValue } from '@/shared/table';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { useResourceDetails } from '../details/detailsContext';
import { ResourceTable } from '../list/ResourceTable';
import { eventColumns } from '../registry/kinds/events';
import type { ColumnDef } from '../registry/types';

/** Exact empty text of UI-5. */
export const NO_EVENTS_TEXT = 'No events — events are kept for about an hour by default.';

const COLUMNS: ColumnDef<K8sResource>[] = eventColumns({ withInvolvedObject: false });
const NO_EVENTS: K8sResource[] = [];

/** Stable sort accessors of the sortable event columns (`useClientSort` wants them stable). */
const SORT_ACCESSORS: Record<string, (event: K8sResource) => SortValue> = Object.fromEntries(
  COLUMNS.flatMap((column) =>
    column.sortValue ? [[column.id, (event: K8sResource) => column.sortValue?.(event) ?? null]] : [],
  ),
);

/**
 * Events tab (UI-5): the object's events only — a live list filtered server-side by `involvedObject.uid` in the
 * object's namespace — newest first, with the Events list columns minus "Involved object". Lazy route module.
 */
export function ResourceEventsTab() {
  const { cluster, obj } = useResourceDetails();
  const namespace = obj.metadata.namespace;
  const events = useK8sList<K8sResource>(cluster, EventModel, {
    namespace,
    fieldSelector: `involvedObject.uid=${obj.metadata.uid ?? ''}`,
  });
  const { sorted, sortProps } = useClientSort(events.data ?? NO_EVENTS, SORT_ACCESSORS, {
    by: 'lastSeen',
    direction: 'desc',
  });

  if (events.error) {
    return (
      <ResourceErrorState
        error={events.error}
        cluster={cluster}
        model={EventModel}
        namespace={namespace}
        onRetry={() => events.refetch()}
      />
    );
  }
  return (
    <ResourceTable
      ariaLabel="Events"
      columns={COLUMNS}
      rows={sorted}
      sortProps={sortProps}
      isPending={events.isPending}
      emptyRow={sorted.length === 0 && <TableEmptyRow colSpan={COLUMNS.length} title={NO_EVENTS_TEXT} />}
    />
  );
}
