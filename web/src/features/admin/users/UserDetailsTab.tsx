import { HelperText, HelperTextItem } from '@patternfly/react-core';
import { Link } from 'react-router';
import type { UserDetail } from '@/shared/api';
import { DASH, DetailsColumn, DetailsGrid, DetailsItem, LabelList, RelativeTime, SectionHeading } from '@/shared/ui';
import { adminSourceText } from './adminSource';
import { READ_ONLY_EXPLANATION } from './UserActionDialogs';
import { UserStatusLabel } from './UserStatusLabel';
import { fleetAdminPath } from '@/shared/routing';


/** Link target of "View audit entries": the audit log filtered to the user as actor or target (USR-7, AUD-4). */
export const userAuditPath = (username: string) => fleetAdminPath(`audit?${new URLSearchParams({ user: username })}`);

/**
 * Where a user's role comes from (USR-6, ADR-0017), in user language (`adminSourceText`); both sources can apply.
 */
function roleSources(user: UserDetail): string[] {
  const sources: string[] = [];
  if (user.isAdminByAssignment) sources.push('Assigned by an administrator');
  if (user.isAdminViaConfiguration) sources.push(adminSourceText(user.adminConfigurationSource));
  return sources;
}

/** A value with explanatory lines under it, e.g. the role with its sources. */
function WithHelp({ value, help }: { value: string; help: string[] }) {
  return (
    <>
      {value}
      {help.length > 0 && (
        <HelperText>
          {help.map((text) => (
            <HelperTextItem key={text}>{text}</HelperTextItem>
          ))}
        </HelperText>
      )}
    </>
  );
}

/** Props for {@link UserDetailsTab}. */
export interface UserDetailsTabProps {
  user: UserDetail;
}

/**
 * Details tab of the user detail page (USR-7, `UX.md` §6): "User details" h2 over two vertical columns — who the
 * user is (username, display name, role with its source, status, read-only with the USR-5 explanation) left, and
 * activity (created, last login, groups seen at the last login, grant count, audit link) right. Purely
 * presentational; the page loads the `UserDetail`.
 */
export function UserDetailsTab({ user }: UserDetailsTabProps) {
  return (
    <>
      <SectionHeading text="User details" />
      <DetailsGrid>
        <DetailsColumn aria-label="User details">
          <DetailsItem label="Username">{user.username}</DetailsItem>
          <DetailsItem label="Display name">{user.displayName ?? DASH}</DetailsItem>
          <DetailsItem label="Role">
            <WithHelp value={user.role === 'admin' ? 'Administrator' : 'User'} help={roleSources(user)} />
          </DetailsItem>
          <DetailsItem label="Status">
            <UserStatusLabel status={user.status} />
          </DetailsItem>
          <DetailsItem label="Read only">
            <WithHelp value={user.isReadOnly ? 'Yes' : 'No'} help={[READ_ONLY_EXPLANATION]} />
          </DetailsItem>
        </DetailsColumn>
        <DetailsColumn aria-label="User activity">
          <DetailsItem label="Created">
            <RelativeTime value={user.createdAt} /> by {user.createdBy}
          </DetailsItem>
          <DetailsItem label="Last login">
            <RelativeTime value={user.lastLoginAt} emptyText="Never" />
          </DetailsItem>
          <DetailsItem label="Groups last seen">
            {user.groups.length > 0 ? (
              <LabelList labels={user.groups} max={user.groups.length} aria-label={`Groups of ${user.username}`} />
            ) : (
              DASH
            )}
          </DetailsItem>
          <DetailsItem label="Cluster grants">{user.grantCount}</DetailsItem>
          <DetailsItem label="Audit">
            <Link to={userAuditPath(user.username)}>View audit entries</Link>
          </DetailsItem>
        </DetailsColumn>
      </DetailsGrid>
    </>
  );
}
