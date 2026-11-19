import {
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { Link, type LinkProps } from 'react-router';
import { UserMenu } from '@/features/auth';
import { ClusterSwitcher } from '@/features/cluster-context';
import { ThemeToggle } from './ThemeToggle';

/** Brand link rendered by `MastheadLogo`; keeps navigation client-side. */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/** Top bar: sidebar toggle, brand, cluster switcher, theme toggle and user menu. */
export function AppMasthead() {
  return (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton isHamburgerButton aria-label="Global navigation" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component={HomeLink}>FleetConsole</MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarItem>
              <ClusterSwitcher />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <ThemeToggle />
              </ToolbarItem>
              <ToolbarItem>
                <UserMenu />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
}
