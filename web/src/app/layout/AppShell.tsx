import { Page, SkipToContent } from '@patternfly/react-core';
import { Outlet } from 'react-router';
import { AppMasthead } from './AppMasthead';
import { AppSidebar } from './AppSidebar';

const MAIN_CONTENT_ID = 'fleetconsole-main';

/** PatternFly page frame (masthead + managed sidebar) around every authenticated route. */
export function AppShell() {
  return (
    <Page
      masthead={<AppMasthead />}
      sidebar={<AppSidebar />}
      isManagedSidebar
      skipToContent={<SkipToContent href={`#${MAIN_CONTENT_ID}`}>Skip to content</SkipToContent>}
      mainContainerId={MAIN_CONTENT_ID}
    >
      <Outlet />
    </Page>
  );
}
