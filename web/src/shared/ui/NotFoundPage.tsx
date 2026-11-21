import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Link, type LinkProps } from 'react-router';
import { PageBody } from './page/PageBody';
import { PageHeading } from './page/PageHeading';

/** Router link to `/` that PatternFly's `Button` can render as (keeps client-side navigation). */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * 404 page for unknown routes, laid out like OCP's `error.tsx` (`UX.md` §10): the page heading carries the title as
 * the page's `h1`, the empty state below explains and links home. Lives in `shared/ui` so features can reuse it for
 * unknown sub-routes.
 */
export function NotFoundPage() {
  return (
    <>
      <PageHeading title="404: Page not found" />
      <PageBody>
        <EmptyState icon={SearchIcon} titleText="This page does not exist" headingLevel="h2">
          <EmptyStateBody>Check the address, or go back to the home page.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" component={HomeLink}>
                Go to home
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </PageBody>
    </>
  );
}
