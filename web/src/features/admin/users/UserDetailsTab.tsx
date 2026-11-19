import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { Link } from 'react-router';
import type { UserDetail } from '@/shared/api';
import { LabelList, RelativeTime } from '@/shared/ui';
import { READ_ONLY_EXPLANATION } from './UserActionDialogs';
import { USER_STATUS_TEXT } from './UserStatusLabel';

/** Placeholder for missing values, as elsewhere in the console. */
const EMPTY = '—';

/** Link target of "View audit entries": the audit log filtered to the user as actor or target (USR-7, AUD-4). */
export const userAuditPath = (username: string) => `/admin/audit?${new URLSearchParams({ user: username })}`;

/**
 * Where a user's role comes from (USR-6, ADR-0017), e.g. "granted by configuration (group fleetconsole-admins)";
 * both sources can apply at once.
 */
function roleSources(user: UserDetail): string[] {
  const sources: string[] = [];
  if (user.isAdminByAssignment) sources.push('assigned by an administrator');
  if (user.isAdminViaConfiguration) {
    const source = user.adminConfigurationSource;
    sources.push(source ? `granted by configuration (${source})` : 'granted by configuration');
  }
  return sources;
}

/** Props for {@link UserDetailsTab}. */
export interface UserDetailsTabProps {
  user: UserDetail;
}

/**
 * Details tab of the user detail page (USR-7): role with its source, status, read-only with the USR-5 explanation,
 * display name, creation, last login, all groups seen at the last login, the grant count and a link to the user's
 * audit entries. Purely presentational; the page loads the `UserDetail`.
 */
export function UserDetailsTab({ user }: UserDetailsTabProps) {
  const sources = roleSources(user);
  return (
    <DescriptionList isHorizontal aria-label="User details">
      <DescriptionListGroup>
        <DescriptionListTerm>Role</DescriptionListTerm>
        <DescriptionListDescription>
          {user.role === 'admin' ? 'Administrator' : 'User'}
          {sources.length > 0 && ` — ${sources.join('; ')}`}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Status</DescriptionListTerm>
        <DescriptionListDescription>{USER_STATUS_TEXT[user.status]}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Read only</DescriptionListTerm>
        <DescriptionListDescription>
          {user.isReadOnly ? 'Yes' : 'No'}
          <HelperText>
            <HelperTextItem>{READ_ONLY_EXPLANATION}</HelperTextItem>
          </HelperText>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Display name</DescriptionListTerm>
        <DescriptionListDescription>{user.displayName ?? EMPTY}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>
          <RelativeTime value={user.createdAt} /> by {user.createdBy}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Last login</DescriptionListTerm>
        <DescriptionListDescription>
          <RelativeTime value={user.lastLoginAt} emptyText="Never" />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Groups last seen</DescriptionListTerm>
        <DescriptionListDescription>
          {user.groups.length > 0 ? (
            <LabelList labels={user.groups} max={user.groups.length} aria-label={`Groups of ${user.username}`} />
          ) : (
            EMPTY
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Cluster grants</DescriptionListTerm>
        <DescriptionListDescription>{user.grantCount}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Audit</DescriptionListTerm>
        <DescriptionListDescription>
          <Link to={userAuditPath(user.username)}>View audit entries</Link>
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  );
}
