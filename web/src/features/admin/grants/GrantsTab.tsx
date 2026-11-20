import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { Grant, UserDetail } from '@/shared/api';
import { ActionButton, ErrorState } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { useClusterGrants, useUserGrants } from './api';
import { GrantFormModal, type GrantCluster, type GrantCreateTarget } from './GrantFormModal';
import type { GrantPerspective } from './GrantRow';
import { GrantsTable } from './GrantsTable';
import { RevokeGrantModal } from './RevokeGrantModal';

/** Which dialog a grants tab shows; grants are referenced by id so the dialog always gets the current version. */
type GrantDialog = { kind: 'create' } | { kind: 'change' | 'revoke'; grantId: string } | null;

/** Props for {@link GrantsTabContent}. */
interface GrantsTabContentProps {
  query: UseQueryResult<Grant[]>;
  target: GrantCreateTarget;
  ariaLabel: string;
  createLabel: string;
  emptyTitle: string;
  emptyBody: string;
}

/**
 * Shared body of both grants tabs: `ErrorState` with Retry when the list can't load, else `GrantsTable` with the
 * create button, and the create / change / revoke dialogs. Read-only admins see every action disabled with the
 * reason (ADM-2). A dialog for a grant that disappears (revoked meanwhile) closes with the list.
 */
function GrantsTabContent({ query, target, ariaLabel, createLabel, emptyTitle, emptyBody }: GrantsTabContentProps) {
  const { readOnlyReason } = useAdminAccess();
  const [dialog, setDialog] = useState<GrantDialog>(null);
  const { data, error, refetch } = query;
  const perspective: GrantPerspective = target.perspective;
  const close = () => setDialog(null);

  const createButton = (
    <ActionButton disabledReason={readOnlyReason} onClick={() => setDialog({ kind: 'create' })}>
      {createLabel}
    </ActionButton>
  );

  if (error && !data) {
    return <ErrorState error={error} title="Could not load grants" onRetry={() => void refetch()} />;
  }

  const selected = dialog !== null && dialog.kind !== 'create' ? data?.find((g) => g.id === dialog.grantId) : undefined;

  return (
    <>
      <GrantsTable
        grants={data}
        perspective={perspective}
        ariaLabel={ariaLabel}
        readOnlyReason={readOnlyReason}
        onChange={(grant) => setDialog({ kind: 'change', grantId: grant.id })}
        onRevoke={(grant) => setDialog({ kind: 'revoke', grantId: grant.id })}
        emptyState={{ title: emptyTitle, body: emptyBody, action: createButton }}
        toolbarActions={createButton}
      />
      {dialog?.kind === 'create' && (
        <GrantFormModal mode="create" target={target} existing={data ?? []} onClose={close} />
      )}
      {dialog?.kind === 'change' && selected && (
        <GrantFormModal
          mode="edit"
          perspective={perspective}
          grant={selected}
          onReload={async () => (await refetch()).data?.find((g) => g.id === selected.id)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'revoke' && selected && <RevokeGrantModal grant={selected} onClose={close} />}
    </>
  );
}

/**
 * "Cluster access" tab of the user detail page (USR-7): the clusters `user` can reach, through which credential and
 * in which mode, with "Add access" and per-row Change / Revoke. Admins appear only with grants (GRANT-6).
 */
export function UserGrantsTab({ user }: { user: Pick<UserDetail, 'username'> }) {
  const query = useUserGrants(user.username);
  return (
    <GrantsTabContent
      query={query}
      target={{ perspective: 'user', username: user.username }}
      ariaLabel={`Cluster access of ${user.username}`}
      createLabel="Add access"
      emptyTitle="No cluster access yet"
      emptyBody={`${user.username} can't reach any cluster until you grant access.`}
    />
  );
}

/**
 * "Access" tab of the cluster detail page (CLU-8, US-9): who can touch `cluster`, with a text filter, "Grant access"
 * and per-row Change / Revoke. The admin role never implies access (GRANT-6), so admins appear only with grants.
 */
export function ClusterGrantsTab({ cluster }: { cluster: GrantCluster }) {
  const query = useClusterGrants(cluster.name);
  return (
    <GrantsTabContent
      query={query}
      target={{ perspective: 'cluster', cluster: { name: cluster.name, environment: cluster.environment } }}
      ariaLabel={`Access to ${cluster.name}`}
      createLabel="Grant access"
      emptyTitle="Nobody has access to this cluster"
      emptyBody={`Grant users access to ${cluster.name}; administrators need a grant too.`}
    />
  );
}
