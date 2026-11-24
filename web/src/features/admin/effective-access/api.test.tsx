import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffectiveAccess } from './api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEffectiveAccess', () => {
  it("returns the user's resolved access per cluster with its source and candidates", async () => {
    const { result } = renderHook(() => useEffectiveAccess('alice'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groups).toEqual(['sre']);
    // On staging-eu-1 her direct grant overrides sre's (PREC-3).
    const staging = result.current.data?.clusters.find((c) => c.clusterName === 'staging-eu-1');
    expect(staging?.source).toEqual({ kind: 'user', groupName: null, priority: null });
    expect(staging?.candidates.map((c) => [c.subjectName, c.outcome])).toEqual([
      ['alice', 'winner'],
      ['sre', 'overriddenByDirectGrant'],
    ]);
  });

  it('surfaces 404 Users.NotFound', async () => {
    const { result } = renderHook(() => useEffectiveAccess('nobody'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('Users.NotFound');
  });
});
