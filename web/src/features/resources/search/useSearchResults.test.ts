import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { K8S_MODELS, proxyBasePath, SelfSubjectAccessReviewModel } from '@/shared/k8s';
import { server } from '@/test/server';
import { useSearchResults } from './useSearchResults';

/** More kinds than the limiter allows at once (SRCH-5: 6). */
const MODELS = K8S_MODELS.filter((model) => model !== SelfSubjectAccessReviewModel).slice(0, 10);
const MAX_IN_FLIGHT = 6;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

/**
 * Holds every list request of dev-1 until the test releases it, counting how many are in flight at once. MSW calls
 * the resolver when the request arrives, so the counter reflects requests actually sent, not queued in the limiter.
 */
function holdListRequests() {
  const held: (() => void)[] = [];
  const stats = { inFlight: 0, maxInFlight: 0, received: 0 };
  server.use(
    http.get(`${proxyBasePath('dev-1')}/*`, async () => {
      stats.received += 1;
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await new Promise<void>((resolve) => held.push(resolve));
      stats.inFlight -= 1;
      return HttpResponse.json({ kind: 'List', apiVersion: 'v1', metadata: { resourceVersion: '1' }, items: [] });
    }),
  );
  /** Answers the requests held so far (later ones keep waiting until the next call). */
  const releaseHeld = () => held.splice(0).forEach((resolve) => resolve());
  return { stats, held, releaseHeld };
}

describe('useSearchResults', () => {
  it('SRCH-5: at most 6 list requests are in flight at once, and every section still loads', async () => {
    expect(MODELS.length).toBeGreaterThan(MAX_IN_FLIGHT);
    const { stats, held, releaseHeld } = holdListRequests();

    const { result } = renderHook(
      () => MODELS.map((model) => useSearchResults('dev-1', model, 'shop', '')),
      { wrapper },
    );

    // The first batch fills the limiter and stops there while the server holds its answers.
    await waitFor(() => expect(held).toHaveLength(MAX_IN_FLIGHT));
    expect(stats.inFlight).toBe(MAX_IN_FLIGHT);

    // Answer in batches until every section has its list; the limit holds throughout.
    await waitFor(() => {
      releaseHeld();
      expect(result.current.every((query) => query.isSuccess)).toBe(true);
    });
    expect(stats.received).toBe(MODELS.length);
    expect(stats.maxInFlight).toBe(MAX_IN_FLIGHT);
  });
});
