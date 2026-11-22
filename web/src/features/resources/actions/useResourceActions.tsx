import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { disabledActionProps, type DisabledActionProps } from '@/shared/ui';
import { resourcePath } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import { DeleteResourceModal } from './DeleteResourceModal';
import { useResourceAccess } from './useResourceAccess';

/**
 * One resource action. Assignable to PatternFly's `IAction` as is (row `ActionsColumn`); the details Actions
 * dropdown maps it to `DropdownItem`s. Disabled items stay visible, with a tooltip once the reason is known.
 */
export interface ResourceActionItem extends DisabledActionProps {
  itemKey: 'edit-yaml' | 'delete';
  title: string;
  onClick: () => void;
  isDanger?: boolean;
}

/** Options of {@link useResourceActions}. */
export interface ResourceActionsOptions {
  cluster: string;
  descriptor: ResourceDescriptor;
  /** Namespace of the object; ignored for cluster-scoped kinds. */
  namespace: string | undefined;
  name: string;
  /**
   * Whether the access check names the object. List rows pass `false` so every row of a namespace shares one
   * SelfSubjectAccessReview (ADR-0022 §9); the details page passes `true`.
   */
  reviewByName: boolean;
  /** Runs after a successful delete (the details page returns to the list). */
  onDeleted?: () => void;
}

/** Result of {@link useResourceActions}. */
export interface ResourceActions {
  /** Menu items in display order. */
  items: ResourceActionItem[];
  /** The open delete dialog, or `null`; render it next to the menu. */
  dialog: ReactNode;
}

/**
 * Builds the generic actions of one object (UI-8/9) and owns the dialog they open, so the row kebab and the details
 * Actions menu offer the same items: "Edit YAML" (always enabled — the YAML tab explains read-only itself) and
 * "Delete", gated by {@link useResourceAccess}: aria-disabled without tooltip while checking, with the reason when
 * denied.
 */
export function useResourceActions({
  cluster,
  descriptor,
  namespace,
  name,
  reviewByName,
  onDeleted,
}: ResourceActionsOptions): ResourceActions {
  const { model } = descriptor;
  const navigate = useNavigate();
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const deleteAccess = useResourceAccess(cluster, {
    verb: 'delete',
    model,
    namespace,
    name: reviewByName ? name : undefined,
  });
  const isDeleteBlocked = deleteAccess.isChecking || deleteAccess.disabledReason !== undefined;

  const items: ResourceActionItem[] = [
    {
      itemKey: 'edit-yaml',
      title: 'Edit YAML',
      onClick: () => void navigate(resourcePath(cluster, model, { namespace, name, tab: 'yaml' })),
    },
    {
      itemKey: 'delete',
      title: 'Delete',
      isDanger: true,
      onClick: () => {
        if (!isDeleteBlocked) setDeleteOpen(true);
      },
      // While checking: aria-disabled without a tooltip — there is no reason to give yet.
      ...(deleteAccess.isChecking
        ? { isAriaDisabled: true }
        : disabledActionProps(deleteAccess.disabledReason)),
    },
  ];

  const dialog = isDeleteOpen ? (
    <DeleteResourceModal
      cluster={cluster}
      descriptor={descriptor}
      namespace={namespace}
      name={name}
      onDeleted={onDeleted}
      onClose={() => setDeleteOpen(false)}
    />
  ) : null;
  return { items, dialog };
}
