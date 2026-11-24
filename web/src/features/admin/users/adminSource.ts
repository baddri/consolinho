import type { AdminConfigurationSource } from '@/shared/api';

/**
 * Why a configuration admin is an admin, as a phrase that completes "… is an administrator" (POL-4): "through group
 * <g>" for an admin group, "set in the deployment settings" for the bootstrap user list or `null` — the backend's
 * kinds are never shown verbatim (`UX.md` §11). Used by the Promote dialog.
 */
export function adminSourceReason(source: AdminConfigurationSource | null): string {
  switch (source?.kind) {
    case 'group':
      // The backend guarantees `group` for this kind; a missing name still reads as a settings-based admin.
      return source.group ? `through group ${source.group}` : 'set in the deployment settings';
    case 'userList':
    case undefined:
      return 'set in the deployment settings';
  }
}

/**
 * User-language text for where a configuration admin's role comes from (USR-6): "Admin through group <g>" or
 * "Admin set in the deployment settings" ({@link adminSourceReason}); `null` (not a configuration admin) gives plain
 * "Admin". Used by the user details tab and the Demote disabled reason.
 */
export function adminSourceText(source: AdminConfigurationSource | null): string {
  return source === null ? 'Admin' : `Admin ${adminSourceReason(source)}`;
}
