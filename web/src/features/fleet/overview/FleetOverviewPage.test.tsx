import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessibleCluster, ClusterDistribution, FleetClusterStatus } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import { fleetScenarios, http } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const cluster = (name: string, overrides: Partial<AccessibleCluster> = {}): AccessibleCluster => ({
  name,
  displayName: name,
  environment: name.startsWith('prod') ? 'production' : 'development',
  distribution: (name.includes('k8s') ? 'kubernetes' : 'openShift') satisfies ClusterDistribution,
  accessMode: 'readWrite',
  webConsoleUrl: null,
  fallbackNamespaces: [],
  ...overrides,
});

/** The scenario line of `name` (`fixtures/fleetStatus.ts`) for `cluster`. */
const lineOf = (target: AccessibleCluster): FleetClusterStatus => {
  const scenario = fleetScenarios[target.name];
  if (!scenario) throw new Error(`no scenario ${target.name}`);
  return { ...scenario.line, cluster: target, checkedAt: '2026-11-25T10:00:00Z' };
};

const SCENARIO_NAMES = ['dev-1', 'prod-us-1', 'prod-k8s-1', 'dev-2', 'staging-eu-1', 'lab-1'];

/** Serves `clusters` as `GET /api/clusters`. */
function listClusters(clusters: AccessibleCluster[]) {
  server.use(http.get('/api/clusters', ({ response }) => response(200).json(clusters)));
}

/** A fleet stream the test writes to; `requests()` counts the requests. */
function controlledFleet() {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const encoder = new TextEncoder();
  server.use(
    http.untyped.get('*/api/fleet/status', () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push(controller);
          controller.enqueue(new Uint8Array(0));
        },
      });
      return new HttpResponse(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
    }),
  );
  const current = () => {
    const controller = streams.at(-1);
    if (!controller) throw new Error('No fleet request yet');
    return controller;
  };
  return {
    requests: () => streams.length,
    send: (...lines: FleetClusterStatus[]) =>
      act(() => {
        for (const line of lines) current().enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }),
    end: () => act(() => current().close()),
  };
}

