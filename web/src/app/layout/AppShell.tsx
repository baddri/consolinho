import { Page, SkipToContent } from '@patternfly/react-core';
import { Outlet } from 'react-router';
import { EnvironmentBanner } from '@/features/cluster-context';
import { FavoriteButton } from '@/features/preferences';
import { HeadingFavoriteContext, type HeadingFavoriteRenderer } from '@/shared/ui';
import { AppMasthead } from './AppMasthead';
import { AppSidebar } from './AppSidebar';

const MAIN_CONTENT_ID = 'fleetconsole-main';

/** The heading star; module-level so the context value is stable. */
const renderFavorite: HeadingFavoriteRenderer = (props) => <FavoriteButton {...props} />;

/**
 * PatternFly page frame (masthead + managed sidebar) around every authenticated route; on production and staging
 * clusters an environment band sits under the masthead (SW-10). Provides the favourite star to every page heading
 * (OCP shows `FavoriteButton` in each `PageHeading`).
 */
export function AppShell() {
  return (
    <Page
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
