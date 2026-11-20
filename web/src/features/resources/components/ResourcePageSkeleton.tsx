import { PageSection, Skeleton, Stack, StackItem } from '@patternfly/react-core';

/**
 * Page-level loading placeholder of the resource area: while a page chunk loads (`HydrateFallback`) and while the
 * cluster landing waits for discovery.
 */
export function ResourcePageSkeleton() {
  return (
    <PageSection>
      <Stack hasGutter>
        <StackItem>
          <Skeleton fontSize="2xl" width="30%" screenreaderText="Loading page" />
        </StackItem>
        <StackItem>
          <Skeleton height="200px" />
        </StackItem>
      </Stack>
    </PageSection>
  );
}
