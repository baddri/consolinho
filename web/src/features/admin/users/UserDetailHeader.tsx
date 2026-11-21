import { Label, LabelGroup, Skeleton } from '@patternfly/react-core';
import type { UserDetail } from '@/shared/api';
import { PageHeading } from '@/shared/ui';
import { UserActionsDropdown } from './UserActionsDropdown';
import { UserStatusLabel } from './UserStatusLabel';

/** Breadcrumb of every state of the page (`UX.md` §3): `Users › User details`. */
const BREADCRUMBS = [{ label: 'Users', to: '/admin/users' }, { label: 'User details' }];

/**
 * The header's category labels (`UX.md` §5): Admin and Read only. Where an admin role comes from is on the Details
 * tab (`adminSourceText`); nothing renders for a plain, writable user.
 */
function UserHeaderLabels({ user }: { user: UserDetail }) {
  if (user.role !== 'admin' && !user.isReadOnly) return null;
  return (
    <LabelGroup aria-label="User labels">
      {user.role === 'admin' && (
        <Label isCompact color="blue">
          Admin
        </Label>
      )}
      {user.isReadOnly && (
        <Label isCompact color="orange">
          Read only
        </Label>
      )}
    </LabelGroup>
  );
}

/** Props for {@link UserDetailHeader}. */
export interface UserDetailHeaderProps {
  /** Username from the route (already decoded); the title even while loading or not found. */
  username: string;
  /** The loaded user; without one there are no status, labels or actions. */
  user?: UserDetail;
  /** The user is still loading: show a skeleton in place of status and labels. */
  isLoading: boolean;
}

/**
 * Heading of the user detail page (USR-7, `UX.md` §3) via {@link PageHeading}: breadcrumb `Users › User details`, the
 * username as `h1` with the status as an outlined label and the Admin / Read only labels, the display name as
 * subtitle and the shared Actions menu ({@link UserActionsDropdown}, whose first item opens the bulk grant wizard) on
 * the right. The Cluster access tab's toolbar holds the one create button, so the heading has no second one.
 */
export function UserDetailHeader({ username, user, isLoading }: UserDetailHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={BREADCRUMBS}
      title={username}
      status={
        isLoading ? (
          <Skeleton width="10rem" screenreaderText="Loading user details" />
        ) : (
          user && <UserStatusLabel status={user.status} asLabel />
        )
      }
      labels={user && <UserHeaderLabels user={user} />}
      subtitle={user?.displayName}
      actions={user && <UserActionsDropdown user={user} />}
    />
  );
}
