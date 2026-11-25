import { useLocation } from 'react-router';

/** Which sidebar/switcher context a URL belongs to: a managed cluster (`/c/...` and everything else) or the fleet. */
export type Perspective = 'cluster' | 'fleet';

/** Prefix of the fleet perspective; the admin area lives under it (ADR-0033 §1). */
export const FLEET_PATH = '/fleet';

/** The fleet overview (`/fleet/overview`, FLT-2): the fleet perspective's landing page, open to every user. */
export function fleetOverviewPath(): string {
  return `${FLEET_PATH}/overview`;
}

/**
 * Path of an admin page: `/fleet/admin/<rest>`. `rest` is already encoded by the caller and has no leading slash; it
 * may carry a query (`'audit?user=alice'`). `''` gives the admin root `/fleet/admin`.
 */
export function fleetAdminPath(rest = ''): string {
  const root = `${FLEET_PATH}/admin`;
  return rest === '' ? root : `${root}/${rest}`;
}

/** `'fleet'` for `/fleet` and `/fleet/...`, else `'cluster'` (also `/`, `/preferences`, 404s). Pure. */
export function perspectiveOf(pathname: string): Perspective {
  return pathname === FLEET_PATH || pathname.startsWith(`${FLEET_PATH}/`) ? 'fleet' : 'cluster';
}

/** Perspective of the current URL; derived, never stored, so it can't drift from the address bar (ADR-0033 §4). */
export function usePerspective(): Perspective {
  return perspectiveOf(useLocation().pathname);
}
