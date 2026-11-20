import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import {
  ConfigMapModel,
  PodModel,
  setWatchTimingForTests,
  type ConfigMap,
  type K8sResource,
  type Pod,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, mockK8s, problem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { NO_EVENTS_TEXT } from '../events/ResourceEventsTab';
import { resourceRoutes } from '../routes';
import { base64Size, formatBytes } from './sections/ConfigMapDetails';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';
const POD_PATH = `/c/dev-1/k8s/ns/shop/pods/${CRASHING_POD}`;

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

const isWatch = (request: Request) => new URL(request.url).searchParams.has('watch');

/** Answers the object GET (path ending in `/<plural>/<name>`) with `respond()`; everything else reaches the mock. */
function answerGet(plural: string, name: string, respond: () => Response): void {
  server.use(
    http.get(PROXY, ({ request }) =>
      !isWatch(request) && new URL(request.url).pathname.endsWith(`/${plural}/${name}`)
        ? respond()
        : undefined,
    ),
  );
}

/** Gives `admin` a grant on lab-1 (fixtures grant only dev-1), for switching clusters without switching users. */
function grantAdminOnLab1(): void {
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
}

function getPod(cluster: string, name: string): Pod & K8sResource {
  return mockK8s.get(cluster, PodModel, 'shop', name) as Pod & K8sResource;
}

describe('pod details (UI-4)', () => {
  it(
    'shows header, metadata and the containers table of a crash-looping pod',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp(POD_PATH);

      expect(
        await screen.findByRole(
          'heading',
          { name: CRASHING_POD, level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(breadcrumb).getByRole('link', { name: 'Projects' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/cluster/projects',
      );
      expect(within(breadcrumb).getByRole('link', { name: 'shop' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/cluster/projects/shop',
      );
      expect(within(breadcrumb).getByRole('link', { name: 'Pods' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/pods',
      );

      const containers = await screen.findByRole('grid', { name: 'Containers' });
      const row = within(containers).getByRole('row', { name: /^web/ });
      expect(within(row).getByText('Waiting: CrashLoopBackOff')).toBeInTheDocument();
      expect(within(row).getByText('Error, exit code 1')).toBeInTheDocument();
      expect(
        within(row).getByText(
          String(getPod('dev-1', CRASHING_POD).status?.containerStatuses?.[0]?.restartCount),
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('worker-1')).toBeInTheDocument();
      expect(screen.getByText('10.128.3.7')).toBeInTheDocument();
      // Header status label from the descriptor.
      expect(screen.getAllByText('CrashLoopBackOff').length).toBeGreaterThan(0);
      // Unregistered owner kind (ReplicaSet) is text.
      expect(screen.getByText(/^ReplicaSet web-/)).toBeInTheDocument();
      // Namespace link in the metadata, next to the breadcrumb's.
      expect(screen.getAllByRole('link', { name: 'shop' })).toHaveLength(2);

      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['Details', 'YAML', 'Events']);
    },
  );

  it('links an owner of a registered kind', async () => {
    mockK8s.upsert('dev-1', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'owned-config',
        namespace: 'shop',
        ownerReferences: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            name: CRASHING_POD,
            uid: getPod('dev-1', CRASHING_POD).metadata.uid ?? '',
          },
        ],
      },
      data: {},
    } as K8sResource);
    renderApp('/c/dev-1/k8s/ns/shop/configmaps/owned-config');

    expect(await screen.findByRole('link', { name: CRASHING_POD })).toHaveAttribute('href', POD_PATH);
  });

  it('updates the Details tab after an out-of-band change', async () => {
    renderApp(POD_PATH);
    await screen.findByRole('grid', { name: 'Containers' });

    const pod = getPod('dev-1', CRASHING_POD);
    mockK8s.upsert('dev-1', {
      ...pod,
      metadata: { ...pod.metadata, labels: { ...pod.metadata.labels, tier: 'gold' } },
    });

    expect(await screen.findByText('tier=gold')).toBeInTheDocument();
  });
});

describe('config map details (UI-4)', () => {
  it('shows each data key with its value', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config');

    const block = await screen.findByLabelText('app.properties');
    expect(block).toHaveTextContent('shop.currency=EUR');
    expect(screen.getByLabelText('LOG_LEVEL')).toHaveTextContent('debug');
  });

  it('lists binary keys with their decoded size', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-assets');

    const binary = await screen.findByLabelText('Binary data');
    expect(within(binary).getByText('favicon.png')).toBeInTheDocument();
    expect(within(binary).getByText('68 B')).toBeInTheDocument();
  });

  it('formats sizes', () => {
    expect(base64Size('aGVsbG8=')).toBe(5);
    expect(formatBytes(1229)).toBe('1.2 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MiB');
  });
});

describe('details tabs (URL segments)', () => {
  it('switches to YAML by URL and shows the object without managedFields', async () => {
    const cm = mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config') as ConfigMap & K8sResource;
    mockK8s.upsert('dev-1', {
      ...cm,
      metadata: { ...cm.metadata, managedFields: [{ manager: 'kubectl', operation: 'Apply' }] },
    });
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config');

    await user.click(await screen.findByRole('tab', { name: 'YAML' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps/web-config/yaml'),
    );
    const yaml = await screen.findByLabelText('YAML', { selector: 'div' });
    expect(yaml).toHaveTextContent('kind: ConfigMap');
    expect(yaml).not.toHaveTextContent('managedFields');
  });
});

describe('events tab (UI-5)', () => {
  it("opens on Events from the URL and lists only the object's events, newest first, live", async () => {
    const fieldSelectors: (string | null)[] = [];
    server.use(
      http.get(PROXY, ({ request }) => {
        const url = new URL(request.url);
        if (!isWatch(request) && url.pathname.endsWith('/events')) {
          fieldSelectors.push(url.searchParams.get('fieldSelector'));
        }
        return undefined;
      }),
    );
    const pod = getPod('dev-1', CRASHING_POD);
    renderApp(`${POD_PATH}/events`);

    const table = await screen.findByRole('grid', { name: 'Events' });
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
    await within(table).findByText('BackOff');
    expect(fieldSelectors).toContain(`involvedObject.uid=${pod.metadata.uid ?? ''}`);
    const reasons = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).queryByText(/^(BackOff|Started|Killing)$/)?.textContent);
    expect(reasons()).toEqual(['BackOff', 'Started']);
    expect(within(table).queryByRole('columnheader', { name: 'Involved object' })).not.toBeInTheDocument();

    mockK8s.upsert('dev-1', {
      apiVersion: 'v1',
      kind: 'Event',
      metadata: { name: `${CRASHING_POD}.live`, namespace: 'shop' },
      involvedObject: {
        apiVersion: 'v1',
        kind: 'Pod',
        name: CRASHING_POD,
        namespace: 'shop',
        uid: pod.metadata.uid,
      },
      type: 'Normal',
      reason: 'Killing',
      message: 'Stopping container web',
      lastTimestamp: new Date().toISOString(),
    } as K8sResource);

    await waitFor(() => expect(reasons()).toEqual(['Killing', 'BackOff', 'Started']));
  });

  it('shows the exact empty text', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config/events');

    expect(await screen.findByRole('heading', { name: NO_EVENTS_TEXT })).toBeInTheDocument();
  });
});

describe('details error states (UI-10)', () => {
  it('shows not found with a link to the list', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/pods/nope');

    expect(await screen.findByRole('heading', { name: 'Pod nope not found on dev-1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Pods in shop' })).toHaveAttribute(
      'href',
      '/c/dev-1/k8s/ns/shop/pods',
    );
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows not found when the object is deleted while open', async () => {
    renderApp(POD_PATH);
    await screen.findByRole('grid', { name: 'Containers' });

    mockK8s.remove('dev-1', PodModel, 'shop', CRASHING_POD);

    expect(
      await screen.findByRole('heading', { name: `Pod ${CRASHING_POD} not found on dev-1` }),
    ).toBeInTheDocument();
  });

  it('shows not found after switching to a cluster without the object', async () => {
    grantAdminOnLab1();
    mockK8s.remove('lab-1', PodModel, 'shop', CRASHING_POD);
    const { router } = renderApp(POD_PATH);
    await screen.findByRole('grid', { name: 'Containers' });

    await router.navigate(`/c/lab-1/k8s/ns/shop/pods/${CRASHING_POD}`);

    expect(
      await screen.findByRole('heading', { name: `Pod ${CRASHING_POD} not found on lab-1` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Pods in shop' })).toHaveAttribute(
      'href',
      '/c/lab-1/k8s/ns/shop/pods',
    );
  });

  it('shows "Restricted access" on 403', async () => {
    answerGet('pods', CRASHING_POD, () =>
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
    renderApp(POD_PATH);

    expect(await screen.findByRole('heading', { name: 'Restricted access' })).toBeInTheDocument();
    expect(screen.getByText("The service account for dev-1 can't get pods in shop.")).toBeInTheDocument();
  });

  it('shows the proxy error detail with Retry on 502', async () => {
    answerGet('pods', CRASHING_POD, () =>
      problem(502, { code: 'Proxy.UpstreamUnavailable', detail: 'upstream down' }),
    );
    renderApp(POD_PATH);

    expect(await screen.findByText(/upstream down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
