import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  Alert,
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  Divider,
  Icon,
  Skeleton,
} from '@patternfly/react-core';
import { RhUiPauseIcon, RhUiPlayIcon, RhUiWarningFillIcon } from '@patternfly/react-icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/shared/api';
import { clusterUpdate, clusterVersionFacts } from '@/shared/health';
import { EventModel } from '@/shared/k8s';
import { KindBadge, kindAbbr, Timestamp } from '@/shared/ui';
import { useClusterVersion } from '../cluster-settings/useClusterVersion';
import { ObjectReferenceLink } from '../components/ObjectReferenceLink';
import { eventLastTime, isWarningEvent, NO_EVENT_FILTERS, type EventResource } from '../events/eventStream';
import { useEventStream } from '../events/useEventStream';
import { ALL_NAMESPACES, clusterSettingsPath, resourcePath } from '../paths';
import styles from './Overview.module.css';

/** Recent events shown in the card (OCP `RecentEventsBody` caps the list too; the rest is on the Events page). */
const MAX_RECENT = 50;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** OCP `RecentEventsBodyContent` toggle: "HH:MM", warning icon, kind badge and the one-line message. */
function RecentEvent({
  event,
  isExpanded,
  onToggle,
}: {
  event: EventResource;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { involvedObject: obj } = event;
  const last = eventLastTime(event);
  const id = `recent-event-${event.metadata.uid ?? event.metadata.name}`;
  return (
    <AccordionItem isExpanded={isExpanded}>
      <AccordionToggle id={id} onClick={onToggle}>
        <div className={styles.recentTitle}>
          <span className={styles.recentTime}>{last ? timeFormat.format(new Date(last)) : '-'}</span>
          <div className={styles.recentMessage}>
            {isWarningEvent(event) && (
              <Icon status="warning" isInline className={styles.recentIcon}>
                <RhUiWarningFillIcon title="Warning" />
              </Icon>
            )}
            {obj.kind && <KindBadge kind={obj.kind} abbr={kindAbbr(obj.kind)} />}
            <span className={styles.recentMessageText}>{event.message}</span>
          </div>
        </div>
      </AccordionToggle>
      <AccordionContent>
        <ObjectReferenceLink
          apiVersion={obj.apiVersion}
          kind={obj.kind}
          name={obj.name}
          namespace={obj.namespace}
        />
        <div className={styles.recentContentMessage}>{event.message}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * The "Recent events" section (OCP `RecentEventsBody`): the cluster-wide event stream, newest first; Pause/Resume
 * freezes it (`useEventStream` snapshot). Expanding an event shows its object and full message.
 */
function RecentEvents({ cluster }: { cluster: string }) {
  const stream = useEventStream({ cluster, namespace: undefined, filters: NO_EVENT_FILTERS });
  const [expanded, setExpanded] = useState<string | null>(null);
  const events = stream.shown.slice(0, MAX_RECENT);

  const body = (() => {
    if (stream.isPending) {
      return (
        <div className={styles.ongoingItem}>
          <Skeleton screenreaderText="Loading recent events" />
        </div>
      );
    }
    if (stream.error) {
      return (
        <div className={styles.ongoingItem}>
          <Alert variant="danger" isInline isPlain title={`Events: ${errorMessage(stream.error)}`} />
        </div>
      );
    }
    if (events.length === 0) {
      return (
        <div className={`${styles.ongoingItem} pf-v6-u-text-color-subtle`}>There are no recent events.</div>
      );
    }
    return (
      <Accordion asDefinitionList={false} headingLevel="h5" className={styles.recentAccordion}>
        {events.map((event) => {
          const key = event.metadata.uid ?? `${event.metadata.namespace}/${event.metadata.name}`;
          return (
            <RecentEvent
              key={key}
              event={event}
              isExpanded={expanded === key}
              onToggle={() => setExpanded((current) => (current === key ? null : key))}
            />
          );
        })}
      </Accordion>
    );
  })();

  return (
    <>
      <div className={styles.activityTitle}>
        <span>Recent events</span>
        <Button
          variant="link"
          isInline
          onClick={stream.toggle}
          icon={stream.isActive ? <RhUiPauseIcon /> : <RhUiPlayIcon />}
        >
          {stream.isActive ? 'Pause' : 'Resume'}
        </Button>
      </div>
      {body}
      {stream.shown.length > MAX_RECENT && (
        // OCP shows the footer only when more events exist than the card lists; the stream already holds up to 500.
        <>
          <Divider />
          <CardFooter>
            <Link to={resourcePath(cluster, EventModel, { namespace: ALL_NAMESPACES })}>View all events</Link>
          </CardFooter>
        </>
      )}
    </>
  );
}

/**
 * The "Ongoing" section (OCP `OngoingActivityBody` + `ClusterUpdateActivity`): the running cluster update, else
 * "There are no ongoing activities.".
 */
function OngoingActivity({ cluster, isOpenShift }: { cluster: string; isOpenShift: boolean }) {
  const cv = useClusterVersion(cluster, { enabled: isOpenShift });
  const update = clusterUpdate(clusterVersionFacts(cv.data, cv.error));
  const body = (() => {
    if (isOpenShift && cv.isPending) return <Skeleton screenreaderText="Loading ongoing activities" />;
    if (update?.kind === 'updating') {
      const started = cv.data?.status?.history?.[0]?.startedTime;
      return (
        <>
          <Link to={clusterSettingsPath(cluster)}>
            Updating cluster to {update.version ?? cv.data?.status?.desired?.version}
          </Link>
          {started && (
            <div className="pf-v6-u-text-color-subtle">
              Started <Timestamp value={started} />
            </div>
          )}
        </>
      );
    }
    return <span className="pf-v6-u-text-color-subtle">There are no ongoing activities.</span>;
  })();
  return (
    <>
      <div className={styles.activityTitle}>Ongoing</div>
      <div className={styles.ongoingItem}>{body}</div>
    </>
  );
}

/** Props for {@link ActivityCard}. */
export interface ActivityCardProps {
  cluster: string;
  isOpenShift: boolean;
}

/**
 * Activity card (OVW-5, OCP `activity-card.tsx`): "Ongoing" (cluster update) and "Recent events" (all events, warnings
 * marked); "View all events" in the footer when there are more than the card lists.
 */
export function ActivityCard({ cluster, isOpenShift }: ActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <div className={styles.activityBody}>
        <OngoingActivity cluster={cluster} isOpenShift={isOpenShift} />
        <RecentEvents cluster={cluster} />
      </div>
    </Card>
  );
}
