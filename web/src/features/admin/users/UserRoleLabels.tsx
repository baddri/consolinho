import { Label } from '@patternfly/react-core';
import type { UserListItem } from '@/shared/api';

/** Props for {@link UserRoleLabels}; a `UserListItem` or `UserDetail` can be passed as is. */
export type UserRoleLabelsProps = Pick<
  UserListItem,
  'role' | 'isAdminViaConfiguration' | 'adminConfigurationSource'
>;

/**
 * A user's role (USR-1): one compact "Admin" category label for admins, the text "User" otherwise (`UX.md` §5).
 * Where a configuration admin's role comes from (USR-6, `adminSourceText`) is shown on the user's details page, not
 * in this label; the props still accept a whole `UserListItem`/`UserDetail`.
 */
export function UserRoleLabels({ role }: UserRoleLabelsProps) {
  if (role !== 'admin') {
    return <>User</>;
  }
  return (
    <Label isCompact color="blue">
      Admin
    </Label>
  );
}
