import { Content, Flex, FlexItem, Spinner } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Progress text while a test runs (TEST-1). */
export const TESTING_TEXT = 'Testing… this can take up to 15 seconds.';

/** Shown after the admin cancelled a running test. */
export const TEST_CANCELLED_TEXT = 'Test cancelled.';

/** Props for {@link TestProgress}. */
export interface TestProgressProps {
  isTesting: boolean;
  /** The latest test was cancelled by the admin (and none runs now). */
  isCancelled: boolean;
  /** Extra controls next to the progress text, e.g. an inline "Cancel test" link. */
  children?: ReactNode;
}

/**
 * Status line of a running connection test: spinner + "Testing… this can take up to 15 seconds." while it runs,
 * "Test cancelled." after a cancel, else nothing. It is not a live region itself: render it inside an
 * `aria-live="polite"` element that is **always mounted**, so screen readers announce both texts when they appear.
 */
export function TestProgress({ isTesting, isCancelled, children }: TestProgressProps) {
  if (isTesting) {
    return (
      <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <Spinner size="md" aria-label="Testing" />
        </FlexItem>
        <FlexItem>{TESTING_TEXT}</FlexItem>
        {children !== undefined && <FlexItem>{children}</FlexItem>}
      </Flex>
    );
  }
  return isCancelled ? <Content component="p">{TEST_CANCELLED_TEXT}</Content> : null;
}
