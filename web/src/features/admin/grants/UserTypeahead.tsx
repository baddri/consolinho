import { Flex, FlexItem } from '@patternfly/react-core';
import type { Control } from 'react-hook-form';
import type { UserListItem } from '@/shared/api';
import { useUsers } from '../users/api';
import { UserStatusLabel } from '../users/UserStatusLabel';
import type { GrantFormValues } from './grantForm.schema';
import { TypeaheadSelectField, type TypeaheadOption } from './TypeaheadSelectField';

/** Props for {@link UserTypeahead}. */
export interface UserTypeaheadProps {
  control: Control<GrantFormValues>;
  /** Users who already hold a grant on the cluster: listed, but disabled with "already has access". */
  granted: ReadonlySet<string>;
  /** Focus the input on mount (the admin just switched the subject kind). */
  isAutoFocus?: boolean;
}

/** Second line of a user option: display name, status and existing access. */
function UserFacts({ user, hasAccess }: { user: UserListItem; hasAccess: boolean }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      {user.displayName !== null && <FlexItem>{user.displayName}</FlexItem>}
      <FlexItem>
        <UserStatusLabel status={user.status} />
      </FlexItem>
      {hasAccess && <FlexItem>already has access</FlexItem>}
    </Flex>
  );
}

/**
 * User picker of "Grant access" on the cluster page (GRANT-2), labelled "Subject name" like OCP's RoleBinding
 * form: every FleetConsole user (pending and deactivated ones may be granted too), existing holders disabled with
 * "already has access". The admin role never implies access (GRANT-6), so admins are offered like anyone else.
 */
export function UserTypeahead({ control, granted, isAutoFocus }: UserTypeaheadProps) {
  const { data, error, isPending } = useUsers();
  const options: TypeaheadOption[] = (data ?? []).map((user) => ({
    value: user.username,
    searchText: user.displayName ?? undefined,
    isDisabled: granted.has(user.username),
    description: <UserFacts user={user} hasAccess={granted.has(user.username)} />,
  }));
  return (
    <TypeaheadSelectField
      control={control}
      label="Subject name"
      placeholder="Search users"
      options={options}
      isLoading={isPending}
      loadError={error ? 'Could not load users' : undefined}
      isAutoFocus={isAutoFocus}
    />
  );
}
