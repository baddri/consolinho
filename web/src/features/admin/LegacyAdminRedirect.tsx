import { Navigate, type RouteObject, useLocation, useParams } from 'react-router';
import { fleetAdminPath } from '@/shared/routing';

/**
 * Sends an old `/admin[/<rest>]` URL to `/fleet/admin[/<rest>]` (ADR-0033 §2), replacing the history entry and
 * keeping query and hash, so bookmarks and login `returnUrl`s from before CP3.7 still land on their page. Unknown
 * rests then hit the admin 404. Deliberately outside `RequireAdmin`: the target route gates access. Keep until CP6.
 */
export function LegacyAdminRedirect() {
  const rest = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: fleetAdminPath(rest), search, hash }} />;
}

/** `admin/*` (also matches `/admin`) under the shell: the legacy admin prefix, redirected to the fleet perspective. */
export const legacyAdminRoute: RouteObject = { path: 'admin/*', element: <LegacyAdminRedirect /> };
