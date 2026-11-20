import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
} from '@patternfly/react-core';
import { LockIcon } from '@patternfly/react-icons';
import { Link, type LinkProps } from 'react-router';
import { PRODUCT_NAME } from '@/shared/branding';

/** Router link to `/` that PatternFly's `Button` can render as (keeps client-side navigation). */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * Shown instead of any `/admin/...` page to signed-in users who are not admins (ADM-3): an explanation rather than a
 * blank screen or a raw 403.
 */
export function AdminNoAccessPage() {
  return (
    <PageSection>
      <EmptyState titleText="You don't have access to Fleet administration" headingLevel="h1" icon={LockIcon}>
        <EmptyStateBody>Ask a {PRODUCT_NAME} administrator if you need access.</EmptyStateBody>
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
