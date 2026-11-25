import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { useNamespaceFallback } from './useNamespaceFallback';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useNamespaceFallback (NSF-1)', () => {
  it('is pending first, then falls back to the configured namespaces when namespaces cannot be listed', async () => {
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

  it('falls back on OpenShift too when the token may not list projects (NSF-1, DIST-5)', async () => {
    // QA (T-0391): the rule is response-driven, not distribution-driven; a review denying `list projects` on an
    // OpenShift cluster must switch to fallback mode, and the SSAR must ask about projects where they are served.
    const reviewed: unknown[] = [];
    server.use(
      http.post(
        '*/api/clusters/:cluster/k8s/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        async ({ request }) => {
          const body = (await request.json()) as { spec: { resourceAttributes: unknown } };
          reviewed.push(body.spec.resourceAttributes);
          return HttpResponse.json({ ...body, status: { allowed: false } }, { status: 201 });
        },
      ),
    );
    const { result } = renderHook(() => useNamespaceFallback('dev-1'), { wrapper });

    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(reviewed).toContainEqual(
      expect.objectContaining({ verb: 'list', group: 'project.openshift.io', resource: 'projects' }),
    );
  });

  it('sends no access review while disabled', async () => {
    setMockUser('alice');
    const { result } = renderHook(() => useNamespaceFallback('dev-k8s-ns', { enabled: false }), { wrapper });

    await waitFor(() => expect(result.current.namespaces).toEqual(['team-a']));
    expect(result.current.isFallback).toBeUndefined();
  });
});
