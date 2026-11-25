import { MenuToggle } from '@patternfly/react-core';
import { RhUiEllipsisVerticalFillIcon } from '@patternfly/react-icons';
import { ActionsColumn, type CustomActionsToggleProps } from '@patternfly/react-table';
import { useState } from 'react';
import { modelKey, type K8sResource } from '@/shared/k8s';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceActions } from './useResourceActions';

/** Props for {@link ResourceRowActions}. */
export interface ResourceRowActionsProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/**
 * The kebab of a resource list row (UI-8; the list's data view renders the sticky action cell around it): the kind's
 * items, then Edit <Kind> and Delete <Kind>, from `useResourceActions` (keyed by the model: rules of hooks). Access
 * reviews wait until the kebab is hovered, focused or opened (OCP `LazyActionMenu`), so rendering a list sends none;
 * they are namespace-level (no name), so rows of one namespace share a single SelfSubjectAccessReview, which usually
 * resolves between hover and click. After a delete the list's watch removes the row.
 */
export function ResourceRowActions(props: ResourceRowActionsProps) {
  return <RowActions key={modelKey(props.descriptor.model)} {...props} />;
}

function RowActions({ cluster, descriptor, obj }: ResourceRowActionsProps) {
  const [active, setActive] = useState(false);
  const { items, dialog } = useResourceActions({
    cluster,
    descriptor,
    obj,
    reviewByName: false,
    checkAccess: active,
  });
  const activate = () => setActive(true);
  // No kebab without actions (OCP lists read-only kinds like ClusterOperators without one); the cell stays empty.
  if (items.length === 0) return dialog;
  return (
    <>
      <ActionsColumn
        items={items}
        // PF's default toggle (same label, icon and variant), plus the hover/focus hooks that start the reviews.
        actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }: CustomActionsToggleProps) => (
          <MenuToggle
            aria-label="Kebab toggle"
            ref={toggleRef}
            variant="plain"
            icon={<RhUiEllipsisVerticalFillIcon />}
            isExpanded={isOpen}
            isDisabled={isDisabled}
            onClick={(event) => {
              activate();
              onToggle(event);
            }}
            onMouseEnter={activate}
            onFocus={activate}
          />
        )}
      />
      {dialog}
    </>
  );
}
