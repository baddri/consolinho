import { screen, waitFor } from '@testing-library/react';
import { renderApp } from '@/test/render';

describe('legacy /admin redirect (FLEET-6)', () => {
  it('sends /admin to the fleet users list', async () => {
    const { router } = renderApp('/admin');

    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fleet/admin/users');
  });

  it('keeps the rest, query and hash and replaces the history entry', async () => {
    const { router } = renderApp('/admin/clusters/prod-eu-1/credentials?x=1#y');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/fleet/admin/clusters/prod-eu-1/credentials'),
    );
    expect(router.state.location.search).toBe('?x=1');
    expect(router.state.location.hash).toBe('#y');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('lands a pre-CP3.7 login returnUrl on the new path', async () => {
    const { router } = renderApp('/admin/users');

    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users'));
  });

  it('shows the admin 404 for an unknown rest', async () => {
    const { router } = renderApp('/admin/nope');

    expect(await screen.findByRole('heading', { name: '404: Page Not Found' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fleet/admin/nope');
  });

  // Bare `/admin` goes through the `/fleet/admin` index redirect, which used to drop the query (fix round 1).
  it.each([
    ['/admin?mockUser=admin', '/fleet/admin/users', '?mockUser=admin', ''],
    ['/admin?x=1#h', '/fleet/admin/users', '?x=1', '#h'],
    ['/admin/clusters?x=1', '/fleet/admin/clusters', '?x=1', ''],
  ])('redirects %s to %s keeping search and hash', async (path, pathname, search, hash) => {
    const { router } = renderApp(path);

    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
