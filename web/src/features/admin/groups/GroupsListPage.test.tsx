import { screen, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, setMockHostGroups } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** Waits for the groups table with data rows and returns it. */
async function findGroupsTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Groups' }, { timeout });
  await within(table).findByRole('link', { name: 'ghost-team' });
  return table;
}

/** Group names of the visible rows, in display order. */
function visibleGroups(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .flatMap((row) =>
      within(row)
        .queryAllByRole('link')
        .map((link) => link.textContent),
    );
}

/** The table row of `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const row = within(table).getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => mockViewportWidth(1440));

describe('GroupsListPage (GPG-1, GPG-4, Q7)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('lists host and grant-only groups without system groups', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/fleet/admin/groups');

    const table = await findGroupsTable(COLD_START_TIMEOUT_MS);
    expect(screen.getByRole('heading', { name: 'Groups', level: 1 })).toBeInTheDocument();
    expect(visibleGroups(table)).toEqual(['auditors', 'ghost-team', 'platform', 'sre']);
    for (const header of ['Name', 'Users', 'Clusters']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(`^${header}`) })).toBeInTheDocument();
    }
    const sre = rowOf(table, 'sre');
    expect(within(sre).getByText('G')).toHaveAttribute('title', 'Group');
    expect(within(sre).getByRole('link', { name: 'sre' })).toHaveAttribute('href', '/fleet/admin/groups/sre');
    expect(within(sre).getByText('3')).toBeInTheDocument();
    expect(within(sre).queryByText('Not found on host cluster')).not.toBeInTheDocument();
    expect(within(rowOf(table, 'ghost-team')).getByText('Not found on host cluster')).toBeInTheDocument();
    expect(screen.queryByText(/Could not list groups/)).not.toBeInTheDocument();
  });

  it("explains a grant-only group's unknown member count", async () => {
    const { user } = renderApp('/fleet/admin/groups');

    const table = await findGroupsTable();
    await user.hover(within(rowOf(table, 'ghost-team')).getByText('-'));
    expect(await screen.findByText("The group doesn't exist on the host cluster.")).toBeInTheDocument();
    expect(screen.queryByText(/Member count unavailable/)).not.toBeInTheDocument();
  });

  it('filters by name from the URL', async () => {
    renderApp('/fleet/admin/groups?q=plat');

    const table = await screen.findByRole('grid', { name: 'Groups' });
    await within(table).findByRole('link', { name: 'platform' });
    expect(visibleGroups(table)).toEqual(['platform']);
    expect(screen.getByRole('textbox', { name: 'Filter by name' })).toHaveValue('plat');
  });

  it('warns and shows grant-only groups with unknown counts when the host listing is forbidden', async () => {
    setMockHostGroups('forbidden');
    const { user } = renderApp('/fleet/admin/groups');

    const table = await findGroupsTable();
    expect(
      screen.getByText('Could not list groups on the host cluster. Only groups that have cluster access are shown.'),
    ).toBeInTheDocument();
    expect(visibleGroups(table)).toEqual(['ghost-team', 'sre']);
    const sre = rowOf(table, 'sre');
    expect(within(sre).queryByText('Not found on host cluster')).not.toBeInTheDocument();
    await user.hover(within(sre).getByText('-'));
    expect(await screen.findByText(/Member count unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("The group doesn't exist on the host cluster.")).not.toBeInTheDocument();
  });

  it('shows the empty state with the host permission hint when there is no group', async () => {
    setMockHostGroups([]);
    mockDb.grants = mockDb.grants.filter((grant) => grant.subjectKind !== 'group');
    renderApp('/fleet/admin/groups');

    expect(await screen.findByRole('heading', { name: 'No Groups found' })).toBeInTheDocument();
    expect(screen.getByText(/groups\.user\.openshift\.io/)).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
