import { ADMIN_SECTIONS } from '@/features/admin';
import type { NavSection } from '@/features/resources';
import { fleetAdminPath } from '@/shared/routing';

/** Sidebar types are owned by `features/resources` (its `useClusterNav` builds the cluster sections). */
export type { NavLinkItem, NavSection } from '@/features/resources';

/**
 * Sidebar sections of the fleet perspective (ADR-0033 §5) — today only "Fleet administration" (users, clusters,
 * credentials, audit), not tied to a cluster. An array so CP5's fleet overview can add sections.
 */
export function buildFleetNav(): NavSection[] {
  return [
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
