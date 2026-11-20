import { Label } from '@patternfly/react-core';
import { EventModel, type Event, type K8sResource } from '@/shared/k8s';
import { RelativeTime } from '@/shared/ui';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { namespaceColumn, timestampValue } from '../columns';
import type { ColumnDef, ResourceDescriptor } from '../types';

/** A listed core/v1 event (`metadata` always present). */
export type EventResource = Event & K8sResource;

/** When the event last happened: `lastTimestamp`, else `eventTime` (newer reporters), else creation. */
export function eventLastSeen(event: EventResource): string | undefined {
  return event.lastTimestamp ?? event.eventTime ?? event.metadata.creationTimestamp;
}

function eventCount(event: Event): number {
  return event.count ?? event.series?.count ?? 1;
}

/**
 * Event columns: Type (Warning highlighted), Reason, Involved object (optional), Message, Count, Last seen (id
 * `lastSeen`). Shared by the Events list and the details page's Events tab (T-0075, `withInvolvedObject: false`).
 */
export function eventColumns({
  withInvolvedObject,
}: {
  withInvolvedObject: boolean;
}): ColumnDef<EventResource>[] {
  const involvedObject: ColumnDef<EventResource> = {
    id: 'involvedObject',
    title: 'Involved object',
    cell: (event) => (
      <ObjectReferenceLink
        apiVersion={event.involvedObject.apiVersion}
        kind={event.involvedObject.kind}
        name={event.involvedObject.name}
        namespace={event.involvedObject.namespace ?? event.metadata.namespace}
      />
    ),
    sortValue: (event) => event.involvedObject.name ?? null,
  };
  return [
    {
      id: 'type',
      title: 'Type',
      cell: (event) =>
        event.type === 'Warning' ? (
          <Label isCompact color="orange" status="warning">
            Warning
          </Label>
        ) : (
          (event.type ?? 'Normal')
        ),
      sortValue: (event) => event.type ?? null,
    },
    {
      id: 'reason',
      title: 'Reason',
      cell: (event) => event.reason ?? '—',
      sortValue: (event) => event.reason ?? null,
    },
    ...(withInvolvedObject ? [involvedObject] : []),
    { id: 'message', title: 'Message', width: 40, cell: (event) => event.message ?? '' },
    { id: 'count', title: 'Count', cell: eventCount, sortValue: eventCount },
    {
      id: 'lastSeen',
      title: 'Last seen',
      cell: (event) => <RelativeTime value={eventLastSeen(event) ?? null} />,
      sortValue: (event) => timestampValue(eventLastSeen(event)),
    },
  ];
}

const [typeColumn, ...otherColumns] = eventColumns({ withInvolvedObject: true });

/** Events (UI-3): newest first, type filter, no Events tab of their own. */
export const eventDescriptor: ResourceDescriptor<EventResource> = {
  model: EventModel,
  nav: { section: 'home', order: 20 },
  hasEventsTab: false,
  defaultSort: { columnId: 'lastSeen', direction: 'desc' },
  columns: [...(typeColumn ? [typeColumn] : []), namespaceColumn(EventModel), ...otherColumns],
  filters: [
    {
      id: 'type',
      title: 'Type',
      options: [
        { value: 'Normal', label: 'Normal' },
        { value: 'Warning', label: 'Warning' },
      ],
      matches: (event, values) => values.includes(event.type ?? 'Normal'),
    },
  ],
};
