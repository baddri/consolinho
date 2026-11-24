import { Page, PageSection, SkipToContent } from '@patternfly/react-core';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { EnvironmentBanner, useShownCluster } from '@/features/cluster-context';
import { FavoriteButton } from '@/features/preferences';
import { HeadingFavoriteContext, type HeadingFavoriteRenderer, TopBarSlotContext } from '@/shared/ui';
import styles from './AppShell.module.css';
import { AppMasthead } from './AppMasthead';
import { AppSidebar } from './AppSidebar';
import theme from './clusterTheme.module.css';

const MAIN_CONTENT_ID = 'fleetconsole-main';

/** The heading star; module-level so the context value is stable. */
const renderFavorite: HeadingFavoriteRenderer = (props) => <FavoriteButton {...props} />;

/**
 * PatternFly page frame (masthead + managed sidebar) around every authenticated route. Like OCP's `app-contents.tsx`,
 * the main area has a fixed top section (the environment band on production and staging clusters, SW-10, then the
 * page's project bar via {@link TopBarSlotContext}) and below it the only scrolling section, which holds the route
 * (UX.md §2 "Fixed top, scrolling body"). Provides the favourite star to every page heading
 * (OCP shows `FavoriteButton` in each `PageHeading`).
 *
 * While the shown cluster is Kubernetes, `data-cluster-type="kubernetes"` on the `Page` turns the masthead and nav
 * header navy (`clusterTheme.module.css`, UX.md §2a). It is derived on render from {@link useShownCluster}, so a
 * cluster switch re-themes without an effect or DOM access; fleet pages, the not-available page and loading stay
 * neutral (THEME-1, THEME-5).
 */
export function AppShell() {
  const shown = useShownCluster();
  // Ref callback into state, so pages re-render with the slot once it is mounted (no DOM lookup).
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null);
  return (
    <Page
      className={theme.shell}
      data-cluster-type={shown?.distribution === 'kubernetes' ? 'kubernetes' : undefined}
      masthead={<AppMasthead />}
      sidebar={<AppSidebar />}
      isManagedSidebar
      isContentFilled
      skipToContent={<SkipToContent href={`#${MAIN_CONTENT_ID}`}>Skip to content</SkipToContent>}
      mainContainerId={MAIN_CONTENT_ID}
    >
      <PageSection hasBodyWrapper={false} padding={{ default: 'noPadding' }} className={styles.noGap}>
        <EnvironmentBanner />
        <div ref={setTopBarSlot} />
      </PageSection>
      <PageSection
        isFilled
        hasBodyWrapper={false}
        padding={{ default: 'noPadding' }}
        className={`${styles.noGap} ${styles.scrollable} pf-v6-u-flex-shrink-1`}
      >
        <TopBarSlotContext.Provider value={topBarSlot}>
          <HeadingFavoriteContext.Provider value={renderFavorite}>
            <Outlet />
          </HeadingFavoriteContext.Provider>
        </TopBarSlotContext.Provider>
      </PageSection>
    </Page>
  );
}
