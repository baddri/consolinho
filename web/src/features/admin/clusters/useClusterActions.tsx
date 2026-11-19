import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { disabledActionProps, type DisabledActionProps } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { clusterEditPath, type ClusterTarget } from './clusterTarget';
import { DeleteClusterModal } from './DeleteClusterModal';
import { DisableClusterModal } from './DisableClusterModal';
import { EnableClusterModal } from './EnableClusterModal';

/** CLU-6: why an enabled cluster can't be deleted (same intent as the Api's `Clusters.NotDisabled`). */
export const DELETE_ENABLED_REASON = 'Disable the cluster before deleting it.';

/** The confirmation a cluster action opens. */
export type ClusterActionKind = 'enable' | 'disable' | 'delete';

/**
 * One cluster action. Assignable to PatternFly's `IAction` as is (row `ActionsColumn`); the detail page's Actions
 * dropdown (T-0035) maps it to `DropdownItem`s. Disabled items stay visible with a tooltip (ADR-0014 §6).
 */
export interface ClusterActionItem extends DisabledActionProps {
  itemKey: 'edit' | ClusterActionKind;
  title: string;
  onClick: () => void;
  isDanger?: boolean;
}

/** Result of {@link useClusterActions}. */
export interface ClusterActions {
  /** Menu items in display order. */
  items: ClusterActionItem[];
  /** The open confirmation dialog, or `null`; render it next to the menu. */
  dialog: ReactNode;
}

/**
 * Builds the lifecycle actions of one cluster (CLU-5/6, ADM-2) and owns the dialog they open, so the list kebab and
 * the detail page offer the same items with the same reasons: Edit, Enable or Disable by state, Delete
 * (aria-disabled while enabled). A read-only admin gets every item aria-disabled with the read-only reason; a
 * disabled item's click is a no-op. `onDeleted` runs after a successful delete (the detail page navigates away).
 * "Test connection" is added by T-0038.
 */
export function useClusterActions(cluster: ClusterTarget, onDeleted?: () => void): ClusterActions {
  const { readOnlyReason } = useAdminAccess();
  const navigate = useNavigate();
  const [open, setOpen] = useState<ClusterActionKind | null>(null);

  const item = (
    itemKey: ClusterActionItem['itemKey'],
    title: string,
    action: () => void,
    reason?: string,
    isDanger?: boolean,
  ): ClusterActionItem => {
    const effectiveReason = readOnlyReason ?? reason;
    return {
      itemKey,
      title,
      isDanger,
      onClick: () => {
        if (!effectiveReason) action();
      },
      ...disabledActionProps(effectiveReason),
    };
  };

  const items: ClusterActionItem[] = [
    item('edit', 'Edit', () => void navigate(clusterEditPath(cluster.name))),
    cluster.isEnabled
      ? item('disable', 'Disable', () => setOpen('disable'))
      : item('enable', 'Enable', () => setOpen('enable')),
    item(
      'delete',
      'Delete',
      () => setOpen('delete'),
      cluster.isEnabled ? DELETE_ENABLED_REASON : undefined,
      true,
    ),
  ];

  const close = () => setOpen(null);
  let dialog: ReactNode = null;
  if (open === 'disable') dialog = <DisableClusterModal cluster={cluster} onClose={close} />;
  if (open === 'enable') dialog = <EnableClusterModal cluster={cluster} onClose={close} />;
  if (open === 'delete')
    dialog = <DeleteClusterModal cluster={cluster} onClose={close} onDeleted={onDeleted} />;
  return { items, dialog };
}
