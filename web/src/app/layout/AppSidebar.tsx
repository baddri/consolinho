import { Nav, NavExpandable, NavItem, NavList, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { Link, useLocation } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import {
  ClusterSwitcher,
  useIsActiveClusterUnavailable,
  usePreferredCluster,
} from '@/features/cluster-context';
import { FavoritesNavSection } from '@/features/preferences';
import { useClusterNav } from '@/features/resources';
import { usePerspective } from '@/shared/routing';
import theme from './clusterTheme.module.css';
import { buildFleetNav, type NavSection } from './navigation';

/**
 * Renders one collapsible section. Like OCP (`NavSection.tsx`: `useState(false)`) every section starts collapsed, also
 * the one holding the current page; that one is only marked active.
 */
function SidebarSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const containsActive = section.items.some((item) => item.isActive(pathname));
  return (
    <NavExpandable title={section.title} groupId={section.id} isActive={containsActive}>
      {section.items.map((item) => (
        <NavItem key={item.to} groupId={section.id} isActive={item.isActive(pathname)}>
          {/* Not `NavLink`: items target redirect paths (`k8s/pods`), so activity comes from `isActive`; NavItem sets aria-current. */}
          <Link to={item.to}>{item.label}</Link>
        </NavItem>
      ))}
    </NavExpandable>
  );
}

/**
 * The cluster's sections (registry + discovery, ADR-0023 §5) with Favorites second, after Home, as in OCP; a component
 * so the hook runs only with a cluster.
 */
function ClusterSections({ cluster, pathname }: { cluster: string; pathname: string }) {
  const sections = useClusterNav(cluster);
  const homeCount = sections[0]?.id === 'home' ? 1 : 0;
  return (
    <>
      {sections.slice(0, homeCount).map((section) => (
        <SidebarSection key={section.id} section={section} pathname={pathname} />
      ))}
      <FavoritesNavSection />
      {sections.slice(homeCount).map((section) => (
        <SidebarSection key={section.id} section={section} pathname={pathname} />
      ))}
    </>
  );
}

/**
 * The fleet perspective's sections ({@link buildFleetNav}); admins only — a non-admin on `/fleet/...` gets the
 * forbidden page and an empty sidebar (FLEET-8).
 */
function FleetSections({ pathname }: { pathname: string }) {
  const isAdmin = useCurrentUser().data?.role === 'admin';
  if (!isAdmin) return null;
  return (
    <NavList>
      {buildFleetNav().map((section) => (
        <SidebarSection key={section.id} section={section} pathname={pathname} />
      ))}
    </NavList>
  );
}

/**
 * Left navigation (`packages/console-app/src/components/nav/index.tsx`). Like OCP's perspective switcher, the
 * {@link ClusterSwitcher} is the first child of the `Nav` (full width, no divider below; UX.md §2) — shown on every
 * page, also while the user has no clusters. The content below depends on the URL's perspective (ADR-0033 §5, like
 * OCP's `PerspectiveNav`):
 *
 * - `fleet` (`/fleet/...`): only the Fleet sections, for admins (FLEET-3); no Home, Favorites or cluster sections.
 * - `cluster` (everything else): Home, Favorites (starred pages), then the cluster sections (`useClusterNav`), never
 *   Fleet administration (FLEET-4). Cluster links target `usePreferredCluster()` (the active cluster, else the last
 *   used or first granted one on non-cluster pages such as Preferences). Hidden while the user has no clusters and on
 *   the "Cluster … is not available" page (T-0097).
 *
 * No footer: the version is in Help › About.
 */
export function AppSidebar() {
  const { pathname } = useLocation();
  const perspective = usePerspective();
  const preferredCluster = usePreferredCluster();
  const cluster = useIsActiveClusterUnavailable() ? undefined : preferredCluster;

  return (
    <PageSidebar>
      <PageSidebarBody>
        <Nav aria-label="Global">
          {/* The Nav is a grid with a row gap, which spaces the switcher and the sections. Min-width 0 keeps a long
              cluster name with labels from widening the grid column; the name truncates instead. */}
          <div className={`pf-v6-u-min-width ${theme.navHeader}`}>
            <ClusterSwitcher />
          </div>
          {perspective === 'fleet' ? (
            <FleetSections pathname={pathname} />
          ) : (
            cluster !== undefined && (
              <NavList>
                <ClusterSections cluster={cluster} pathname={pathname} />
              </NavList>
            )
          )}
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );
}
