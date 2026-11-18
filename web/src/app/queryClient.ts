import { QueryClient } from '@tanstack/react-query';

/**
 * Creates the app's TanStack Query client. Tests pass `retry: false` so failures surface immediately.
 */
export function createQueryClient(options: { retry?: boolean | number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: options.retry ?? 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
