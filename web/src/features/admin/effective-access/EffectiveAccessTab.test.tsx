import { screen, waitFor, within } from '@testing-library/react';
import { apiClient, unwrap } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** Waits for the loaded clusters table of `username`. */
async function findTable(username: string, timeout?: number) {
  const table = await screen.findByRole('grid', { name: `Effective access of ${username}` }, { timeout });
  await waitFor(() => expect(within(table).queryAllByRole('button', { name: /^Details for / }).length).toBeGreaterThan(0));
  return table;
}

/** Texts of the outer rows (one per cluster): cluster link, environment, access mode, source, credential. */
function clusterRows(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole('button', { name: /^Details for / })
    .map((toggle) => {
      const row = toggle.closest('tr');
      if (!row) throw new Error('toggle outside a row');
      const [cluster, ...rest] = within(row).getAllByRole('cell').slice(1);
      if (!cluster) throw new Error('row without cells');
      return [
        within(cluster).getByRole('link').textContent,
        cluster.textContent.includes('prod') ? 'prod' : 'non-prod',
        ...rest.map((cell) => cell.textContent),
      ];
    });
}

/** Candidate rows of the expanded cluster as `[subject, priority, mode, credential, outcome]`. */
function candidateRows(cluster: string): string[][] {
  const nested = screen.getByRole('grid', { name: `Matching grants on ${cluster}` });
  return within(nested)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
}

const userNamed = (username: string) => {
  const user = mockDb.users.find((u) => u.username === username);
  if (!user) throw new Error(`no fixture user ${username}`);
  return user;
};

beforeEach(() => mockViewportWidth(1440));

describe('EffectiveAccessTab (T-0265)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'EFF-1/EFF-4: one row per cluster with mode, source and credential; groups and "as of" above',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/fleet/admin/users/carol/effective-access');
      const table = await findTable('carol', COLD_START_TIMEOUT_MS);

      expect(screen.getByRole('tab', { name: 'Effective access' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Effective access' })).toBeInTheDocument();
      // dev-2 is disabled, so carol's direct grant there gives no access (PREC-7).
      expect(clusterRows(table)).toEqual([
        ['prod-eu-1', 'prod', 'Read write', 'Direct grant', 'fleet-edit'],
        ['staging-eu-1', 'non-prod', 'Read only', 'Group platform (priority 10)', 'fleet-admin'],
      ]);
      const groups = screen.getByRole('list', { name: 'Groups of carol' });
      expect(within(groups).getByRole('link', { name: 'platform' })).toHaveAttribute(
        'href',
        '/fleet/admin/groups/platform',
      );
      expect(screen.queryByText('Never logged in')).not.toBeInTheDocument();
      expect(screen.queryByText(/Read-only flag/)).not.toBeInTheDocument();
    },
  );

  it('EFF-2: expanding lists every candidate with the outcome copy; keyboard toggles', async () => {
    userNamed('carol').groups = ['platform', 'sre'];
    const { user } = renderApp('/fleet/admin/users/carol/effective-access');
    const table = await findTable('carol');

    const toggle = within(table).getByRole('button', { name: 'Details for staging-eu-1' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(candidateRows('staging-eu-1')).toEqual([
      ['Groupsre', '100', 'Read only', 'fleet-admin', 'Applies'],
      ['Groupplatform', '10', 'Read only', 'fleet-admin', 'Lower priority than sre'],
    ]);

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('grid', { name: 'Matching grants on staging-eu-1' })).not.toBeInTheDocument();
  });

  it('EFF-2: the read-only flag narrows the winner and is explained above the table', async () => {
    userNamed('carol').isReadOnly = true;
    const { user } = renderApp('/fleet/admin/users/carol/effective-access');
    const table = await findTable('carol');

    expect(screen.getByText('Read-only flag: every cluster is narrowed to read only.')).toBeInTheDocument();
    expect(clusterRows(table)[0]).toEqual(['prod-eu-1', 'prod', 'Read only', 'Direct grant', 'fleet-edit']);
    await user.click(within(table).getByRole('button', { name: 'Details for prod-eu-1' }));
    expect(candidateRows('prod-eu-1')).toEqual([
      ['Usercarol', '—', 'Read write', 'fleet-edit', "AppliesNarrowed to read-only by the user's read-only flag"],
    ]);
  });

  it('EFF-2: a direct grant overrides the group grant (alice on staging-eu-1)', async () => {
    const { user } = renderApp('/fleet/admin/users/alice/effective-access');
    const table = await findTable('alice');

    await user.click(within(table).getByRole('button', { name: 'Details for staging-eu-1' }));
    expect(candidateRows('staging-eu-1').map((row) => [row[0], row[4]])).toEqual([
      ['Useralice', 'Applies'],
      ['Groupsre', 'Overridden by direct grant'],
    ]);
  });

  it('EFF-4: a user who never logged in shows "Never logged in" and no groups', async () => {
    renderApp('/fleet/admin/users/pending-paul/effective-access');
    await findTable('pending-paul');

    expect(screen.getByText('Never logged in')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Groups of pending-paul' })).not.toBeInTheDocument();
  });

  it('EFF-5: no clusters shows the empty state with links to Cluster access and Groups', async () => {
    renderApp('/fleet/admin/users/bob/effective-access');

    expect(await screen.findByText('bob has no access to any cluster.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cluster access' })).toHaveAttribute(
      'href',
      '/fleet/admin/users/bob/access',
    );
    expect(screen.getByRole('link', { name: 'Groups' })).toHaveAttribute('href', '/fleet/admin/groups');
  });

  it('EFF-5: an error shows the detail with a working Retry', async () => {
    server.use(
      http.get('/api/admin/users/{username}/effective-access', () =>
        problem(500, { detail: 'Database unavailable.' }),
      ),
    );
    const { user } = renderApp('/fleet/admin/users/carol/effective-access');

    expect(await screen.findByText('Could not load effective access')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findTable('carol')).toBeInTheDocument();
  });

  it('EFF-3: the tab lists exactly the clusters the switcher gives the same user', async () => {
    setMockUser('carol');
    const switcher = await unwrap(apiClient.GET('/api/clusters'));
    setMockUser('admin');
    renderApp('/fleet/admin/users/carol/effective-access');
    const table = await findTable('carol');

    const rows = within(table).getAllByRole('link').map((link) => link.textContent);
    expect(rows).toEqual(switcher.map((cluster) => cluster.name).sort());
    expect(rows).toEqual(['prod-eu-1', 'staging-eu-1']);
  });
});
