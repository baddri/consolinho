import { Content } from '@patternfly/react-core';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ApiError, UserDetail, UserListItem } from '@/shared/api';
import { ConfirmModal, useToast } from '@/shared/ui';
import { adminSourceReason } from './adminSource';
import {
  useChangeUserRole,
  useDeactivateUser,
  useReactivateUser,
  useSetUserReadOnly,
} from './api';

/** A user as either representation carries it; both have `version` (contract §7.1). */
export type UserActionTarget = UserListItem | UserDetail;

/** The confirmation a user action opens; see {@link UserActionDialog}. */
export type UserActionKind = 'promote' | 'demote' | 'setReadOnly' | 'removeReadOnly' | 'deactivate' | 'reactivate';

/** USR-5 explanation shown when setting or removing the read-only flag. */
export const READ_ONLY_EXPLANATION =
  "Read-only users can't change anything on any cluster or in Fleet administration.";

/** Props for {@link UserActionDialog}. */
export interface UserActionDialogProps {
  kind: UserActionKind;
  user: UserActionTarget;
  onClose: () => void;
}

/**
 * The confirmation of one user transition (USR-3/4/5, ADR-0017). Mount it only while the action is chosen: each kind
 * owns its mutation, sends the `version` of the `user` it was given and, on success, toasts and closes. Failures
 * (`Users.LastAdmin`, `Users.SelfChange`, `Users.AdminViaConfiguration`, `Concurrency.Conflict`, 403 …) stay in the
 * dialog with the server's `detail`; a conflict refetches the user, so a second "Confirm" uses the fresh version.
 */
export function UserActionDialog({ kind, user, onClose }: UserActionDialogProps) {
  switch (kind) {
    case 'promote':
    case 'demote':
      return <RoleDialog user={user} role={kind === 'promote' ? 'admin' : 'user'} onClose={onClose} />;
    case 'setReadOnly':
    case 'removeReadOnly':
      return <ReadOnlyDialog user={user} isReadOnly={kind === 'setReadOnly'} onClose={onClose} />;
    case 'deactivate':
      return <DeactivateDialog user={user} onClose={onClose} />;
    case 'reactivate':
      return <ReactivateDialog user={user} onClose={onClose} />;
  }
}

interface TransitionDialogProps<TVariables> {
  mutation: UseMutationResult<UserDetail, ApiError, TVariables>;
  variables: TVariables;
  title: string;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  /** Toast title after success, built from the returned user. */
  successTitle: (user: UserDetail) => string;
  onClose: () => void;
  children: ReactNode;
}

/** `ConfirmModal` wired to a user mutation: runs it on confirm, shows its error inline, toasts and closes on success. */
function TransitionDialog<TVariables>({
  mutation,
  variables,
  title,
  confirmLabel,
  variant,
  successTitle,
  onClose,
  children,
}: TransitionDialogProps<TVariables>) {
  const toast = useToast();
  const confirm = () =>
    mutation.mutate(variables, {
      onSuccess: (user) => {
        toast.success(successTitle(user));
        onClose();
      },
    });
  return (
    <ConfirmModal
      isOpen
      title={title}
      confirmLabel={confirmLabel}
      variant={variant}
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={confirm}
      onClose={onClose}
    >
      {children}
    </ConfirmModal>
  );
}

/** Promote (records the assignment, also for configuration admins — ADR-0017) or demote. */
function RoleDialog({ user, role, onClose }: { user: UserActionTarget; role: 'admin' | 'user'; onClose: () => void }) {
  const mutation = useChangeUserRole();
  const { username } = user;
  const isPromote = role === 'admin';
  let body: string;
  if (!isPromote) {
    body = `${username} will lose access to Fleet administration. Their cluster grants are kept.`;
  } else if (user.isAdminViaConfiguration) {
    body =
      `${username} is already an administrator ${adminSourceReason(user.adminConfigurationSource)}. Promoting ` +
      'records the role, so it is kept if the deployment settings change.';
  } else {
    body = `${username} will be able to manage users, clusters, credentials and grants in Fleet administration.`;
  }
  return (
    <TransitionDialog
      mutation={mutation}
      variables={{ username, role, version: user.version }}
      title={isPromote ? `Promote ${username} to administrator?` : `Demote ${username} to user?`}
      confirmLabel={isPromote ? 'Promote' : 'Demote'}
      variant={isPromote ? 'primary' : 'danger'}
      successTitle={(u) =>
        isPromote ? `${u.username} is now an administrator` : `${u.username} is no longer an administrator`
      }
      onClose={onClose}
    >
      <Content component="p">{body}</Content>
    </TransitionDialog>
  );
}

/** Sets or removes the global read-only flag, with the USR-5 explanation. */
function ReadOnlyDialog({
  user,
  isReadOnly,
  onClose,
}: {
  user: UserActionTarget;
  isReadOnly: boolean;
  onClose: () => void;
}) {
  const mutation = useSetUserReadOnly();
  const { username } = user;
  return (
    <TransitionDialog
      mutation={mutation}
      variables={{ username, isReadOnly, version: user.version }}
      title={isReadOnly ? `Make ${username} read-only?` : `Remove read-only from ${username}?`}
      confirmLabel={isReadOnly ? 'Set read-only' : 'Remove read-only'}
      successTitle={(u) => (isReadOnly ? `${u.username} is now read-only` : `${u.username} is no longer read-only`)}
      onClose={onClose}
    >
      <Content component="p">{READ_ONLY_EXPLANATION}</Content>
    </TransitionDialog>
  );
}

/** Deactivation (USR-4): names the user and how many cluster grants stop applying. */
function DeactivateDialog({ user, onClose }: { user: UserActionTarget; onClose: () => void }) {
  const mutation = useDeactivateUser();
  const { username, grantCount } = user;
  return (
    <TransitionDialog
      mutation={mutation}
      variables={{ username, version: user.version }}
      title={`Deactivate ${username}?`}
      confirmLabel="Deactivate"
      variant="danger"
      successTitle={(u) => `${u.username} deactivated`}
      onClose={onClose}
    >
      <Content component="p">
        {`Deactivate ${username}? They will be logged out within a minute and lose access to all ${grantCount} ` +
          `${grantCount === 1 ? 'cluster' : 'clusters'}. Their grants are kept and return if reactivated.`}
      </Content>
    </TransitionDialog>
  );
}

/** Reactivation (USR-4): the kept grants apply again. */
function ReactivateDialog({ user, onClose }: { user: UserActionTarget; onClose: () => void }) {
  const mutation = useReactivateUser();
  const { username } = user;
  return (
    <TransitionDialog
      mutation={mutation}
      variables={{ username, version: user.version }}
      title={`Reactivate ${username}?`}
      confirmLabel="Reactivate"
      successTitle={(u) => `${u.username} reactivated`}
      onClose={onClose}
    >
      <Content component="p">{`${username} can log in again and their kept grants apply again.`}</Content>
    </TransitionDialog>
  );
}
