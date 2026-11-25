import { waitFor } from '@testing-library/react';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, mockDb, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { resourceRoutes } from './routes';

const SSAR_PATH = '/selfsubjectaccessreviews';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  mockViewportWidth(1440);
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

const location = (router: ReturnType<typeof renderApp>['router']) =>
  `${router.state.location.pathname}${router.state.location.search}`;

/** Counts the access reviews the app sends. */
function countAccessReviews(): { count: number } {
  const reviews = { count: 0 };
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith(SSAR_PATH)) reviews.count += 1;
  });
  onTestFinished(() => server.events.removeAllListeners('request:start'));
  return reviews;
}

describe('k8s/:plural and search redirects', () => {
  it(
    'keeps all namespaces where namespaces can be listed',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp('/c/dev-1/k8s/deployments?name=web');

      await waitFor(() => expect(location(router)).toBe('/c/dev-1/k8s/all-namespaces/deployments?name=web'), {
        timeout: COLD_START_TIMEOUT_MS,
      });
    },
  );

  it('redirects a remembered namespace and a cluster-scoped kind without an access review', async () => {
    const reviews = countAccessReviews();
    localStorage.setItem('fleetconsole.lastNamespace', JSON.stringify({ 'dev-1': 'shop' }));
    const { router } = renderApp('/c/dev-1/k8s/deployments');
    await waitFor(() => expect(location(router)).toBe('/c/dev-1/k8s/ns/shop/deployments'));

    await router.navigate('/c/dev-1/k8s/nodes');
    await waitFor(() => expect(location(router)).toBe('/c/dev-1/k8s/cluster/nodes'));
    expect(reviews.count).toBe(0);
  });
});

describe('redirects without namespace listing (NSF-3)', () => {
  beforeEach(() => setMockUser('alice'));

  it('sends a namespaced plural to the first configured namespace, keeping the query', async () => {
    const { router } = renderApp('/c/dev-k8s-ns/k8s/deployments?name=web');

    await waitFor(() => expect(location(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-a/deployments?name=web'));
  });

  it('sends search to the first configured namespace', async () => {
    const { router } = renderApp('/c/dev-k8s-ns/search');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-k8s-ns/search/ns/team-a'));
  });

  it('goes to the cluster root (its empty state) when no namespaces are configured', async () => {
    const credential = mockDb.credentials.find((entry) => entry.id === credentialIds.devK8sNsTeamA);
    if (!credential) throw new Error('fixture credential missing');
    credential.inspectNamespaces = [];
    const { router } = renderApp('/c/dev-k8s-ns/k8s/deployments');

    await waitFor(() => expect(location(router)).toBe('/c/dev-k8s-ns'));
  });
});
