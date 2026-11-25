import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { setMockUser } from '@/test/handlers';
import { useNamespaceFallback } from './useNamespaceFallback';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useNamespaceFallback (NSF-1)', () => {
  it('is pending first, then falls back to the configured namespaces when the token cannot list namespaces', async () => {
    setMockUser('alice');
    const { result } = renderHook(() => useNamespaceFallback('dev-k8s-ns'), { wrapper });

    expect(result.current.isFallback).toBeUndefined();
    await waitFor(() => expect(result.current.isFallback).toBe(true));
    await waitFor(() => expect(result.current.namespaces).toEqual(['team-a']));
  });

  it('is not a fallback when projects can be listed', async () => {
    const { result } = renderHook(() => useNamespaceFallback('dev-1'), { wrapper });

    await waitFor(() => expect(result.current.isFallback).toBe(false));
    expect(result.current.namespaces).toEqual([]);
  });

  it('sends no access review while disabled', async () => {
    setMockUser('alice');
    const { result } = renderHook(() => useNamespaceFallback('dev-k8s-ns', { enabled: false }), { wrapper });

    await waitFor(() => expect(result.current.namespaces).toEqual(['team-a']));
    expect(result.current.isFallback).toBeUndefined();
  });
});
