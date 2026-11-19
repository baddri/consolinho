import type { UserListItem, UserRole, UserStatus } from '@/shared/api';
import { matchesText, type FilterDefs, type FilterOption, type FilterValues } from '@/shared/table';
import { USER_STATUS_TEXT } from './UserStatusLabel';

const ROLES: readonly UserRole[] = ['admin', 'user'];
const STATUSES: readonly UserStatus[] = ['active', 'pending', 'deactivated'];

/**
 * URL filters of `/admin/users` (FRONTEND.md "Routing": `?q=&role=&status=&readOnly=`): `q` searches username,
 * display name and groups; `role`/`status` are multi-selects; `readOnly` is `yes` or `no`.
 */
export const USER_FILTERS = {
  q: { kind: 'text' },
  role: { kind: 'multi', values: ROLES },
  status: { kind: 'multi', values: STATUSES },
  readOnly: { kind: 'single', values: ['yes', 'no'] },
} as const satisfies FilterDefs;

/** Current values of {@link USER_FILTERS}. */
export type UserFilterValues = FilterValues<typeof USER_FILTERS>;

/** Options of the role filter. */
export const ROLE_OPTIONS: FilterOption[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

/** Options of the status filter, labelled like `UserStatusLabel`. */
export const STATUS_OPTIONS: FilterOption[] = STATUSES.map((status) => ({
  value: status,
  label: USER_STATUS_TEXT[status],
}));

/** Options of the read-only filter (shown under the category "Read only", e.g. "Read only: Yes"). */
export const READ_ONLY_OPTIONS: FilterOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** True when `user` passes every applied filter (an empty multi filter or missing value means "any"). */
export function matchesUserFilters(user: UserListItem, filters: UserFilterValues): boolean {
  return (
    matchesText(filters.q ?? '', user.username, user.displayName, ...user.groups) &&
    (filters.role.length === 0 || filters.role.includes(user.role)) &&
    (filters.status.length === 0 || filters.status.includes(user.status)) &&
    (filters.readOnly === undefined || (filters.readOnly === 'yes') === user.isReadOnly)
  );
}
