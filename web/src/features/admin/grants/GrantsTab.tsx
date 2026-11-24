import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { Grant, UserDetail } from '@/shared/api';
import { ActionButton, ErrorState } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { useClusterGrants, useUserGrants } from './api';
import { GrantFormModal, type GrantCluster } from './GrantFormModal';
import type { GrantPerspective } from './GrantRow';
import { GrantsTable } from './GrantsTable';
import { RevokeGrantModal } from './RevokeGrantModal';

/** Which row dialog a grants tab shows; grants are referenced by id so the dialog always gets the current version. */
type GrantDialog = { kind: 'change' | 'revoke'; grantId: string } | null;

/** Props for {@link GrantsTabContent}. */
interface GrantsTabContentProps {
  query: UseQueryResult<Grant[]>;
  /** Which side the rows name: clusters on the user page, users and groups on the cluster page. */
  perspective: GrantPerspective;
  ariaLabel: string;
  createLabel: string;
  emptyTitle: string;
  emptyBody: string;
  /** The create button's action: the bulk grant wizard (user tab) or the single-grant dialog (cluster tab). */
  onCreate: () => void;
}

/**
 * Shared body of both grants tabs: `ErrorState` with Retry when the list can't load, else `GrantsTable` with the
 * create button (`onCreate`) and the change / revoke dialogs. Read-only admins see every action disabled with the
 * reason (ADM-2). A dialog for a grant that disappears (revoked meanwhile) closes with the list.
 */
function GrantsTabContent({
  query,
  perspective,
  ariaLabel,
  createLabel,
  emptyTitle,
  emptyBody,
  onCreate,
}: GrantsTabContentProps) {
  const { readOnlyReason } = useAdminAccess();
  const [dialog, setDialog] = useState<GrantDialog>(null);
  const { data, error, refetch } = query;
  const close = () => setDialog(null);

  const createButton = (
    <ActionButton disabledReason={readOnlyReason} onClick={onCreate}>
      {createLabel}
    </ActionButton>
  );

  if (error && !data) {
    return <ErrorState error={error} title="Could not load grants" onRetry={() => void refetch()} />;
  }

  const selected = dialog ? data?.find((g) => g.id === dialog.grantId) : undefined;

  return (
    <>
      <GrantsTable
        grants={data}
        perspective={perspective}
        ariaLabel={ariaLabel}
        readOnlyReason={readOnlyReason}
        onChange={(grant) => setDialog({ kind: 'change', grantId: grant.id })}
        onRevoke={(grant) => setDialog({ kind: 'revoke', grantId: grant.id })}
        emptyState={{
          title: emptyTitle,
          body: emptyBody,
          action: createButton,
        }}
        toolbarActions={createButton}
      />
      {dialog?.kind === 'change' && selected && (
        <GrantFormModal
          mode="edit"
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
 * in which mode, with per-row Edit access / Revoke access. "Grant access" in the toolbar (and the empty state) is
 * the page's one grant entry point (T-0118 #9): it calls `onGrantAccess`, which opens the bulk grant wizard for
 * 1..n clusters (GRANT-4). Admins appear only with grants (GRANT-6).
 */
export function UserGrantsTab({
  user,
  onGrantAccess,
}: {
  user: Pick<UserDetail, 'username'>;
  onGrantAccess: () => void;
}) {
  const query = useUserGrants(user.username);
  return (
    <GrantsTabContent
      query={query}
      perspective="user"
      ariaLabel={`Cluster access of ${user.username}`}
      createLabel="Grant access"
      emptyTitle="No cluster access yet"
      emptyBody={`${user.username} can't reach any cluster until you grant access.`}
      onCreate={onGrantAccess}
    />
  );
}

/**
 * "Access" tab of the cluster detail page (CLU-8, US-9, UIG-4): which users and groups can touch `cluster`, with a
 * text and a subject-kind filter, "Grant access" (the single-grant dialog) and per-row Edit access / Revoke
 * access. The admin role never implies access (GRANT-6), so admins appear only with grants.
 */
export function ClusterGrantsTab({ cluster }: { cluster: GrantCluster }) {
  const query = useClusterGrants(cluster.name);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <GrantsTabContent
        query={query}
        perspective="cluster"
        ariaLabel={`Access to ${cluster.name}`}
        createLabel="Grant access"
        emptyTitle="Nobody has access to this cluster"
        emptyBody={`Grant users or groups access to ${cluster.name}; administrators need a grant too.`}
        onCreate={() => setCreating(true)}
      />
      {creating && (
        <GrantFormModal
          mode="create"
          cluster={{ name: cluster.name, environment: cluster.environment }}
          existing={query.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
