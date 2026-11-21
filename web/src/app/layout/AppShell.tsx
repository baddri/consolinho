import { Page, SkipToContent } from '@patternfly/react-core';
import { Outlet } from 'react-router';
import { EnvironmentBanner } from '@/features/cluster-context';
import { AppMasthead } from './AppMasthead';
import { AppSidebar } from './AppSidebar';

const MAIN_CONTENT_ID = 'fleetconsole-main';

/**
 * PatternFly page frame (masthead + managed sidebar) around every authenticated route; on production and staging
 * clusters an environment band sits under the masthead (SW-10).
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
      <Outlet />
    </Page>
  );
}
