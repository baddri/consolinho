import { ADMIN_SECTIONS } from '@/features/admin';
import type { NavSection } from '@/features/resources';

/** Sidebar types are owned by `features/resources` (its `useClusterNav` builds the cluster sections). */
export type { NavLinkItem, NavSection } from '@/features/resources';

/** FleetConsole's own admin area (users, clusters, credentials, audit) — not tied to a cluster. */
export function buildAdminNav(): NavSection {
  return {
    id: 'admin',
    title: 'Fleet administration',
    items: ADMIN_SECTIONS.map((section) => ({
      label: section.title,
      to: `/admin/${section.id}`,
      isActive: (pathname: string) =>
        pathname === `/admin/${section.id}` || pathname.startsWith(`/admin/${section.id}/`),
    })),
  };
}
