import {
  ClipboardCopy,
  Content,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { TableEmptyRow, TableSkeletonRows } from '@/shared/table';
import { ActionButton, ErrorState } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { AddCredentialModal } from './AddCredentialModal';
import { useClusterCredentials } from './api';
import type { CredentialCluster } from './CredentialModalFrame';
import { CREDENTIAL_COLUMN_COUNT, CredentialRow } from './CredentialRow';

/** Command an admin runs to mint a long-lived ServiceAccount token (shown in the empty state). */
export const CREATE_TOKEN_COMMAND = 'oc create token <service-account> -n <namespace> --duration=8760h';

/**
 * Credentials tab of the cluster detail page (CRED-1..6): a table of the cluster's ServiceAccount credentials —
 * identity, fingerprint, expiry, grants, last test, rotation — with "Add credential" and per-row Rotate / Delete.
 * Loading shows skeleton rows, errors `ErrorState` with Retry, no credentials an empty state with the `oc create
 * token` command. Read-only admins see every action disabled with the reason (ADM-2).
 */
export function ClusterCredentialsTab({ cluster }: { cluster: CredentialCluster }) {
  const { readOnlyReason } = useAdminAccess();
  const { data, error, isPending, refetch } = useClusterCredentials(cluster.name);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const addButton = (
    <ActionButton disabledReason={readOnlyReason} onClick={() => setIsAddOpen(true)}>
      Add credential
    </ActionButton>
  );

  return (
    <>
      <Toolbar aria-label="Credentials toolbar">
        <ToolbarContent>
          <ToolbarItem align={{ default: 'alignEnd' }}>{addButton}</ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      {error && <ErrorState error={error} title="Could not load credentials" onRetry={() => void refetch()} />}
      {!error && (
        <Table aria-label={`Credentials of ${cluster.name}`} variant="compact">
          <Thead>
            <Tr>
              <Th modifier="nowrap">Name</Th>
              <Th modifier="nowrap">Service account</Th>
              <Th modifier="nowrap">Fingerprint</Th>
              <Th modifier="nowrap">Expiry</Th>
              <Th modifier="nowrap">Grants</Th>
              <Th modifier="nowrap">Last test</Th>
              <Th modifier="nowrap">Rotated</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {isPending && <TableSkeletonRows columns={CREDENTIAL_COLUMN_COUNT} rows={3} />}
            {data?.length === 0 && (
              <TableEmptyRow
                colSpan={CREDENTIAL_COLUMN_COUNT}
                title="No credentials"
                body={
                  <Stack hasGutter>
                    <StackItem>
                      <Content component="p">
                        Users can&apos;t be granted access until you add a ServiceAccount token. Create one with:
                      </Content>
                    </StackItem>
                    <StackItem>
                      <ClipboardCopy
                        isReadOnly
                        hoverTip="Copy"
                        clickTip="Copied"
                        copyAriaLabel="Copy oc create token command"
                        textAriaLabel="oc create token command"
                      >
                        {CREATE_TOKEN_COMMAND}
                      </ClipboardCopy>
                    </StackItem>
                  </Stack>
                }
                actions={addButton}
              />
            )}
            {data?.map((credential) => (
              <CredentialRow key={credential.id} cluster={cluster} credential={credential} />
            ))}
          </Tbody>
        </Table>
      )}
      <AddCredentialModal isOpen={isAddOpen} cluster={cluster} onClose={() => setIsAddOpen(false)} />
    </>
  );
}
