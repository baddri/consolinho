import { Bullseye, PageSection, Spinner } from '@patternfly/react-core';
import type { RouteObject } from 'react-router';

/** Shown in the page area while the overview chunk loads when the app starts on `/fleet/overview`. */
function FleetPageSpinner() {
  return (
    <PageSection isFilled>
      <Bullseye>
        <Spinner aria-label="Loading page" />
      </Bullseye>
    </PageSection>
  );
}

/**
 * The fleet overview route (FLT-1/FLT-2), mounted by the app inside the `fleet` route next to `admin`. Open to every
 * signed-in user: the page lists only the clusters the user can access. Same code-splitting convention as the admin
 * routes (`features/admin/routes.tsx`): the page is a lazy module with a string-literal import path.
 */
export const fleetRoute: RouteObject = {
  path: 'overview',
  HydrateFallback: FleetPageSpinner,
  lazy: () => import('./overview/FleetOverviewPage').then((m) => ({ Component: m.FleetOverviewPage })),
};
