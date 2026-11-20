import { Modal, ModalHeader } from '@patternfly/react-core';
import { useId, type ReactNode } from 'react';
import type { ClusterDetail } from '@/shared/api';
import { EnvironmentLabel } from '@/shared/ui';

/**
 * The cluster a credential dialog acts on: its name for titles, the environment label (prod safety signal) and
 * `isEnabled`, so the connection test opened from a credential row can note that the cluster is disabled.
 */
export type CredentialCluster = Pick<ClusterDetail, 'name' | 'environment' | 'isEnabled'>;

/** Props for {@link CredentialModalFrame}. */
export interface CredentialModalFrameProps {
  isOpen: boolean;
  title: string;
  cluster: CredentialCluster;
  onClose: () => void;
  /** Body and footer; mounted only while open, so form state (and any typed token) is dropped on close. */
  children: ReactNode;
  variant?: 'small' | 'medium';
}

/**
 * Small modal shell of the credential dialogs: header with the title and the cluster's environment label in PF's
 * `help` slot (as in `ConfirmModal`, so a long title truncates without hiding the label), both part of the
 * accessible name. Children mount only while open (CRED-2: closing discards the token).
 */
export function CredentialModalFrame({
  isOpen,
  title,
  cluster,
  onClose,
  children,
  variant = 'small',
}: CredentialModalFrameProps) {
  const titleId = useId();
  const labelId = useId();
  return (
    <Modal variant={variant} isOpen={isOpen} onClose={onClose} aria-labelledby={`${titleId} ${labelId}`}>
      {isOpen && (
        <>
          <ModalHeader
            title={title}
            labelId={titleId}
            help={
              <span id={labelId}>
                <EnvironmentLabel environment={cluster.environment} isCompact />
              </span>
            }
          />
          {children}
        </>
      )}
    </Modal>
  );
}
