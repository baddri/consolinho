import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from '@patternfly/react-core';
import { errorMessage } from '@/shared/api';

/** Props for {@link LoadError}. */
export interface LoadErrorProps {
  /** What failed to load, in OCP's words: the title reads "Error loading <label>" (e.g. "Pods"). */
  label: string;
  /** What was thrown — normally an `ApiError`; its ProblemDetails `detail` is the body. */
  error: unknown;
  /** Refetches the failed query ("Try again"). */
  onRetry: () => void;
}

/**
 * Page-level load failure of a Kubernetes page, as OCP's `StatusBox` → `LoadError` (`console-shared/src/components/
 * loading/LoadError.tsx`): a small empty state without icon titled "Error loading <label>", the server's message as
 * body and an inline link "Try again". Admin pages keep the inline {@link ErrorState} alert (`UX.md` §10).
 */
export function LoadError({ label, error, onRetry }: LoadErrorProps) {
  return (
    <EmptyState variant="sm" titleText={`Error loading ${label}`} headingLevel="h2">
      <EmptyStateBody>{errorMessage(error)}</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="link" isInline onClick={onRetry}>
            Try again
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}
