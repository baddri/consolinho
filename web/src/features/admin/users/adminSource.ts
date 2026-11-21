/** Prefix of a group source as the backend reports it (`AdminConfigurationResolver`), e.g. "group fleetconsole-admins". */
const GROUP_PREFIX = 'group ';

/**
 * Why a configuration admin is an admin, as a phrase that completes "… is an administrator": "through group <g>" for
 * `"group <g>"`, otherwise (`"user list"`, `null` or any future source) "set in the deployment settings" — the
 * backend's source strings are never shown verbatim (`UX.md` §11). Used by the Promote dialog.
 */
export function adminSourceReason(source: string | null): string {
  return source?.startsWith(GROUP_PREFIX)
    ? `through group ${source.slice(GROUP_PREFIX.length)}`
    : 'set in the deployment settings';
}

/**
 * User-language text for where a configuration admin's role comes from (USR-6): "Admin through group <g>" or
 * "Admin set in the deployment settings" ({@link adminSourceReason}); `null` (older representation, or not a
 * configuration admin) gives plain "Admin". Used by the user details tab and the Demote disabled reason.
 */
export function adminSourceText(source: string | null): string {
  return source === null ? 'Admin' : `Admin ${adminSourceReason(source)}`;
}
