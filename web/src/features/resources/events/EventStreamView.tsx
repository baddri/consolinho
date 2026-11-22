import { Bullseye, Button, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { RhUiPauseFillIcon, RhUiPlayFillIcon } from '@patternfly/react-icons';
import type { ReactNode } from 'react';
import { EventModel } from '@/shared/k8s';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { EventCard } from './EventCard';
import { MAX_EVENTS, type EventFilters } from './eventStream';
import styles from './EventStream.module.css';
import { useEventStream } from './useEventStream';

/** OCP `NoEvents` text (`events.tsx`). */
export const NO_EVENTS = 'No events';

/** OCP `TogglePlay` (`public/components/utils/toggle-play.tsx`): round pause/play button, green ring while active. */
function TogglePlay({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Button
      variant="plain"
      icon={active ? <RhUiPauseFillIcon /> : <RhUiPlayFillIcon />}
      className={`${styles.togglePlay} ${active ? styles.togglePlayActive : ''} ${styles.timelineButton}`}
      onClick={onClick}
      aria-label={active ? 'Pause event streaming' : 'Start streaming events'}
    />
  );
}

/** OCP `ConsoleEmptyState` (`variant sm`, `pf-v6-u-pt-xl-on-md`) as the stream uses it. */
function StreamEmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <EmptyState variant="sm" className="pf-v6-u-pt-xl-on-md" titleText={title} headingLevel="h2">
      <EmptyStateBody>{children}</EmptyStateBody>
    </EmptyState>
  );
}

/** Props for {@link EventStreamView}. */
export interface EventStreamViewProps {
  cluster: string;
  /** Namespace to watch; `undefined` for all namespaces. */
  namespace: string | undefined;
  /** Server-side selector, e.g. the object's `involvedObject.uid=…` on an Events tab. */
  fieldSelector?: string;
  /** Client-side filters of the Events page toolbar; memoise them. */
  filters: EventFilters;
  /** An object's Events tab: no matches read "No events", not "No matching events" (OCP `resourceEventStream`). */
  isResourceStream?: boolean;
}

/**
 * OCP `EventStream` (`public/components/events.tsx`): the status line ("Streaming events..." / "Event stream is
 * paused." / "Loading events..." / the watch's connection error) with "Showing N events" on the right, the timeline
 * with the pause/play button and "Older events are not stored.", then one {@link EventCard} per event, newest first,
 * at most {@link MAX_EVENTS}. Loading shows a spinner, an empty stream "No events", filters without matches "No matching
 * events". A failed list (RBAC, credential) is the shared resource error state instead of OCP's reconnect text, as
 * every other list page. Wrap it in a `PageBody` (OCP `PaneBody`).
 */
export function EventStreamView({
  cluster,
  namespace,
  fieldSelector,
  filters,
  isResourceStream = false,
}: EventStreamViewProps) {
  const stream = useEventStream({ cluster, namespace, fieldSelector, filters });

  if (stream.error) {
    return (
      <ResourceErrorState
        error={stream.error}
        cluster={cluster}
        model={EventModel}
        namespace={namespace}
        onRetry={stream.refetch}
      />
    );
  }

  const count = stream.shown.length;
  const allCount = stream.all.length;
  let statusText: ReactNode;
  let body: ReactNode = null;
  if (stream.isPending) {
    statusText = 'Loading events...';
    body = (
      <Bullseye>
        <Spinner size="lg" aria-label="Loading events" />
      </Bullseye>
    );
  } else if (stream.liveStatus === 'paused') {
    // The watch dropped and is retrying (DATA-3); the events shown are the last ones received.
    statusText = <span className={styles.connectionError}>Error connecting to event stream</span>;
  } else {
    statusText = stream.isActive ? 'Streaming events...' : 'Event stream is paused.';
  }
  if (!stream.isPending && (allCount === 0 || (count === 0 && isResourceStream))) {
    body = <StreamEmptyState>{NO_EVENTS}</StreamEmptyState>;
  } else if (!stream.isPending && count === 0) {
    body = (
      <StreamEmptyState title="No matching events">
        {allCount >= MAX_EVENTS
          ? `${MAX_EVENTS}+ events exist, but none match the current filter`
          : `${allCount} ${allCount === 1 ? 'event exists' : 'events exist'}, but none match the current filter`}
      </StreamEmptyState>
    );
  }

  return (
    <div className={styles.stream}>
      <div className={styles.status}>
        <div>{statusText}</div>
        <div className="pf-v6-u-text-color-subtle" data-test="event-totals">
          {count < MAX_EVENTS
            ? `Showing ${count} ${count === 1 ? 'event' : 'events'}`
            : `Showing most recent ${count} events`}
        </div>
      </div>
      <div className={`${styles.timeline} ${count === 0 ? styles.timelineEmpty : ''}`}>
        <TogglePlay active={stream.isActive} onClick={stream.toggle} />
        <div className={styles.endMessage}>Older events are not stored.</div>
      </div>
      {count > 0 && (
        <div role="list" aria-label="Events">
          {stream.shown.map((event, index) => (
            <div role="listitem" key={event.metadata.uid ?? `${event.metadata.namespace ?? ''}/${event.metadata.name ?? ''}`}>
              <EventCard event={event} index={index} />
            </div>
          ))}
        </div>
      )}
      {body}
    </div>
  );
}
