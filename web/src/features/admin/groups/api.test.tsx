import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/shared/api';
import { useGroupGrants } from '../grants/api';
import { useGroup, useGroups } from './api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('group read hooks', () => {
  it('useGroups returns the Groups list with the host status', async () => {
    const { result } = renderHook(() => useGroups(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hostStatus).toBe('ok');
    expect(result.current.data?.items.map((g) => g.name)).toContain('sre');
  });

  it('useGroup returns a group with its members', async () => {
    const { result } = renderHook(() => useGroup('platform'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.members?.map((m) => m.username)).toEqual(['carol']);
  });

  it('useGroup surfaces 404 Groups.NotFound', async () => {
    const { result } = renderHook(() => useGroup('nobody'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.code).toBe('Groups.NotFound');
  });

  it("useGroupGrants returns the group's grants", async () => {
    const { result } = renderHook(() => useGroupGrants('sre'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((g) => [g.subjectKind, g.clusterName, g.priority])).toEqual([
      ['group', 'staging-eu-1', 100],
    ]);
  });
});
