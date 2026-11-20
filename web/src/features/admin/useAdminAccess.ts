import { useCurrentUser } from '@/features/auth';

/** What the signed-in user may do in the admin area; see {@link useAdminAccess}. */
export interface AdminAccess {
  /** Whether admin commands (create, edit, delete, grant ...) are allowed. */
  canMutate: boolean;
  /**
   * Why mutating controls are disabled; set exactly when `canMutate` is false. Pass it to `ActionButton`'s
   * `disabledReason` or `disabledActionProps(...)` so the control stays visible with a tooltip (ADR-0014 §6).
   */
  readOnlyReason?: string;
}

/** ADM-2 wording, identical to the Api's 403 `Auth.ReadOnly` detail. */
export const READ_ONLY_REASON = 'Your account is read-only';

/** Shown when the session is not (yet) known to be an admin's; normally unreachable behind `RequireAdmin`. */
export const NOT_ADMIN_REASON = 'Administrator role required';

/**
 * Read-only gating for admin pages (ADM-2, ADR-0014 §6), derived from `GET /api/auth/me` only.
 *
 * Read-only admins (`isReadOnly`) may view everything but every mutating control is disabled with
 * "Your account is read-only". Because `me` can be up to 60 s old, pages must still show the server's 403 `detail`.
 */
export function useAdminAccess(): AdminAccess {
  const { data: me } = useCurrentUser();
  if (me?.role !== 'admin') {
    return { canMutate: false, readOnlyReason: NOT_ADMIN_REASON };
  }
  if (me.isReadOnly) {
    return { canMutate: false, readOnlyReason: READ_ONLY_REASON };
  }
  return { canMutate: true };
}
