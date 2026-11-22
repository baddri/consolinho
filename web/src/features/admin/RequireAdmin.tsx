import { Outlet } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import { AdminNoAccessPage } from './AdminNoAccessPage';

/**
 * Layout route around `/fleet/admin/*` (ADR-0014 §3, ADM-3): admins get the requested page, everyone else the
 * "no access" page. It sits inside `RequireSession`, so `me` is already loaded; pages below it never render for
 * non-admins and therefore never call admin endpoints.
 */
export function RequireAdmin() {
  const { data: me } = useCurrentUser();
  return me?.role === 'admin' ? <Outlet /> : <AdminNoAccessPage />;
}
