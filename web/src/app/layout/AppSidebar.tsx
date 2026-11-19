import { Nav, NavExpandable, NavItem, NavList, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { NavLink, useLocation } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import { DEFAULT_CLUSTER, useActiveCluster } from '@/features/cluster-context';
import { buildAdminNav, buildClusterNav, type NavSection } from './navigation';
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
          <NavLink to={item.to}>{item.label}</NavLink>
        </NavItem>
      ))}
    </NavExpandable>
  );
}

/**
 * Left navigation: cluster sections (links target the active cluster, or the default cluster on non-cluster pages
 * such as admin) followed by the FleetConsole admin section — for admins only (ADM-3) — plus a footer with the
 * deployment version.
 */
export function AppSidebar() {
  const { pathname } = useLocation();
  const cluster = useActiveCluster() ?? DEFAULT_CLUSTER;
  const isAdmin = useCurrentUser().data?.role === 'admin';
  const sections = [...buildClusterNav(cluster), ...(isAdmin ? [buildAdminNav()] : [])];

  return (
    <PageSidebar>
      <PageSidebarBody isFilled>
        <Nav aria-label="Global">
          <NavList>
            {sections.map((section) => (
              <SidebarSection key={section.id} section={section} pathname={pathname} />
            ))}
          </NavList>
        </Nav>
      </PageSidebarBody>
      <PageSidebarBody>
        <SystemInfoFooter />
      </PageSidebarBody>
    </PageSidebar>
  );
}
