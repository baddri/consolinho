import { Label, Tooltip, type LabelProps } from '@patternfly/react-core';
import type { UserStatus } from '@/shared/api';

/** Display text per status, shared by the status label and the users list's status filter. */
export const USER_STATUS_TEXT: Record<UserStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  deactivated: 'Deactivated',
};

const STATUS_COLORS: Record<UserStatus, NonNullable<LabelProps['color']>> = {
  active: 'green',
  pending: 'blue',
  deactivated: 'grey',
};

/** Props for {@link UserStatusLabel}. */
export interface UserStatusLabelProps {
  status: UserStatus;
}

/**
 * A user's lifecycle status as a coloured compact label (USR-1): Active green, Pending blue, Deactivated grey.
 * Pending (pre-created, USR-2) carries a "Pending — never logged in" tooltip; the label is focusable then so
 * keyboard users can open it. Used by the users list and the user detail page.
 */
export function UserStatusLabel({ status }: UserStatusLabelProps) {
  const text = USER_STATUS_TEXT[status];
  const color = STATUS_COLORS[status];
  if (status !== 'pending') {
    return (
      <Label isCompact color={color}>
        {text}
      </Label>
    );
  }
  return (
    <Tooltip content="Pending — never logged in">
      {/* PatternFly's tooltip trigger must be focusable for keyboard users; a static label is not by itself. */}
      <Label isCompact color={color} tabIndex={0}>
        {text}
      </Label>
    </Tooltip>
  );
}
