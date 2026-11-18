import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
} from '@patternfly/react-core';
import { Link, type LinkProps } from 'react-router';

/** Router link to `/` that PatternFly's `Button` can render as (keeps client-side navigation). */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/** 404 page for unknown routes. Lives in `shared/ui` so features can reuse it for unknown sub-routes. */
export function NotFoundPage() {
  return (
    <PageSection>
      <EmptyState titleText="404: Page not found" headingLevel="h1">
        <EmptyStateBody>The page you are looking for does not exist.</EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" component={HomeLink}>
              Go to home
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  );
}
