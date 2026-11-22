import { screen, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { expandSection, openSidebar } from '@/test/sidebar';
import { adminKeys, adminRoute, useAdminAccess } from './index';

/** Records the path of every request the app makes while the test runs (MSW life-cycle spy). */
function spyOnRequests(): string[] {
  const paths: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    paths.push(new URL(request.url).pathname);
  };
  server.events.on('request:start', listener);
  onTestFinished(() => server.events.removeListener('request:start', listener));
  return paths;
}

describe('admin area access (ADM-3)', () => {
  // React Router loads a matched route's lazy page module even when RequireAdmin then hides it; load them up front so
  // no test pays the first import inside a `findBy*` wait (T-0046).
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'shows the no-access page to a non-admin without calling admin endpoints',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser('alice');
      const requests = spyOnRequests();
      renderApp('/admin/users');

      expect(
        await screen.findByRole(
          'heading',
          { name: "You don't have access to Fleet administration", level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Ask a Consolinho administrator if you need access.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument();
      expect(requests).toContain('/api/auth/me');
      expect(requests.filter((path) => path.startsWith('/api/admin'))).toEqual([]);
    },
  );

  it('also hides unknown admin paths behind the no-access page for a non-admin', async () => {
    setMockUser('alice');
    renderApp('/admin/x/y');

    expect(
      await screen.findByRole('heading', { name: "You don't have access to Fleet administration" }),
    ).toBeInTheDocument();
  });

  it('hides the Fleet administration sidebar section from a non-admin', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/prod-eu-1/overview');

    const nav = await openSidebar(user);
    expect(within(nav).getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Fleet administration' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows the Fleet administration sidebar section with all admin pages to an admin', async () => {
    const { user } = renderApp('/admin/clusters');

    expect(await screen.findByRole('heading', { name: 'Clusters', level: 1 })).toBeInTheDocument();
    const nav = await openSidebar(user);
    // Collapsed like every OCP nav section (T-0119), but marked as holding the current page.
    const section = within(nav).getByRole('button', { name: 'Fleet administration' });
    expect(section).toHaveAttribute('aria-expanded', 'false');
    expect(section.closest('li')).toHaveClass('pf-m-current');
    await expandSection(user, nav, 'Fleet administration');
    const links = {
      Users: '/admin/users',
      Clusters: '/admin/clusters',
      Credentials: '/admin/credentials',
      'Audit log': '/admin/audit',
    };
    for (const [name, href] of Object.entries(links)) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(nav).getByRole('link', { name: 'Clusters' })).toHaveAttribute('aria-current', 'page');
  });

  it('lets a read-only admin into the admin area', async () => {
    setMockUser('ines');
    renderApp('/admin/audit');

    expect(await screen.findByRole('heading', { name: 'Audit log', level: 1 })).toBeInTheDocument();
  });
});

/** Renders `useAdminAccess()` as text so the test can read it. */
function AccessProbe() {
  const { canMutate, readOnlyReason } = useAdminAccess();
  return (
    <p>
      canMutate={String(canMutate)} reason={readOnlyReason ?? '-'}
    </p>
  );
}

describe('useAdminAccess (ADM-2)', () => {
  it.each([
    ['admin', 'canMutate=true reason=-'],
    ['ines', 'canMutate=false reason=Your account is read-only'],
    ['alice', 'canMutate=false reason=Administrator role required'],
  ])('derives access for %s from the session', async (username, expected) => {
    setMockUser(username);
    renderWithProviders(<AccessProbe />);

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});

describe('adminKeys', () => {
  it('mirrors the endpoint URLs under the admin prefix', () => {
    expect(adminKeys.all).toEqual(['api', 'admin']);
    expect(adminKeys.users()).toEqual(['api', 'admin', 'users']);
    expect(adminKeys.user('alice')).toEqual(['api', 'admin', 'users', 'alice']);
    expect(adminKeys.userGrants('alice')).toEqual(['api', 'admin', 'users', 'alice', 'grants']);
    expect(adminKeys.clusters()).toEqual(['api', 'admin', 'clusters']);
    expect(adminKeys.cluster('dev-1')).toEqual(['api', 'admin', 'clusters', 'dev-1']);
    expect(adminKeys.clusterCredentials('dev-1')).toEqual([
      'api',
      'admin',
      'clusters',
      'dev-1',
      'credentials',
    ]);
    expect(adminKeys.clusterGrants('dev-1')).toEqual(['api', 'admin', 'clusters', 'dev-1', 'grants']);
    expect(adminKeys.credentials()).toEqual(['api', 'admin', 'credentials']);
    expect(adminKeys.audit({ category: 'users', limit: 50 })).toEqual([
      'api',
      'admin',
      'audit',
      { category: 'users', limit: 50 },
    ]);
  });
});
