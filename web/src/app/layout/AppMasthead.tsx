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
import { useShownCluster } from '@/features/cluster-context';
import { MARK_SRC, PRODUCT_NAME, useMarkSrc } from '@/shared/branding';
import styles from './AppMasthead.module.css';
import theme from './clusterTheme.module.css';
import { HelpMenu } from './HelpMenu';

/** Brand link rendered by `MastheadLogo`; keeps navigation client-side. */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * Top bar like OCP's (UX.md §2): sidebar toggle and brand (24px mark plus the name in Red Hat Display, linking home) on
 * the left, a right-aligned toolbar with the help menu and the user menu (`masthead-toolbar.tsx`). No theme button
 * (colour scheme moves to User preferences) and no context selectors — the cluster switcher sits in the sidebar.
 * On Kubernetes clusters `clusterTheme.module.css` turns it navy (UX.md §2a) and the dark-surface mark is used.
 * Like OCP, the link carries the product name as its accessible name and the brand inside is decorative.
 */
export function AppMasthead() {
  const themeMarkSrc = useMarkSrc();
  // The Kubernetes masthead is a fixed dark surface in both themes (UX.md §2a), so it needs the dark-surface mark.
  const markSrc = useShownCluster()?.distribution === 'kubernetes' ? MARK_SRC.dark : themeMarkSrc;
  return (
    <Masthead className={theme.masthead}>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton isHamburgerButton aria-label="Global navigation" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component={HomeLink} className={styles.logo} aria-label={PRODUCT_NAME}>
            <Brand src={markSrc} alt="" heights={{ default: '24px' }} />
            <span className={styles.wordmark} aria-hidden>
              {PRODUCT_NAME}
            </span>
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
