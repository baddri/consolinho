import { Content } from '@patternfly/react-core';
import { useBeforeUnload, useBlocker } from 'react-router';
import { ConfirmModal } from '@/shared/ui';

/** Props for {@link UnsavedChangesGuard}. */
export interface UnsavedChangesGuardProps {
  /** There are unsaved edits: leaving the page asks first. */
  when: boolean;
  /** Object and cluster, named in the dialog body. */
  name: string;
  cluster: string;
}

/**
 * Asks before unsaved YAML edits are lost (UI-7): in-app navigation to another page (tab switch, cluster switch, a
 * link) is held by React Router's `useBlocker` until the user confirms "Discard unsaved changes?"; reloading or
 * closing the browser tab triggers the browser's own prompt via `useBeforeUnload`.
 */
export function UnsavedChangesGuard({ when, name, cluster }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (when) event.preventDefault();
  });

  return (
    <ConfirmModal
      isOpen={blocker.state === 'blocked'}
      title="Discard unsaved changes?"
      confirmLabel="Discard"
      variant="danger"
      onConfirm={() => blocker.proceed?.()}
      onClose={() => blocker.reset?.()}
    >
      <Content component="p">{`Your edits to ${name} on ${cluster} haven't been saved and will be lost.`}</Content>
    </ConfirmModal>
  );
}
