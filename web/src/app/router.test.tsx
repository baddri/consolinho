import { screen } from '@testing-library/react';
import { routes } from '@/app/router';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
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
    "redirects / to the overview of the user's first granted cluster",
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp('/');

      expect(
        await screen.findByRole(
          'heading',
          { name: 'Overview', level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/c/dev-1/overview');
      expect(await routeParams()).toEqual({ cluster: 'dev-1' });
    },
  );

  it('renders a namespaced resource list with its params', async () => {
    renderApp('/c/dev-1/ns/default/deployments');

    expect(await routeParams()).toEqual({ cluster: 'dev-1', namespace: 'default', resource: 'deployments' });
  });

  it('renders namespaced resource details with its params', async () => {
    renderApp('/c/dev-1/ns/default/pods/web-1');

    expect(await screen.findByRole('heading', { name: 'Resource details: web-1' })).toBeInTheDocument();
    expect(await routeParams()).toEqual({
      cluster: 'dev-1',
      namespace: 'default',
      resource: 'pods',
      name: 'web-1',
    });
  });

  it('renders cluster-scoped list and details', async () => {
    renderApp('/c/dev-1/cluster/nodes/node-a');

    expect(await routeParams()).toEqual({ cluster: 'dev-1', resource: 'nodes', name: 'node-a' });
  });

  it('redirects /admin to the users list', async () => {
    const { router } = renderApp('/admin');

    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users');
  });

  // Every admin route resolves to its lazily loaded page module (placeholders until the page tasks land).
  it.each([
    ['/admin/users', 'Users', {}],
    ['/admin/clusters', 'Clusters', {}],
    ['/admin/clusters/new', 'Register cluster', {}],
    ['/admin/clusters/dev-1/edit', 'Edit dev-1', {}],
    ['/admin/credentials', 'Credentials', {}],
    ['/admin/audit', 'Audit log', {}],
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
  // unknown one (404 state); tab selection is covered by their page tests.
  it.each([
    ['/admin/users/alice', 'alice'],
    ['/admin/users/alice/access', 'alice'],
    ['/admin/users/kube%3Aadmin', 'kube:admin'],
    ['/admin/clusters/dev-1', 'dev-1'],
    ['/admin/clusters/dev-1/credentials', 'dev-1'],
    ['/admin/clusters/dev-1/access', 'dev-1'],
  ])('renders %s', async (path, title) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
  });

  it('renders the login page outside the shell', async () => {
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Log in to FleetConsole' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Global' })).not.toBeInTheDocument();
  });

  it.each([
    '/nope',
    '/admin/unknown',
    '/admin/x/y',
    '/admin/users/alice/unknown-tab',
    '/admin/clusters/dev-1/credentials/extra',
    '/c/dev-1/ns/default/pods/web-1/extra/deep',
  ])('renders 404 for %s', async (path) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: '404: Page not found' })).toBeInTheDocument();
  });
});
