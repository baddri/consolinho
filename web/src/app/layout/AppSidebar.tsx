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
import { buildAdminNav, type NavSection } from './navigation';

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
 * Left navigation (`packages/console-app/src/components/nav/index.tsx`). Like OCP's perspective switcher, the
 * {@link ClusterSwitcher} is the first child of the `Nav` (full width, no divider below; UX.md §2) — shown on every
 * page, also on admin pages and while the user has no clusters. Then the cluster sections (`useClusterNav`) and the
 * FleetConsole admin section — for admins only (ADM-3). Favorites (starred pages) follow Home and are hidden with the
 * cluster sections. No footer: the version is in Help › About.
 *
 * Cluster links target `usePreferredCluster()` (the active cluster, else the last used or first granted one on
 * non-cluster pages such as admin). The cluster sections are hidden while the user has no clusters and on the
 * "Cluster … is not available" page, where only Fleet administration remains (T-0097).
 */
export function AppSidebar() {
  const { pathname } = useLocation();
  const preferredCluster = usePreferredCluster();
  const cluster = useIsActiveClusterUnavailable() ? undefined : preferredCluster;
  const isAdmin = useCurrentUser().data?.role === 'admin';

  return (
    <PageSidebar>
      <PageSidebarBody>
        <Nav aria-label="Global">
          {/* The Nav is a grid with a row gap, which spaces the switcher and the sections. Min-width 0 keeps a long
              cluster name with labels from widening the grid column; the name truncates instead. */}
          <div className="pf-v6-u-min-width">
            <ClusterSwitcher />
          </div>
          {(cluster !== undefined || isAdmin) && (
            <NavList>
              {cluster !== undefined && <ClusterSections cluster={cluster} pathname={pathname} />}
              {isAdmin && <SidebarSection section={buildAdminNav()} pathname={pathname} />}
            </NavList>
          )}
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );
}
