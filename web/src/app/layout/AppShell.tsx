import { Page, SkipToContent } from '@patternfly/react-core';
import { Outlet } from 'react-router';
import { EnvironmentBanner, useShownCluster } from '@/features/cluster-context';
import { FavoriteButton } from '@/features/preferences';
import { HeadingFavoriteContext, type HeadingFavoriteRenderer } from '@/shared/ui';
import { AppMasthead } from './AppMasthead';
import { AppSidebar } from './AppSidebar';
import theme from './clusterTheme.module.css';

const MAIN_CONTENT_ID = 'fleetconsole-main';

/** The heading star; module-level so the context value is stable. */
const renderFavorite: HeadingFavoriteRenderer = (props) => <FavoriteButton {...props} />;

/**
 * PatternFly page frame (masthead + managed sidebar) around every authenticated route; on production and staging
 * clusters an environment band sits under the masthead (SW-10). Provides the favourite star to every page heading
 * (OCP shows `FavoriteButton` in each `PageHeading`).
 *
 * While the shown cluster is Kubernetes, `data-cluster-type="kubernetes"` on the `Page` turns the masthead and nav
 * header navy (`clusterTheme.module.css`, UX.md §2a). It is derived on render from {@link useShownCluster}, so a
 * cluster switch re-themes without an effect or DOM access; fleet pages, the not-available page and loading stay
 * neutral (THEME-1, THEME-5).
 */
export function AppShell() {
  const shown = useShownCluster();
  return (
    <Page
      className={theme.shell}
      data-cluster-type={shown?.distribution === 'kubernetes' ? 'kubernetes' : undefined}
      masthead={<AppMasthead />}
      banner={<EnvironmentBanner />}
      sidebar={<AppSidebar />}
      isManagedSidebar
      isContentFilled
      skipToContent={<SkipToContent href={`#${MAIN_CONTENT_ID}`}>Skip to content</SkipToContent>}
      mainContainerId={MAIN_CONTENT_ID}
    >
      <HeadingFavoriteContext.Provider value={renderFavorite}>
        <Outlet />
      </HeadingFavoriteContext.Provider>
    </Page>
  );
}
