import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, type LinkProps } from 'react-router';
import { isApiError, type UserDetail } from '@/shared/api';
import { ErrorState, PageBody, PageTabs, useToast } from '@/shared/ui';
import {
  detailPageTabs,
  USER_DETAIL_TAB_TITLES,
  USER_DETAIL_TABS,
  useAdminTab,
  type UserDetailTab,
} from '../adminTabs';
import { EffectiveAccessTab } from '../effective-access/EffectiveAccessTab';
import { BulkGrantWizard } from '../grants/bulk/BulkGrantWizard';
import { UserGrantsTab } from '../grants/GrantsTab';
import { useUser } from './api';
import { UserDetailHeader } from './UserDetailHeader';
import { UserDetailsTab } from './UserDetailsTab';
import { userDetailPath } from './userColumns';
import { fleetAdminPath } from '@/shared/routing';

/** Router link to the users list that PatternFly's `Button` can render as. */
function UsersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to={fleetAdminPath('users')} />;
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
    void navigate(fleetAdminPath('users'), { replace: true });
  }, [vanished, username, navigate, toast]);
}

/** Router state that asks the user page to open the bulk grant wizard once ("Create and grant access", USR-2). */
export interface OpenBulkGrantState {
  openBulkGrant: true;
}

/** `true` when the router `state` is an {@link OpenBulkGrantState}. */
function asksForBulkGrant(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'openBulkGrant' in state && state.openBulkGrant === true;
}

/**
 * Open state of the page's bulk grant wizard. Starts open when the page was reached with {@link OpenBulkGrantState};
 * that state is then dropped from the history entry (`replace`), so a reload or Back doesn't open it again.
 */
function useBulkGrantOpen() {
  const location = useLocation();
  const navigate = useNavigate();
  const asked = asksForBulkGrant(location.state);
  const [isOpen, setOpen] = useState(asked);
  useEffect(() => {
    if (asked) void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [asked, navigate, location.pathname, location.search]);
  return [isOpen, setOpen] as const;
}

/** Content of the Details or Cluster access tab; only the active one is mounted, so e.g. the grants query runs only on its tab. */
function UserTabPanel({ user, tab, onGrantAccess }: UserTabsProps) {
  if (tab === 'details') {
    return <UserDetailsTab user={user} />;
  }
  return <UserGrantsTab user={user} onGrantAccess={onGrantAccess} />;
}

/** Props of {@link UserTabs} and {@link UserTabPanel}. */
interface UserTabsProps {
  user: UserDetail;
  tab: UserDetailTab;
  /** Opens the bulk grant wizard (Cluster access "Grant access"). */
  onGrantAccess: () => void;
}

/**
 * URL-driven Details / Cluster access / Effective access tabs of a loaded user as `PageTabs` aligned with the heading
 * (`UX.md` §4), then the active tab's content labelled by the tab — in a `PageBody`, except Effective access, which
 * renders its own bordered sections (OCP `PaneBody`s). Selecting a tab navigates to its URL.
 */
function UserTabs({ user, tab, onGrantAccess }: UserTabsProps) {
  const tabs = detailPageTabs(USER_DETAIL_TABS, USER_DETAIL_TAB_TITLES, userDetailPath(user.username));
  return (
    <>
      <PageTabs tabs={tabs} activeKey={tab} aria-label="User detail tabs" />
      {tab === 'effective-access' ? (
        // A plain element: PageGroup drops `aria-label` unless it scrolls.
        <div role="tabpanel" aria-label={USER_DETAIL_TAB_TITLES[tab]}>
          <EffectiveAccessTab username={user.username} />
        </div>
      ) : (
        <PageBody role="tabpanel" aria-label={USER_DETAIL_TAB_TITLES[tab]}>
          <UserTabPanel user={user} tab={tab} onGrantAccess={onGrantAccess} />
        </PageBody>
      )}
    </>
  );
}

/**
 * `/fleet/admin/users/:username[/access|/effective-access]` — who a user is and what they can do (USR-7): `PageHeading` with labels and
 * the shared Actions menu, then Details, Cluster access and Effective access tabs whose selection comes from the URL (`useAdminTab`). The
 * router decodes the username; `useUser` re-encodes it for the API (ADR-0013 §1), so names like `system:admin` work.
 * Loading shows skeletons, `Users.NotFound` an empty state with a way back, other errors `ErrorState` with Retry —
 * both only while nothing is loaded: a failed background refetch keeps the loaded data, and a 404 after load sends
 * the admin back to the list with a toast. "Grant access" (Cluster access tab) or router state
 * {@link OpenBulkGrantState} after "Create and grant access" opens the bulk grant wizard.
 * Lazy-loaded by `routes.tsx`.
 */
export function UserDetailPage() {
  // The route only matches with a non-empty `:username`.
  const username = useParams().username ?? '';
  const tab = useAdminTab(USER_DETAIL_TABS);
  const { data: user, error, isPending, refetch } = useUser(username);
  useLeaveVanishedUser(username, user !== undefined && isUserNotFound(error));
  const [isBulkGrantOpen, setBulkGrantOpen] = useBulkGrantOpen();
  const openBulkGrant = () => setBulkGrantOpen(true);

  return (
    <>
      <UserDetailHeader username={username} user={user} isLoading={isPending} />
      {isPending && (
        <PageBody>
          <Skeleton height="10rem" screenreaderText="Loading user" />
        </PageBody>
      )}
      {error && !user && (
        <PageBody>
          {isUserNotFound(error) ? (
            <UserNotFound username={username} />
          ) : (
            <ErrorState error={error} title="Could not load user" onRetry={() => void refetch()} />
          )}
        </PageBody>
      )}
      {user && <UserTabs user={user} tab={tab} onGrantAccess={openBulkGrant} />}
      <BulkGrantWizard username={username} isOpen={isBulkGrantOpen} onClose={() => setBulkGrantOpen(false)} />
    </>
  );
}
