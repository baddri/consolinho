import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';

/** Options of {@link createQueryClient}. */
export interface QueryClientOptions {
  /** Query retry policy. Default: {@link retryTransientFailures}. Tests pass `false` so failures surface at once. */
  retry?: boolean | number;
  /**
   * Called whenever a query or mutation fails with a 401 `ApiError` — the single place the app reacts to a missing or
   * ended session (ADR-0014 §2). Components never handle 401 themselves.
   */
  onUnauthenticated?: () => void;
}

/** Retries of a transient failure (network error, 5xx) before a query reports its error. */
const TRANSIENT_RETRIES = 1;

/**
 * Default query retry policy: client errors (`ApiError` 4xx — 401 session gone, 403, 404, 409 …) are final and
 * never retried; network failures and 5xx get {@link TRANSIENT_RETRIES} more attempt.
 */
export function retryTransientFailures(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < TRANSIENT_RETRIES;
}

/**
 * Creates the app's TanStack Query client. Prefer `createAppRuntime` (`session.ts`), which also wires
 * `onUnauthenticated` to the router, so the app and the test helpers cannot drift apart.
 */
export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const { retry = retryTransientFailures, onUnauthenticated } = options;
  const onError = (error: unknown) => {
    if (isApiError(error) && error.status === 401) {
      onUnauthenticated?.();
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
