import { ADMIN_SECTIONS } from '@/features/admin';
import type { NavSection } from '@/features/resources';
import { fleetAdminPath, fleetOverviewPath } from '@/shared/routing';

/** Sidebar types are owned by `features/resources` (its `useClusterNav` builds the cluster sections). */
export type { NavLinkItem, NavSection } from '@/features/resources';

/**
 * Sidebar sections of the fleet perspective (ADR-0033 §5), not tied to a cluster: "Fleet" > "Overview" first for
 * everyone (FLT-1), then "Fleet administration" (users, groups, clusters, credentials, audit) for admins only.
 */
export function buildFleetNav(isAdmin: boolean): NavSection[] {
  const fleet: NavSection = {
    id: 'fleet',
    title: 'Fleet',
    items: [
      {
        label: 'Overview',
        to: fleetOverviewPath(),
        isActive: (pathname: string) => pathname === fleetOverviewPath(),
      },
    ],
  };
  if (!isAdmin) return [fleet];
  return [
    fleet,
    {
      id: 'fleet-admin',
      title: 'Fleet administration',
      items: ADMIN_SECTIONS.map((section) => ({
        label: section.title,
        to: fleetAdminPath(section.id),
        isActive: (pathname: string) =>
          pathname === fleetAdminPath(section.id) || pathname.startsWith(`${fleetAdminPath(section.id)}/`),
      })),
    },
  ];
}
