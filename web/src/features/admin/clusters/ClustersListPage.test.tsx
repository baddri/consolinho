import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { checkFilterOption } from '../dataViewTestUtils';
import { adminRoute } from '../routes';

/** All fixture cluster names in display order (sorted by name). */
const ALL_CLUSTERS = [
  'dev-1',
  'dev-2',
  'dev-k8s-ns',
  'lab-1',
  'prod-eu-1',
  'prod-k8s-1',
  'prod-us-1',
  'staging-eu-1',
];

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
    renderApp('/fleet/admin/clusters');

    const table = await findClustersTable(COLD_START_TIMEOUT_MS);
    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
    expect(screen.getByRole('heading', { name: 'Clusters', level: 1 })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'prod-eu-1' })).toHaveAttribute(
      'href',
      '/fleet/admin/clusters/prod-eu-1',
    );

    const prodEu = rowOf(table, 'prod-eu-1');
    const prodEuCells = within(prodEu);
    expect(prodEuCells.getByText('Production EU 1')).toBeInTheDocument();
    expect(prodEuCells.getByText('prod')).toBeInTheDocument();
    // DIST-3: the Type column shows the cluster type tag.
    expect(within(table).getByRole('columnheader', { name: /^Type/ })).toBeInTheDocument();
    expect(prodEuCells.getByText('OCP')).toBeInTheDocument();
    expect(within(rowOf(table, 'dev-2')).getByText('K8s')).toBeInTheDocument();
    expect(prodEu).toHaveTextContent('https://api.prod-eu-1.example.com:6443');
    expect(prodEuCells.getByText('Enabled')).toBeInTheDocument();
    expect(prodEuCells.getByText('Expires soon')).toBeInTheDocument();
    expect(prodEuCells.getByText('Passed')).toBeInTheDocument();
    expect(prodEuCells.getByText('2 days ago')).toBeInTheDocument();
    expect(prodEu).toHaveTextContent('fleet-view');
    // TLS and Users are additional columns ("Manage columns"), so the table fits the page up to 1920.
    expect(within(table).queryByRole('columnheader', { name: /^TLS/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /^Users/ })).not.toBeInTheDocument();

    const prodUs = within(rowOf(table, 'prod-us-1'));
    expect(prodUs.getByText('Expired')).toBeInTheDocument();
    expect(prodUs.getByText('Failed')).toBeInTheDocument();

    const staging = within(rowOf(table, 'staging-eu-1'));
    expect(staging.getByText('Settings changed since last test')).toBeInTheDocument();
    expect(staging.getByText('No expiry')).toBeInTheDocument();

    // Disabled with OCP's ban icon (UX.md §5); names carry the fleet kind badge "C".
    const dev2 = rowOf(table, 'dev-2');
    expect(within(dev2).getByText('Disabled')).toBeInTheDocument();
    expect(within(dev2).getByText('Never tested')).toBeInTheDocument();
    expect(within(dev2).getByText('C')).toHaveAttribute('title', 'Cluster');

    // lab-1 has no credentials: count 0 and no expiry icon.
    expect(within(rowOf(table, 'lab-1')).queryByRole('img')).not.toBeInTheDocument();
  });

  it('explains the worst credential expiry in a tooltip', async () => {
    const { user } = renderApp('/fleet/admin/clusters');
    const table = await findClustersTable();

    await user.hover(within(rowOf(table, 'prod-eu-1')).getByText('Expires soon'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('A credential token expires soon');
  });

  it('filters by text and environment and keeps the filters in the URL', async () => {
    const { user, router } = renderApp('/fleet/admin/clusters');
    const table = await findClustersTable();

    await user.click(screen.getByRole('textbox', { name: 'Filter by name' }));
    await user.paste('api.prod');
    await waitFor(() => expect(visibleClusters(table)).toEqual(['prod-eu-1', 'prod-k8s-1', 'prod-us-1']));
    expect(router.state.location.search).toBe('?q=api.prod');

    await user.clear(screen.getByRole('textbox', { name: 'Filter by name' }));
    await user.paste('Development');
    await waitFor(() => expect(visibleClusters(table)).toEqual(['dev-1', 'dev-2', 'dev-k8s-ns']));

    await checkFilterOption(user, 'Status', 'Disabled');
    await waitFor(() => expect(visibleClusters(table)).toEqual(['dev-2']));
    expect(router.state.location.search).toBe('?q=Development&status=disabled');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleClusters(table)).toEqual(ALL_CLUSTERS));
  });

  it('pre-filters from a ?env=production deep link', async () => {
    renderApp('/fleet/admin/clusters?env=production');
    const table = await findClustersTable();

    await waitFor(() => expect(visibleClusters(table)).toEqual(['prod-eu-1', 'prod-k8s-1', 'prod-us-1']));
    expect(within(screen.getByRole('list', { name: 'Environment' })).getByText('Production')).toBeInTheDocument();
  });

  it('shows the OCP no-match row with "Clear filters" when nothing matches', async () => {
    const { user } = renderApp('/fleet/admin/clusters?q=nothing-like-this');
    const table = await screen.findByRole('grid', { name: 'Clusters' });

    expect(await within(table).findByText('No Clusters found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleClusters(table)).toEqual(ALL_CLUSTERS));
  });

  it('shows the empty state with Register cluster when no cluster exists', async () => {
    mockDb.clusters = [];
    const { user, router } = renderApp('/fleet/admin/clusters');

    expect(await screen.findByRole('heading', { name: 'No Clusters found' })).toBeInTheDocument();
    expect(
      screen.getByText("You need the cluster's API URL, its CA bundle (or system trust) and a ServiceAccount token."),
    ).toBeInTheDocument();
    // The heading's button and the empty state's.
    const [, emptyStateRegister] = screen.getAllByRole('button', { name: 'Register cluster' });
    if (!emptyStateRegister) throw new Error('no Register cluster in the empty state');
    await user.click(emptyStateRegister);
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/clusters/new'));
  });

  it('shows skeleton rows while loading', async () => {
    server.use(
      http.get('*/api/admin/clusters', async () => {
        await delay('infinite');
      }),
    );
    renderApp('/fleet/admin/clusters');

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
    const { user } = renderApp('/fleet/admin/clusters');

    expect(await screen.findByText('Could not load clusters')).toBeInTheDocument();
    expect(screen.getByText('The cluster store is unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    const table = await findClustersTable();
    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
  });

  it('renders 40+ clusters on one page (50 per page, as OCP)', async () => {
    const [template] = mockDb.clusters;
    if (!template) throw new Error('no fixture cluster');
    for (let i = 0; i < 40; i++) {
      mockDb.clusters.push({
        ...template,
        name: `bulk-${String(i).padStart(2, '0')}`,
        displayName: `Bulk ${i}`,
      });
    }
    renderApp('/fleet/admin/clusters');
    const table = await findClustersTable();

    expect(visibleClusters(table)).toHaveLength(ALL_CLUSTERS.length + 40);
  });

  it('keeps Register cluster visible but aria-disabled for a read-only admin (ADM-2)', async () => {
    setMockUser('ines');
    const { user } = renderApp('/fleet/admin/clusters');
    const table = await findClustersTable();

    expect(visibleClusters(table)).toEqual(ALL_CLUSTERS);
    const register = screen.getByRole('button', { name: 'Register cluster' });
    expect(register).toHaveAttribute('aria-disabled', 'true');
    // The create action sits in the page heading (UX.md §3), not in the toolbar.
    expect(screen.getAllByRole('button', { name: 'Register cluster' })).toHaveLength(1);
    await user.hover(register);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/read-only/i);
  });
});
