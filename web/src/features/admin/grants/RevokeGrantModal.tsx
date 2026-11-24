import { Content } from '@patternfly/react-core';
import type { Grant } from '@/shared/api';
import { ConfirmModal, EnvironmentLabel, useToast } from '@/shared/ui';
import { isGrantGone, useRevokeGrant } from './api';
import { alreadyRevokedText, revokedText } from './grantText';

/** Props for {@link RevokeGrantModal}. */
export interface RevokeGrantModalProps {
  grant: Grant;
  onClose: () => void;
}

/** Confirmation body naming subject and cluster in bold; group grants use the spec §5 copy. */
function RevokeBody({ grant }: { grant: Grant }) {
  if (grant.subjectKind === 'group') {
    return (
      <Content component="p">
        Revoke access of group <strong>{grant.subjectName}</strong> to <strong>{grant.clusterName}</strong>?
        Members lose access within a minute.
      </Content>
    );
  }
  return (
    <Content component="p">
      Are you sure you want to revoke <strong>{grant.subjectName}</strong>&apos;s access to{' '}
      <strong>{grant.clusterName}</strong>?{' '}
      {`${grant.subjectName} will no longer see it in the cluster switcher, and requests through it stop immediately.`}
    </Content>
  );
}

/**
 * Danger confirmation of revoking one grant (GRANT-3, UIG-4) in OCP confirm wording: "Revoke access?" with the
 * environment label; the body names subject and cluster in bold ("…revoke **alice**'s access to **prod-eu-1**?",
 * or "Revoke access of group **sre** to **staging-eu-1**? …" for a group grant). On 204 the row leaves both grant lists, the
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
      title="Revoke access?"
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
      <RevokeBody grant={grant} />
    </ConfirmModal>
  );
}
