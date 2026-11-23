import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminKeys } from '../queryKeys';
import { adminRoute } from '../routes';

/** Waits for the loaded Details tab. */
async function findDetails(timeout?: number) {
  return screen.findByLabelText('User details', { selector: 'dl' }, { timeout });
}

/** Reads both details columns of the Details tab as `term → text`. */
function details(): Record<string, string> {
  const panel = screen.getByRole('tabpanel', { name: 'Details' });
  const terms = within(panel).getAllByRole('term');
  const values = within(panel).getAllByRole('definition');
  return Object.fromEntries(terms.map((term, i) => [term.textContent, values[i]?.textContent ?? '']));
}

/** Texts that must never reach an admin (`UX.md` §11). */
const INTERNAL_COPY = /CP\d|proxy|configuration \(|user list/;

beforeEach(() => mockViewportWidth(1440));
afterEach(() => server.events.removeAllListeners());

describe('UserDetailPage (T-0032)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'USR-7: shows header, all details and the audit link for alice',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/fleet/admin/users/alice');
      const list = await findDetails(COLD_START_TIMEOUT_MS);

      expect(screen.getByRole('heading', { name: 'alice', level: 1 })).toBeInTheDocument();
      // OCP details heading: large kind badge, name and status; no subtitle (the display name is a details item).
      expect(screen.queryByText('Alice Example', { selector: 'p' })).not.toBeInTheDocument();
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(crumbs).getByRole('link', { name: 'Users' })).toHaveAttribute(
        'href',
        '/fleet/admin/users',
      );
      expect(within(crumbs).getByText('User details')).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('heading', { name: 'User details', level: 2 })).toBeInTheDocument();
      // One grant entry point on the page (T-0118 #9): "Grant access" on the Cluster access tab.
      expect(screen.queryByRole('button', { name: /Grant access/ })).not.toBeInTheDocument();

      expect(
        within(list)
          .getAllByRole('term')
          .map((term) => term.textContent),
      ).toEqual(['Username', 'Display name', 'Role', 'Status', 'Read only']);
      const values = details();
      expect(values).toMatchObject({
        Username: 'alice',
        Role: 'User',
        Status: 'Active',
        'Display name': 'Alice Example',
        'Groups last seen': 'sre',
        'Cluster grants': '4',
      });
      expect(values['Read only']).toBe(
        "NoRead-only users can't change anything on any cluster or in Fleet administration.",
      );
      expect(values.Created).toMatch(/ago by alice$/);
      expect(values['Last login']).toMatch(/ago$/);
      expect(document.body.textContent).not.toMatch(INTERNAL_COPY);
      expect(screen.getByRole('link', { name: 'View audit entries' })).toHaveAttribute(
        'href',
        '/fleet/admin/audit?user=alice',
      );
    },
  );

  it('USR-6: a configuration admin shows where the role comes from, in user language', async () => {
    renderApp('/fleet/admin/users/admin');
    await findDetails();

    const labels = screen.getByRole('list', { name: 'User labels' });
    expect(within(labels).getByText('Admin')).toBeInTheDocument();
    expect(details().Role).toBe('AdministratorAdmin through group fleetconsole-admins');
    expect(document.body.textContent).not.toMatch(INTERNAL_COPY);
  });

  it('USR-6: an admin from the deployment user list and a read-only admin', async () => {
    const ines = mockDb.users.find((u) => u.username === 'ines');
    if (!ines) throw new Error('no ines fixture');
    ines.adminConfigurationSource = { kind: 'userList', group: null };
    renderApp('/fleet/admin/users/ines');
    await findDetails();

    const labels = screen.getByRole('list', { name: 'User labels' });
    expect(within(labels).getByText('Read only')).toBeInTheDocument();
    expect(details().Role).toContain('Admin set in the deployment settings');
    expect(document.body.textContent).not.toMatch(INTERNAL_COPY);
  });

  it('tabs are URL-driven', async () => {
    const { user, router } = renderApp('/fleet/admin/users/alice/access');

    const access = await screen.findByRole('tab', { name: 'Cluster access' });
    expect(access).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Cluster access' })).toBeInTheDocument();
    expect(screen.queryByLabelText('User details')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users/alice'));
    expect(await findDetails()).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Cluster access' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users/alice/access'));
  });

  it('the Actions menu offers the list items with their reasons and opens the dialog', async () => {
    // Signed in as `admin` (configuration admin): own Demote/Deactivate are disabled.
    const { user } = renderApp('/fleet/admin/users/admin');
    await findDetails();

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = await screen.findAllByRole('menuitem');
    // No "Grant access to clusters": the Cluster access tab's "Grant access" is the page's one entry point.
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
      'Admin through group fleetconsole-admins. Remove it in the deployment settings.',
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

    renderApp('/fleet/admin/users/system%3Asa%40corp');

    expect(await screen.findByRole('heading', { name: 'system:sa@corp', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Encoded Name')).toBeInTheDocument();
    expect(paths).toContain('/api/admin/users/system%3Asa%40corp');
  });

  it('QG-3: an unknown user shows a not-found state with a way back', async () => {
    const { user, router } = renderApp('/fleet/admin/users/nobody');

    expect(await screen.findByRole('heading', { name: 'User nobody not found' })).toBeInTheDocument();
    expect(screen.queryByText(/Loading user/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to Users' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users'));
  });

  it('QG-3: other errors show the detail with a working Retry', async () => {
    server.use(
      http.get('/api/admin/users/{username}', () => problem(500, { detail: 'Database unavailable.' })),
    );
    const { user } = renderApp('/fleet/admin/users/alice');

    expect(await screen.findByText('Could not load user')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/Loading user/)).not.toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findDetails()).toBeInTheDocument();
  });

  it('T-0051: a failed background refetch keeps the loaded user', async () => {
    const { queryClient } = renderApp('/fleet/admin/users/alice');
    await findDetails();

    server.use(
      http.get('/api/admin/users/{username}', () => problem(500, { detail: 'Database unavailable.' })),
    );
    await queryClient.invalidateQueries({ queryKey: adminKeys.user('alice') });

    await waitFor(() => expect(queryClient.getQueryState(adminKeys.user('alice'))?.status).toBe('error'));
    expect(screen.getByLabelText('User details', { selector: 'dl' })).toBeInTheDocument();
    expect(screen.queryByText('Could not load user')).not.toBeInTheDocument();
  });

  it('T-0051: a refetch that no longer finds the user toasts once and returns to the list', async () => {
    const { router, queryClient } = renderApp('/fleet/admin/users/alice');
    await findDetails();

    server.use(
      http.get('/api/admin/users/{username}', () =>
        problem(404, { code: 'Users.NotFound', detail: 'User alice was not found.' }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: adminKeys.user('alice') });

    expect(await screen.findByText('User alice no longer exists')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getAllByText('User alice no longer exists')).toHaveLength(1);
  });
});
