import { Alert, AlertActionLink } from '@patternfly/react-core';
import { errorMessage } from '@/shared/api';

/** Props for {@link ErrorState}. */
export interface ErrorStateProps {
  /** What was thrown — normally an `ApiError`; anything else shows a generic message. */
  error: unknown;
  /** Alert heading (default "Something went wrong"). Name what failed, e.g. "Could not load users". */
  title?: string;
  /** Shows a "Retry" action, e.g. the query's `refetch`. */
  onRetry?: () => void;
  /** Announce the alert when it appears, for errors that show up after a user action (e.g. in a dialog). */
  isLiveRegion?: boolean;
}

/**
 * Inline danger alert for a failed request (spec §5: "never a blank page"). Shows the server's ProblemDetails `detail`
 * verbatim via `errorMessage` — never a stack trace or raw body — with an optional Retry action.
 */
export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  isLiveRegion = false,
}: ErrorStateProps) {
  return (
    <Alert
      variant="danger"
      isInline
      isLiveRegion={isLiveRegion}
      title={title}
      actionLinks={onRetry && <AlertActionLink onClick={onRetry}>Retry</AlertActionLink>}
    >
      {errorMessage(error)}
    </Alert>
  );
}
