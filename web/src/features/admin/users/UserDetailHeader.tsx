import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  PageSection,
  Skeleton,
  Title,
} from '@patternfly/react-core';
import { Link } from 'react-router';
import type { UserDetail } from '@/shared/api';
import { ActionButton } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { UserActionsDropdown } from './UserActionsDropdown';
import { UserStatusLabel } from './UserStatusLabel';

/** Header label of a configuration admin (USR-6), e.g. "Admin via configuration (group fleetconsole-admins)". */
export function adminViaConfigurationLabel(source: string | null): string {
  return source ? `Admin via configuration (${source})` : 'Admin via configuration';
}

/** Breadcrumb "Users › name"; the first crumb is a client-side router link. */
function UserBreadcrumb({ username }: { username: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbItem
        render={({ className }) => (
          <Link className={className} to="/admin/users">
            Users
          </Link>
        )}
      />
      <BreadcrumbItem isActive>{username}</BreadcrumbItem>
    </Breadcrumb>
  );
}

/** The header's role and state labels: Admin, configuration admin, Read only, and a non-active status. */
function UserHeaderLabels({ user }: { user: UserDetail }) {
  return (
    <LabelGroup aria-label="User labels" numLabels={4}>
      {user.role === 'admin' && <Label color="blue">Admin</Label>}
      {user.isAdminViaConfiguration && (
        <Label variant="outline">{adminViaConfigurationLabel(user.adminConfigurationSource)}</Label>
      )}
      {user.isReadOnly && <Label color="orange">Read only</Label>}
      {user.status !== 'active' && <UserStatusLabel status={user.status} />}
    </LabelGroup>
  );
}

/** Props for {@link UserDetailHeader}. */
export interface UserDetailHeaderProps {
  /** Username from the route (already decoded); shown in the breadcrumb even while loading or not found. */
  username: string;
  /** The loaded user; without one there are no labels and no actions. */
  user?: UserDetail;
  /** The user is still loading: show a skeleton in place of display name and labels. */
  isLoading: boolean;
  /** Opens the bulk grant wizard ("Grant access to clusters", GRANT-4). */
  onGrantAccess: () => void;
}

/**
 * Header of the user detail page (USR-7): breadcrumb Users › name, the username as `h1`, the display name below,
 * role/state labels, "Grant access to clusters" (aria-disabled for read-only admins) and the shared Actions menu
 * ({@link UserActionsDropdown}). While loading it shows the breadcrumb and
 * title with a skeleton in place of the details; after a failure only breadcrumb and title.
 */
export function UserDetailHeader({ username, user, isLoading, onGrantAccess }: UserDetailHeaderProps) {
  const { readOnlyReason } = useAdminAccess();
  return (
    <PageSection>
      <UserBreadcrumb username={username} />
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsFlexStart' }}>
        <FlexItem>
          <Title headingLevel="h1">{username}</Title>
          {user && (
            <>
              {user.displayName && <Content component="p">{user.displayName}</Content>}
              <UserHeaderLabels user={user} />
            </>
          )}
          {isLoading && <Skeleton width="15rem" screenreaderText="Loading user details" />}
        </FlexItem>
        {user && (
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <ActionButton variant="secondary" disabledReason={readOnlyReason} onClick={onGrantAccess}>
                  Grant access to clusters
                </ActionButton>
              </FlexItem>
              <FlexItem>
                <UserActionsDropdown user={user} />
              </FlexItem>
            </Flex>
          </FlexItem>
        )}
      </Flex>
    </PageSection>
  );
}
