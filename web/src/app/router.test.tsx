import { screen, waitFor } from '@testing-library/react';
import { routes } from '@/app/router';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';

/** Reads the placeholder page's route-parameter description list (`<dl>`) as a plain object. */
async function routeParams(): Promise<Record<string, string>> {
  const terms = await screen.findAllByRole('term');
  const values = screen.getAllByRole('definition');
  return Object.fromEntries(terms.map((term, i) => [term.textContent, values[i]?.textContent ?? '']));
}

describe('routes', () => {
  // The admin pages are lazy route modules; load them once up front so no test pays their first import inside a
  // `findBy*` wait (that made this file flaky under load, T-0046).
  beforeAll(() => preloadLazyRoutes(routes));

  // Landing details (last cluster, no clusters) are covered in features/cluster-context.
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    "redirects / to the landing list of the user's first granted cluster",
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp('/');

      expect(
        await screen.findByRole(
          'heading',
          // admin's first granted cluster is the Kubernetes prod-k8s-1: Namespaces, not Projects.
          { name: 'Namespaces', level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/c/prod-k8s-1/k8s/cluster/namespaces');
    },
  );

  it('renders the cluster overview dashboard at /c/:cluster/overview', async () => {
    renderApp('/c/dev-1/overview');

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Cluster inventory')).toBeInTheDocument();
  });

  it.each([
    ['/c/dev-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp', 'Details'],
    ['/c/dev-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp/yaml', 'YAML'],
    ['/c/dev-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp/events', 'Events'],
  ])('renders the details page for %s on the %s tab', async (path, tab) => {
    renderApp(path);

    expect(
      await screen.findByRole('heading', { name: 'Pod web-7d4b9c8f6d-2xkqp', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders cluster-scoped details routes', async () => {
    renderApp('/c/dev-1/k8s/cluster/namespaces/shop');

    expect(await screen.findByRole('heading', { name: 'Namespace shop', level: 1 })).toBeInTheDocument();
  });

  it.each([
    ['/c/dev-1/k8s/pods?name=web', '/c/dev-1/k8s/all-namespaces/pods', '?name=web'],
    ['/c/dev-1/k8s/cluster/pods', '/c/dev-1/k8s/all-namespaces/pods', ''],
    ['/c/dev-1/k8s/unknownthings', '/c/dev-1/k8s/all-namespaces/unknownthings', ''],
  ])('redirects %s to %s', async (path, pathname, search) => {
    const { router } = renderApp(path);

    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
  });

  it('redirects /fleet to the fleet overview (Q10)', async () => {
    const { router } = renderApp('/fleet');

    expect(await screen.findByRole('heading', { name: 'Fleet overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fleet/overview');
  });

  it('opens the fleet overview to a non-admin (FLT-1)', async () => {
    setMockUser('alice');
    const { router } = renderApp('/fleet/overview');

    expect(await screen.findByRole('heading', { name: 'Fleet overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fleet/overview');
  });

  it('redirects /fleet/admin to the users list', async () => {
    const { router } = renderApp('/fleet/admin');

    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fleet/admin/users');
  });

  // Index redirects keep query and hash (legacy `/admin` cases: LegacyAdminRedirect.test.tsx).
  it.each([
    ['/fleet?x=1#h', '/fleet/overview', '?x=1', '#h'],
    ['/fleet/admin?x=1#h', '/fleet/admin/users', '?x=1', '#h'],
  ])('redirects %s to %s keeping search and hash', async (path, pathname, search, hash) => {
    const { router } = renderApp(path);

    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe('REPLACE');
  });

  // Every admin route resolves to its lazily loaded page module (placeholders until the page tasks land).
  it.each([
    ['/fleet/admin/users', 'Users', {}],
    ['/fleet/admin/clusters', 'Clusters', {}],
    ['/fleet/admin/clusters/new', 'Register cluster', {}],
    ['/fleet/admin/clusters/dev-1/edit', 'Edit dev-1', {}],
    ['/fleet/admin/credentials', 'Credentials', {}],
    ['/fleet/admin/audit', 'Audit log', {}],
  ])('renders %s', async (path, title, params) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    if (Object.keys(params).length > 0) {
      expect(await routeParams()).toEqual(params);
    } else {
      expect(screen.queryByRole('term')).not.toBeInTheDocument();
    }
  });

  // The user (T-0032) and cluster (T-0035) detail pages title themselves with the decoded route name, also for an
  // unknown one (404 state), after the kind badge's screen-reader text; tab selection is covered by their page tests.
  it.each([
    ['/fleet/admin/users/alice', 'User alice'],
    ['/fleet/admin/users/alice/access', 'User alice'],
    ['/fleet/admin/users/kube%3Aadmin', 'User kube:admin'],
    ['/fleet/admin/clusters/dev-1', 'Cluster dev-1'],
    ['/fleet/admin/clusters/dev-1/credentials', 'Cluster dev-1'],
    ['/fleet/admin/clusters/dev-1/access', 'Cluster dev-1'],
  ])('renders %s', async (path, title) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
  });

  it('renders the login page outside the shell', async () => {
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Log in to Consolinho' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Global' })).not.toBeInTheDocument();
  });

  it.each([
    '/nope',
    '/fleet/unknown',
    '/fleet/admin/unknown',
    '/fleet/admin/x/y',
    '/fleet/admin/users/alice/unknown-tab',
    '/fleet/admin/clusters/dev-1/credentials/extra',
    '/c/dev-1/k8s/ns/default/pods/web-1/extra/deep',
    '/c/dev-1/ns/default/pods',
  ])('renders 404 for %s', async (path) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: '404: Page Not Found' })).toBeInTheDocument();
  });
});
