import {
  Brand,
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
import { PRODUCT_NAME, useLogoSrc } from '@/shared/branding';
import { ThemeMenu } from './ThemeMenu';

/** Brand link rendered by `MastheadLogo`; keeps navigation client-side. */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * Top bar like OCP's (UX.md §2): sidebar toggle and brand (theme-matched logo linking home) on the left, a
 * right-aligned toolbar with the theme icon menu and the user menu. No context selectors here — the cluster switcher
 * sits at the top of the sidebar.
 */
export function AppMasthead() {
  const logoSrc = useLogoSrc();
  return (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton isHamburgerButton aria-label="Global navigation" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component={HomeLink}>
            <Brand src={logoSrc} alt={PRODUCT_NAME} heights={{ default: '36px' }} />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <ThemeMenu />
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
