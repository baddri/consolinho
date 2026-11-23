import {
  Alert,
  AlertActionCloseButton,
  AlertActionLink,
  AlertGroup,
  Banner,
  Flex,
} from '@patternfly/react-core';
import { useState } from 'react';
import type { ApiError } from '@/shared/api';
import type { PodLogStatus } from './usePodLog';

/** Props for {@link LogStatusBanner}. */
export interface LogStatusBannerProps {
  lineCount: number;
  status: PodLogStatus;
  error?: ApiError | undefined;
  /** The container is waiting to start (it has no log yet): the error is information, not a failure. */
  isWaiting: boolean;
  onRetry: () => void;
}

/**
 * The stream error (LOG-10): OCP's danger alert with the cluster's message as body and a "Retry" link, or, for a
 * container waiting to start, an info alert with the cluster's message. Dismissing hides that error only.
 */
function LogErrorAlert({
  error,
  isWaiting,
  onRetry,
}: {
  error: ApiError;
  isWaiting: boolean;
  onRetry: () => void;
}) {
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  if (dismissed === error) return null;
  const close = <AlertActionCloseButton onClose={() => setDismissed(error)} />;
  if (isWaiting) {
    return (
      <Alert
        isInline
        className="pf-v6-u-mb-sm"
        variant="info"
        title={error.detail ?? error.title}
        actionClose={close}
      />
    );
  }
  return (
    <Alert
      isInline
      className="pf-v6-u-mb-sm"
      variant="danger"
      title="An error occurred while retrieving the requested logs."
      actionLinks={<AlertActionLink onClick={onRetry}>Retry</AlertActionLink>}
      actionClose={close}
    >
      {error.detail ?? error.title}
    </Alert>
  );
}

/**
 * The log viewer header (OCP `resource-log.tsx` `LogViewer` header + `HeaderBanner`): the error alert, then a banner
 * with the line count, turned into an info banner with " - Log stream ended." once the log is at its end.
 */
export function LogStatusBanner({ lineCount, status, error, isWaiting, onRetry }: LogStatusBannerProps) {
  const isEOF = status === 'eof';
  return (
    <Flex gap={{ default: 'gapNone' }} direction={{ default: 'column' }} fullWidth={{ default: 'fullWidth' }}>
      {error && (
        <AlertGroup>
          <LogErrorAlert error={error} isWaiting={isWaiting} onRetry={onRetry} />
        </AlertGroup>
      )}
      <Banner {...(isEOF ? { status: 'info' as const } : {})}>
        {`${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
        {isEOF && ' - Log stream ended.'}
      </Banner>
    </Flex>
  );
}
