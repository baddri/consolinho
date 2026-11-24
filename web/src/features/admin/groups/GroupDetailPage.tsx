import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { useState } from 'react';
import { Link, useParams, type LinkProps } from 'react-router';
import { isApiError, type GroupDetail } from '@/shared/api';
import { fleetAdminPath } from '@/shared/routing';
import { ErrorState, KindBadge, PageBody, PageHeading, PageTabs } from '@/shared/ui';
import { ADMIN_KIND_ABBR } from '../AdminResourceLink';
import { BulkGrantWizard } from '../grants/bulk/BulkGrantWizard';
import { GroupGrantsTab } from '../grants/GrantsTab';
import {
  detailPageTabs,
  GROUP_DETAIL_TAB_TITLES,
  GROUP_DETAIL_TABS,
  useAdminTab,
  type GroupDetailTab,
} from '../adminTabs';
import { useGroup } from './api';
import { GroupDetailsTab } from './GroupDetailsTab';
import { GroupNotOnHostLabel } from './GroupHostLabels';
import { groupDetailPath } from './groupPaths';

/** Breadcrumb of every state of the page (`UX.md` §3): `Groups › Group details`. */
const BREADCRUMBS = [{ label: 'Groups', to: fleetAdminPath('groups') }, { label: 'Group details' }];

/** Router link to the groups list that PatternFly's `Button` can render as. */
function GroupsLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to={fleetAdminPath('groups')} />;
}

/** 404 body: neither the host nor any grant knows the group (`Groups.NotFound`), with a way back to the list. */
function GroupNotFound({ name }: { name: string }) {
  return (
    <EmptyState titleText={`Group ${name} not found`} headingLevel="h2">
      <EmptyStateBody>The group doesn't exist on the host cluster and has no cluster access.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" component={GroupsLink}>
            Back to Groups
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}

/** `true` for the Api's 404 `Groups.NotFound`. */
const isGroupNotFound = (error: unknown) => isApiError(error) && error.status === 404;

/**
 * URL-driven tabs of a loaded group as `PageTabs` (`UX.md` §4), then the active tab's content in a tab panel
 * labelled by the tab: Details, or Cluster access with "Grant access" opening the bulk grant wizard (GPG-2/3).
 */
function GroupTabs({ group, tab }: { group: GroupDetail; tab: GroupDetailTab }) {
  const tabs = detailPageTabs(GROUP_DETAIL_TABS, GROUP_DETAIL_TAB_TITLES, groupDetailPath(group.name));
  const [isBulkGrantOpen, setBulkGrantOpen] = useState(false);
  return (
    <>
      <PageTabs tabs={tabs} activeKey={tab} aria-label="Group detail tabs" />
      {tab === 'access' ? (
        <PageBody role="tabpanel" aria-label={GROUP_DETAIL_TAB_TITLES[tab]}>
          <GroupGrantsTab group={group} onGrantAccess={() => setBulkGrantOpen(true)} />
        </PageBody>
      ) : (
        // A plain element: the Details sections are sibling page sections, and PageGroup drops `aria-label`.
        <div role="tabpanel" aria-label={GROUP_DETAIL_TAB_TITLES[tab]}>
          <GroupDetailsTab group={group} />
        </div>
      )}
      <BulkGrantWizard
        subject={{ kind: 'group', name: group.name }}
        isOpen={isBulkGrantOpen}
        onClose={() => setBulkGrantOpen(false)}
      />
    </>
  );
}

/**
 * `/fleet/admin/groups/:groupName` — a group and its host members (GPG-2), as OCP's Group details page: breadcrumb
 * `Groups › Group details`, "G" kind badge and the name as `h1` with "Not found on host cluster" for grant-only
 * groups, then the tabs (`useAdminTab`). The router decodes the name; `useGroup` re-encodes it for the API. Loading
 * shows a skeleton, `Groups.NotFound` an empty state with a way back, other errors `ErrorState` with Retry — both
 * only while nothing is loaded (a failed background refetch keeps the data). Lazy-loaded by `routes.tsx`.
 */
export function GroupDetailPage() {
  // The route only matches with a non-empty `:groupName`.
  const name = useParams().groupName ?? '';
  const tab = useAdminTab(GROUP_DETAIL_TABS);
  const { data: group, error, isPending, refetch } = useGroup(name);

  return (
    <>
      <PageHeading
        breadcrumbs={BREADCRUMBS}
        icon={<KindBadge kind="Group" abbr={ADMIN_KIND_ABBR.Group} size="lg" />}
        title={name}
        labels={group && <GroupNotOnHostLabel foundOnHost={group.foundOnHost} />}
      />
      {isPending && (
        <PageBody>
          <Skeleton height="10rem" screenreaderText="Loading group" />
        </PageBody>
      )}
      {error && !group && (
        <PageBody>
          {isGroupNotFound(error) ? (
            <GroupNotFound name={name} />
          ) : (
            <ErrorState error={error} title="Could not load group" onRetry={() => void refetch()} />
          )}
        </PageBody>
      )}
      {group && <GroupTabs group={group} tab={tab} />}
    </>
  );
}
