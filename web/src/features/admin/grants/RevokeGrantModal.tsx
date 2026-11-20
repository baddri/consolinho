import { Content } from '@patternfly/react-core';
import type { Grant } from '@/shared/api';
import { ConfirmModal, EnvironmentLabel, useToast } from '@/shared/ui';
import { isGrantGone, useRevokeGrant } from './api';
import { alreadyRevokedText, ENVIRONMENT_TEXT, revokedText } from './grantText';

/** Props for {@link RevokeGrantModal}. */
export interface RevokeGrantModalProps {
  grant: Grant;
  onClose: () => void;
}

/**
 * Danger confirmation of revoking one grant (GRANT-3): the title names user, cluster and environment ("Revoke
 * alice's access to prod-eu-1 (production)?") with the environment label. On 204 the row leaves both grant lists, the
 * switcher refreshes and a toast confirms; a 404 (revoked meanwhile) closes with a
 * warning toast, other failures show inline.
 */
export function RevokeGrantModal({ grant, onClose }: RevokeGrantModalProps) {
  const revoke = useRevokeGrant();
  const toast = useToast();
  return (
    <ConfirmModal
      isOpen
      variant="danger"
      title={`Revoke ${grant.username}'s access to ${grant.clusterName} (${ENVIRONMENT_TEXT[grant.clusterEnvironment]})?`}
      titleLabel={<EnvironmentLabel environment={grant.clusterEnvironment} isCompact />}
      confirmLabel="Revoke"
      isPending={revoke.isPending}
      // A 404 means "already revoked": it closes with a warning toast instead of showing inline.
      error={isGrantGone(revoke.error) ? null : revoke.error}
      onConfirm={() =>
        revoke.mutate(grant, {
          onSuccess: () => {
            toast.success(revokedText(grant));
            onClose();
          },
          onError: (error) => {
            if (!isGrantGone(error)) return;
            toast.warning(alreadyRevokedText(grant), 'Another administrator revoked it.');
            onClose();
          },
        })
      }
      onClose={onClose}
    >
      <Content component="p">
        {`${grant.username} will no longer see ${grant.clusterName} in the cluster switcher, and requests through it stop immediately.`}
      </Content>
    </ConfirmModal>
  );
}
