import { EmptyState, EmptyStateBody, PageSection } from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Router-level error boundary: shown when a route throws while rendering or loading. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <PageSection>
      <EmptyState
        titleText="Something went wrong"
        headingLevel="h1"
        icon={ExclamationCircleIcon}
        status="danger"
      >
        <EmptyStateBody>{message}</EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
}
