import { Navigate, useLocation } from 'react-router';

/**
 * Index-route redirect that keeps the current query and hash (`/fleet/admin?x=1#h` → `/fleet/admin/users?x=1#h`);
 * a plain `<Navigate to="users" />` drops them. `to` is resolved relative to the route, like `Navigate`'s.
 */
export function RedirectKeepingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: to, search, hash }} />;
}
