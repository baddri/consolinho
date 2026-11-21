import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { EventModel, useK8sList, type K8sResource } from '@/shared/k8s';
import { useClientSort, type SortValue } from '@/shared/table';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { useResourceDetails } from '../details/detailsContext';
import { ResourceTable } from '../list/ResourceTable';
import { eventColumns } from '../registry/kinds/events';
import type { ColumnDef } from '../registry/types';

/** Empty-state title and body (UI-5 text, split OCP `EmptyBox`-style by T-0113). */
export const NO_EVENTS_TITLE = 'No events';
export const NO_EVENTS_BODY = 'Events are kept for about an hour by default.';

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
 * object's namespace — newest first, with the Events list columns minus "Involved object". Without events a small
 * `EmptyState` replaces the table (no orphan column headers). Lazy route module.
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
  if (!events.isPending && sorted.length === 0) {
    return (
      <EmptyState variant="sm" titleText={NO_EVENTS_TITLE} headingLevel="h2">
        <EmptyStateBody>{NO_EVENTS_BODY}</EmptyStateBody>
      </EmptyState>
    );
  }
  return (
    <ResourceTable
      ariaLabel="Events"
      columns={COLUMNS}
      rows={sorted}
      sortProps={sortProps}
      isPending={events.isPending}
    />
  );
}
