import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { currentUserQueryKey } from '@/features/auth';
import {
  apiClient,
  isApiError,
  unwrap,
  type ChangeUserRoleRequest,
  type CreateUserRequest,
  type SetUserReadOnlyRequest,
  type UserDetail,
  type UserListItem,
  type VersionRequest,
} from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/users` (USR-1): every FleetConsole user, sorted by username by the server. Admin-only;
 * read-only admins may call it too (ADM-2). Failures are `ApiError`s; a 401 is handled by the QueryClient.
 */
export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: ({ signal }): Promise<UserListItem[]> => unwrap(apiClient.GET('/api/admin/users', { signal })),
  });
}

/** Loads `GET /api/admin/users/{username}` (USR-7): the user detail page's representation, incl. its `version`. */
export function useUser(username: string) {
  return useQuery({
    queryKey: adminKeys.user(username),
    queryFn: ({ signal }): Promise<UserDetail> =>
      unwrap(apiClient.GET('/api/admin/users/{username}', { params: { path: { username } }, signal })),
  });
}

/** Variables of a role change; `version` comes from the row or detail the dialog was opened from (ADM-4). */
export type ChangeUserRoleVariables = ChangeUserRoleRequest & { username: string };
/** Variables of a read-only change. */
export type SetUserReadOnlyVariables = SetUserReadOnlyRequest & { username: string };
/** Variables of deactivate / reactivate. */
export type UserTransitionVariables = VersionRequest & { username: string };

/**
 * Refreshes what a failed user command proved stale: a 409 (version conflict, last admin, …) means the user changed,
 * so every users query is refetched and a retried "Confirm" sends the fresh `version`; a 403 `Auth.ReadOnly` /
 * `Auth.Forbidden` means our `me` is outdated (ADR-0014 §6), so the session is refetched and the controls disable.
 */
function invalidateAfterError(queryClient: QueryClient, error: unknown): void {
  if (!isApiError(error)) return;
  if (error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: adminKeys.users() });
  }
  if (error.status === 403 && (error.code === 'Auth.ReadOnly' || error.code === 'Auth.Forbidden')) {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }
}

/**
 * Shared mutation wiring of every user command (ADR-0015 §6): on success the returned `UserDetail` is written to
 * `adminKeys.user(username)` and the whole admin prefix is invalidated (list, grant counts, audit); on failure see
 * {@link invalidateAfterError}. The `apiClient` middleware adds the CSRF header to every non-GET request.
 */
function useUserCommand<TVariables>(command: (variables: TVariables) => Promise<UserDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: (user) => {
      queryClient.setQueryData(adminKeys.user(user.username), user);
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}

/** `POST /api/admin/users` (USR-2): pre-creates a user; 409 `Users.UsernameTaken` when the name exists. */
export function useCreateUser() {
  return useUserCommand((body: CreateUserRequest) => unwrap(apiClient.POST('/api/admin/users', { body })));
}

/** `PUT /api/admin/users/{username}/role` (USR-3, ADR-0017): promote or demote. */
export function useChangeUserRole() {
  return useUserCommand(({ username, ...body }: ChangeUserRoleVariables) =>
    unwrap(apiClient.PUT('/api/admin/users/{username}/role', { params: { path: { username } }, body })),
  );
}

/** `PUT /api/admin/users/{username}/read-only` (USR-5). */
export function useSetUserReadOnly() {
  return useUserCommand(({ username, ...body }: SetUserReadOnlyVariables) =>
    unwrap(apiClient.PUT('/api/admin/users/{username}/read-only', { params: { path: { username } }, body })),
  );
}

/** `POST /api/admin/users/{username}/deactivate` (USR-4). */
export function useDeactivateUser() {
  return useUserCommand(({ username, ...body }: UserTransitionVariables) =>
    unwrap(apiClient.POST('/api/admin/users/{username}/deactivate', { params: { path: { username } }, body })),
  );
}

/** `POST /api/admin/users/{username}/reactivate` (USR-4). */
export function useReactivateUser() {
  return useUserCommand(({ username, ...body }: UserTransitionVariables) =>
    unwrap(apiClient.POST('/api/admin/users/{username}/reactivate', { params: { path: { username } }, body })),
  );
}
