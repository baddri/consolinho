import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { PRODUCT_NAME } from '@/shared/branding';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, mockDb, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { resourceRoutes } from './routes';

const LAST_NAMESPACE_KEY = 'fleetconsole.lastNamespace';
const NO_NAMESPACES_BODY =
  "Your access to this cluster can't list namespaces and none are configured for it. Enter a namespace name, or ask " +
  `a ${PRODUCT_NAME} administrator to add one.`;

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  mockViewportWidth(1440);
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Removes the namespaces configured for alice's `dev-k8s-ns` access (NSF-4). */
function clearFallbackNamespaces(): void {
  const credential = mockDb.credentials.find((entry) => entry.id === credentialIds.devK8sNsTeamA);
  if (!credential) throw new Error('fixture credential missing');
  credential.inspectNamespaces = [];
}

const pathOf = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname;

describe('cluster landing (UI-2)', () => {
  it('lands on Projects on OpenShift', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { router } = renderApp('/c/dev-1');

    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-1/k8s/cluster/projects'), {
      timeout: COLD_START_TIMEOUT_MS,
    });
  });

  it('lands on the baseline Namespaces list when discovery fails, without refetching it in a loop', async () => {
    let discoveryRequests = 0;
    const notFound = () => {
      discoveryRequests += 1;
      return HttpResponse.json({ kind: 'Status', code: 404 }, { status: 404 });
    };
    server.use(
      http.get('*/api/clusters/:cluster/k8s/api', notFound),
      http.get('*/api/clusters/:cluster/k8s/apis', notFound),
    );
    const { router } = renderApp('/c/dev-1');

    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-1/k8s/cluster/namespaces'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(discoveryRequests).toBe(2);
  });
});

describe('cluster landing without namespace listing (NSF-3/4)', () => {
  beforeEach(() => setMockUser('alice'));

  it('opens the Pods list of the first configured namespace', async () => {
    const { router } = renderApp('/c/dev-k8s-ns');

    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-a/pods'));
  });

  it('opens the last used namespace', async () => {
    localStorage.setItem(LAST_NAMESPACE_KEY, JSON.stringify({ 'dev-k8s-ns': 'team-b' }));
    const { router } = renderApp('/c/dev-k8s-ns');

    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-b/pods'));
  });

  it('opens the first configured namespace when all namespaces were last used', async () => {
    localStorage.setItem(LAST_NAMESPACE_KEY, JSON.stringify({ 'dev-k8s-ns': '#all' }));
    const { router } = renderApp('/c/dev-k8s-ns');

    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-a/pods'));
  });

  it('words the toggle for fallback mode after the redirect, without opening the menu', async () => {
    const { router } = renderApp('/c/dev-k8s-ns');
    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-a/pods'));

    await router.navigate('/c/dev-k8s-ns/k8s/all-namespaces/pods');
    expect(await screen.findByRole('button', { name: 'Namespace: Select a namespace' })).toBeInTheDocument();
  });

  it('shows the empty state with a Go-to entry when no namespaces are configured', async () => {
    clearFallbackNamespaces();
    const { user, router } = renderApp('/c/dev-k8s-ns');

    expect(await screen.findByRole('heading', { name: 'No namespaces available', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(NO_NAMESPACES_BODY)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(pathOf(router)).toBe('/c/dev-k8s-ns');

    await user.click(screen.getByRole('button', { name: 'Namespace: Select a namespace' }));
    const list = await screen.findByRole('listbox', { name: 'Namespaces' });
    await user.type(screen.getByRole('textbox', { name: 'Search namespaces' }), 'team-a');
    await user.click(within(list).getByRole('option', { name: 'Go to namespace "team-a"' }));
    await waitFor(() => expect(pathOf(router)).toBe('/c/dev-k8s-ns/k8s/ns/team-a/pods'));
  });
});
