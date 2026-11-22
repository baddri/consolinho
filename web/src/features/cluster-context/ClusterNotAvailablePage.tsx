import { Button, EmptyStateActions } from '@patternfly/react-core';
import { NotFoundPage, ReturnToHomepageButton } from '@/shared/ui';
import { requestClusterSwitcherOpen } from './clusterSwitcherRequest';

/**
 * Shown for `/c/<name>/...` when `<name>` is not in the user's cluster list (SW-5), in the layout of OCP's 404 page
 * (`UX.md` §10). The text is identical for unknown and ungranted clusters, so the page never reveals whether a cluster
 * exists. Next to "Return to homepage" it offers "Select a cluster", which opens the sidebar's switcher (T-0097).
 */
export function ClusterNotAvailablePage({ cluster }: { cluster: string }) {
  return (
    <NotFoundPage
      title={`Cluster ${cluster} is not available`}
      body="It does not exist or you don't have access."
      documentTitle="Cluster not available"
      footer={
        <EmptyStateActions>
          <ReturnToHomepageButton />
          <Button variant="link" onClick={requestClusterSwitcherOpen}>
            Select a cluster
          </Button>
        </EmptyStateActions>
      }
    />
  );
}
