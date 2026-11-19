import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';

/** Reads the placeholder page's route-parameter description list (`<dl>`) as a plain object. */
async function routeParams(): Promise<Record<string, string>> {
  const terms = await screen.findAllByRole('term');
  const values = screen.getAllByRole('definition');
  return Object.fromEntries(terms.map((term, i) => [term.textContent, values[i]?.textContent ?? '']));
}

describe('routes', () => {
  it('redirects / to the first cluster overview', async () => {
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/prod-eu-1/overview');
    expect(await routeParams()).toEqual({ cluster: 'prod-eu-1' });
  });

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
    ['/admin/users/alice', 'User details', { username: 'alice', tab: 'details' }],
    ['/admin/users/alice/access', 'User details', { username: 'alice', tab: 'access' }],
    ['/admin/users/kube%3Aadmin', 'User details', { username: 'kube:admin', tab: 'details' }],
    ['/admin/clusters', 'Clusters', {}],
    ['/admin/clusters/new', 'Add cluster', {}],
    ['/admin/clusters/dev-1', 'Cluster details', { name: 'dev-1', tab: 'details' }],
    ['/admin/clusters/dev-1/credentials', 'Cluster details', { name: 'dev-1', tab: 'credentials' }],
    ['/admin/clusters/dev-1/access', 'Cluster details', { name: 'dev-1', tab: 'access' }],
    ['/admin/clusters/dev-1/edit', 'Edit cluster', { name: 'dev-1' }],
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
  ])(
    'renders 404 for %s',
    async (path) => {
      renderApp(path);

      expect(await screen.findByRole('heading', { name: '404: Page not found' })).toBeInTheDocument();
    },
  );
});
