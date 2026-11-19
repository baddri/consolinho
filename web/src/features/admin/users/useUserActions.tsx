import { useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/features/auth';
import { disabledActionProps, type DisabledActionProps } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { UserActionDialog, type UserActionKind, type UserActionTarget } from './UserActionDialogs';
import { adminViaConfigurationText } from './UserRoleLabels';

/** ADM-5: why an admin can't demote or deactivate their own account (same wording as the Api's `Users.SelfChange`). */
export const SELF_CHANGE_REASON = "You can't demote or deactivate yourself.";

/**
 * One user action. Assignable to PatternFly's `IAction` as is (row `ActionsColumn`); the detail page's Actions
 * dropdown (T-0032) maps it to `DropdownItem`s. Disabled items stay visible with a tooltip (ADR-0014 §6).
 */
export interface UserActionItem extends DisabledActionProps {
  itemKey: UserActionKind;
  title: string;
  onClick: () => void;
  isDanger?: boolean;
}

/** Result of {@link useUserActions}. */
export interface UserActions {
  /** Menu items in display order. */
  items: UserActionItem[];
  /** The open confirmation dialog, or `null`; render it next to the menu. */
  dialog: ReactNode;
}

/**
 * Builds the actions of one user (USR-3/4/5/6, ADM-2/5, ADR-0017) and owns the confirmation dialog they open, so the
 * list kebab and the detail page offer exactly the same items with the same reasons:
 * - Promote when the role is not assigned (also for configuration admins); Demote for every admin, disabled with the
 *   USR-6 text for configuration admins; read-only toggle; Deactivate / Reactivate by status.
 * - Disabled reasons, first match wins: the signed-in admin is read-only (every item), then configuration admin
 *   (Demote), then self (Demote, Deactivate). A disabled item's click is a no-op, so no request is ever sent.
 *
 * Dialogs send `user.version`; pass the freshest representation (list row or loaded detail). "Grant access to
 * clusters" is added by T-0040.
 */
export function useUserActions(user: UserActionTarget): UserActions {
  const { readOnlyReason } = useAdminAccess();
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState<UserActionKind | null>(null);
  const isSelf = me?.username === user.username;

  const item = (itemKey: UserActionKind, title: string, reason?: string, isDanger?: boolean): UserActionItem => {
    const effectiveReason = readOnlyReason ?? reason;
    return {
      itemKey,
      title,
      isDanger,
      onClick: () => {
        if (!effectiveReason) setOpen(itemKey);
      },
      ...disabledActionProps(effectiveReason),
    };
  };

  const items: UserActionItem[] = [];
  if (!user.isAdminByAssignment) {
    items.push(item('promote', 'Promote to administrator'));
  }
  if (user.role === 'admin') {
    const demoteReason = user.isAdminViaConfiguration
      ? `${adminViaConfigurationText(user.adminConfigurationSource)}. Change the configuration to remove.`
      : isSelf
        ? SELF_CHANGE_REASON
        : undefined;
    items.push(item('demote', 'Demote to user', demoteReason));
  }
  items.push(
    user.isReadOnly ? item('removeReadOnly', 'Remove read-only') : item('setReadOnly', 'Set read-only'),
  );
  items.push(
    user.status === 'deactivated'
      ? item('reactivate', 'Reactivate')
      : item('deactivate', 'Deactivate', isSelf ? SELF_CHANGE_REASON : undefined, true),
  );

  const dialog = open === null ? null : <UserActionDialog kind={open} user={user} onClose={() => setOpen(null)} />;
  return { items, dialog };
}
