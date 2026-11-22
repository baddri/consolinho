import { screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, http, mockDb, problem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { checkFilterOption } from '../dataViewTestUtils';
import { adminRoute } from '../routes';

/** Every fixture credential as `cluster/name`, in server order (expiry asc, nulls last, then cluster, name). */
const SERVER_ORDER = [
  'prod-us-1/fleet-view',
  'prod-eu-1/fleet-edit',
  'dev-1/fleet-edit',
  'prod-eu-1/fleet-view',
  'dev-2/fleet-view',
  'prod-us-1/legacy-token',
  'staging-eu-1/fleet-admin',
];

const ALERT_TITLE = '1 credential expired, 1 expires within 14 days';

/** Waits for the fleet credentials table with data rows (`timeout` for the file's cold start). */
async function findTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Credentials' }, { timeout });
  await within(table).findAllByRole('link', { name: 'prod-us-1' }, { timeout });
  return table;
}

/** Text of the cell with `dataLabel` in `row`. */
function cellText(row: HTMLElement, label: string): string {
  return row.querySelector(`[data-label="${label}"]`)?.textContent ?? '';
}

/**
 * `cluster/name` of a body row (the name after its kind badge, without the description); `null` for state rows.
 */
function rowKey(row: HTMLElement): string | null {
  const cluster = within(row).queryByRole('link')?.textContent;
  const name = row.querySelector('[data-label="Name"]')?.firstChild?.lastChild?.textContent;
  return cluster && name ? `${cluster}/${name}` : null;
}

/** Visible body rows as `cluster/name`, in display order. */
function visibleRows(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .flatMap((row) => rowKey(row) ?? []);
}

/** The body row of `cluster/name`. */
function rowOf(table: HTMLElement, key: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => rowKey(candidate) === key);
  if (!row) throw new Error(`No row ${key}`);
  return row;
}

/** Removes the fixture credentials that are expired or expire soon, leaving only healthy ones. */
function keepOnlyHealthyCredentials() {
  mockDb.credentials = mockDb.credentials.filter(
    (c) => c.id !== credentialIds.prodUsView && c.id !== credentialIds.prodEuEdit,
  );
}

beforeEach(() => mockViewportWidth(1440));

