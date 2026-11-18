import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { systemInfoFixture } from '@/test/handlers';
import { server } from '@/test/server';
import { useSystemInfo } from './system';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSystemInfo', () => {
  it('returns version and environment from GET /api/system/info', async () => {
    const { result } = renderHook(() => useSystemInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(systemInfoFixture);
  });

  it('surfaces an error when the Api fails', async () => {
    server.use(http.get('*/api/system/info', () => HttpResponse.json({ title: 'boom' }, { status: 500 })));

    const { result } = renderHook(() => useSystemInfo(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('HTTP 500');
  });
});
