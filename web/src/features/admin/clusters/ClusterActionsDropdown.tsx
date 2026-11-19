import { Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { useState } from 'react';
import type { ClusterDetail } from '@/shared/api';
import { useClusterActions, type ClusterActionsOptions } from './useClusterActions';

/** Props for {@link ClusterActionsDropdown}. */
export interface ClusterActionsDropdownProps extends ClusterActionsOptions {
  /** The loaded detail; the dialogs confirm with its `version`, so opening them needs no extra fetch. */
  cluster: ClusterDetail;
}

/**
 * The cluster detail page's "Actions" menu (CLU-4/5/6). Items, order and disabled reasons come from
 * `useClusterActions`, the same hook as the list kebab: Edit, Enable or Disable, Delete (aria-disabled while
 * enabled), every item aria-disabled for a read-only admin. "Test connection" joins with T-0038. The confirmation
 * dialog the hook owns is rendered next to the menu.
 */
export function ClusterActionsDropdown({ cluster, onDeleted, onGone }: ClusterActionsDropdownProps) {
  const { items, dialog } = useClusterActions(cluster, { onDeleted, onGone });
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
