import { Tooltip } from '@patternfly/react-core';
import type { UserStatus } from '@/shared/api';
import { StatusIconText, type StatusKind } from '@/shared/ui';

/** Display text per status, shared by the status label and the users list's status filter. */
export const USER_STATUS_TEXT: Record<UserStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  deactivated: 'Deactivated',
};

const STATUS_KINDS: Record<UserStatus, StatusKind> = {
  active: 'success',
  pending: 'pending',
  deactivated: 'ban',
};

/** Props for {@link UserStatusLabel}. */
export interface UserStatusLabelProps {
  status: UserStatus;
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * A user's lifecycle status as icon + text (USR-1, `UX.md` §5): Active (green check), Pending (in-progress icon),
 * Deactivated (ban icon, as OCP's disabled-like states). Pending (pre-created, USR-2) carries a "Pending — never logged in" tooltip; its trigger
 * is focusable then so keyboard users can open it. Used by the users list, grants and the user detail page.
 */
export function UserStatusLabel({ status, asLabel }: UserStatusLabelProps) {
  const content = (
    <StatusIconText status={STATUS_KINDS[status]} text={USER_STATUS_TEXT[status]} asLabel={asLabel} />
  );
  if (status !== 'pending') return content;
  return (
    <Tooltip content="Pending — never logged in">
      {/* PatternFly's tooltip trigger must be focusable for keyboard users; the status text is not by itself. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>{content}</span>
    </Tooltip>
  );
}
