import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { ThemeProvider } from '@/shared/theme';

/** Devtools are loaded only in the dev server; the dynamic import is dropped from production builds. */
const ReactQueryDevtools =
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
    : null;

/** App-wide providers: server-state cache (TanStack Query) and theme. Shared by the app and test render helpers. */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
