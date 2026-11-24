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
import { stubLogViewerLayout } from '@/test/logViewer';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { NO_EVENTS } from '../events/EventStreamView';
import { resourceRoutes } from '../routes';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';
const POD_PATH = `/c/dev-1/k8s/ns/shop/pods/${CRASHING_POD}`;

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  stubLogViewerLayout(); // the Logs tab (LOG-1) mounts PF LogViewer
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
          { name: `Pod ${CRASHING_POD}`, level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(breadcrumb).getByRole('link', { name: 'Pods' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/pods',
      );
      expect(within(breadcrumb).getByText('Pod details')).toHaveAttribute('aria-current', 'page');
      expect(await screen.findByRole('heading', { name: 'Pod details', level: 2 })).toBeInTheDocument();

      const containers = await screen.findByRole('grid', { name: 'Containers' });
      const row = within(containers).getByRole('row', { name: /^web/ });
      // OCP `PodContainerTable`: state, readiness and the last state with exit code and reason.
      expect(within(row).getByText('Waiting')).toBeInTheDocument();
      expect(within(row).getByText('Not ready')).toBeInTheDocument();
      expect(within(row).getByText('Terminated with exit code 1 (Error)')).toBeInTheDocument();
      expect(
        within(row).getByText(
          String(getPod('dev-1', CRASHING_POD).status?.containerStatuses?.[0]?.restartCount),
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('worker-1')).toBeInTheDocument();
      expect(screen.getByText('10.128.3.7')).toBeInTheDocument();
      // Header status badge from the descriptor (OCP `ResourceStatus`: a read PF badge).
      const heading = screen.getByRole('heading', { name: `Pod ${CRASHING_POD}`, level: 1 });
      expect(
        heading.closest('.pf-v6-c-page__main-section')?.querySelector('.pf-v6-c-badge.pf-m-read'),
      ).toHaveTextContent('CrashLoopBackOff');
      const metadata = screen.getByLabelText('Metadata');
      // OCP `ResourceSummary` + `PodResourceSummary` order and labels.
      expect(
        within(metadata)
          .getAllByRole('term')
          .map((term) => term.textContent),
      ).toEqual([
        'Name',
        'Namespace',
        // The admin may patch the pod, so the Labels term carries OCP's inline "Edit".
        'LabelsEdit',
        'Node selector',
        'Tolerations',
        'Annotations',
        'Created at',
        'Owner',
      ]);
      // OCP `PodDetailsList` order and labels.
      expect(
        within(screen.getByLabelText('Pod properties'))
          .getAllByRole('term')
          .map((term) => term.textContent),
      ).toEqual(['Status', 'Restart policy', 'Active deadline seconds', 'Pod IP', 'Host IP', 'Node']);
      // Owner ReplicaSet: kind badge + link to its details page.
      expect(within(metadata).getByRole('link', { name: 'web-7d4b9c8f6d' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/replicasets/web-7d4b9c8f6d',
      );
      // Namespace link in the metadata column.
      expect(within(metadata).getByRole('link', { name: 'shop' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/cluster/projects/shop',
      );
      // Namespace shown with the NS badge (OCP), even though it links to the project.
      expect(within(metadata).getByTitle('Namespace')).toHaveTextContent('NS');

      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['Details', 'YAML', 'Logs', 'Events', 'Terminal']);
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

describe('details project bar', () => {
  it("shows on a pod and opens the picked project's list", async () => {
    const { user, router } = renderApp(POD_PATH);

    await user.click(await screen.findByRole('button', { name: 'Project: shop' }));
    const list = await screen.findByRole('listbox', { name: 'Projects' });
    await user.click(await within(list).findByRole('option', { name: /^payments/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/payments/pods'));
  });

  it('is absent on Project and Namespace details', async () => {
    for (const path of ['/c/dev-1/k8s/cluster/projects/shop', '/c/dev-1/k8s/cluster/namespaces/default']) {
      const { unmount } = renderApp(path);
      // The Details tab's h2 means the object (and anything above it) has rendered.
      expect(await screen.findByRole('heading', { level: 2, name: / details$/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Project:/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('details tabs (URL segments)', () => {
  it('switches to YAML by URL and shows the whole object, managedFields included (folded by Monaco)', async () => {
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
    const yaml = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'YAML editor' });
    expect(yaml.value).toContain('kind: ConfigMap');
    expect(yaml.value).toContain('manager: kubectl');
  });
});

describe('kind tabs (ADR-0037 §2)', () => {
  const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

  it('gives a pod Details, YAML, Logs, Events, Terminal and deep-links Logs with ?container= (LOG-1)', async () => {
    const { router } = renderApp(`${POD_PATH}/logs?container=web`);

    expect(await screen.findByRole('tabpanel', { name: 'Logs' })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Details', 'YAML', 'Logs', 'Events', 'Terminal']);
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.pathname).toBe(`${POD_PATH}/logs`);
    expect(router.state.location.search).toBe('?container=web');
  });

  it('names the Details tab panel by its tab', async () => {
    renderApp(POD_PATH);

    expect(await screen.findByRole('tabpanel', { name: 'Details' })).toBeInTheDocument();
  });

  it('gives a deployment Details, YAML, ReplicaSets, Pods, Events (DEP-9)', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/deployments/web/replicasets');

    expect(await screen.findByRole('tabpanel', { name: 'ReplicaSets' })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Details', 'YAML', 'ReplicaSets', 'Pods', 'Events']);
  });

  it('keeps other kinds unchanged and redirects a kind tab they lack to Details', async () => {
    const { router } = renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config/terminal');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps/web-config'),
    );
    expect(await screen.findByRole('tab', { name: 'Details', selected: true })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Details', 'YAML']); // no Events on config maps (CFG-1, OCP)
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

    const stream = await screen.findByRole('list', { name: 'Events' });
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
    expect(fieldSelectors).toContain(
      `involvedObject.uid=${pod.metadata.uid ?? ''},involvedObject.name=${CRASHING_POD},involvedObject.kind=Pod`,
    );
    const messages = () =>
      within(stream)
        .getAllByRole('group')
        .map((message) => message.textContent);
    expect(messages()).toEqual([
      `Back-off restarting failed container web in pod ${CRASHING_POD}`,
      'Started container web',
    ]);
    // The OCP stream on a details tab has no toolbar.
    expect(screen.queryByRole('combobox', { name: 'Resources' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 events')).toBeInTheDocument();

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

    await waitFor(() => expect(messages()[0]).toBe('Stopping container web'));
    expect(screen.getByText('Showing 3 events')).toBeInTheDocument();
  });

  it('shows "No events" under the stream header (OCP NoEvents)', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services/web/events'); // config maps have no Events tab (CFG-1)

    expect(await screen.findByText(NO_EVENTS)).toBeInTheDocument();
    expect(screen.getByText('Showing 0 events')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Events' })).not.toBeInTheDocument();
  });
});

describe('details error states (UI-10)', () => {
  it('shows not found with a link to the list', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/pods/nope');

    expect(await screen.findByRole('heading', { name: '404: Page Not Found' })).toBeInTheDocument();
    expect(screen.getByText(/Pod nope was not found on dev-1\./)).toBeInTheDocument();
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
      await screen.findByText(new RegExp(`Pod ${CRASHING_POD} was not found on dev-1\\.`)),
    ).toBeInTheDocument();
  });

  it('shows not found after switching to a cluster without the object', async () => {
    grantAdminOnLab1();
    mockK8s.remove('lab-1', PodModel, 'shop', CRASHING_POD);
    const { router } = renderApp(POD_PATH);
    await screen.findByRole('grid', { name: 'Containers' });

    await router.navigate(`/c/lab-1/k8s/ns/shop/pods/${CRASHING_POD}`);

    expect(
      await screen.findByText(new RegExp(`Pod ${CRASHING_POD} was not found on lab-1\\.`)),
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

  it('shows the proxy error detail with Try again on 502', async () => {
    answerGet('pods', CRASHING_POD, () =>
      problem(502, { code: 'Proxy.UpstreamUnavailable', detail: 'upstream down' }),
    );
    renderApp(POD_PATH);

    expect(await screen.findByText(/upstream down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
