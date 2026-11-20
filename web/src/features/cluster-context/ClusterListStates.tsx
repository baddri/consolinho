import { Bullseye, PageSection, Spinner } from '@patternfly/react-core';
import type { ApiError } from '@/shared/api';
import { ErrorState } from '@/shared/ui';

/** Page-area spinner while the user's cluster list loads (landing and cluster gate). */
export function ClusterListPending() {
  return (
    <PageSection isFilled>
      <Bullseye>
        <Spinner aria-label="Loading clusters" />
      </Bullseye>
    </PageSection>
  );
}

/** Page-area error with Retry when the user's cluster list could not be loaded and nothing is cached. */
export function ClusterListError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <PageSection>
      <ErrorState error={error} title="Could not load your clusters" onRetry={onRetry} />
    </PageSection>
  );
}
