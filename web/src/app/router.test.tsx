import { screen, waitFor } from '@testing-library/react';
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
    "redirects / to the Projects list of the user's first granted cluster",
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp('/');

      // Projects get their descriptor in T-0078; until then the page is the "not supported" state.
      expect(
        await screen.findByRole(
          'heading',
          { name: 'Kind not supported yet', level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/cluster/projects');
    },
  );

  it('keeps overview as an unlisted placeholder', async () => {
    renderApp('/c/dev-1/overview');

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(await routeParams()).toEqual({ cluster: 'dev-1' });
  });

  it.each([
    ['/c/dev-1/k8s/ns/shop/pods/web-1', { plural: 'pods', namespace: 'shop', tab: 'details' }],
    ['/c/dev-1/k8s/ns/shop/pods/web-1/yaml', { plural: 'pods', namespace: 'shop', tab: 'yaml' }],
    ['/c/dev-1/k8s/ns/shop/pods/web-1/events', { plural: 'pods', namespace: 'shop', tab: 'events' }],
    ['/c/dev-1/k8s/cluster/namespaces/web-1', { plural: 'namespaces', tab: 'details' }],
  ])('renders the details placeholder for %s', async (path, params) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Resource details: web-1' })).toBeInTheDocument();
    expect(await routeParams()).toEqual({ cluster: 'dev-1', name: 'web-1', ...params });
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

    expect(await screen.findByRole('heading', { name: 'Log in to Consolinho' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Global' })).not.toBeInTheDocument();
  });

  it.each([
    '/nope',
    '/admin/unknown',
    '/admin/x/y',
    '/admin/users/alice/unknown-tab',
    '/admin/clusters/dev-1/credentials/extra',
    '/c/dev-1/k8s/ns/default/pods/web-1/extra/deep',
    '/c/dev-1/ns/default/pods',
  ])('renders 404 for %s', async (path) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { name: '404: Page not found' })).toBeInTheDocument();
  });
});