/** Lists the scenario clusters and streams all their lines at once. */
async function renderScenarios(url = '/fleet/overview') {
  const clusters = SCENARIO_NAMES.map((name) => cluster(name));
  listClusters(clusters);
  const fleet = controlledFleet();
  const result = renderApp(url);
  await waitFor(() => expect(fleet.requests()).toBe(1));
  fleet.send(...clusters.map(lineOf));
  fleet.end();
  await waitFor(() => expect(screen.queryAllByText('Checking…')).toHaveLength(0));
  await screen.findByRole('group', { name: 'Fleet summary' });
  return { ...result, fleet };
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });
const shownNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell')[0]?.textContent);

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe('FleetOverviewPage', () => {
  it('renders the status cells of every scenario (FLT-2/3/4)', async () => {
    const { user } = await renderScenarios();

    const dev2 = within(row('dev-2'));
    expect(dev2.getByText('Degraded')).toBeInTheDocument();
    expect(dev2.getByRole('link', { name: '1 degraded, 0 unavailable' })).toHaveAttribute(
      'href',
      '/c/dev-2/settings/cluster/clusteroperators',
    );
    expect(dev2.getByRole('link', { name: '5 of 6 Ready' })).toHaveAttribute(
      'href',
      '/c/dev-2/k8s/cluster/nodes',
    );
    expect(dev2.getByText(', 1 Not Ready')).toHaveClass('pf-v6-u-text-color-status-warning');

    const dev1 = within(row('dev-1'));
    expect(dev1.getByText('Healthy')).toBeInTheDocument();
    expect(dev1.getByText('4.18.12')).toBeInTheDocument();
    expect(dev1.getByText('Up to date')).toBeInTheDocument();
    expect(dev1.getByRole('link', { name: 'All available' })).toBeInTheDocument();
    // A cordoned node is Ready, so dev-1 stays Healthy; the count is a second line.
    expect(dev1.getByText('1 unschedulable')).toBeInTheDocument();

    expect(within(row('staging-eu-1')).getByText('Updating to 4.18.14')).toBeInTheDocument();

    const k8s = within(row('prod-k8s-1'));
    expect(k8s.getByText('v1.31.4')).toBeInTheDocument();
    expect(k8s.getByText('Kubernetes')).toBeInTheDocument();
    expect(k8s.getAllByText('-')).toHaveLength(2);

    const lab = within(row('lab-1'));
    expect(lab.getByText('Unreachable')).toBeInTheDocument();
    expect(lab.getByText('Timed out')).toBeInTheDocument();

    const prodUs = within(row('prod-us-1'));
    expect(prodUs.getByText('Update available')).toBeInTheDocument();
    // Status and Operators both say Restricted; the Operators cell names its resource.
    const restricted = prodUs.getAllByText('Restricted');
    expect(restricted).toHaveLength(2);
    await user.hover(restricted[1] ?? document.body);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Not allowed to read ClusterOperators');
  });

  it('sorts by status severity, then display name, pending last (FLT-5)', async () => {
    await renderScenarios();
    expect(shownNames()).toEqual(['lab-1', 'dev-2', 'staging-eu-1', 'prod-us-1', 'dev-1', 'prod-k8s-1']);
  });

  it('fills rows in as their lines arrive and refetches on Refresh (FLT-6)', async () => {
    const clusters = [cluster('dev-1'), cluster('lab-1')];
    listClusters(clusters);
    const fleet = controlledFleet();
    const { user } = renderApp('/fleet/overview');
    await waitFor(() => expect(fleet.requests()).toBe(1));
    expect(await screen.findAllByText('Checking…')).toHaveLength(2);
    expect(screen.queryByText(/^Last checked/, { selector: 'div' })).not.toBeInTheDocument();

    fleet.send(lineOf(cluster('dev-1')));
    expect(await within(row('dev-1')).findByText('Healthy')).toBeInTheDocument();
    expect(within(row('lab-1')).getByText('Checking…')).toBeInTheDocument();
    expect(shownNames()).toEqual(['dev-1', 'lab-1']);
    // "Last checked" waits for the first check to finish, not just its first line.
    expect(screen.queryByText(/^Last checked/, { selector: 'div' })).not.toBeInTheDocument();

    fleet.send(lineOf(cluster('lab-1')));
    fleet.end();
    // Rows are re-sorted: query the row again rather than holding the old element.
    await waitFor(() => expect(within(row('lab-1')).getByText('Unreachable')).toBeInTheDocument());
    expect(screen.getByText(/^Last checked/, { selector: 'div' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fleet.requests()).toBe(2));
    // The previous lines stay until the new ones arrive.
    expect(within(row('dev-1')).getByText('Healthy')).toBeInTheDocument();
  });

  it('refreshes every 60 s only while the page is visible (FLT-6)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listClusters([cluster('dev-1')]);
    const fleet = controlledFleet();
    renderApp('/fleet/overview');
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.send(lineOf(cluster('dev-1')));
    fleet.end();

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await waitFor(() => expect(fleet.requests()).toBe(2));
    fleet.end();

    act(() => focusManager.setFocused(false));
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(fleet.requests()).toBe(2);
  });

  it('filters by the summary links and the URL, with "Clear all filters" (FLT-5/7)', async () => {
    const { user, router } = await renderScenarios();
    const summary = screen.getByRole('group', { name: 'Fleet summary' });
    expect(summary).toHaveTextContent('6 clusters·1 degraded·1 unreachable·1 updating');

    await user.click(within(summary).getByRole('button', { name: '1 degraded' }));
    expect(router.state.location.search).toBe('?status=degraded');
    expect(shownNames()).toEqual(['dev-2']);

    await user.click(within(summary).getByRole('button', { name: '6 clusters' }));
    expect(shownNames()).toHaveLength(6);

    await act(() => router.navigate('/fleet/overview?q=nothing-matches'));
    expect(await screen.findByText('No clusters found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(shownNames()).toHaveLength(6));
  });

  it('shows zero counts in the summary as plain text, not links (FLT-5)', async () => {
    listClusters([cluster('dev-1')]);
    const fleet = controlledFleet();
    renderApp('/fleet/overview');
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.send(lineOf(cluster('dev-1')));
    fleet.end();

    const summary = await screen.findByRole('group', { name: 'Fleet summary' });
    expect(within(summary).getByRole('button', { name: '1 cluster' })).toBeInTheDocument();
    expect(within(summary).getByText('0 degraded')).not.toHaveRole('button');
    expect(within(summary).queryAllByRole('button')).toHaveLength(1);
  });

  it('filters by Environment and Type from the URL (FLT-5)', async () => {
    await renderScenarios('/fleet/overview?type=kubernetes&env=production');
    expect(shownNames()).toEqual(['prod-k8s-1']);
  });

  it('shows "No clusters" without any accessible cluster (FLT-7)', async () => {
    listClusters([]);
    const fleet = controlledFleet();
    renderApp('/fleet/overview');
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.end();

    expect(await screen.findByRole('heading', { name: 'No clusters' })).toBeInTheDocument();
    expect(
      screen.getByText(
        `You don't have access to any cluster. Ask a ${PRODUCT_NAME} administrator for access.`,
      ),
    ).toBeInTheDocument();
  });

  it('opens the cluster Overview from the name and records it as recent (FLT-8)', async () => {
    const { user, router } = await renderScenarios();
    await user.click(within(row('dev-2')).getByRole('link', { name: 'dev-2' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/overview'));
    expect(JSON.parse(localStorage.getItem('fleetconsole.recentClusters.admin') ?? '[]')).toContain('dev-2');
  });

  it('shows the display name with the cluster name underneath', async () => {
    listClusters([cluster('dev-1', { displayName: 'Development one' })]);
    const fleet = controlledFleet();
    renderApp('/fleet/overview');
    await waitFor(() => expect(fleet.requests()).toBe(1));

    const name = await screen.findByRole('link', { name: 'Development one' });
    expect(name).toHaveAttribute('href', '/c/dev-1/overview');
    expect(within(row('Development one')).getByText('dev-1')).toBeInTheDocument();
  });

  it('keeps the rows behind "Could not check the clusters" and its detail when the check is busy (FLT-6)', async () => {
    listClusters([cluster('dev-1')]);
    server.use(
      http.untyped.get('*/api/fleet/status', () =>
        HttpResponse.json(
          {
            title: 'Service Unavailable',
            status: 503,
            code: 'Fleet.Busy',
            detail: 'Try again in a few seconds.',
          },
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const { user } = renderApp('/fleet/overview');

    expect(await screen.findByText('Could not check the clusters')).toBeInTheDocument();
    expect(screen.getByText('Try again in a few seconds.')).toBeInTheDocument();
    expect(row('dev-1')).toBeInTheDocument();

    const fleet = controlledFleet();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fleet.requests()).toBe(1));
  });
});
