import { Nav, NavExpandable, NavItem, NavList, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { Link, useLocation } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import { usePreferredCluster } from '@/features/cluster-context';
import { useClusterNav } from '@/features/resources';
import { buildAdminNav, type NavSection } from './navigation';
import { SystemInfoFooter } from './SystemInfoFooter';

/** Renders one collapsible section; it starts expanded when it is Home or contains the current page. */
function SidebarSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const containsActive = section.items.some((item) => item.isActive(pathname));
  return (
    <NavExpandable
      title={section.title}
      groupId={section.id}
      isActive={containsActive}
      isExpanded={containsActive || section.id === 'home'}
    >
      {section.items.map((item) => (
        <NavItem key={item.to} groupId={section.id} isActive={item.isActive(pathname)}>
          {/* Not `NavLink`: items target redirect paths (`k8s/pods`), so activity comes from `isActive`. */}
          <Link to={item.to} aria-current={item.isActive(pathname) ? 'page' : undefined}>
            {item.label}
          </Link>
        </NavItem>
      ))}
    </NavExpandable>
  );
}

/** The cluster's sections (registry + discovery, ADR-0023 §5); a component so the hook runs only with a cluster. */
function ClusterSections({ cluster, pathname }: { cluster: string; pathname: string }) {
  const sections = useClusterNav(cluster);
  return (
    <>
      {sections.map((section) => (
        <SidebarSection key={section.id} section={section} pathname={pathname} />
      ))}
    </>
  );
}

/**
 * Left navigation: cluster sections (`useClusterNav`) followed by the FleetConsole admin section — for admins only (ADM-3) — plus a
 * footer with the deployment version. Cluster links target `usePreferredCluster()` (the active cluster, else the last
 * used or first granted one on non-cluster pages such as admin); the cluster sections are hidden while the user has
 * no clusters.
 */
export function AppSidebar() {
  const { pathname } = useLocation();
  const cluster = usePreferredCluster();
  const isAdmin = useCurrentUser().data?.role === 'admin';

  return (
    <PageSidebar>
      <PageSidebarBody isFilled>
        <Nav aria-label="Global">
          <NavList>
            {cluster !== undefined && <ClusterSections cluster={cluster} pathname={pathname} />}
            {isAdmin && <SidebarSection section={buildAdminNav()} pathname={pathname} />}
          </NavList>
        </Nav>
      </PageSidebarBody>
      <PageSidebarBody>
        <SystemInfoFooter />
      </PageSidebarBody>
    </PageSidebar>
  );
}
