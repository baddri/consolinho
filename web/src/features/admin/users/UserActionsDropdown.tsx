import { Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { useState } from 'react';
import type { UserDetail } from '@/shared/api';
import { useUserActions } from './useUserActions';

/** Props for {@link UserActionsDropdown}. */
export interface UserActionsDropdownProps {
  /** The loaded detail; its `version` is what the confirmation dialogs send. */
  user: UserDetail;
}

/**
 * The user detail page's "Actions" menu (USR-3/4/5/6). Items, order and disabled reasons come from
 * `useUserActions`, the same hook as the list kebab, minus "Grant access to clusters": on this page granting lives in
 * the Cluster access tab's toolbar only (T-0118 #9). Disabled items stay visible, aria-disabled with a tooltip. The
 * confirmation dialog the hook owns is rendered next to the menu.
 */
export function UserActionsDropdown({ user }: UserActionsDropdownProps) {
  const { items, dialog } = useUserActions(user, { withGrant: false });
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setOpen}
        onSelect={() => setOpen(false)}
        popperProps={{ position: 'right' }}
        toggle={(ref) => (
          <MenuToggle ref={ref} isExpanded={isOpen} onClick={() => setOpen((open) => !open)}>
            Actions
          </MenuToggle>
        )}
      >
        <DropdownList>
          {items.map(({ itemKey, title, onClick, isDanger, isAriaDisabled, tooltipProps }) => (
            <DropdownItem
              key={itemKey}
              value={itemKey}
              onClick={onClick}
              isDanger={isDanger}
              isAriaDisabled={isAriaDisabled}
              tooltipProps={tooltipProps}
            >
              {title}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
      {dialog}
    </>
  );
}