describe('CredentialsListPage (CRED-7)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('lists every credential of the fleet in server order', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/fleet/admin/credentials');
    const table = await findTable(COLD_START_TIMEOUT_MS);

    expect(screen.getByRole('heading', { name: 'Credentials', level: 1 })).toBeInTheDocument();
    expect(visibleRows(table)).toEqual(SERVER_ORDER);

    const expired = rowOf(table, 'prod-us-1/fleet-view');
    expect(within(expired).getByRole('link', { name: 'prod-us-1' })).toHaveAttribute(
      'href',
      '/fleet/admin/clusters/prod-us-1/credentials',
    );
    expect(within(expired).getByText('prod')).toBeInTheDocument();
    expect(within(expired).getByText('Expired')).toBeInTheDocument();
    expect(cellText(expired, 'Service account')).toBe('fleetconsole/fleet-view');

    expect(within(rowOf(table, 'prod-us-1/legacy-token')).getByText('Not a ServiceAccount token')).toBeInTheDocument();
    // Credential badge "CC" (ClusterCredential), distinct from the cluster's "C" in the same row (UX.md §5).
    expect(within(expired).getByTitle('Credential')).toHaveTextContent(/^CC$/);
    expect(within(expired).getByTitle('Cluster')).toHaveTextContent(/^C$/);
    expect(within(rowOf(table, 'dev-2/fleet-view')).getByText('Disabled')).toBeInTheDocument();
    expect(within(rowOf(table, 'dev-1/fleet-edit')).queryByText('Disabled')).not.toBeInTheDocument();
    expect(within(rowOf(table, 'dev-2/fleet-view')).getByText('Never tested')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kebab toggle' })).not.toBeInTheDocument();
  });

  it('sorts by cluster and back to soonest expiry', async () => {
    const { user } = renderApp('/fleet/admin/credentials');
    const table = await findTable();

    await user.click(within(table).getByRole('button', { name: 'Cluster' }));
    expect(visibleRows(table).map((key) => key.split('/')[0])).toEqual([
      'dev-1',
      'dev-2',
      'prod-eu-1',
      'prod-eu-1',
      'prod-us-1',
      'prod-us-1',
      'staging-eu-1',
    ]);
    await user.click(within(table).getByRole('button', { name: 'Expiry' }));
    expect(visibleRows(table)).toEqual(SERVER_ORDER);
  });

  it('filters by text, expiry and environment and keeps them in the URL', async () => {
    const { user, router } = renderApp('/fleet/admin/credentials');
    const table = await findTable();

    await user.click(screen.getByRole('textbox', { name: 'Filter by name' }));
    await user.paste('fleetconsole/fleet-edit');
    await waitFor(() => expect(visibleRows(table)).toEqual(['prod-eu-1/fleet-edit', 'dev-1/fleet-edit']));

    await checkFilterOption(user, 'Environment', 'Development');
    await waitFor(() => expect(visibleRows(table)).toEqual(['dev-1/fleet-edit']));
    expect(router.state.location.search).toBe('?q=fleetconsole%2Ffleet-edit&env=development');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleRows(table)).toEqual(SERVER_ORDER));
  });

  it('pre-filters from a deep link', async () => {
    renderApp('/fleet/admin/credentials?expiry=noExpiry&expiry=unknown');
    const table = await findTable();

    await waitFor(() => expect(visibleRows(table)).toEqual(['prod-us-1/legacy-token', 'staging-eu-1/fleet-admin']));
    const chips = within(screen.getByRole('list', { name: 'Expiry' }));
    expect(chips.getByText('No expiry')).toBeInTheDocument();
    expect(chips.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the OCP no-match row with "Clear filters"', async () => {
    const { user } = renderApp('/fleet/admin/credentials?q=nothing-like-this');
    const table = await screen.findByRole('grid', { name: 'Credentials' });

    expect(await within(table).findByText('No Credentials found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(visibleRows(table)).toEqual(SERVER_ORDER));
  });

  it('QG-3: empty state links to Clusters', async () => {
    mockDb.credentials = [];
    renderApp('/fleet/admin/credentials');

    expect(await screen.findByRole('heading', { name: 'No Credentials found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Clusters' })).toHaveAttribute('href', '/fleet/admin/clusters');
  });

  it('QG-3: skeleton rows while loading', async () => {
    server.use(
      http.get('/api/admin/credentials', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    renderApp('/fleet/admin/credentials');
    const table = await screen.findByRole('grid', { name: 'Credentials' });
    expect(within(table).getByText('Loading')).toBeInTheDocument();
  });

  it('QG-3: an error shows ErrorState with Retry and no table, then recovers', async () => {
    server.use(
      http.get('/api/admin/credentials', () => problem(500, { code: 'Internal', detail: 'Database unavailable.' }), {
        once: true,
      }),
    );
    const { user } = renderApp('/fleet/admin/credentials');

    expect(await screen.findByText('Could not load credentials')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: 'Credentials' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(visibleRows(await findTable())).toEqual(SERVER_ORDER);
  });
});

describe('CredentialExpiryAlert (CRED-8)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('counts expired and expiring credentials on the Credentials page; the link applies both filters', async () => {
    const { user, router } = renderApp('/fleet/admin/credentials');
    const table = await findTable();

    const title = await screen.findByRole('heading', { name: new RegExp(ALERT_TITLE) });
    expect(title).toHaveTextContent(/^Danger alert:/);
    await user.click(screen.getByRole('link', { name: 'Review credentials' }));

    await waitFor(() => expect(router.state.location.search).toBe('?expiry=expired&expiry=expiringSoon'));
    await waitFor(() => expect(visibleRows(table)).toEqual(['prod-us-1/fleet-view', 'prod-eu-1/fleet-edit']));
  });

  it('shows the same counts on the Clusters page and links to the filtered credentials', async () => {
    const { user, router } = renderApp('/fleet/admin/clusters');

    expect(await screen.findByRole('heading', { name: new RegExp(ALERT_TITLE) })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Review credentials' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/credentials'));
    expect(router.state.location.search).toBe('?expiry=expired&expiry=expiringSoon');
    const table = await findTable();
    await waitFor(() => expect(visibleRows(table)).toEqual(['prod-us-1/fleet-view', 'prod-eu-1/fleet-edit']));
  });

  it('is a warning when nothing has expired yet', async () => {
    mockDb.credentials = mockDb.credentials.filter((c) => c.id !== credentialIds.prodUsView);
    renderApp('/fleet/admin/clusters');

    const title = await screen.findByRole('heading', { name: /1 credential expires within 14 days/ });
    expect(title).toHaveTextContent(/^Warning alert:/);
  });

  it('is absent when every credential is fine', async () => {
    keepOnlyHealthyCredentials();
    renderApp('/fleet/admin/credentials');
    const table = await findTable();

    expect(visibleRows(table)).toHaveLength(SERVER_ORDER.length - 2);
    expect(screen.queryByRole('link', { name: 'Review credentials' })).not.toBeInTheDocument();
  });
});
