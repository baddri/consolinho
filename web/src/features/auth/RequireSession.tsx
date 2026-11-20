import { Bullseye, Spinner } from '@patternfly/react-core';
import { Outlet } from 'react-router';
import { ErrorState } from '@/shared/ui';
import { useCurrentUser } from './useCurrentUser';

/**
 * Layout route around everything that needs a session (ADR-0014 §3). Renders its child routes once
 * `GET /api/auth/me` succeeded.
 *
 * - pending → full-page spinner;
 * - 401 → nothing: the QueryClient's global 401 handler is already navigating to `/login` (no per-page auth code);
 * - any other failure → `ErrorState` with Retry.
 *
 * Once a user was loaded, a failed background refetch keeps the app on screen: a transient 5xx must not blank the
 * whole console, and a 401 is handled globally anyway.
 */
export function RequireSession() {
  const { data, error, isPending, refetch } = useCurrentUser();

  if (data) {
    return <Outlet />;
  }
  if (isPending) {
    return (
      <Bullseye className="pf-v6-u-h-100vh">
        <Spinner aria-label="Loading session" />
      </Bullseye>
    );
  }
  if (error.status === 401) {
    return null;
  }
  return (
    <Bullseye className="pf-v6-u-h-100vh pf-v6-u-p-xl">
      <ErrorState error={error} title="Could not load your session" onRetry={() => void refetch()} />
    </Bullseye>
  );
}
