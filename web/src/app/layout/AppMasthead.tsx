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
import styles from './AppMasthead.module.css';
import { HelpMenu } from './HelpMenu';

/** Brand link rendered by `MastheadLogo`; keeps navigation client-side. */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * Top bar like OCP's (UX.md §2): sidebar toggle and brand (theme-matched 40px logo linking home, as high as OCP's) on
 * the left, a right-aligned toolbar with the help menu and the user menu (`masthead-toolbar.tsx`). No theme button
 * (colour scheme moves to User preferences) and no context selectors — the cluster switcher sits in the sidebar.
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
          <MastheadLogo component={HomeLink} className={styles.logo}>
            <Brand src={logoSrc} alt={PRODUCT_NAME} heights={{ default: '40px' }} />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }} gap={{ default: 'gapNone', md: 'gapMd' }}>
              <ToolbarItem>
                <HelpMenu />
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
