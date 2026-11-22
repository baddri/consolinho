import { ErrorState } from '@patternfly/react-component-groups';
import { PageSection, Stack, StackItem } from '@patternfly/react-core';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ReturnToHomepageButton } from '@/shared/ui';

/**
 * Router-level error boundary, shown when a route throws while rendering or loading. Mirrors OCP's `ErrorState`
 * (`public/components/error.tsx`): component-groups `ErrorState` with the danger icon, an `h1` "An error occurred",
 * OCP's retry sentence, then the error's own message.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <PageSection isFilled>
      <ErrorState
        headingLevel="h1"
        titleText="An error occurred"
        bodyText={
          <Stack>
            <StackItem>There was a problem processing the request. Please try again.</StackItem>
            <StackItem>{message}</StackItem>
          </Stack>
        }
        customFooter={<ReturnToHomepageButton />}
      />
    </PageSection>
  );
}
