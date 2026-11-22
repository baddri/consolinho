import { Label, LabelGroup, Skeleton } from '@patternfly/react-core';
import type { UserDetail } from '@/shared/api';
import { KindBadge, PageHeading } from '@/shared/ui';
import { ADMIN_KIND_ABBR } from '../AdminResourceLink';
import { UserActionsDropdown } from './UserActionsDropdown';
import { UserStatusLabel } from './UserStatusLabel';
import { fleetAdminPath } from '@/shared/routing';

/** Breadcrumb of every state of the page (`UX.md` §3): `Users › User details`. */
const BREADCRUMBS = [{ label: 'Users', to: fleetAdminPath('users') }, { label: 'User details' }];

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
 * large "U" kind badge and the username as `h1`, the status in a read `Badge`, the Admin / Read only labels and the
 * Actions menu ({@link UserActionsDropdown}) on the right. No subtitle, as OCP: the display name is in the Details
 * tab. Granting access lives only in the Cluster access tab's toolbar ("Grant access").
 */
export function UserDetailHeader({ username, user, isLoading }: UserDetailHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={BREADCRUMBS}
      icon={<KindBadge kind="User" abbr={ADMIN_KIND_ABBR.User} size="lg" />}
      title={username}
      status={
        isLoading ? (
          <Skeleton width="10rem" screenreaderText="Loading user details" />
        ) : (
          user && <UserStatusLabel status={user.status} asLabel />
        )
      }
      labels={user && <UserHeaderLabels user={user} />}
      actions={user && <UserActionsDropdown user={user} />}
    />
  );
}
