import { Alert, Label, LabelGroup, Skeleton } from '@patternfly/react-core';
import { Link } from 'react-router';
import type { EffectiveAccess } from '@/shared/api';
import {
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  DetailsSubsection,
  ErrorState,
  PageBody,
  RelativeTime,
} from '@/shared/ui';
import { groupDetailPath } from '../groups/groupPaths';
import { useEffectiveAccess } from './api';
import { EffectiveAccessTable } from './EffectiveAccessTable';
import { EMPTY } from './effectiveAccessText';

/** The user's recorded groups as compact labels linking to each group's page, or "—" without groups. */
function GroupLabels({ access }: { access: EffectiveAccess }) {
  if (access.groups.length === 0) return <>{EMPTY}</>;
  return (
    <LabelGroup numLabels={access.groups.length} aria-label={`Groups of ${access.username}`}>
      {access.groups.map((group) => (
        <Label
          key={group}
          isCompact
          isClickable
          render={({ className, content }) => (
            <Link to={groupDetailPath(group)} className={className}>
              {content}
            </Link>
          )}
        >
          {group}
        </Label>
      ))}
    </LabelGroup>
  );
}

/**
 * What access is resolved from (EFF-4): the recorded groups, when they were last read ("Never logged in" before the
 * first login) and, for a read-only user, that every cluster is narrowed to read only. Skeletons while loading.
 */
function EffectiveAccessSummary({ access }: { access: EffectiveAccess | undefined }) {
  return (
    <>
      <DetailsGrid>
        <DetailsColumn aria-label="Group membership">
          <DetailsItem label="Groups">
            {access ? <GroupLabels access={access} /> : <Skeleton screenreaderText="Loading groups" />}
          </DetailsItem>
          <DetailsItem label="Groups as of">
            {access ? (
              <RelativeTime value={access.groupsAsOf} emptyText="Never logged in" />
            ) : (
              <Skeleton screenreaderText="Loading groups as of" />
            )}
          </DetailsItem>
        </DetailsColumn>
      </DetailsGrid>
      {access?.userIsReadOnly && (
        <Alert
          variant="info"
          isInline
          isPlain
          title="Read-only flag: every cluster is narrowed to read only."
          className="pf-v6-u-mt-md"
        />
      )}
    </>
  );
}

/** Props for {@link EffectiveAccessTab}. */
export interface EffectiveAccessTabProps {
  username: string;
}

/**
 * Effective access tab of the user page (EFF-1..5): read-only answer to "which clusters can this user open, with
 * which mode, and why". A summary of the groups access is resolved from, then one row per reachable cluster,
 * expandable to every candidate grant. Edits happen on Cluster access and Groups (Q2). Renders its own bordered
 * sections (OCP `PaneBody`s); an error replaces both with `ErrorState` and Retry. Refetches on every mount (default
 * `staleTime`), so the next visit after a grant change is current.
 */
export function EffectiveAccessTab({ username }: EffectiveAccessTabProps) {
  const { data, error, refetch } = useEffectiveAccess(username);
  if (error && !data) {
    return (
      <PageBody>
        <ErrorState error={error} title="Could not load effective access" onRetry={() => void refetch()} />
      </PageBody>
    );
  }
  return (
    <>
      <DetailsSubsection title="Effective access details">
        <EffectiveAccessSummary access={data} />
      </DetailsSubsection>
      <DetailsSubsection title="Clusters">
        <EffectiveAccessTable username={username} clusters={data?.clusters} />
      </DetailsSubsection>
    </>
  );
}
