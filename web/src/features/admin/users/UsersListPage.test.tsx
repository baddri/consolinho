import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';

/** All fixture usernames in server order (sorted by username). */
const ALL_USERS = ['admin', 'alice', 'bob', 'carol', 'dave', 'ines', 'pending-paul'];

/** Waits until the users table shows data rows and returns it. */
async function findUsersTable() {
  const table = await screen.findByRole('grid', { name: 'Users' });
  await within(table).findByRole('link', { name: 'admin' });
  return table;
}

/** Usernames of the visible rows, in display order. */
function visibleUsernames(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .flatMap((row) =>
      within(row)
        .queryAllByRole('link')
        .map((link) => link.textContent),
    );
}

/** The table row of `username`. */
function rowOf(table: HTMLElement, username: string): HTMLElement {
  const row = within(table).getByRole('link', { name: username }).closest('tr');
  if (!row) throw new Error(`no row for ${username}`);
  return row;
}

beforeEach(() => mockViewportWidth(1440));

describe('UsersListPage (USR-1)', () => {
  it('renders every column from the fixtures', async () => {
    const alice = mockDb.users.find((u) => u.username === 'alice');
    if (alice) alice.groups = ['sre', 'oncall', 'platform', 'dba', 'network'];
    renderApp('/admin/users');

    const table = await findUsersTable();
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
    expect(screen.getByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'pending-paul' })).toHaveAttribute(
      'href',
      '/admin/users/pending-paul',
    );

    const admin = within(rowOf(table, 'admin'));
    expect(admin.getByText('Fleet Admin')).toBeInTheDocument();
    expect(admin.getByText('Admin')).toBeInTheDocument();
    expect(admin.getByText('via config')).toBeInTheDocument();
    expect(admin.getByText('Active')).toBeInTheDocument();

    const carol = within(rowOf(table, 'carol'));
    expect(carol.getByText('Admin')).toBeInTheDocument();
    expect(carol.queryByText('via config')).not.toBeInTheDocument();

    const paul = within(rowOf(table, 'pending-paul'));
    expect(paul.getByText('Pending')).toBeInTheDocument();
    expect(paul.getByText('Never')).toBeInTheDocument();
    expect(paul.getByText('User')).toBeInTheDocument();

    expect(within(rowOf(table, 'dave')).getByText('Deactivated')).toBeInTheDocument();
    expect(within(rowOf(table, 'ines')).getByText('Read only')).toBeInTheDocument();
    expect(within(rowOf(table, 'bob')).queryByText('Read only')).not.toBeInTheDocument();

    // alice: grants on prod-eu-1 and staging-eu-1; five groups collapse after three.
    const aliceRow = within(rowOf(table, 'alice'));
    expect(aliceRow.getByRole('cell', { name: '2' })).toBeInTheDocument();
    const groups = aliceRow.getByRole('list', { name: 'Groups of alice' });
    expect(within(groups).getByText('platform')).toBeInTheDocument();
    expect(within(groups).queryByText('dba')).not.toBeInTheDocument();
    expect(within(groups).getByRole('button', { name: '+2' })).toBeInTheDocument();
    expect(aliceRow.getByText('42 minutes ago')).toBeInTheDocument();
  });

  it('explains config-sourced admins and pending users in tooltips', async () => {
    const { user } = renderApp('/admin/users');
    const table = await findUsersTable();

    await user.hover(within(rowOf(table, 'admin')).getByText('via config'));
    expect(
      await screen.findByText('Admin granted by configuration (group fleetconsole-admins)'),
    ).toBeInTheDocument();

    await user.hover(within(rowOf(table, 'pending-paul')).getByText('Pending'));
    expect(await screen.findByText('Pending — never logged in')).toBeInTheDocument();
  });

  it('filters by text over groups and keeps the filter in the URL', async () => {
    const { user, router } = renderApp('/admin/users');
    const table = await findUsersTable();

    await user.type(screen.getByRole('textbox', { name: 'Search users' }), 'auditors');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['ines']));
    expect(router.state.location.search).toBe('?q=auditors');

    await user.clear(screen.getByRole('textbox', { name: 'Search users' }));
    await user.type(screen.getByRole('textbox', { name: 'Search users' }), 'carol op');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['carol']));
  });

  it('filters by role and status chips and clears all filters', async () => {
    const { user, router } = renderApp('/admin/users');
    const table = await findUsersTable();

    await user.click(screen.getByRole('button', { name: 'Filter by Role' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Admin' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['admin', 'carol', 'ines']));

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Active' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Pending' }));
    expect(router.state.location.search).toBe('?role=admin&status=active&status=pending');

    const toolbar = screen.getByRole('group', { name: 'Users toolbar' });
    const statusChips = within(toolbar).getByRole('list', { name: 'Status' });
    expect(within(statusChips).getByText('Active')).toBeInTheDocument();
    expect(within(statusChips).getByText('Pending')).toBeInTheDocument();

    await user.click(within(toolbar).getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(ALL_USERS));
    expect(router.state.location.search).toBe('');
  });

  it('pre-filters from a ?status=deactivated deep link', async () => {
    renderApp('/admin/users?status=deactivated');
    const table = await screen.findByRole('grid', { name: 'Users' });

    await waitFor(() => expect(visibleUsernames(table)).toEqual(['dave']));
    const toolbar = screen.getByRole('group', { name: 'Users toolbar' });
    expect(
      within(within(toolbar).getByRole('list', { name: 'Status' })).getByText('Deactivated'),
    ).toBeInTheDocument();
  });

  it('filters by the read-only flag', async () => {
    const { user, router } = renderApp('/admin/users');
    const table = await findUsersTable();

    await user.click(screen.getByRole('button', { name: 'Filter by Read only' }));
    await user.click(await screen.findByRole('option', { name: 'Yes' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['ines']));
    expect(router.state.location.search).toBe('?readOnly=yes');

    await user.click(screen.getByRole('button', { name: 'Filter by Read only' }));
    await user.click(await screen.findByRole('option', { name: 'No' }));
    await waitFor(() => expect(visibleUsernames(table)).not.toContain('ines'));
    expect(visibleUsernames(table)).toHaveLength(ALL_USERS.length - 1);
  });

  it('shows "No users match" with Clear filters when nothing matches', async () => {
    const { user, router } = renderApp('/admin/users?q=nobody-like-this');
    const table = await screen.findByRole('grid', { name: 'Users' });

    expect(await within(table).findByRole('heading', { name: 'No users match' })).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(ALL_USERS));
    expect(router.state.location.search).toBe('');
  });

  it('sorts by last login in both directions with never-logged-in users last', async () => {
    const { user } = renderApp('/admin/users');
    const table = await findUsersTable();
    const header = within(table).getByRole('button', { name: 'Last login' });

    await user.click(header);
    expect(visibleUsernames(table)).toEqual([
      'dave',
      'bob',
      'ines',
      'carol',
      'alice',
      'admin',
      'pending-paul',
    ]);

    await user.click(header);
    expect(visibleUsernames(table)).toEqual([
      'admin',
      'alice',
      'carol',
      'ines',
      'bob',
      'dave',
      'pending-paul',
    ]);

    await user.click(within(table).getByRole('button', { name: 'Username' }));
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
  });

  it('shows skeleton rows while loading', async () => {
    server.use(
      http.get('*/api/admin/users', async () => {
        await delay('infinite');
      }),
    );
    renderApp('/admin/users');

    const table = await screen.findByRole('grid', { name: 'Users' });
    expect(within(table).getByText('Loading')).toBeInTheDocument();
  });

  it('shows the error with Retry and recovers', async () => {
    server.use(
      http.get(
        '*/api/admin/users',
        () => problem(500, { title: 'Internal Server Error', detail: 'The user store is unavailable.' }),
        { once: true },
      ),
    );
    const { user } = renderApp('/admin/users');

    expect(await screen.findByText('Could not load users')).toBeInTheDocument();
    expect(screen.getByText('The user store is unavailable.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    const table = await findUsersTable();
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
    expect(screen.queryByText('Could not load users')).not.toBeInTheDocument();
  });

  it('works for a read-only admin (ADM-2, AUD-5)', async () => {
    setMockUser('ines');
    renderApp('/admin/users');

    const table = await findUsersTable();
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
  });
});
