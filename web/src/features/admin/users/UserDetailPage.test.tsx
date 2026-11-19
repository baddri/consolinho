import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** Waits for the loaded Details tab. */
async function findDetails(timeout?: number) {
  return screen.findByLabelText('User details', { selector: 'dl' }, { timeout });
}

/** Reads the details description list as `term → text`. */
function detailsOf(list: HTMLElement): Record<string, string> {
  const terms = within(list).getAllByRole('term');
  const values = within(list).getAllByRole('definition');
  return Object.fromEntries(terms.map((term, i) => [term.textContent, values[i]?.textContent ?? '']));
}

beforeEach(() => mockViewportWidth(1440));
afterEach(() => server.events.removeAllListeners());

describe('UserDetailPage (T-0032)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'USR-7: shows header, all details and the audit link for alice',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/admin/users/alice');
      const list = await findDetails(COLD_START_TIMEOUT_MS);

      expect(screen.getByRole('heading', { name: 'alice', level: 1 })).toBeInTheDocument();
      expect(screen.getByText('Alice Example', { selector: 'p' })).toBeInTheDocument();
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(crumbs).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');

      const details = detailsOf(list);
      expect(details).toMatchObject({
        Role: 'User',
        Status: 'Active',
        'Display name': 'Alice Example',
        'Groups last seen': 'sre',
        'Cluster grants': '2',
      });
      expect(details['Read only']).toMatch(/^No.*Read-only applies on every cluster regardless of grant mode/);
      expect(details.Created).toMatch(/ago by alice$/);
      expect(details['Last login']).toMatch(/ago$/);
      expect(within(list).getByRole('link', { name: 'View audit entries' })).toHaveAttribute(
        'href',
        '/admin/audit?user=alice',
      );
    },
  );

  it('USR-6: a configuration admin is labelled with the source', async () => {
    renderApp('/admin/users/admin');
    const list = await findDetails();

    const labels = screen.getByRole('list', { name: 'User labels' });
    expect(within(labels).getByText('Admin')).toBeInTheDocument();
    expect(within(labels).getByText('Admin via configuration (group fleetconsole-admins)')).toBeInTheDocument();
    expect(detailsOf(list).Role).toBe('Administrator — granted by configuration (group fleetconsole-admins)');
  });

  it('tabs are URL-driven', async () => {
    const { user, router } = renderApp('/admin/users/alice/access');

    const access = await screen.findByRole('tab', { name: 'Cluster access' });
    expect(access).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Cluster access' })).toBeInTheDocument();
    expect(screen.queryByLabelText('User details')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users/alice'));
    expect(await findDetails()).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Cluster access' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users/alice/access'));
  });

  it('the Actions menu offers the list items with their reasons and opens the dialog', async () => {
    // Signed in as `admin` (configuration admin): own Demote/Deactivate are disabled.
    const { user } = renderApp('/admin/users/admin');
    await findDetails();

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Promote to administrator',
      'Demote to user',
      'Set read-only',
      'Deactivate',
    ]);
    const demote = screen.getByRole('menuitem', { name: 'Demote to user' });
    expect(demote).toHaveAttribute('aria-disabled', 'true');
    await user.hover(demote);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Admin granted by configuration (group fleetconsole-admins). Change the configuration to remove.',
    );
    expect(screen.getByRole('menuitem', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('menuitem', { name: 'Set read-only' }));
    expect(await screen.findByRole('dialog', { name: 'Make admin read-only?' })).toBeInTheDocument();
  });

  it('ADR-0013: loads a username with ":" and "@" through an encoded path', async () => {
    const alice = mockDb.users.find((u) => u.username === 'alice');
    if (!alice) throw new Error('no alice fixture');
    mockDb.users.push({ ...alice, username: 'system:sa@corp', displayName: 'Encoded Name' });
    const paths: string[] = [];
    server.events.on('request:start', ({ request }) => {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/admin/users/')) paths.push(path);
    });

    renderApp('/admin/users/system%3Asa%40corp');

    expect(await screen.findByRole('heading', { name: 'system:sa@corp', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Encoded Name', { selector: 'p' })).toBeInTheDocument();
    expect(paths).toContain('/api/admin/users/system%3Asa%40corp');
  });

  it('QG-3: an unknown user shows a not-found state with a way back', async () => {
    const { user, router } = renderApp('/admin/users/nobody');

    expect(await screen.findByRole('heading', { name: 'User nobody not found' })).toBeInTheDocument();
    expect(screen.queryByText(/Loading user/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to Users' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'));
  });

  it('QG-3: other errors show the detail with a working Retry', async () => {
    server.use(http.get('/api/admin/users/{username}', () => problem(500, { detail: 'Database unavailable.' })));
    const { user } = renderApp('/admin/users/alice');

    expect(await screen.findByText('Could not load user')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/Loading user/)).not.toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findDetails()).toBeInTheDocument();
  });
});
