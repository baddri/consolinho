import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { PodModel, setWatchTimingForTests, type K8sResource, type Pod } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { resourceRoutes } from '../routes';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const WEB_PODS = ['web-7d4b9c8f6d-2xkqp', 'web-7d4b9c8f6d-8mzrt', 'web-7d4b9c8f6d-tq5wn'];
const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  // Filters sit behind a toggle below PF's `xl` breakpoint.
  mockViewportWidth(1440);
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

const isWatch = (request: Request) => new URL(request.url).searchParams.has('watch');

/** Answers list GETs whose path ends in `/<plural>` with `respond()`; watches and everything else reach the mock. */
function answerLists(plural: string, respond: () => Response | Promise<Response>): void {
  server.use(
    http.get(PROXY, ({ request }) =>
      !isWatch(request) && new URL(request.url).pathname.endsWith(`/${plural}`) ? respond() : undefined,
    ),
  );
}

/** Records the `labelSelector` of every list GET. */
function recordLabelSelectors(): (string | null)[] {
  const selectors: (string | null)[] = [];
  server.use(
    http.get(PROXY, ({ request }) => {
      if (!isWatch(request)) selectors.push(new URL(request.url).searchParams.get('labelSelector'));
      return undefined;
    }),
  );
  return selectors;
}

async function findTable(name: string, timeout?: number): Promise<HTMLElement> {
  return screen.findByRole('grid', { name }, { timeout });
}

/** Names of the listed pods (object links; owner and namespace links are filtered out), in row order. */
function linkNames(table: HTMLElement): string[] {
  return within(table)
    .queryAllByRole('link')
    .map((link) => link.textContent)
    .filter((name) => /^(?:web|load|extra)-/.test(name));
}

function columnHeaders(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
}

/** A pod for `shop` built from a fixture pod. */
function shopPod(name: string): K8sResource {
  const pod = mockK8s.get('dev-1', PodModel, 'shop', WEB_PODS[0] ?? '') as Pod;
  return {
    ...pod,
    metadata: {
      name,
      namespace: 'shop',
      labels: { app: 'web' },
      creationTimestamp: pod.metadata?.creationTimestamp,
    },
  } as K8sResource;
}

describe('cluster landing (UI-1/UI-2)', () => {
  it('lands on Projects on OpenShift', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { router } = renderApp('/c/dev-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/cluster/projects'), {
      timeout: COLD_START_TIMEOUT_MS,
    });
  });

  it('lands on Namespaces where project.openshift.io is not served', async () => {
    // lab-1 (vanilla Kubernetes) has no credential/grant in the fixtures.
    mockDb.credentials.push({
      ...structuredClone(mockDb.credentials[0]),
      id: 'lab',
      name: 'fleet-admin',
      clusterName: 'lab-1',
    } as (typeof mockDb.credentials)[number]);
    mockDb.grants.push({
      ...structuredClone(mockDb.grants[0]),
      id: 'lab',
      username: 'admin',
      clusterName: 'lab-1',
      credentialId: 'lab',
    } as (typeof mockDb.grants)[number]);
    const { router } = renderApp('/c/lab-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/lab-1/k8s/cluster/namespaces'));
  });
});

