import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { checkFilterOption } from '../dataViewTestUtils';
import { adminRoute } from '../routes';

/** All fixture usernames in server order (sorted by username). */
const ALL_USERS = ['admin', 'alice', 'bob', 'carol', 'dave', 'ines', 'pending-paul'];

/**
 * Waits until the users table shows data rows and returns it. `timeout` widens the wait for the table itself (the
 * first full-app render of the file, `COLD_START_TIMEOUT_MS`).
 */
async function findUsersTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Users' }, { timeout });
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
  // The page is a lazy route module; load it up front so no test pays its first import inside a `findBy*` (T-0046).
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it('renders every column from the fixtures', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const alice = mockDb.users.find((u) => u.username === 'alice');
    if (alice) alice.groups = ['sre', 'oncall', 'platform', 'dba', 'network'];
    renderApp('/fleet/admin/users');

    const table = await findUsersTable(COLD_START_TIMEOUT_MS);
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
    expect(screen.getByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    // The create action sits in the page heading (UX.md §3), not in the toolbar.
    expect(screen.getAllByRole('button', { name: 'Add user' })).toHaveLength(1);
    // OCP list toolbar (UX.md §5): name filter with the `/` hint, column management, pagination top and bottom.
    expect(screen.getByRole('textbox', { name: 'Filter by name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Column management' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: /Users pagination/ })).toHaveLength(2);
    expect(within(table).getByRole('columnheader', { name: /^Cluster grants/ })).toBeInTheDocument();
    // Names are OCP `ResourceLink`s with the fleet kind badge "U" (UX.md §5).
    expect(within(rowOf(table, 'admin')).getByText('U')).toHaveAttribute('title', 'User');
    expect(within(table).getByRole('link', { name: 'pending-paul' })).toHaveAttribute(
      'href',
      '/fleet/admin/users/pending-paul',
    );

    const admin = within(rowOf(table, 'admin'));
    expect(admin.getByText('Fleet Admin')).toBeInTheDocument();
    expect(admin.getByText('Admin')).toBeInTheDocument();
    // One "Admin" label; where a configuration admin's role comes from is on the details page (T-0114).
    expect(admin.queryByText('via config')).not.toBeInTheDocument();
    expect(admin.getByText('Active')).toBeInTheDocument();

    const carol = within(rowOf(table, 'carol'));
    expect(carol.getByText('Admin')).toBeInTheDocument();

    const paul = within(rowOf(table, 'pending-paul'));
    expect(paul.getByText('Pending')).toBeInTheDocument();
    expect(paul.getByText('Never')).toBeInTheDocument();
    expect(paul.getByText('User')).toBeInTheDocument();

    expect(within(rowOf(table, 'dave')).getByText('Deactivated')).toBeInTheDocument();
    expect(within(rowOf(table, 'ines')).getByText('Read only')).toBeInTheDocument();
    expect(within(rowOf(table, 'bob')).queryByText('Read only')).not.toBeInTheDocument();

    // alice: grants on prod-eu-1, staging-eu-1 and lab-1; five groups collapse after three.
    const aliceRow = within(rowOf(table, 'alice'));
    expect(aliceRow.getByRole('cell', { name: '3' })).toBeInTheDocument();
    const groups = aliceRow.getByRole('list', { name: 'Groups of alice' });
    expect(within(groups).getByText('platform')).toBeInTheDocument();
    expect(within(groups).queryByText('dba')).not.toBeInTheDocument();
    expect(within(groups).getByRole('button', { name: '+2' })).toBeInTheDocument();
    expect(aliceRow.getByText('42 minutes ago')).toBeInTheDocument();
  });

  it('explains pending users in a tooltip', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await user.hover(within(rowOf(table, 'pending-paul')).getByText('Pending'));
    expect(await screen.findByText('Pending — never logged in')).toBeInTheDocument();
  });

  it('filters by text over groups and keeps the filter in the URL', async () => {
    const { user, router } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    // Paste, not type: every keystroke re-renders the table and updates the URL, which under load pushed this test
    // past Vitest's 5 s timeout. One input event per value is ~3x faster; `delay: null` made no difference (T-0046).
    await user.click(screen.getByRole('textbox', { name: 'Filter by name' }));
    await user.paste('auditors');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['ines']));
    expect(router.state.location.search).toBe('?q=auditors');

    await user.clear(screen.getByRole('textbox', { name: 'Filter by name' }));
    await user.paste('carol op');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['carol']));
  });

  it('filters by role and status chips and clears all filters', async () => {
    const { user, router } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await checkFilterOption(user, 'Role', 'Admin');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['admin', 'carol', 'ines']));

    await user.click(screen.getByRole('button', { name: 'Filter by role' }));
    await checkFilterOption(user, 'Status', 'Active', 'Role');
    await user.click(await screen.findByRole('checkbox', { name: 'Pending' }));
    expect(router.state.location.search).toBe('?role=admin&status=pending&status=active');

    const statusChips = screen.getByRole('list', { name: 'Status' });
    expect(within(statusChips).getByText('Active')).toBeInTheDocument();
    expect(within(statusChips).getByText('Pending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(ALL_USERS));
    expect(router.state.location.search).toBe('');
  });

  it('pre-filters from a ?status=deactivated deep link', async () => {
    renderApp('/fleet/admin/users?status=deactivated');
    const table = await screen.findByRole('grid', { name: 'Users' });

    await waitFor(() => expect(visibleUsernames(table)).toEqual(['dave']));
    expect(within(screen.getByRole('list', { name: 'Status' })).getByText('Deactivated')).toBeInTheDocument();
  });

  it('filters by the read-only flag', async () => {
    const { user, router } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await checkFilterOption(user, 'Read only', 'Yes');
    await waitFor(() => expect(visibleUsernames(table)).toEqual(['ines']));
    expect(router.state.location.search).toBe('?readOnly=yes');

    await user.click(screen.getByRole('checkbox', { name: 'Yes' }));
    await user.click(screen.getByRole('checkbox', { name: 'No' }));
    await waitFor(() => expect(visibleUsernames(table)).not.toContain('ines'));
    expect(visibleUsernames(table)).toHaveLength(ALL_USERS.length - 1);
  });

  it('shows the OCP no-match row with "Clear filters" when nothing matches', async () => {
    const { user, router } = renderApp('/fleet/admin/users?q=nobody-like-this');
    const table = await screen.findByRole('grid', { name: 'Users' });

    expect(await within(table).findByText('No Users found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleUsernames(table)).toEqual(ALL_USERS));
    expect(router.state.location.search).toBe('');
  });

  it('sorts by last login in both directions with never-logged-in users last', async () => {
    const { user } = renderApp('/fleet/admin/users');
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

    await user.click(within(table).getByRole('button', { name: 'Name' }));
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
  });

  it('shows skeleton rows while loading', async () => {
    server.use(
      http.get('*/api/admin/users', async () => {
        await delay('infinite');
      }),
    );
    renderApp('/fleet/admin/users');

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
    const { user } = renderApp('/fleet/admin/users');

    expect(await screen.findByText('Could not load users')).toBeInTheDocument();
    expect(screen.getByText('The user store is unavailable.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    const table = await findUsersTable();
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
    expect(screen.queryByText('Could not load users')).not.toBeInTheDocument();
  });

  it('works for a read-only admin (ADM-2, AUD-5)', async () => {
    setMockUser('ines');
    renderApp('/fleet/admin/users');

    const table = await findUsersTable();
    expect(visibleUsernames(table)).toEqual(ALL_USERS);
  });
});
