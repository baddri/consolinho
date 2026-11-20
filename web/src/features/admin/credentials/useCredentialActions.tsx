import { useState, type ReactNode } from 'react';
import type { Credential } from '@/shared/api';
import { disabledActionProps, type DisabledActionProps } from '@/shared/ui';
import { TestConnectionModal } from '../connection-test/TestConnectionModal';
import { useAdminAccess } from '../useAdminAccess';
import type { CredentialCluster } from './CredentialModalFrame';
import { DeleteCredentialModal } from './DeleteCredentialModal';
import { RotateCredentialModal } from './RotateCredentialModal';

/** The dialog a credential action opens. */
type CredentialActionKind = 'test' | 'rotate' | 'delete';

/** One credential row action; assignable to PatternFly's `IAction` (row `ActionsColumn`). */
export interface CredentialActionItem extends DisabledActionProps {
  title: string;
  onClick: () => void;
  isDanger?: boolean;
}

/** Result of {@link useCredentialActions}. */
export interface CredentialActions {
  /** Menu items in display order. */
  items: CredentialActionItem[];
  /** The open dialog, or `null`; render it next to the menu. */
  dialog: ReactNode;
}

/**
 * Row actions of one credential and the dialog they open: Test (TEST-1, the connection test dialog with this
 * credential pre-selected), Rotate token (CRED-5) and Delete (CRED-6). Tests are commands, so a read-only admin gets
 * all three aria-disabled with the read-only reason (ADM-2); a disabled item's click is a no-op. Delete stays enabled
 * for an in-use credential because its dialog explains who uses it.
 */
export function useCredentialActions(cluster: CredentialCluster, credential: Credential): CredentialActions {
  const { readOnlyReason } = useAdminAccess();
  const [open, setOpen] = useState<CredentialActionKind | null>(null);

  const item = (title: string, kind: CredentialActionKind, isDanger?: boolean): CredentialActionItem => ({
    title,
    isDanger,
    onClick: () => {
      if (!readOnlyReason) setOpen(kind);
    },
    ...disabledActionProps(readOnlyReason),
  });

  const close = () => setOpen(null);
  let dialog: ReactNode = null;
  if (open === 'test')
    dialog = <TestConnectionModal cluster={cluster} initialCredentialId={credential.id} onClose={close} />;
  if (open === 'rotate') dialog = <RotateCredentialModal cluster={cluster} credential={credential} onClose={close} />;
  if (open === 'delete') dialog = <DeleteCredentialModal cluster={cluster} credential={credential} onClose={close} />;
  return { items: [item('Test', 'test'), item('Rotate token', 'rotate'), item('Delete', 'delete', true)], dialog };
}
