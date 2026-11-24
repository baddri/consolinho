import { fleetAdminPath } from '@/shared/routing';

/** Path of a group's detail page, `/fleet/admin/groups/<name>`; the name is URL-encoded (groups may contain spaces). */
export const groupDetailPath = (name: string): string => fleetAdminPath(`groups/${encodeURIComponent(name)}`);
