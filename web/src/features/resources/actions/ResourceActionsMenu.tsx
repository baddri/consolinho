import { Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { resourcePath } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceActions } from './useResourceActions';

/** Props for {@link ResourceActionsMenu}. */
export interface ResourceActionsMenuProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  /** Namespace of a namespaced object; `undefined` for cluster-scoped kinds. */
  namespace: string | undefined;
  name: string;
}

/**
 * The details page's right-aligned "Actions" dropdown (UI-8): the same items and reasons as the list kebab, with an
 * object-level access check. A successful delete returns to the kind's list in the object's namespace.
 */
export function ResourceActionsMenu({ cluster, descriptor, namespace, name }: ResourceActionsMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setOpen] = useState(false);
  const { items, dialog } = useResourceActions({
    cluster,
    descriptor,
    namespace,
    name,
    reviewByName: true,
    onDeleted: () => void navigate(resourcePath(cluster, descriptor.model, { namespace })),
  });

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
          {items.map(({ itemKey, title, onClick, isAriaDisabled, tooltipProps }) => (
            <DropdownItem
              key={itemKey}
              value={itemKey}
              onClick={onClick}
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
