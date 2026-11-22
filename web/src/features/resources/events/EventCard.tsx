import { memo, useState } from 'react';
import { NamespaceModel } from '@/shared/k8s';
import { durationText, Timestamp, useTimestampTick } from '@/shared/ui';
import { ObjectReferenceLink } from '../components/ObjectReferenceLink';
import { ResourceLink } from '../components/ResourceLink';
import {
  eventCount,
  eventFirstTime,
  eventLastTime,
  isWarningEvent,
  type EventResource,
} from './eventStream';
import styles from './EventStream.module.css';

/** OCP animates only new events near the top of the stream (`event-stream.tsx`: the first 6). */
const ANIMATED_ROWS = 6;

/** "in the last 3 days" part of the count: the time since the first occurrence, on the shared 10-second tick. */
function SinceFirst({ value }: { value: string }) {
  const now = useTimestampTick();
  return <>{durationText(new Date(value), now)}</>;
}

/** "N times in the last <duration>" (OCP `co-sysevent__count`), only for repeated events. */
function EventCount({ event }: { event: EventResource }) {
  const count = eventCount(event);
  if (count <= 1) return null;
  const first = eventFirstTime(event);
  return (
    <span className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">
      {count} times{first && <> in the last <SinceFirst value={first} /></>}
    </span>
  );
}

/**
 * "Generated from <component>[ on <host>]": `source.component` (core/v1) else `reportingComponent` (events.k8s.io);
 * kubelet events name their node. OCP links the node when the user can list nodes; we have no Node page, so it's text.
 */
function eventSource(event: EventResource): string {
  const component = event.source?.component ?? event.reportingComponent;
  const host = event.source?.host;
  return component === 'kubelet' && host
    ? `Generated from ${component} on ${host}`
    : `Generated from ${component ?? ''}`;
}

/** Props for {@link EventCard}. */
export interface EventCardProps {
  event: EventResource;
  /** Position in the stream; only cards mounted near the top fade in. */
  index: number;
}

/**
 * One event of the stream (OCP `events.tsx` `Inner`, `co-sysevent`): a timeline dot with connector (titled with the
 * reason) and a card with the involved object link, its namespace badge link and the last time; "Generated from …"
 * with "N times in the last …"; then the message, scrollable when long. Warnings get the warning border.
 */
function EventCardImpl({ event, index }: EventCardProps) {
  // Decided once per mount, so re-renders never restart the animation (OCP `SysEvent`).
  const [animate] = useState(() => index < ANIMATED_ROWS);
  const { involvedObject: obj } = event;
  const warning = isWarningEvent(event);
  const namespace = obj.namespace ?? event.metadata.namespace;
  return (
    <div className={`${styles.item} ${animate ? styles.slideIn : ''}`}>
      <div
        className={`${styles.event} ${warning ? styles.warning : ''}`}
        data-test={warning ? 'event-warning' : 'event'}
      >
        <div className={styles.iconBox}>
          <span className={styles.icon} title={`${event.reason ?? ''} (${obj.kind ?? ''})`} />
          <div className={styles.iconLine} />
        </div>
        <div className={styles.box}>
          <div className={styles.subheader}>
            <div className={styles.resourceLink}>
              <ObjectReferenceLink
                apiVersion={obj.apiVersion}
                kind={obj.kind}
                name={obj.name}
                namespace={namespace}
              />
            </div>
            {obj.namespace && (
              <div className={`${styles.resourceLink} ${styles.namespaceLink}`}>
                <ResourceLink model={NamespaceModel} name={obj.namespace} />
              </div>
            )}
            <div className={styles.timestamp}>
              <Timestamp value={eventLastTime(event)} />
            </div>
          </div>
          <div className={styles.details}>
            <span className={`pf-v6-u-font-size-xs ${styles.source}`}>{eventSource(event)}</span>
            <div className={styles.countAndActions}>
              <EventCount event={event} />
            </div>
          </div>
          {/* Focusable so keyboard users can scroll a long message (OCP does the same). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={styles.message} role="group" tabIndex={0}>
            {event.message}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Re-render a card only when its event changed (new count or time after the API server merged a repeat). The index is
 * ignored: it only matters at mount, so a new event at the top doesn't re-render every card below it.
 */
function sameEvent(prev: EventCardProps, next: EventCardProps): boolean {
  if (prev.event === next.event) return true;
  const a = prev.event.metadata;
  const b = next.event.metadata;
  return a.uid !== undefined && a.uid === b.uid && a.resourceVersion !== undefined && a.resourceVersion === b.resourceVersion;
}

/** {@link EventCardImpl}, memoised per event (OCP `SysEventContent`'s `arePropsEqual`). */
export const EventCard = memo(EventCardImpl, sameEvent);