describe('resource list states (QG-3, UI-10)', () => {
  it.each([
    ['pods', 'Pods', WEB_PODS[0] ?? ''],
    ['configmaps', 'ConfigMaps', 'web-config'],
    ['events', 'Events', 'Back-off restarting failed container web in pod ' + CRASHING_POD],
  ])('renders %s from the fixtures with a Live indicator', async (plural, title, sample) => {
    renderApp(`/c/dev-1/k8s/ns/shop/${plural}`);

    const table = await findTable(title);
    expect(await within(table).findByText(sample)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  it.each([
    ['pods', 'Pods'],
    ['configmaps', 'ConfigMaps'],
    ['events', 'Events'],
  ])('shows skeleton rows while %s load', async (plural, title) => {
    answerLists(plural, async () => {
      await delay('infinite');
      return HttpResponse.json({});
    });
    renderApp(`/c/dev-1/k8s/ns/shop/${plural}`);

    expect(within(await findTable(title)).getByText('Loading')).toBeInTheDocument();
  });

  it.each([
    ['pods', 'Pods'],
    ['configmaps', 'ConfigMaps'],
    ['events', 'Events'],
  ])('shows the empty state for %s in an empty namespace', async (plural, title) => {
    renderApp(`/c/dev-1/k8s/ns/empty/${plural}`);

    const table = await findTable(title);
    expect(
      await within(table).findByRole('heading', { name: `No ${title} found in empty` }),
    ).toBeInTheDocument();
  });

  it.each([
    ['pods', 'ns/shop', "The service account for dev-1 can't list pods in shop."],
    ['configmaps', 'all-namespaces', "The service account for dev-1 can't list configmaps in any project."],
    ['events', 'ns/shop', "The service account for dev-1 can't list events in shop."],
  ])('shows "Restricted access" when listing %s is forbidden', async (plural, scope, text) => {
    answerLists(plural, () =>
      HttpResponse.json(
        {
          kind: 'Status',
          apiVersion: 'v1',
          status: 'Failure',
          reason: 'Forbidden',
          code: 403,
          message: 'forbidden',
        },
        { status: 403 },
      ),
    );
    renderApp(`/c/dev-1/k8s/${scope}/${plural}`);

    expect(await screen.findByRole('heading', { name: 'Restricted access' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    ['pods', 'Pods'],
    ['configmaps', 'ConfigMaps'],
    ['events', 'Events'],
  ])('shows a rejected credential for %s with Retry, without logging out', async (plural, title) => {
    setMockUser('ines');
    const { user, router } = renderApp(`/c/prod-us-1/k8s/ns/shop/${plural}`);

    expect(
      await screen.findByText(/rejected the credential assigned to you for prod-us-1/),
    ).toBeInTheDocument();
    expect(screen.getByText(`Could not load ${title}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/rejected the credential/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/c/prod-us-1/k8s/ns/shop/${plural}`);
  });

  it('says a kind is not supported yet for an unknown plural', async () => {
    renderApp('/c/dev-1/k8s/all-namespaces/widgets');

    expect(
      await screen.findByRole('heading', { name: 'Kind not supported yet', level: 1 }),
    ).toBeInTheDocument();
  });

  it('redirects a namespaced plural under the cluster scope to all namespaces, keeping the query', async () => {
    const { router } = renderApp('/c/dev-1/k8s/cluster/pods?name=web');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/all-namespaces/pods'));
    expect(router.state.location.search).toBe('?name=web');
  });

  it('says a registered kind is not available when the cluster does not serve it', async () => {
    server.use(
      http.get('*/api/clusters/:cluster/k8s/api', () =>
        HttpResponse.json({ kind: 'APIVersions', versions: [] }),
      ),
    );
    renderApp('/c/dev-1/k8s/ns/shop/pods');

    expect(
      await screen.findByRole('heading', { name: "Pods aren't available on dev-1", level: 1 }),
    ).toBeInTheDocument();
  });
});

describe('resource list filters and sorting (UI-3)', () => {
  it('filters by name and keeps the filter in the URL', async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods');
    const table = await findTable('Pods');
    await within(table).findByText(CRASHING_POD);

    await user.type(screen.getByRole('textbox', { name: 'Filter by name' }), '8mzrt');

    await waitFor(() => expect(linkNames(table)).toEqual(['web-7d4b9c8f6d-8mzrt']));
    expect(router.state.location.search).toBe('?name=8mzrt');
  });

  it('restores name and status filters from the URL (reload)', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/pods?status=CrashLoopBackOff');

    const table = await findTable('Pods');
    await waitFor(() => expect(linkNames(table)).toEqual([CRASHING_POD]));
  });

  it('sends the label filter as labelSelector on Enter', async () => {
    const selectors = recordLabelSelectors();
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods');
    await within(await findTable('Pods')).findByText(CRASHING_POD);

    await user.type(
      screen.getByRole('textbox', { name: 'Filter by label selector' }),
      'app=web,tier!=db{Enter}',
    );

    await waitFor(() => expect(selectors).toContain('app=web,tier!=db'));
    expect(new URLSearchParams(router.state.location.search).get('label')).toBe('app=web,tier!=db');
    expect(await within(await findTable('Pods')).findByText(CRASHING_POD)).toBeInTheDocument();
  });

  it('filters pods by status and offers Clear filters when nothing matches', async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods');
    const table = await findTable('Pods');
    await within(table).findByText(CRASHING_POD);

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await user.click(await screen.findByRole('checkbox', { name: 'CrashLoopBackOff' }));
    await waitFor(() => expect(linkNames(table)).toEqual([CRASHING_POD]));
    expect(router.state.location.search).toBe('?status=CrashLoopBackOff');

    await user.click(screen.getByRole('checkbox', { name: 'CrashLoopBackOff' }));
    await user.click(screen.getByRole('checkbox', { name: 'Failed' }));
    expect(
      await within(table).findByRole('heading', { name: 'No Pods match the filters' }),
    ).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(linkNames(table)).toEqual(WEB_PODS));
    expect(router.state.location.search).toBe('');
  });

  it('filters events by type, newest first', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/shop/events');
    const table = await findTable('Events');
    await within(table).findByText('BackOff');
    const reasons = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    // The Warning happened 2 minutes ago, the Normal ones hours ago.
    expect(reasons()[0]).toBe('BackOff');

    await user.click(screen.getByRole('button', { name: 'Filter by Type' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Normal' }));

    await waitFor(() => expect(reasons()).toEqual(['Started', 'Started', 'Started']));
  });

  it('sorts by a column header', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/shop/pods');
    const table = await findTable('Pods');
    await within(table).findByText(CRASHING_POD);
    expect(linkNames(table)).toEqual(WEB_PODS);

    await user.click(within(table).getByRole('button', { name: 'Name' }));

    expect(linkNames(table)).toEqual([...WEB_PODS].reverse());
  });

  it('shows the Namespace column only for all namespaces', async () => {
    renderApp('/c/dev-1/k8s/all-namespaces/pods');
    const all = await findTable('Pods');
    await within(all).findByText(CRASHING_POD);
    expect(columnHeaders(all)).toEqual([
      'Name',
      'Namespace',
      'Status',
      'Ready',
      'Restarts',
      'Owner',
      'Created',
    ]);
    expect(within(all).getAllByRole('link', { name: 'shop' })[0]).toHaveAttribute(
      'href',
      '/c/dev-1/k8s/ns/shop/pods',
    );
  });

  it('has no Namespace column in one namespace', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/pods');
    const table = await findTable('Pods');
    await within(table).findByText(CRASHING_POD);

    expect(columnHeaders(table)).toEqual(['Name', 'Status', 'Ready', 'Restarts', 'Owner', 'Created']);
    expect(within(table).getByRole('link', { name: CRASHING_POD })).toHaveAttribute(
      'href',
      `/c/dev-1/k8s/ns/shop/pods/${CRASHING_POD}`,
    );
    // Owner kind (ReplicaSet) isn't registered: plain text.
    expect(within(table).getAllByText(/^ReplicaSet web-/)).toHaveLength(3);
    expect(within(table).getAllByText('CrashLoopBackOff')).toHaveLength(1);
  });
});

describe('live updates (DATA-3)', () => {
  it('adds and removes pods without reload', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/pods');
    const table = await findTable('Pods');
    await within(table).findByText(CRASHING_POD);
    await screen.findByText('Live');

    mockK8s.upsert('dev-1', shopPod('extra-pod'));
    expect(await within(table).findByRole('link', { name: 'extra-pod' })).toBeInTheDocument();

    mockK8s.remove('dev-1', PodModel, 'shop', WEB_PODS[0] ?? '');
    await waitFor(() => expect(linkNames(table)).toEqual(['extra-pod', ...WEB_PODS.slice(1)]));
  });

  it('shows "Paused — retrying" while the watch fails', async () => {
    server.use(
      http.get(PROXY, ({ request }) =>
        isWatch(request) ? problem(502, { code: 'Proxy.UpstreamUnavailable', detail: 'down' }) : undefined,
      ),
    );
    renderApp('/c/dev-1/k8s/ns/shop/pods');

    expect(await screen.findByText('Paused — retrying')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });
});

describe('big lists (DATA-4)', () => {
  it(
    'pages 2,000 pods, filters them and applies a watch update to a visible pod',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      mockK8s.seedPods('dev-1', 'load', 2000);
      const { user } = renderApp('/c/dev-1/k8s/ns/load/pods');

      const table = await findTable('Pods', COLD_START_TIMEOUT_MS);
      await within(table).findByRole('link', { name: 'load-00000' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(within(table).getAllByRole('row')).toHaveLength(51);

      await user.type(screen.getByRole('textbox', { name: 'Filter by name' }), 'load-0199');
      await waitFor(() => expect(linkNames(table)).toHaveLength(10));

      const pod = mockK8s.get('dev-1', PodModel, 'load', 'load-01995') as Pod;
      mockK8s.upsert('dev-1', {
        ...pod,
        status: { ...pod.status, phase: 'Failed', containerStatuses: [] },
      } as K8sResource);
      await waitFor(() => {
        const row = within(table)
          .getAllByRole('row')
          .find((candidate) => within(candidate).queryByRole('link', { name: 'load-01995' }));
        expect(row && within(row).getByText('Failed')).toBeInTheDocument();
      });
    },
  );
});
