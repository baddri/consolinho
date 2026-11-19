import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { AUDIT_FIXTURE_COUNT, mockDb, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';
import { formatDetails } from './AuditEntryRow';

const HOUR_MS = 3_600_000;

/** Records the query string of every `GET /api/admin/audit` the page sends during the test. */
function recordAuditRequests(): URLSearchParams[] {
  const requests: URLSearchParams[] = [];
  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/audit') requests.push(url.searchParams);
  };
  server.events.on('request:start', listener);
  onTestFinished(() => server.events.removeListener('request:start', listener));
  return requests;
}

/** Waits for the audit table with data rows (`timeout` for the file's cold start). */
async function findAuditTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Audit log' }, { timeout });
  await within(table).findAllByRole('button', { name: 'Details' });
  return table;
}

/** Number of entry rows (one expand toggle each). */
const entryCount = (table: HTMLElement) => within(table).getAllByRole('button', { name: 'Details' }).length;

/** The newest request sent so far. */
function lastRequest(requests: URLSearchParams[]): URLSearchParams {
  const last = requests.at(-1);
  if (!last) throw new Error('no audit request sent');
  return last;
}

beforeEach(() => mockViewportWidth(1440));

describe('AuditLogPage', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('AUD-2: shows time, actor, action, target, cluster and summary; expanding shows details and correlation id', {
    timeout: COLD_START_TEST_TIMEOUT_MS,
  }, async () => {
    const { user } = renderApp('/admin/audit');

    const table = await findAuditTable(COLD_START_TIMEOUT_MS);
    expect(screen.getByRole('heading', { name: 'Audit log', level: 1 })).toBeInTheDocument();
    expect(entryCount(table)).toBe(50);

    const [first] = mockDb.audit;
    if (!first) throw new Error('fixtures empty');
    const firstRow = within(table).getByText(first.summary).closest('tr');
    if (!firstRow) throw new Error('row not found');
    const cells = within(firstRow);
    expect(cells.getByText(first.action)).toBeInTheDocument();
    expect(firstRow).toHaveTextContent(`${first.targetType} ${first.targetName}`);
    expect(firstRow.querySelector('time')).toHaveAttribute('dateTime', first.occurredAt);

    const systemRow = within(table)
      .getByText('admin became an administrator through group fleetconsole-admins.')
      .closest('tr');
    if (!systemRow) throw new Error('row not found');
    expect(within(systemRow).getByText('system')).toBeInTheDocument();

    const clusterLink = within(table).getAllByRole('link', { name: 'prod-eu-1' })[0];
    expect(clusterLink).toHaveAttribute('href', '/admin/clusters/prod-eu-1');

    await user.click(cells.getByRole('button', { name: 'Details' }));
    expect(await within(table).findByText(/"groups": \[/)).toBeInTheDocument();
    expect(within(table).getByText(first.correlationId ?? '')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('AUD-4: "Load more" appends pages by cursor without duplicates under one query key', async () => {
    const requests = recordAuditRequests();
    const { user, queryClient } = renderApp('/admin/audit');
    const table = await findAuditTable();

    expect(screen.getByText('Showing 50 entries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 100 entries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(`Showing ${AUDIT_FIXTURE_COUNT} entries`)).toBeInTheDocument();

    expect(screen.getByText('End of audit log')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(entryCount(table)).toBe(AUDIT_FIXTURE_COUNT);
    const times = [...table.querySelectorAll('time')].map((t) => t.getAttribute('dateTime'));
    expect(new Set(times).size).toBe(AUDIT_FIXTURE_COUNT);

    expect(requests.map((r) => r.has('cursor'))).toEqual([false, true, true]);
    expect(requests.every((r) => r.get('limit') === '50')).toBe(true);
    expect(queryClient.getQueryCache().findAll({ queryKey: ['api', 'admin', 'audit'] })).toHaveLength(1);
  });

  it('AUD-4: ?user= and ?cluster= deep links pre-filter; the user filter shows a removable label', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit?user=alice');
    const table = await findAuditTable();

    expect(lastRequest(requests).get('user')).toBe('alice');
    expect(within(table).getAllByText('alice logged in.').length).toBeGreaterThan(0);
    expect(within(table).queryByText('bob logged in.')).not.toBeInTheDocument();
    const userLabels = screen.getByRole('list', { name: 'User' });
    expect(within(userLabels).getByText('alice')).toBeInTheDocument();

    await user.click(within(userLabels).getByRole('button', { name: /close alice/i }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(lastRequest(requests).has('user')).toBe(false));

    await router.navigate('/admin/audit?cluster=prod-eu-1');
    await waitFor(() => expect(lastRequest(requests).get('cluster')).toBe('prod-eu-1'));
    // The results remount per filter set: query the screen, not the old table.
    await waitFor(() => expect(screen.queryByText('alice logged in.')).not.toBeInTheDocument());
    await findAuditTable();
    expect(within(screen.getByRole('list', { name: 'Cluster' })).getByText('prod-eu-1')).toBeInTheDocument();
  });

  // One filter per test keeps each test short, so none nears Vitest's timeout when suites run in parallel.
  it('AUD-4: the category select writes ?category= and sends it', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit');
    await findAuditTable();

    await user.click(screen.getByRole('button', { name: 'Filter by Category' }));
    await user.click(screen.getByRole('option', { name: 'Users' }));
    await waitFor(() => expect(lastRequest(requests).get('category')).toBe('users'));
    expect(router.state.location.search).toBe('?category=users');
  });

  it('AUD-4: the actor typeahead applies a clicked suggestion', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit');
    await findAuditTable();

    await user.click(screen.getByRole('combobox', { name: 'Filter by Actor' }));
    await user.paste('car');
    await user.click(await screen.findByRole('option', { name: 'carol' }));
    await waitFor(() => expect(lastRequest(requests).get('actor')).toBe('carol'));
    expect(router.state.location.search).toBe('?actor=carol');
  });

  it('AUD-4: the cluster typeahead applies free text with Enter and suggestions with arrow keys', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit');
    await findAuditTable();
    const cluster = screen.getByRole('combobox', { name: 'Filter by Cluster' });

    // Free text (e.g. a deleted cluster) is applied with Enter.
    await user.click(cluster);
    await user.paste('gone-1');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(lastRequest(requests).get('cluster')).toBe('gone-1'));

    // Arrow keys move the highlight (focus stays in the input); Enter applies the highlighted suggestion.
    await user.click(cluster);
    await user.paste('prod');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(cluster).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'prod-us-1' }).id);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(lastRequest(requests).get('cluster')).toBe('prod-us-1'));
    expect(router.state.location.search).toBe('?cluster=prod-us-1');
  });

  it('AUD-4: the target search writes ?target= after the debounce', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit');
    await findAuditTable();

    await user.click(screen.getByRole('textbox', { name: 'Search targets' }));
    await user.paste('alice');
    await waitFor(() => expect(lastRequest(requests).get('target')).toBe('alice'));
    expect(router.state.location.search).toBe('?target=alice');
  });

  it('AUD-4: a preset sends from ≈ now − range; custom sends both bounds', async () => {
    const requests = recordAuditRequests();
    const { user, router } = renderApp('/admin/audit');
    await findAuditTable();

    await user.click(screen.getByRole('button', { name: 'Filter by Time' }));
    await user.click(screen.getByRole('option', { name: 'Last 24 hours' }));
    await waitFor(() => expect(lastRequest(requests).has('from')).toBe(true));
    const from = Date.parse(lastRequest(requests).get('from') ?? '');
    expect(Math.abs(Date.now() - 24 * HOUR_MS - from)).toBeLessThan(60_000);
    expect(lastRequest(requests).has('to')).toBe(false);
    expect(router.state.location.search).toBe('?range=24h');
    // Fixture entries are 49 minutes apart: 29 fall within the last 24 hours.
    expect(await screen.findByText('Showing 29 entries')).toBeInTheDocument();

    const bounds = '?range=custom&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z';
    await router.navigate(`/admin/audit${bounds}`);
    await waitFor(() => expect(lastRequest(requests).get('to')).toBe('2026-01-02T00:00:00.000Z'));
    expect(lastRequest(requests).get('from')).toBe('2026-01-01T00:00:00.000Z');

    // Clearing and typing a "From" date writes local midnight of that day as an ISO bound.
    await user.clear(screen.getByRole('textbox', { name: 'From date' }));
    await user.click(screen.getByRole('textbox', { name: 'From date' }));
    await user.paste('2026-01-01');
    const localMidnight = new Date(2026, 0, 1).toISOString();
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('from')).toBe(localMidnight));
    await waitFor(() => expect(lastRequest(requests).get('from')).toBe(localMidnight));
    expect(lastRequest(requests).has('to')).toBe(true);
  });

  it('400 on a hand-edited filter shows the problem and "Clear filters"', async () => {
    const { user, router } = renderApp('/admin/audit?from=yesterday');

    expect(await screen.findByText('These filters are not valid')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Filter errors' })).toHaveTextContent('from: Enter an ISO 8601 timestamp.');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await findAuditTable();
  });

  it('shows the no-match state with "Clear filters"', async () => {
    const { user } = renderApp('/admin/audit?actor=nobody');

    expect(await screen.findByText('No audit entries match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await findAuditTable();
  });

  it('shows skeleton rows while loading and an error with Retry', async () => {
    server.use(
      http.get('/api/admin/audit', async () => {
        await delay(50);
        return new Response(null, { status: 500 });
      }),
    );
    renderApp('/admin/audit');

    expect(await screen.findByRole('grid', { name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findByText('Could not load the audit log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('AUD-5: works for a read-only admin', async () => {
    setMockUser('ines');
    renderApp('/admin/audit');

    const table = await findAuditTable();
    expect(entryCount(table)).toBe(50);
  });
});

describe('formatDetails', () => {
  it('pretty-prints JSON and shows nothing for null', () => {
    expect(formatDetails({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatDetails([1])).toBe('[\n  1\n]');
    expect(formatDetails('text')).toBe('"text"');
    expect(formatDetails(null)).toBeUndefined();
    expect(formatDetails(undefined)).toBeUndefined();
  });
});
