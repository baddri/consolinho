import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** All fixture cluster names in display order (sorted by name). */
const ALL_CLUSTERS = ['dev-1', 'dev-2', 'lab-1', 'prod-eu-1', 'prod-us-1', 'staging-eu-1'];

/** Waits until the clusters table shows data rows and returns it (`timeout` for the file's cold start). */
async function findClustersTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Clusters' }, { timeout });
  await within(table).findByRole('link', { name: 'prod-eu-1' });
  return table;
}

/** Cluster names of the visible rows, in display order. */
function visibleClusters(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .flatMap((row) =>
      within(row)
        .queryAllByRole('link')
        .map((link) => link.textContent),
    );
}

/** The table row of cluster `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const row = within(table).getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => mockViewportWidth(1440));

describe('ClustersListPage (CLU-7)', () => {
  // The page is a lazy route module; load it up front so no test pays its first import inside a `findBy*` (T-0046).
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('renders every column from the fixtures', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/admin/clusters');

    const table = await findClustersTable(COLD_START_TIMEOUT_MS);
    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
    expect(screen.getByRole('heading', { name: 'Clusters', level: 1 })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'prod-eu-1' })).toHaveAttribute(
      'href',
      '/admin/clusters/prod-eu-1',
    );

    const prodEu = rowOf(table, 'prod-eu-1');
    const prodEuCells = within(prodEu);
    expect(prodEuCells.getByText('Production EU 1')).toBeInTheDocument();
    expect(prodEuCells.getByText('prod')).toBeInTheDocument();
    expect(prodEu).toHaveTextContent('https://api.prod-eu-1.example.com:6443');
    expect(prodEuCells.getByText('Enabled')).toBeInTheDocument();
    expect(prodEuCells.getByText('CA bundle')).toBeInTheDocument();
    expect(prodEuCells.getByText('Expires soon')).toBeInTheDocument();
    expect(prodEuCells.getByText('Passed')).toBeInTheDocument();
    expect(prodEuCells.getByText('2 days ago')).toBeInTheDocument();
    expect(prodEu).toHaveTextContent('fleet-view');
    expect(prodEuCells.getByRole('cell', { name: '3' })).toBeInTheDocument();

    const prodUs = within(rowOf(table, 'prod-us-1'));
    expect(prodUs.getByText('System trust')).toBeInTheDocument();
    expect(prodUs.getByText('Expired')).toBeInTheDocument();
    expect(prodUs.getByText('Failed')).toBeInTheDocument();

    const staging = within(rowOf(table, 'staging-eu-1'));
    expect(staging.getByText('TLS not verified')).toBeInTheDocument();
    expect(staging.getByText('Settings changed since last test')).toBeInTheDocument();
    expect(staging.getByText('No expiry')).toBeInTheDocument();

    const dev2 = rowOf(table, 'dev-2');
    expect(dev2).toHaveClass('pf-v6-u-text-color-subtle');
    expect(within(dev2).getByText('Disabled')).toBeInTheDocument();
    expect(within(dev2).getByText('Never tested')).toBeInTheDocument();
    expect(rowOf(table, 'dev-1')).not.toHaveClass('pf-v6-u-text-color-subtle');

    // lab-1 has no credentials: count 0 and no expiry icon.
    expect(within(rowOf(table, 'lab-1')).queryByRole('img')).not.toBeInTheDocument();
  });

  it('explains the worst credential expiry in a tooltip', async () => {
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await user.hover(within(rowOf(table, 'prod-eu-1')).getByText('Expires soon'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('A credential token expires soon');
  });

  it('filters by text and environment and keeps the filters in the URL', async () => {
    const { user, router } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await user.click(screen.getByRole('textbox', { name: 'Search clusters' }));
    await user.paste('api.prod');
    await waitFor(() => expect(visibleClusters(table)).toEqual(['prod-eu-1', 'prod-us-1']));
    expect(router.state.location.search).toBe('?q=api.prod');

    await user.clear(screen.getByRole('textbox', { name: 'Search clusters' }));
    await user.paste('Development');
    await waitFor(() => expect(visibleClusters(table)).toEqual(['dev-1', 'dev-2']));

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Disabled' }));
    await waitFor(() => expect(visibleClusters(table)).toEqual(['dev-2']));
    expect(router.state.location.search).toBe('?q=Development&status=disabled');

    const toolbar = screen.getByRole('group', { name: 'Clusters toolbar' });
    await user.click(within(toolbar).getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(visibleClusters(table)).toEqual(ALL_CLUSTERS));
  });

  it('pre-filters from a ?env=production deep link', async () => {
    renderApp('/admin/clusters?env=production');
    const table = await findClustersTable();

    await waitFor(() => expect(visibleClusters(table)).toEqual(['prod-eu-1', 'prod-us-1']));
    const toolbar = screen.getByRole('group', { name: 'Clusters toolbar' });
    expect(
      within(within(toolbar).getByRole('list', { name: 'Environment' })).getByText('Production'),
    ).toBeInTheDocument();
  });

  it('shows the no-match state with "Clear all filters" when nothing matches', async () => {
    const { user } = renderApp('/admin/clusters?q=nothing-like-this');
    const table = await screen.findByRole('grid', { name: 'Clusters' });

    expect(await within(table).findByRole('heading', { name: 'No results match the filter criteria' })).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(visibleClusters(table)).toEqual(ALL_CLUSTERS));
  });

  it('shows the empty state with Register cluster when no cluster exists', async () => {
    mockDb.clusters = [];
    const { user, router } = renderApp('/admin/clusters');
    const table = await screen.findByRole('grid', { name: 'Clusters' });

    expect(await within(table).findByRole('heading', { name: 'No clusters found' })).toBeInTheDocument();
    expect(
      within(table).getByText(
        "You need the cluster's API URL, its CA bundle (or system trust) and a ServiceAccount token.",
      ),
    ).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Register cluster' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters/new'));
  });

  it('shows skeleton rows while loading', async () => {
    server.use(
      http.get('*/api/admin/clusters', async () => {
        await delay('infinite');
      }),
    );
    renderApp('/admin/clusters');

    const table = await screen.findByRole('grid', { name: 'Clusters' });
    expect(within(table).getByText('Loading')).toBeInTheDocument();
  });

  it('shows the error with Retry and recovers', async () => {
    server.use(
      http.get(
        '*/api/admin/clusters',
        () => problem(500, { title: 'Internal Server Error', detail: 'The cluster store is unavailable.' }),
        { once: true },
      ),
    );
    const { user } = renderApp('/admin/clusters');

    expect(await screen.findByText('Could not load clusters')).toBeInTheDocument();
    expect(screen.getByText('The cluster store is unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    const table = await findClustersTable();
    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
  });

  it('renders 40+ clusters without pagination', async () => {
    const [template] = mockDb.clusters;
    if (!template) throw new Error('no fixture cluster');
    for (let i = 0; i < 40; i++) {
      mockDb.clusters.push({
        ...template,
        name: `bulk-${String(i).padStart(2, '0')}`,
        displayName: `Bulk ${i}`,
      });
    }
    renderApp('/admin/clusters');
    const table = await findClustersTable();

    expect(visibleClusters(table)).toHaveLength(ALL_CLUSTERS.length + 40);
    expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument();
  });

  it('keeps Register cluster visible but aria-disabled for a read-only admin (ADM-2)', async () => {
    setMockUser('ines');
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
    const register = screen.getByRole('button', { name: 'Register cluster' });
    expect(register).toHaveAttribute('aria-disabled', 'true');
    // The create action sits in the page heading (UX.md §3), not in the toolbar.
    const toolbar = screen.getByRole('group', { name: 'Clusters toolbar' });
    expect(within(toolbar).queryByRole('button', { name: 'Register cluster' })).not.toBeInTheDocument();
    await user.hover(register);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/read-only/i);
  });
});
