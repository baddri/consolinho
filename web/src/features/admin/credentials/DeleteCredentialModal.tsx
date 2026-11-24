import {
  Alert,
  Button,
  Content,
  Label,
  List,
  ListItem,
  ModalBody,
  ModalFooter,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import type { AccessMode, Credential } from '@/shared/api';
import { errorMessage } from '@/shared/api';
import { ConfirmModal, EnvironmentLabel, ErrorState, useToast } from '@/shared/ui';
import { useClusterGrants } from '../grants/api';
import { isCredentialGone, isCredentialInUse, useDeleteCredential } from './api';
import { affectedUsersText } from './credentialText';
import { CredentialModalFrame, type CredentialCluster } from './CredentialModalFrame';
import { useCredentialGoneToast } from './useCredentialGoneToast';
import { PRODUCT_NAME } from '@/shared/branding';

/** Display names of the grant access modes. */
const ACCESS_MODE_LABELS: Record<AccessMode, string> = { readOnly: 'Read only', readWrite: 'Read write' };

/** CRED-6 hint shown with the users of an in-use credential. */
export const IN_USE_HINT = 'Re-assign or revoke these grants first.';

/** Props for {@link DeleteCredentialModal}. */
export interface DeleteCredentialModalProps {
  cluster: CredentialCluster;
  credential: Credential;
  onClose: () => void;
}

/**
 * Delete flow of one credential (CRED-6). While grants use it (`grantCount > 0`) there is no delete button: the dialog
 * lists the affected users and their access mode and asks to re-assign or revoke those grants first. An unused one
 * gets a danger "Delete credential?" `ConfirmModal` naming credential and cluster in bold; a 409
 * `Credentials.InUse` (granted meanwhile) switches to the in-use view with the server's detail, a 404 (deleted
 * meanwhile) closes with a warning toast.
 */
export function DeleteCredentialModal({ cluster, credential, onClose }: DeleteCredentialModalProps) {
  const mutation = useDeleteCredential(cluster.name);
  const toast = useToast();
  const notifyGone = useCredentialGoneToast();
  const raceDetail = isCredentialInUse(mutation.error) ? errorMessage(mutation.error) : undefined;

  if (credential.grantCount > 0 || raceDetail !== undefined) {
    return (
      <CredentialModalFrame
        isOpen
        title={`Credential ${credential.name} is in use on ${cluster.name}`}
        cluster={cluster}
        onClose={onClose}
      >
        <ModalBody>
          <Stack hasGutter>
            {raceDetail !== undefined && (
              <StackItem>
                <Alert variant="danger" isInline isPlain title={raceDetail} />
              </StackItem>
            )}
            <StackItem>
              <Content component="p">
                {credential.grantCount > 0
                  ? `${affectedUsersText(credential.grantCount)} ${IN_USE_HINT}`
                  : IN_USE_HINT}
              </Content>
            </StackItem>
            <StackItem>
              <AffectedUsers clusterName={cluster.name} credentialId={credential.id} />
            </StackItem>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </CredentialModalFrame>
    );
  }

  const confirm = () =>
    mutation.mutate(credential.id, {
      onSuccess: () => {
        toast.success(`Credential ${credential.name} deleted from ${cluster.name}`);
        onClose();
      },
      onError: (error) => {
        if (!isCredentialGone(error)) return;
        notifyGone(credential.name, cluster.name);
        onClose();
      },
    });

  return (
    <ConfirmModal
      isOpen
      title="Delete credential?"
      titleLabel={<EnvironmentLabel environment={cluster.environment} isCompact />}
      confirmLabel="Delete"
      variant="danger"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Content component="p">
        Are you sure you want to delete <strong>{credential.name}</strong> from cluster <strong>{cluster.name}</strong>?
        No grants use it. Its token is removed from {PRODUCT_NAME}; this cannot be undone.
      </Content>
    </ConfirmModal>
  );
}

/** The users whose grants on `clusterName` go through `credentialId`, with their access mode (CRED-6). */
function AffectedUsers({ clusterName, credentialId }: { clusterName: string; credentialId: string }) {
  const { data: grants, error, isPending, refetch } = useClusterGrants(clusterName);
  if (isPending) return <Skeleton screenreaderText="Loading affected users" />;
  if (error) return <ErrorState error={error} title="Could not load grants" onRetry={() => void refetch()} />;
  const affected = grants.filter((grant) => grant.credentialId === credentialId);
  return (
    <List aria-label="Affected users">
      {affected.map((grant) => (
        <ListItem key={grant.id}>
          {grant.username}
          {grant.userDisplayName !== null && grant.userDisplayName !== grant.username && (
            <span className="pf-v6-u-text-color-subtle"> ({grant.userDisplayName})</span>
          )}{' '}
          <Label isCompact>{ACCESS_MODE_LABELS[grant.accessMode]}</Label>
        </ListItem>
      ))}
    </List>
  );
}
