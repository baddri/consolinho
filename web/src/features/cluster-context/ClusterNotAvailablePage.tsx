import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Link, type LinkProps } from 'react-router';

/** Router link to `/` (landing redirect) that PatternFly's `Button` can render as. */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/**
 * Shown for `/c/<name>/...` when `<name>` is not in the user's cluster list (SW-5). The text is identical for unknown
 * and ungranted clusters, so the page never reveals whether a cluster exists.
 */
export function ClusterNotAvailablePage({ cluster }: { cluster: string }) {
  return (
    <PageSection>
      <EmptyState titleText={`Cluster ${cluster} is not available`} headingLevel="h1" icon={SearchIcon}>
        <EmptyStateBody>It does not exist or you don&apos;t have access.</EmptyStateBody>
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
