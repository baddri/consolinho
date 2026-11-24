import { Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { modelKey, type K8sResource } from '@/shared/k8s';
import { resourcePath } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceActions } from './useResourceActions';

/** Props for {@link ResourceActionsMenu}. */
export interface ResourceActionsMenuProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/**
 * The details page's right-aligned "Actions" dropdown (UI-8): the same items and reasons as the list kebab, with an
 * object-level access check. A successful delete returns to the kind's list in the object's namespace. Keyed by the
 * model, so a kind change remounts the menu and its kind actions hook (rules of hooks).
 */
export function ResourceActionsMenu(props: ResourceActionsMenuProps) {
  return <ActionsMenu key={modelKey(props.descriptor.model)} {...props} />;
}

function ActionsMenu({ cluster, descriptor, obj }: ResourceActionsMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setOpen] = useState(false);
  const namespace = obj.metadata.namespace;
  const { items, dialog } = useResourceActions({
    cluster,
    descriptor,
    obj,
    reviewByName: true,
    onDeleted: () => void navigate(resourcePath(cluster, descriptor.model, { namespace })),
  });

  // OCP `headings.tsx`: no Actions button when the kind has no actions (a read-only kind like ClusterOperator).
  if (items.length === 0) return dialog;
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
