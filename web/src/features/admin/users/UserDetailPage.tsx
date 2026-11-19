import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Tab,
  TabContent,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, type LinkProps } from 'react-router';
import { isApiError, type UserDetail } from '@/shared/api';
import { ErrorState, useToast } from '@/shared/ui';
import { USER_DETAIL_TABS, useAdminTab, type UserDetailTab } from '../adminTabs';
import { useUser } from './api';
import { UserDetailHeader } from './UserDetailHeader';
import { UserDetailsTab } from './UserDetailsTab';
import { userDetailPath } from './UserRow';

/** URL of each tab; tabs are URL segments (FRONTEND.md "Routing"), so switching tabs navigates. */
const tabPath = (username: string, tab: UserDetailTab) =>
  tab === 'details' ? userDetailPath(username) : `${userDetailPath(username)}/${tab}`;

/** Router link to the users list that PatternFly's `Button` can render as. */
function UsersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/admin/users" />;
}

/** 404 body: the user doesn't exist (`Users.NotFound`), with a way back to the list. */
function UserNotFound({ username }: { username: string }) {
  return (
    <EmptyState titleText={`User ${username} not found`} headingLevel="h2">
      <EmptyStateBody>The user may have been entered incorrectly; users are never deleted.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" component={UsersLink}>
            Back to Users
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}

/** `true` for the Api's 404 `Users.NotFound`. */
const isUserNotFound = (error: unknown) => isApiError(error) && error.status === 404;

/**
 * Leaves the page with a "no longer exists" toast when a refetch of an already loaded user answers 404 (users are
 * never deleted, but e.g. a database reset can make one disappear). Mirrors the cluster detail page: a ref makes
 * sure the toast and the `replace` navigation to the list happen once, even if the effect re-runs.
 */
function useLeaveVanishedUser(username: string, vanished: boolean) {
  const navigate = useNavigate();
  const toast = useToast();
  const left = useRef(false);
  useEffect(() => {
    if (!vanished || left.current) return;
    left.current = true;
    toast.warning(`User ${username} no longer exists`, 'It could not be found when the page refreshed.');
    void navigate('/admin/users', { replace: true });
  }, [vanished, username, navigate, toast]);
}

/** Tab titles, also the accessible names of their panels. */
const TAB_TITLES: Record<UserDetailTab, string> = { details: 'Details', access: 'Cluster access' };

/** DOM id of a tab's panel, referenced by the tab's `aria-controls`. */
const panelId = (tab: UserDetailTab) => `user-detail-${tab}-panel`;

/** Content of the active tab; only that one is mounted, so e.g. the grants query runs only on its tab. */
function UserTabPanel({ user, tab }: { user: UserDetail; tab: UserDetailTab }) {
  if (tab === 'details') {
    return <UserDetailsTab user={user} />;
  }
  // Grants table and actions arrive with T-0039.
  return (
    <EmptyState titleText="Cluster access" headingLevel="h2">
      <EmptyStateBody>
        {user.username} has {user.grantCount} cluster grant{user.grantCount === 1 ? '' : 's'}. The grants list is
        coming soon.
      </EmptyStateBody>
    </EmptyState>
  );
}

/**
 * URL-driven Details / Cluster access tabs of a loaded user: the tab bar sits in a `PageSection type="tabs"` (PF6
 * page-tabs idiom), the active panel in its own `PageSection` below; selecting a tab navigates to its URL.
 */
function UserTabs({ user, tab }: { user: UserDetail; tab: UserDetailTab }) {
  const navigate = useNavigate();
  return (
    <>
      <PageSection type="tabs">
        <Tabs
          activeKey={tab}
          onSelect={(_event, key) => {
            const next = USER_DETAIL_TABS.find((candidate) => candidate === key);
            if (next && next !== tab) void navigate(tabPath(user.username, next));
          }}
          aria-label="User detail tabs"
        >
          {USER_DETAIL_TABS.map((key) => (
            <Tab
              key={key}
              eventKey={key}
              title={<TabTitleText>{TAB_TITLES[key]}</TabTitleText>}
              tabContentId={panelId(key)}
            />
          ))}
        </Tabs>
      </PageSection>
      <PageSection>
        <TabContent id={panelId(tab)} eventKey={tab} activeKey={tab} aria-label={TAB_TITLES[tab]}>
          <UserTabPanel user={user} tab={tab} />
        </TabContent>
      </PageSection>
    </>
  );
}

/**
 * `/admin/users/:username[/access]` — who a user is and what they can do (USR-7): header with labels and the shared
 * Actions menu, then Details and Cluster access tabs whose selection comes from the URL (`useAdminTab`). The router
 * decodes the username; `useUser` re-encodes it for the API (ADR-0013 §1), so names like `system:admin` work.
 * Loading shows skeletons, `Users.NotFound` an empty state with a way back, other errors `ErrorState` with Retry —
 * both only while nothing is loaded: a failed background refetch keeps the loaded data, and a 404 after load sends
 * the admin back to the list with a toast.
 * Lazy-loaded by `routes.tsx`.
 */
export function UserDetailPage() {
  // The route only matches with a non-empty `:username`.
  const username = useParams().username ?? '';
  const tab = useAdminTab(USER_DETAIL_TABS);
  const { data: user, error, isPending, refetch } = useUser(username);
  useLeaveVanishedUser(username, user !== undefined && isUserNotFound(error));

  return (
    <>
      <UserDetailHeader username={username} user={user} isLoading={isPending} />
      {isPending && (
        <PageSection>
          <Skeleton height="10rem" screenreaderText="Loading user" />
        </PageSection>
      )}
      {error && !user && (
        <PageSection>
          {isUserNotFound(error) ? (
            <UserNotFound username={username} />
          ) : (
            <ErrorState error={error} title="Could not load user" onRetry={() => void refetch()} />
          )}
        </PageSection>
      )}
      {user && <UserTabs user={user} tab={tab} />}
    </>
  );
}
